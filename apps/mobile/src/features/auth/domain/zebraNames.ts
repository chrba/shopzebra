// The names this app gives itself. Nobody is asked who they are: a device
// picks one of these at first start, and that is what the others see next to
// its changes. A question at the door would look like a registration — and
// registering is the one thing this app never does.
//
// Every name ends in "-zebra", and "das Zebra" is neuter in German, so none
// of them carries a gender. They also behave like proper nouns, which the
// screens rely on ("von Naschzebra", "Naschzebra hat Milch hinzugefügt") —
// an adjective would have to be declined and would read wrong.

/** 300 names — enough that six people on one list rarely collide (~5%). */
export const ZEBRA_NAMES: readonly string[] = [
  // Naschen & Backen
  'Naschzebra',
  'Knabberzebra',
  'Mampfzebra',
  'Schlemmzebra',
  'Futterzebra',
  'Snackzebra',
  'Kekszebra',
  'Kuchenzebra',
  'Waffelzebra',
  'Pfannkuchenzebra',
  'Muffinzebra',
  'Törtchenzebra',
  'Streuselzebra',
  'Glasurzebra',
  'Teigzebra',
  'Backzebra',
  'Zuckerzebra',
  'Honigzebra',
  'Marmeladenzebra',
  'Karamellzebra',
  'Vanillezebra',
  'Zimtzebra',
  'Marzipanzebra',
  'Puderzebra',

  // Süßkram
  'Bonbonzebra',
  'Lakritzzebra',
  'Nougatzebra',
  'Schokozebra',
  'Pralinenzebra',
  'Lollizebra',
  'Gummibärzebra',
  'Baiserzebra',
  'Krokantzebra',
  'Puddingzebra',
  'Eiszebra',
  'Tortenzebra',
  'Sahnezebra',
  'Kakaozebra',
  'Nusszebra',
  'Rosinenzebra',

  // Herzhaftes
  'Nudelzebra',
  'Suppenzebra',
  'Pizzazebra',
  'Brezelzebra',
  'Brötchenzebra',
  'Käsezebra',
  'Butterzebra',
  'Senfzebra',
  'Pommeszebra',
  'Salatzebra',
  'Reiszebra',
  'Linsenzebra',
  'Bohnenzebra',
  'Erbsenzebra',
  'Kartoffelzebra',
  'Knödelzebra',
  'Pfefferzebra',
  'Salzzebra',
  'Kräuterzebra',
  'Olivenzebra',

  // Obst
  'Apfelzebra',
  'Birnenzebra',
  'Kirschzebra',
  'Beerenzebra',
  'Melonenzebra',
  'Bananenzebra',
  'Traubenzebra',
  'Pfirsichzebra',
  'Zitronenzebra',
  'Limettenzebra',
  'Mangozebra',
  'Ananaszebra',
  'Kokoszebra',
  'Feigenzebra',
  'Dattelzebra',
  'Pflaumenzebra',
  'Aprikosenzebra',
  'Quittenzebra',
  'Holunderzebra',
  'Rhabarberzebra',

  // Gemüse
  'Möhrenzebra',
  'Kürbiszebra',
  'Tomatenzebra',
  'Paprikazebra',
  'Brokkolizebra',
  'Spinatzebra',
  'Zucchinizebra',
  'Gurkenzebra',
  'Radieschenzebra',
  'Selleriezebra',
  'Lauchzebra',
  'Fenchelzebra',
  'Rübenzebra',
  'Kohlzebra',
  'Spargelzebra',
  'Kressezebra',

  // Getränke
  'Kaffeezebra',
  'Teezebra',
  'Limozebra',
  'Sprudelzebra',
  'Saftzebra',
  'Milchzebra',
  'Smoothiezebra',
  'Eisteezebra',
  'Brausezebra',
  'Schorlezebra',
  'Punschzebra',
  'Mokkazebra',
  'Kamillenzebra',
  'Sirupzebra',

  // Bewegung
  'Flinkzebra',
  'Hüpfzebra',
  'Hoppelzebra',
  'Wuselzebra',
  'Trippelzebra',
  'Tapszebra',
  'Schlurfzebra',
  'Purzelzebra',
  'Wirbelzebra',
  'Zappelzebra',
  'Schlenderzebra',
  'Galoppzebra',
  'Sprintzebra',
  'Turbozebra',
  'Düsenzebra',
  'Rutschzebra',
  'Kraxelzebra',
  'Watschelzebra',
  'Stapfzebra',
  'Trabzebra',
  'Springzebra',
  'Kletterzebra',
  'Tänzelzebra',
  'Schaukelzebra',

  // Geräusche
  'Quietschzebra',
  'Summzebra',
  'Brummzebra',
  'Kicherzebra',
  'Schnarchzebra',
  'Pfeifzebra',
  'Trällerzebra',
  'Jubelzebra',
  'Schnaufzebra',
  'Prustzebra',
  'Gluckszebra',
  'Murmelzebra',
  'Plapperzebra',
  'Schnatterzebra',
  'Trompetenzebra',
  'Rasselzebra',
  'Klimperzebra',
  'Bimmelzebra',
  'Klopfzebra',
  'Niesezebra',

  // Gemüt & Ruhe
  'Kuschelzebra',
  'Flauschzebra',
  'Schmusezebra',
  'Träumzebra',
  'Schlummerzebra',
  'Döselzebra',
  'Gähnzebra',
  'Blinzelzebra',
  'Schnurrzebra',
  'Seufzerzebra',
  'Grinszebra',
  'Strahlzebra',
  'Freudenzebra',
  'Lächelzebra',
  'Wohlfühlzebra',
  'Ruhezebra',
  'Sanftzebra',
  'Weichzebra',
  'Warmzebra',
  'Nickerzebra',

  // Himmel & Wetter
  'Sonnenzebra',
  'Wolkenzebra',
  'Sternenzebra',
  'Mondzebra',
  'Regenbogenzebra',
  'Glitzerzebra',
  'Funkelzebra',
  'Regenzebra',
  'Schneezebra',
  'Nebelzebra',
  'Windzebra',
  'Sturmzebra',
  'Blitzzebra',
  'Donnerzebra',
  'Tauzebra',
  'Frostzebra',
  'Hagelzebra',
  'Dämmerzebra',
  'Morgenzebra',
  'Abendzebra',

  // Zeiten
  'Sommerzebra',
  'Winterzebra',
  'Herbstzebra',
  'Frühlingszebra',
  'Nachtzebra',
  'Mittagszebra',
  'Sonntagszebra',
  'Feiertagszebra',
  'Ferienzebra',
  'Wochenendzebra',
  'Frühzebra',
  'Spätzebra',

  // Stoffe & Dinge
  'Samtzebra',
  'Seidenzebra',
  'Wollzebra',
  'Plüschzebra',
  'Filzzebra',
  'Knopfzebra',
  'Bandzebra',
  'Schleifenzebra',
  'Kissenzebra',
  'Deckenzebra',
  'Sockenzebra',
  'Mützenzebra',
  'Schalzebra',
  'Handschuhzebra',
  'Taschenzebra',
  'Korbzebra',
  'Beutelzebra',
  'Kofferzebra',
  'Wagenzebra',
  'Kartonzebra',

  // Charakter
  'Neugierzebra',
  'Wunderzebra',
  'Abenteuerzebra',
  'Entdeckerzebra',
  'Forscherzebra',
  'Sammlerzebra',
  'Bastelzebra',
  'Kritzelzebra',
  'Malzebra',
  'Lesezebra',
  'Denkzebra',
  'Grübelzebra',
  'Planzebra',
  'Listenzebra',
  'Ordnungszebra',
  'Merkzebra',
  'Fleißzebra',
  'Helferzebra',
  'Teilzebra',
  'Schenkzebra',

  // Küche
  'Kochzebra',
  'Rührzebra',
  'Schnippelzebra',
  'Knetzebra',
  'Brutzelzebra',
  'Dampfzebra',
  'Ofenzebra',
  'Topfzebra',
  'Pfannenzebra',
  'Löffelzebra',
  'Gabelzebra',
  'Messerzebra',
  'Tellerzebra',
  'Tassenzebra',
  'Kannenzebra',
  'Schürzenzebra',
  'Schaumzebra',

  // Klein & Kringelig
  'Wichtelzebra',
  'Zwergzebra',
  'Knirpszebra',
  'Pünktchenzebra',
  'Tupfenzebra',
  'Fleckenzebra',
  'Ringelzebra',
  'Kringelzebra',
  'Zottelzebra',
  'Fusselzebra',
  'Flöckchenzebra',
  'Perlenzebra',
  'Tröpfchenzebra',
  'Krümelzebra',
  'Bröselzebra',
  'Stäubchenzebra',
  'Kügelchenzebra',
  'Häppchenzebra',
  'Schnipselzebra',
  'Zipfelzebra',
  'Konfettizebra',

  // Unterwegs
  'Reisezebra',
  'Wanderzebra',
  'Zeltzebra',
  'Kompasszebra',
  'Landkartenzebra',
  'Rucksackzebra',
  'Fährtenzebra',
  'Pfadzebra',
  'Brückenzebra',
  'Hügelzebra',
  'Wiesenzebra',
  'Waldzebra',
  'Seezebra',
  'Bachzebra',
  'Steppenzebra',
  'Savannenzebra',
]

/** Used when the draw somehow yields nothing — never in practice. */
const FALLBACK_NAME = 'Naschzebra'

const DRAWN_NAMES: ReadonlySet<string> = new Set(ZEBRA_NAMES)

/**
 * Whether this name came out of the hat rather than out of a person. No
 * flag is stored for it: the answer is in the name itself, and a stored
 * one could drift out of step with what the profile shows. Somebody who
 * types "Naschzebra" on purpose is treated as drawn — which is exactly
 * what the screens should then say anyway.
 */
export function isDrawnName(name: string): boolean {
  return DRAWN_NAMES.has(name)
}

/**
 * One name, drawn uniformly. Called once per device, at the very first
 * start, and never again — the drawn name is persisted, because somebody
 * whose name changes on every restart is nobody.
 *
 * Deliberately not usable from a reducer: reducers must stay replay-pure
 * (sync-engine.md §5), so the draw happens at the boundary and travels in
 * the action.
 */
export function randomZebraName(): string {
  const draw = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
  return ZEBRA_NAMES[draw % ZEBRA_NAMES.length] ?? FALLBACK_NAME
}
