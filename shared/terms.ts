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
      "Používaním aplikácie potvrdzuješ, že si ich prečítal. A keby aj nie. To je jedno, o to tu nejde.",
    ],
  },
  {
    title: "2. Registrácia a bezpečnosť účtu",
    paragraphs: [
      "Svoje heslo nikomu neprezrádzaj. Nikto nepotrebuje tvoj účet — ani ty.",
    ],
  },
  {
  title: "3. Obrana",
    paragraphs: [
    "Obranca nesmie po strate lopty zostať stáť s rukami vbok a skúmať, kto iný mal jeho hráča brániť.",
    "Veta „ja som si myslel, že ho máš ty“ sa nepovažuje za platný obranný systém.",
    "Hráč, ktorý sa nevráti do obrany, stráca právo kritizovať brankára pri najbližšom inkasovanom góle.",
    ],
  },
  {
    title: "4. Brankár",
    paragraphs: [
      "Brankár má vždy pravdu. Keď sa neinkasuje, má pravdu dvojnásobne.",
      "Ak brankár zakričí „mám“, ostatní hráči loptu nechajú jemu. Výnimkou je situácia, keď očividne nemá.",
    "Za inkasovaný gól môže obrana, odraz, svetlo, lopta, povrch alebo nespravodlivosť života. Brankár až ako posledná možnosť.",
    ],
  },
  {
    title: "5. Platby a príspevky",
    paragraphs: [
      "Členské sa platí včas. Každý deň meškania sa dá nahradiť umytím chrbáta vedúceho.",
    ],
  },
  {
    title: "6. Klubová kultúra",
    paragraphs: [
      "Výhra sa oslavuje spolu, prehra sa prežíva spolu. Braňo si zapamätá, kto dá koľko gólov.",
    ],
  },
  {
    title: "7. Zákazy",
    paragraphs: [
      "Zakazuje sa prihrávať súperovi, protestovať proti každému odpískaniu a obliekať ponožky, ktoré nezodpovedajú dresu.",
      "Zakazuje sa po nepodarenej prihrávke ukazovať na miesto, kam mal podľa hráča spoluhráč zázračne dobehnúť.",
      "Zakazuje sa kričať „čas“ spoluhráčovi, ktorý žiadny čas nemá.",
    ],
  },
  {
    title: "8. Ochrana osobných údajov",
    paragraphs: [
    "Aplikácia môže spracúvať meno, prezývku, dochádzku, štatistiky a ďalšie údaje nevyhnutné na fungovanie tímu.",
    "Údaje sa neposkytujú tretím stranám, pokiaľ za to dobre nezaplatia.",
    ],
    },
  {
    title: "9. Záverečné ustanovenia",
    paragraphs: [
      "Tieto podmienky sú účinné okamžite a nepodliehajú reklamácii. Spory sa riešia  kameň–papier–nožnice.",
      "Prevádzkovateľ aplikácie môže podmienky kedykoľvek zmeniť, najmä po situácii, na ktorú existujúce pravidlá ešte nepamätali.",
      "Registráciou hráč potvrdzuje, že podmienkam rozumie, dobrovoľne s nimi súhlasí a nebude sa neskôr tváriť, že o ničom nevedel.",
    ],
  },
];

