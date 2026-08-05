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
      "Členské sa platí včas. Každý deň meškania sa dá nahradiť umytím chrbta.",
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

export type TermsLanguage = "sk" | "cz" | "en";

export const TERMS_INTRO_EN =
  "„I have read the terms, I won't follow them, but I agree with them.“";

export const TERMS_SECTIONS_EN: TermsSection[] = [
  {
    title: "1. Preliminary Provisions",
    paragraphs: [
      "These terms are just as binding as the promise „we'll only have one more“.",
      "By using the app you confirm you have read them. And even if you didn't. Whatever, that's not the point.",
    ],
  },
  {
    title: "2. Registration and Account Security",
    paragraphs: [
      "Don't share your password with anyone. Nobody needs your account — not even you.",
    ],
  },
  {
    title: "3. Defence",
    paragraphs: [
      "A defender must not stand still with his hands on his hips after losing the ball, wondering who else should have been marking his man.",
      "The sentence „I thought you had him“ does not count as a valid defensive system.",
      "A player who doesn't track back loses the right to criticise the goalkeeper after the next goal conceded.",
    ],
  },
  {
    title: "4. Goalkeeper",
    paragraphs: [
      "The goalkeeper is always right. When nothing goes in, he is twice as right.",
      "When the goalkeeper shouts „mine“, the other players leave the ball for him. Exception: when he obviously doesn't have it.",
      "A conceded goal can be blamed on the defence, the rebound, the lights, the ball, the surface or the injustice of life. The goalkeeper only as a last resort.",
    ],
  },
  {
    title: "5. Payments and Contributions",
    paragraphs: [
      "Membership fees are paid on time. Every day of delay can be compensated by washing back.",
    ],
  },
  {
    title: "6. Club Culture",
    paragraphs: [
      "Wins are celebrated together, losses are suffered together. Braňo keeps track of who scores how many goals.",
    ],
  },
  {
    title: "7. Bans",
    paragraphs: [
      "It is forbidden to pass to the opponent, to protest every whistle and to wear socks that don't match the kit.",
      "It is forbidden to point at the spot where, after a bad pass, the teammate should have miraculously run.",
      "It is forbidden to shout „time“ to a teammate who has no time at all.",
    ],
  },
  {
    title: "8. Data Protection",
    paragraphs: [
      "The app may process name, nickname, attendance, statistics and other data necessary for the team to function.",
      "Data is not shared with third parties unless they pay well for it.",
    ],
  },
  {
    title: "9. Final Provisions",
    paragraphs: [
      "These terms are effective immediately and are not subject to complaint. Disputes are settled with rock–paper–scissors.",
      "The app operator may change the terms at any time, especially after a situation the existing rules didn't cover yet.",
      "By registering, the player confirms that they understand the terms, agree to them voluntarily and won't later pretend they knew nothing.",
    ],
  },
];

export const TERMS_INTRO_CZ =
  "„Přečetl jsem si podmínky, nebudu je dodržovat, ale souhlasím s nimi.“";

export const TERMS_SECTIONS_CZ: TermsSection[] = [
  {
    title: "1. Úvodní ustanovení",
    paragraphs: [
      "Tyto podmínky jsou závazné stejně jako slib „dnes dáme jen jedno“.",
      "Používáním aplikace potvrzuješ, že jsi je přečetl. A i kdyby ne. To je jedno, o to tu nejde.",
    ],
  },
  {
    title: "2. Registrace a bezpečnost účtu",
    paragraphs: [
      "Své heslo nikomu neprozrazuj. Nikdo nepotřebuje tvůj účet — ani ty.",
    ],
  },
  {
    title: "3. Obrana",
    paragraphs: [
      "Obránce nesmí po ztrátě míče zůstat stát s rukama v bok a zkoumat, kdo jiný měl jeho hráče bránit.",
      "Věta „já myslel, že ho máš ty“ se nepovažuje za platný obranný systém.",
      "Hráč, který se nevrátí do obrany, ztrácí právo kritizovat brankáře při nejbližším inkasovaném gólu.",
    ],
  },
  {
    title: "4. Brankář",
    paragraphs: [
      "Brankář má vždy pravdu. Když se neinkasuje, má pravdu dvojnásobně.",
      "Když brankář zakřičí „mám“, ostatní hráči míč nechají jemu. Výjimkou je situace, kdy ho očividně nemá.",
      "Za inkasovaný gól může obrana, odraz, světlo, míč, povrch nebo nespravedlnost života. Brankář až jako poslední možnost.",
    ],
  },
  {
    title: "5. Platby a příspěvky",
    paragraphs: [
      "Členské se platí včas. Každý den zpoždění se dá nahradit umytím zad.",
    ],
  },
  {
    title: "6. Klubová kultura",
    paragraphs: [
      "Výhra se slaví spolu, prohra se prožívá spolu. Braňo si zapamatuje, kdo dá kolik gólů.",
    ],
  },
  {
    title: "7. Zákazy",
    paragraphs: [
      "Zakazuje se přihrávat soupeři, protestovat proti každému odpískání a nosit ponožky, které neodpovídají dresu.",
      "Zakazuje se po nepovedené přihrávce ukazovat na místo, kam měl podle hráče spoluhráč zázračně doběhnout.",
      "Zakazuje se křičet „čas“ spoluhráči, který žádný čas nemá.",
    ],
  },
  {
    title: "8. Ochrana osobních údajů",
    paragraphs: [
      "Aplikace může zpracovávat jméno, přezdívku, docházku, statistiky a další údaje nezbytné pro fungování týmu.",
      "Údaje se neposkytují třetím stranám, pokud za to dobře nezaplatí.",
    ],
  },
  {
    title: "9. Závěrečná ustanovení",
    paragraphs: [
      "Tyto podmínky jsou účinné okamžitě a nepodléhají reklamaci. Spory se řeší kámen–nůžky–papír.",
      "Provozovatel aplikace může podmínky kdykoli změnit, zejména po situaci, na kterou stávající pravidla ještě nepamatovala.",
      "Registrací hráč potvrzuje, že podmínkám rozumí, dobrovolně s nimi souhlasí a nebude se později tvářit, že o ničem nevěděl.",
    ],
  },
];

