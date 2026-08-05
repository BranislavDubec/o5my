// Single source of truth for the Terms of Service.
// TERMS_VERSION is bumped whenever the terms text changes; users whose
// accepted version is older are prompted to re-accept (see TermsGate).
// v1 = the legacy terms.pdf era. v2 = this in-app terms page.

export const TERMS_VERSION = 2;

export const TERMS_INTRO =
  "„Prečítal som si podmienky, nebudem ich dodržiavať, ale súhlasím s nimi.“";

export interface TermsSection {
  title: string;
  paragraphs: string[];
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: "1. Úvodné ustanovenia",
    paragraphs: [
      "Tieto podmienky sú záväzné tak isto, ako sľub „dnes dáme iba jedno“.",
      "Používaním aplikácie potvrdzuješ, že si ich prečítal. A keby aj nie. To je jedno, ale o to tu nejde.",
    ],
  },
  {
    title: "2. Registrácia a prezývky",
    paragraphs: [
      "Každá nepremenená tutovka môže viesť k premenovaniu na Krši.",
      "Svoje heslo nikomu neprezrádzaj. Nikto nepotrebuje tvoj účet — ani ty.",
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
    ],
  },
  {
    title: "6. Platby a príspevky",
    paragraphs: [
      "Členské sa platí včas. Každý deň meškania sa dá nahradiť umytím chrbáta vedúceho.",
    ],
  },
  {
    title: "7. Klubová kultúra",
    paragraphs: [
      "Výhra sa oslavuje spolu, prehra sa prežíva spolu. Braňo si zapamätá, kto dá koľko gólov.",
    ],
  },
  {
    title: "8. Zákazy",
    paragraphs: [
      "Zakazuje sa prihrávať súperovi, protestovať proti každému odpískaniu a obliekať ponožky, ktoré nezodpovedajú dresu.",
    ],
  },
  {
    title: "9. Záverečné ustanovenia",
    paragraphs: [
      "Tieto podmienky sú účinné okamžite a nepodliehajú reklamácii. Spory sa riešia  kameň–papier–nožnice.",
    ],
  },
];

