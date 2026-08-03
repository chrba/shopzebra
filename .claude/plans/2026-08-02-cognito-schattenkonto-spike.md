# Cognito-Schattenkonto-Spike — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gegen einen Wegwerf-User-Pool beweisen, dass der Schattenkonto-Flow aus `architecture/accountless-first-planned.md` funktioniert: Silent-SignUp ohne E-Mail → Login → E-Mail als Alias nachrüsten → Login per E-Mail → Google per `AdminLinkProviderForUser` linken → Federated Login landet auf derselben `sub`.

**Architecture:** Reiner AWS-CLI-Spike, kein App-Code. Jeder Verifikationsschritt ist ein eigenes Shell-Skript in `spikes/cognito-shadow-account/`, das seine Erwartung selbst prüft (`assert`-Stil). Ergebnisse landen in `findings.md`. Alle Ressourcen sind Wegwerf-Ressourcen mit Präfix `shopzebra-spike-` und werden am Ende abgeräumt.

**Tech Stack:** AWS CLI v2 (`cognito-idp`, `lambda`, `iam`), bash, python3 (JWT-Decode), jq. Browser (Chrome) nur für den Google-OAuth-Teil.

## Global Constraints

- AWS-Zugriff ausschließlich über `AWS_PROFILE=shopzebra`, Region `eu-central-1`
- Alle AWS-Ressourcen heißen `shopzebra-spike-*` und sind Wegwerf-Ressourcen — der produktive Pool `eu-central-1_z6PK2KOsC` wird **nicht angefasst**
- **Kein Commit ohne ausdrückliche Ansage** (Nutzer-Regel; ersetzt die Commit-Schritte des Plan-Templates)
- `spikes/cognito-shadow-account/.env.spike` enthält Secrets (Passwörter, Tokens) und wird per `.gitignore` ausgeschlossen
- Apple Sign-In ist **außerhalb des Spike-Scopes** (braucht bezahlten Developer-Account; gleiche API wie Google — Restrisiko wird in `findings.md` notiert)
- Skript-Kommentare auf Englisch (CLAUDE.md-Regel)
- E-Mail-Postfach für Verifikationscodes: eine echte, abrufbare Adresse (Vorschlag: `christian.bannes+spike@pagnos.com` — Plus-Adressierung, Code landet im normalen Postfach; vor Task 3 bestätigen lassen)

## Voraussetzungen (vor Task 1 prüfen)

- `aws sts get-caller-identity --profile shopzebra` liefert einen Account (Rechte für `cognito-idp:*`, `iam:CreateRole/AttachRolePolicy/DeleteRole`, `lambda:*` nötig)
- `jq`, `python3`, `uuidgen`, `openssl` vorhanden
- Für Task 5: Zugriff auf einen Google-Account und die Google Cloud Console (OAuth-Client anlegen — manueller Schritt, im Task beschrieben)

---

### Task 1: Spike-Gerüst + Wegwerf-Pool mit Auto-Confirm-Trigger

Ohne E-Mail gibt es keinen Bestätigungscode — ein frisch registrierter User bliebe `UNCONFIRMED` und könnte sich nie einloggen. Der produktive Weg ist ein PreSignUp-Lambda-Trigger mit `autoConfirmUser = true`. Genau den bauen wir auch im Spike, damit wir den echten Pfad testen und nicht die Admin-Abkürzung.

**Files:**
- Create: `spikes/cognito-shadow-account/.gitignore`
- Create: `spikes/cognito-shadow-account/00-env.sh`
- Create: `spikes/cognito-shadow-account/presignup.js`
- Create: `spikes/cognito-shadow-account/01-setup-pool.sh`

**Interfaces:**
- Produces: `.env.spike` mit `POOL_ID`, `CLIENT_ID`, `LAMBDA_ARN`, `ROLE_ARN` — alle Folge-Skripte sourcen `00-env.sh`, das `.env.spike` lädt
- Produces: Helfer `jwt_claim <jwt> <claim>` und `save_var <NAME> <WERT>` aus `00-env.sh`

- [ ] **Step 1: Spike-Ordner + `.gitignore` anlegen**

```gitignore
.env.spike
*.zip
```

- [ ] **Step 2: `00-env.sh` schreiben** (gemeinsame Umgebung + Helfer)

```bash
#!/usr/bin/env bash
# Shared environment for all spike scripts. Source this, don't execute it.
set -euo pipefail

export AWS_PROFILE=shopzebra
export AWS_REGION=eu-central-1
export REGION=eu-central-1

SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SPIKE_DIR/.env.spike"

# Load variables persisted by earlier scripts
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# Persist a variable for later scripts: save_var NAME VALUE
save_var() {
  local name="$1" value="$2"
  touch "$ENV_FILE"
  grep -v "^export $name=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  printf 'export %s=%q\n' "$name" "$value" >> "$ENV_FILE"
  export "$name"="$value"
}

# Decode a claim from a JWT: jwt_claim <jwt> <claim>
jwt_claim() {
  python3 - "$1" "$2" <<'PY'
import base64, json, sys
payload = sys.argv[1].split('.')[1]
payload += '=' * (-len(payload) % 4)
claims = json.loads(base64.urlsafe_b64decode(payload))
print(claims.get(sys.argv[2], ''))
PY
}

# Fail loudly: expect <description> <actual> <expected>
expect() {
  local desc="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "OK: $desc"
  else
    echo "FAIL: $desc — expected '$expected', got '$actual'" >&2
    exit 1
  fi
}
```

- [ ] **Step 3: `presignup.js` schreiben**

```javascript
// Pre-signup trigger: auto-confirm every user.
// Production would use the same trigger — sign-up without email has no
// confirmation code, so users must be confirmed at creation time.
exports.handler = async (event) => {
  event.response.autoConfirmUser = true;
  return event;
};
```

- [ ] **Step 4: `01-setup-pool.sh` schreiben**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
save_var ACCOUNT_ID "$ACCOUNT_ID"

# --- IAM role for the pre-signup trigger ---
ROLE_ARN=$(aws iam create-role --role-name shopzebra-spike-presignup \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --query Role.Arn --output text)
aws iam attach-role-policy --role-name shopzebra-spike-presignup \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
save_var ROLE_ARN "$ROLE_ARN"
echo "Waiting 10s for IAM propagation..."
sleep 10

# --- Pre-signup Lambda ---
zip -q presignup.zip presignup.js
LAMBDA_ARN=$(aws lambda create-function --function-name shopzebra-spike-presignup \
  --runtime nodejs20.x --handler presignup.handler --role "$ROLE_ARN" \
  --zip-file fileb://presignup.zip --query FunctionArn --output text)
save_var LAMBDA_ARN "$LAMBDA_ARN"

# --- Throwaway user pool: email as ALIAS (not required), auto-verify on ---
POOL_ID=$(aws cognito-idp create-user-pool --pool-name shopzebra-spike-shadow \
  --alias-attributes email \
  --auto-verified-attributes email \
  --lambda-config "PreSignUp=$LAMBDA_ARN" \
  --query UserPool.Id --output text)
save_var POOL_ID "$POOL_ID"

# Allow Cognito to invoke the trigger
aws lambda add-permission --function-name shopzebra-spike-presignup \
  --statement-id cognito-invoke --action lambda:InvokeFunction \
  --principal cognito-idp.amazonaws.com \
  --source-arn "arn:aws:cognito-idp:$REGION:$ACCOUNT_ID:userpool/$POOL_ID" > /dev/null

# --- App client: no secret, plain password auth (what the app would use) ---
CLIENT_ID=$(aws cognito-idp create-user-pool-client --user-pool-id "$POOL_ID" \
  --client-name spike-client --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --query UserPoolClient.ClientId --output text)
save_var CLIENT_ID "$CLIENT_ID"

echo "Pool:   $POOL_ID"
echo "Client: $CLIENT_ID"
```

- [ ] **Step 5: Ausführen und prüfen**

Run: `chmod +x spikes/cognito-shadow-account/*.sh && spikes/cognito-shadow-account/01-setup-pool.sh`
Expected: Pool-ID (`eu-central-1_...`) und Client-ID werden ausgegeben; `.env.spike` enthält alle vier Variablen.

---

### Task 2: Silent-SignUp ohne E-Mail + Login → `sub` festhalten

**Verifiziert die Kern-Behauptung:** Ein User ohne jedes Attribut kann angelegt werden, ist durch den Trigger sofort bestätigt und bekommt per `USER_PASSWORD_AUTH` normale JWTs.

**Files:**
- Create: `spikes/cognito-shadow-account/02-signup-signin.sh`

**Interfaces:**
- Consumes: `POOL_ID`, `CLIENT_ID` aus `.env.spike`; Helfer `jwt_claim`, `expect`, `save_var`
- Produces: `SHADOW_USERNAME`, `SHADOW_PASSWORD`, `SUB1`, `ACCESS_TOKEN` in `.env.spike`

- [ ] **Step 1: `02-signup-signin.sh` schreiben**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

# --- Silent sign-up: UUID username, random password, NO attributes ---
SHADOW_USERNAME=$(uuidgen | tr '[:upper:]' '[:lower:]')
SHADOW_PASSWORD=$(openssl rand -base64 30)
save_var SHADOW_USERNAME "$SHADOW_USERNAME"
save_var SHADOW_PASSWORD "$SHADOW_PASSWORD"

SIGNUP=$(aws cognito-idp sign-up --client-id "$CLIENT_ID" \
  --username "$SHADOW_USERNAME" --password "$SHADOW_PASSWORD")
CONFIRMED=$(echo "$SIGNUP" | jq -r .UserConfirmed)
expect "user auto-confirmed by pre-signup trigger" "$CONFIRMED" "true"

# --- Sign in with the generated credentials ---
AUTH=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=$SHADOW_USERNAME,PASSWORD=$SHADOW_PASSWORD")
ID_TOKEN=$(echo "$AUTH" | jq -r .AuthenticationResult.IdToken)
ACCESS_TOKEN=$(echo "$AUTH" | jq -r .AuthenticationResult.AccessToken)
save_var ACCESS_TOKEN "$ACCESS_TOKEN"

SUB1=$(jwt_claim "$ID_TOKEN" sub)
[ -n "$SUB1" ] || { echo "FAIL: no sub in id token" >&2; exit 1; }
save_var SUB1 "$SUB1"

echo "OK: signed in without email. sub=$SUB1"
```

- [ ] **Step 2: Ausführen und prüfen**

Run: `spikes/cognito-shadow-account/02-signup-signin.sh`
Expected: `OK: user auto-confirmed...` und `OK: signed in without email. sub=<uuid>`. Bei `UserNotConfirmedException` → Trigger-Verdrahtung aus Task 1 prüfen (`add-permission`, `--lambda-config`).

---

### Task 3: E-Mail als Alias nachrüsten + Login per E-Mail → gleiche `sub`

**Verifiziert das Verknüpfen per E-Mail:** `update-user-attributes` mit Access-Token (der Weg, den die App geht), Code aus dem echten Postfach, danach Login mit der E-Mail im `USERNAME`-Feld — und die `sub` muss identisch sein. Zweigeteilt, weil der Code manuell aus dem Postfach kommt.

**Files:**
- Create: `spikes/cognito-shadow-account/03a-add-email.sh`
- Create: `spikes/cognito-shadow-account/03b-verify-and-login.sh`

**Interfaces:**
- Consumes: `ACCESS_TOKEN`, `CLIENT_ID`, `SHADOW_PASSWORD`, `SUB1` aus `.env.spike`
- Produces: `SPIKE_EMAIL` in `.env.spike`; `03b` nimmt den Verifikationscode als `$1`

- [ ] **Step 1: `03a-add-email.sh` schreiben**

```bash
#!/usr/bin/env bash
# Usage: 03a-add-email.sh <email>
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

SPIKE_EMAIL="${1:?usage: 03a-add-email.sh <email>}"
save_var SPIKE_EMAIL "$SPIKE_EMAIL"

# User-facing call (access token, not admin) — the same call the app makes
aws cognito-idp update-user-attributes --access-token "$ACCESS_TOKEN" \
  --user-attributes "Name=email,Value=$SPIKE_EMAIL" \
  | jq .CodeDeliveryDetailsList

echo "Check the inbox of $SPIKE_EMAIL, then run: ./03b-verify-and-login.sh <code>"
```

- [ ] **Step 2: `03b-verify-and-login.sh` schreiben**

```bash
#!/usr/bin/env bash
# Usage: 03b-verify-and-login.sh <verification-code>
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

CODE="${1:?usage: 03b-verify-and-login.sh <verification-code>}"

# Verify the email — after this it becomes an active alias
aws cognito-idp verify-user-attribute --access-token "$ACCESS_TOKEN" \
  --attribute-name email --code "$CODE"

# Sign in using the EMAIL as username, same password as before
AUTH=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=$SPIKE_EMAIL,PASSWORD=$SHADOW_PASSWORD")
ID_TOKEN=$(echo "$AUTH" | jq -r .AuthenticationResult.IdToken)
SUB_EMAIL=$(jwt_claim "$ID_TOKEN" sub)

expect "login via email alias yields SAME sub" "$SUB_EMAIL" "$SUB1"
echo "OK: email alias works, identity is stable."
```

- [ ] **Step 3: Ausführen**

Run: `spikes/cognito-shadow-account/03a-add-email.sh christian.bannes+spike@pagnos.com` (Adresse vorher mit dem Nutzer bestätigen)
Expected: `CodeDeliveryDetailsList` mit `DeliveryMedium: EMAIL`.

- [ ] **Step 4: Code aus dem Postfach holen (manuell — Nutzer fragen) und verifizieren**

Run: `spikes/cognito-shadow-account/03b-verify-and-login.sh <CODE>`
Expected: `OK: login via email alias yields SAME sub`.

*Hinweis:* In der App würde der Nutzer hier zusätzlich per Change-Password ein eigenes Passwort setzen (App kennt das Zufallspasswort). Das ist Standard-Cognito und wird im Spike nicht extra getestet.

---

### Task 4: Randfall `AliasExistsException` — E-Mail gehört schon jemandem

**Verifiziert das Signal für den Merge-Fall:** Ein zweiter User versucht, dieselbe E-Mail zu verifizieren. Laut Doku schlägt erst die *Verifikation* fehl (`AliasExistsException`) — genau dieses Verhalten (und den genauen Fehlerzeitpunkt) festhalten, denn der „Konto existiert schon"-Flow der App hängt daran.

**Files:**
- Create: `spikes/cognito-shadow-account/04-alias-exists.sh`

**Interfaces:**
- Consumes: `CLIENT_ID`, `SPIKE_EMAIL` aus `.env.spike`
- Produces: Beobachtung für `findings.md` (welcher Call wirft wann welchen Fehler)

- [ ] **Step 1: `04-alias-exists.sh` schreiben**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

# Second shadow user
USER2=$(uuidgen | tr '[:upper:]' '[:lower:]')
PASS2=$(openssl rand -base64 30)
aws cognito-idp sign-up --client-id "$CLIENT_ID" --username "$USER2" --password "$PASS2" > /dev/null
AUTH2=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" --auth-parameters "USERNAME=$USER2,PASSWORD=$PASS2")
TOKEN2=$(echo "$AUTH2" | jq -r .AuthenticationResult.AccessToken)

# Try to claim the SAME email as user 1
echo "--- update-user-attributes with already-used email:"
if aws cognito-idp update-user-attributes --access-token "$TOKEN2" \
     --user-attributes "Name=email,Value=$SPIKE_EMAIL" 2>&1; then
  echo "(accepted — per docs the conflict surfaces at VERIFY time)"
fi

echo
echo "Record for findings.md:"
echo "- did update-user-attributes succeed or throw AliasExistsException?"
echo "- if it succeeded: run verify-user-attribute with the new code and"
echo "  record whether THAT throws AliasExistsException (expected per docs)."
```

- [ ] **Step 2: Ausführen und Verhalten protokollieren**

Run: `spikes/cognito-shadow-account/04-alias-exists.sh`
Expected: Entweder wirft schon `update-user-attributes` den Fehler, oder erst `verify-user-attribute` (Doku sagt Letzteres). Beobachtetes Verhalten wörtlich in `findings.md` notieren (Task 6). Falls ein zweiter Code aufs Postfach kommt: mit `aws cognito-idp verify-user-attribute --access-token <TOKEN2> --attribute-name email --code <CODE>` den Verify-Pfad testen — **Erwartung: `AliasExistsException`, und der Alias von User 1 bleibt intakt** (Gegenprobe: Login per E-Mail liefert weiterhin `SUB1`).

---

### Task 5: Google-IdP + `AdminLinkProviderForUser` → Federated Login auf derselben `sub`

**Der heikelste Teil.** Ablauf: Google-OAuth-Client anlegen (manuell), IdP + Hosted-UI-Domain im Pool konfigurieren, Google-`sub` des Testkontos ermitteln, linken, dann per Browser über die Hosted UI mit Google einloggen und beweisen, dass das Token die `sub` des Schattenkonto-Users trägt — und kein zweiter User entstanden ist.

**Files:**
- Create: `spikes/cognito-shadow-account/05a-google-idp.sh`
- Create: `spikes/cognito-shadow-account/05b-link-google.sh`
- Create: `spikes/cognito-shadow-account/05c-exchange-code.sh`

**Interfaces:**
- Consumes: `POOL_ID`, `CLIENT_ID`, `SHADOW_USERNAME`, `SUB1` aus `.env.spike`
- Produces: `COGNITO_DOMAIN` in `.env.spike`; `05b` nimmt die Google-`sub` als `$1`; `05c` nimmt den Authorization-Code als `$1`

- [ ] **Step 1: Google-OAuth-Client anlegen (manuell, mit dem Nutzer)**

In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → „Credentials" → „Create OAuth client ID" → Typ **Web application**:
- Authorized redirect URI: `https://shopzebra-spike-<SUFFIX>.auth.eu-central-1.amazoncognito.com/oauth2/idpresponse` (SUFFIX = beliebig, z.B. 6 Zufallszeichen — merken, wird in Step 2 als Domain-Präfix verwendet)
- Client-ID und Client-Secret notieren (werden Step 2 als Argumente übergeben, **nicht** in Dateien ablegen)

- [ ] **Step 2: `05a-google-idp.sh` schreiben**

```bash
#!/usr/bin/env bash
# Usage: 05a-google-idp.sh <domain-suffix> <google-client-id> <google-client-secret>
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

SUFFIX="${1:?usage: 05a-google-idp.sh <domain-suffix> <google-client-id> <google-client-secret>}"
G_CLIENT_ID="${2:?missing google client id}"
G_CLIENT_SECRET="${3:?missing google client secret}"
DOMAIN="shopzebra-spike-$SUFFIX"
save_var COGNITO_DOMAIN "$DOMAIN"

aws cognito-idp create-user-pool-domain --domain "$DOMAIN" --user-pool-id "$POOL_ID"

aws cognito-idp create-identity-provider --user-pool-id "$POOL_ID" \
  --provider-name Google --provider-type Google \
  --provider-details "client_id=$G_CLIENT_ID,client_secret=$G_CLIENT_SECRET,authorize_scopes=openid email profile" \
  --attribute-mapping email=email

# Enable hosted-UI code flow + Google on the app client
aws cognito-idp update-user-pool-client --user-pool-id "$POOL_ID" \
  --client-id "$CLIENT_ID" \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO Google \
  --callback-urls "https://example.com/cb" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client > /dev/null

echo "Hosted UI ready: https://$DOMAIN.auth.$REGION.amazoncognito.com"
```

- [ ] **Step 3: Ausführen**

Run: `spikes/cognito-shadow-account/05a-google-idp.sh <SUFFIX> <GOOGLE_CLIENT_ID> <GOOGLE_CLIENT_SECRET>`
Expected: Domain-URL wird ausgegeben, keine Fehler.

- [ ] **Step 4: Google-`sub` des Testkontos ermitteln (Browser, VOR jedem Cognito-Google-Login)**

Die App kennt die Google-`sub` aus dem OAuth-Response, *bevor* sie linkt. Im Spike holen wir sie, **ohne** die Cognito-Hosted-UI zu berühren (sonst entsteht der Duplikat-User, den wir gerade vermeiden wollen): [Google OAuth Playground](https://developers.google.com/oauthplayground) → Zahnrad → „Use your own OAuth credentials" (Client aus Step 1; dort `https://developers.google.com/oauthplayground` als zusätzliche Redirect-URI eintragen) → Scope `openid` autorisieren → ID-Token dekodieren (`jwt_claim <token> sub` oder jwt.io) → Google-`sub` notieren.

- [ ] **Step 5: `05b-link-google.sh` schreiben**

```bash
#!/usr/bin/env bash
# Usage: 05b-link-google.sh <google-sub>
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

GOOGLE_SUB="${1:?usage: 05b-link-google.sh <google-sub>}"

# Link BEFORE the Google identity ever signs in via Cognito —
# otherwise Cognito auto-creates a separate federated user.
aws cognito-idp admin-link-provider-for-user --user-pool-id "$POOL_ID" \
  --destination-user "ProviderName=Cognito,ProviderAttributeValue=$SHADOW_USERNAME" \
  --source-user "ProviderName=Google,ProviderAttributeName=Cognito_Subject,ProviderAttributeValue=$GOOGLE_SUB"

echo "Linked. Now sign in via hosted UI:"
echo "https://$COGNITO_DOMAIN.auth.$REGION.amazoncognito.com/oauth2/authorize?client_id=$CLIENT_ID&response_type=code&scope=openid+email+profile&redirect_uri=https://example.com/cb&identity_provider=Google"
echo "After Google login you land on https://example.com/cb?code=XXXX — run: ./05c-exchange-code.sh XXXX"
```

- [ ] **Step 6: `05c-exchange-code.sh` schreiben**

```bash
#!/usr/bin/env bash
# Usage: 05c-exchange-code.sh <authorization-code>
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

CODE="${1:?usage: 05c-exchange-code.sh <authorization-code>}"

RESP=$(curl -s -X POST "https://$COGNITO_DOMAIN.auth.$REGION.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&client_id=$CLIENT_ID&code=$CODE&redirect_uri=https://example.com/cb")
ID_TOKEN=$(echo "$RESP" | jq -r .id_token)
[ "$ID_TOKEN" != "null" ] || { echo "FAIL: token exchange: $RESP" >&2; exit 1; }

SUB_GOOGLE=$(jwt_claim "$ID_TOKEN" sub)
expect "federated Google login yields SAME sub" "$SUB_GOOGLE" "$SUB1"

echo "--- claims worth recording (username/identities):"
jwt_claim "$ID_TOKEN" "cognito:username"
jwt_claim "$ID_TOKEN" identities

# Prove no duplicate user was created
COUNT=$(aws cognito-idp list-users --user-pool-id "$POOL_ID" --query 'length(Users)' --output text)
echo "user count in pool (expect 2 — shadow user + task-4 user, NO google_ user): $COUNT"
aws cognito-idp list-users --user-pool-id "$POOL_ID" \
  --query 'Users[].Username' --output table
```

- [ ] **Step 7: Linken + Browser-Login + Code-Tausch ausführen**

Run: `spikes/cognito-shadow-account/05b-link-google.sh <GOOGLE_SUB>` → ausgegebene URL im Browser öffnen (Chrome-Tools oder Nutzer) → Google-Login → Code aus der Redirect-URL kopieren → `spikes/cognito-shadow-account/05c-exchange-code.sh <CODE>`
Expected: `OK: federated Google login yields SAME sub`; User-Zahl = 2 (kein `google_...`-User). Die `cognito:username`/`identities`-Claims wörtlich für `findings.md` notieren (bekannte Quirk-Zone — genau dafür ist der Spike da).

---

### Task 6: Findings dokumentieren + Teardown

**Files:**
- Create: `spikes/cognito-shadow-account/findings.md`
- Create: `spikes/cognito-shadow-account/99-teardown.sh`
- Modify: `architecture/accountless-first-planned.md` (Status-Abschnitt: Spike-Ergebnis)

**Interfaces:**
- Consumes: alle Beobachtungen aus Tasks 2–5

- [ ] **Step 1: `findings.md` schreiben** — pro Behauptung eine Zeile mit Ergebnis:

```markdown
# Spike-Ergebnis: Cognito-Schattenkonto (2026-08-02)

| # | Behauptung | Ergebnis | Beobachtung |
|---|---|---|---|
| 1 | SignUp ohne E-Mail möglich, Auto-Confirm per PreSignUp-Trigger | ✅/❌ | |
| 2 | Login mit UUID-Username + Zufallspasswort liefert JWTs | ✅/❌ | |
| 3 | E-Mail per update-user-attributes nachrüstbar, Login per E-Mail-Alias → gleiche sub | ✅/❌ | |
| 4 | Fremde E-Mail: AliasExistsException bei <Call>, Alias des Erstnutzers bleibt intakt | ✅/❌ | genauer Fehlerzeitpunkt: |
| 5 | AdminLinkProviderForUser vor erstem Federated Login → Google-Login liefert gleiche sub, kein Duplikat-User | ✅/❌ | cognito:username-Claim: / identities-Claim: |

## Nicht getestet (bewusst)
- Apple Sign-In (gleiche API, braucht Dev-Account) — Restrisiko
- Change-Password nach E-Mail-Verknüpfung (Standard-Cognito)

## Konsequenzen für den Umsetzungs-Entwurf
- (hier eintragen, was anders werden muss als in accountless-first-planned.md angenommen)
```

- [ ] **Step 2: `99-teardown.sh` schreiben**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

aws cognito-idp delete-user-pool-domain --domain "$COGNITO_DOMAIN" --user-pool-id "$POOL_ID" || true
aws cognito-idp delete-user-pool --user-pool-id "$POOL_ID"
aws lambda delete-function --function-name shopzebra-spike-presignup
aws iam detach-role-policy --role-name shopzebra-spike-presignup \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name shopzebra-spike-presignup
rm -f .env.spike presignup.zip
echo "Spike resources removed. (Google OAuth client in der Google Console manuell löschen.)"
```

- [ ] **Step 3: Mit dem Nutzer klären, ob der Test-Pool noch gebraucht wird, dann Teardown ausführen**

Run: `spikes/cognito-shadow-account/99-teardown.sh`
Expected: keine Fehler; `aws cognito-idp list-user-pools --max-results 20` zeigt keinen `shopzebra-spike-*`-Pool mehr.

- [ ] **Step 4: `architecture/accountless-first-planned.md` aktualisieren**

Im Abschnitt „Status": „Spike ausstehend" ersetzen durch Ergebnis + Link auf `spikes/cognito-shadow-account/findings.md`. Task #1 (Tasksystem) auf completed setzen; Erkenntnisse, die den Entwurf ändern, in den „Entschieden"-Abschnitt einarbeiten.

---

## Abbruchkriterien

Der Spike ist **gescheitert** (→ zurück zur Options-Bewertung, Identity Pool / Firebase neu bewerten), wenn eine der Kern-Behauptungen 1, 3 oder 5 nicht hält — insbesondere wenn der Federated Login nach Linking eine andere `sub` liefert oder doch ein Duplikat-User entsteht. Kleinere Abweichungen (z.B. anderer Fehlerzeitpunkt bei Alias-Konflikt) sind kein Scheitern, sondern Input für den Entwurf.
