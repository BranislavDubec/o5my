// Single source of truth for the Terms of Service.
// TERMS_VERSION is bumped whenever the terms text changes; users whose
// accepted version is older are prompted to re-accept (see TermsGate).
// v1 = the legacy terms.pdf era. v2 = this in-app terms page.

export const TERMS_VERSION = 2;

export const TERMS_INTRO =
  "„Prečítal som si podmienky, vôbec ich nebudem dodržiavať, ale súhlasím s nimi.“";

export interface TermsSection {
  title: string;
  paragraphs: string[];
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: "1. Úvodné ustanovenia",
    paragraphs: [
      "Tieto podmienky sú záväzné tak isto, ako sľub „dnes určite nebudem meškať“.",
      "Používaním aplikácie potvrdzuješ, že si ich prečítal. Úprimne? Málokto to urobil. Ale veď o to tu nejde.",
    ],
  },
  {
    title: "2. Registrácia a prezývky",
    paragraphs: [
      "Prezývku si môžeš navrhnúť, ale konečné slovo má kolektív. Každá nepremenená tutovka môže viesť k premenovaniu na Krši.",
      "Svoje heslo nikomu neprezrádzaj. Nikto nepotrebuje tvoj účet — ani ty, keď si zabudol formu.",
    ],
  },
  {
    title: "3. Povinnosti hráča",
    paragraphs: [
      "Na tréning aj zápas chodíš načas. Hláška „idem, som na ceste“ sa uznáva len vtedy, keď naozaj stojíš na ceste.",
      "Výhovorky typu „natiahnutý sval“, „nestihol som MHD“ alebo „musel som so psom“ preveruje výbor na najbližšom stretnutí.",
    ],
  },
  {
    title: "4. Tutovky a zakončenie",
    paragraphs: [
      "Beriem na vedomie, že nepremenená tutovka môže mať za následok nosenie mena Krši, a to až do premenenej ďalšej.",
      "Streľba z prvej je vítaná. Streľba do tribúny sa eviduje. Tri tribúny za sezónu = jedno kolo pre spoluhráčov.",
    ],
  },
  {
    title: "5. Brankár",
    paragraphs: [
      "Brankár má vždy pravdu. Keď sa neinkasuje, má pravdu dvojnásobne.",
      "Gól dostane celý tím, ale pohľady sa upierajú na brankára. Tak už to je, bránka je tvoje pódium.",
    ],
  },
  {
    title: "6. Platby a príspevky",
    paragraphs: [
      "Členské sa platí včas. Každý deň meškania sa dá nahradiť kúpou guláša pre celý tím.",
      "Nepremenená jedenástka v poslednej minúte je automaticky večera pre všetkých. Toto nie je debatné.",
    ],
  },
  {
    title: "7. Klubová kultúra",
    paragraphs: [
      "Po zápase sa hodnotí výkon, nie výhovorky. Slovné spojenie „mohol som dať“ je povolené maximálne trikrát za večer.",
      "Výhra sa oslavuje spolu, prehra sa prežíva spolu. A vždy sa pamätá, kto presne mal tú tutovku.",
    ],
  },
  {
    title: "8. Zákazy",
    paragraphs: [
      "Zakazuje sa prihrávať súperovi, protestovať proti každému odpískaniu a obliekať ponožky, ktoré nezodpovedajú dresu.",
      "Zakazuje sa hovoriť „toto je posledný zápas sezóny“, keď o tri mesiace začína ďalšia. Už sme si to overili.",
    ],
  },
  {
    title: "9. Záverečné ustanovenia",
    paragraphs: [
      "Tieto podmienky sú účinné okamžite a nepodliehajú reklamácii. Spory sa riešia penaltovým rozstrelom, prípadne kameň–nožnice–papier.",
      "Ak sa niektoré ustanovenie ukáže ako neplatné, ostatné si z toho nič nerobia a platia ďalej.",
    ],
  },
];

