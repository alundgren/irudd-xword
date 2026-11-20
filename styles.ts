import type { Words } from "./grid";

export const voices = ["classic", "fieldnotes", "wordplay"] as const;
export type ClueVoice = (typeof voices)[number];
export const papers = ["newsprint", "chalk", "mechanical"] as const;
export type Paper = (typeof papers)[number];
export type PictureCorner = "left" | "right";

const guidance: Record<ClueVoice, string> = {
  classic:
    "Mix short definitions with a familiar name or place. Give the picture answer a clear way in.",
  fieldnotes:
    "Clue through an observable detail: sound, texture, habitat or use. Give one detail that distinguishes the answer.",
  wordplay:
    "Give a familiar word a second reading and signal the turn with ?. Keep the crossings and nearby clues straightforward.",
};
const art = [
  "A wide scene with two subjects whose relationship suggests a phrase.",
  "A close crop of an everyday object, keeping its identifying detail visible.",
  "An action caught mid-motion. Let the picture clue ask what is happening.",
  "A place suggested by recognizable details. Give a factual crossing for a proper name.",
];
const media = [
  "watercolour on paper",
  "two-colour linocut",
  "coloured pencil",
  "editorial gouache",
  "ink and wash",
];

export function dailyBrief(
  day: string,
  override?: string,
  corner?: string,
  paperOverride?: string,
) {
  const time = Date.parse(day + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== day
  )
    throw Error("Invalid edition date");
  const days = Math.floor(time / 86400000);
  const index = (n: number) => ((days % n) + n) % n;
  const voice = override ?? voices[index(voices.length)];
  if (!voices.includes(voice as ClueVoice))
    throw Error("Choose a voice from " + voices.join(", "));
  const picture_corner = corner ?? (index(2) === 0 ? "left" : "right");
  if (picture_corner !== "left" && picture_corner !== "right")
    throw Error("Choose left or right for the picture corner");
  const paper =
    paperOverride ?? papers[(index(3) + Math.floor(index(9) / 3)) % 3];
  if (!papers.includes(paper as Paper))
    throw Error("Choose a paper from " + papers.join(", "));
  return {
    paper: paper as Paper,
    edition_day: day,
    voice: voice as ClueVoice,
    picture_corner: picture_corner as PictureCorner,
    clue_voice: guidance[voice as ClueVoice],
    composition: art[index(art.length)],
    illustration_medium:
      paper === "chalk"
        ? "Ivory outline in chalk on dark slate"
        : paper === "mechanical"
          ? "Technical pen with construction lines on drafting paper"
          : media[index(media.length)],
  };
}

// Original Swedish keys for private drafts.
const alternatives: Record<Exclude<ClueVoice, "classic">, Words> = {
  fieldnotes: {
    FYR: "Blinkar över sundet",
    LIVBOJ: "Ring vid kajkanten",
    MÅS: "Skränar över kajen",
    REP: "Tvinnat ombord",
    SEGEL: "Buktar i vinden",
    TALL: "Har barr i par",
    ASK: "Träd med svarta knoppar",
    ÅRA: "Har blad i vattnet",
    KAJ: "Fast kant vid vattnet",
    DIMMA: "Döljer horisonten",
    LERA: "Formbar i vått tillstånd",
    ULL: "Värmer fåret",
    EKA: "Liten roddbåt",
    SÄL: "Dyker från skäret",
    SAND: "Korn under tårna",
    NÄT: "Har maskor",
    STEN: "Kan vara slipad av vågor",
  },
  wordplay: {
    FYR: "Kustens nattlampa?",
    LIVBOJ: "En ring att hålla sig till?",
    ÅRA: "Har blad utan att växa?",
    KAJ: "Här får båten ligga",
    RATT: "Rund vägvisare?",
    EKA: "Roddbåt med efterklang?",
    ASK: "Träd med lock?",
    NÄT: "Kan få napp utan spö",
    TALL: "Barrträd",
    SEGEL: "Får fart av en pust",
    DIMMA: "Gör utsikten oklar",
    TE: "Blad i koppen",
    VIK: "Bukt vid kusten",
    ULL: "Fårets vinterkläder?",
    MÅS: "Vitgrå fågel vid havet",
    REP: "Tamp ombord",
  },
};

export function clueBank(words: Words, lang: string, voice: ClueVoice): Words {
  if (lang !== "sv" || voice === "classic") return words;
  return Object.fromEntries(
    Object.entries(words).map(([word, clue]) => [
      word,
      alternatives[voice][word] ?? clue,
    ]),
  );
}
