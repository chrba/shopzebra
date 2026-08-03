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
value = claims.get(sys.argv[2], '')
print(json.dumps(value) if isinstance(value, (list, dict)) else value)
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
