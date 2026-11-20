import { Database } from "bun:sqlite";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  cells,
  checkRect,
  inspect,
  pictures,
  validate,
  type Entry,
  type Words,
  type Pack,
} from "./grid";

import { dailyBrief, clueBank, type ClueVoice, type Paper } from "./styles";

export function bank(root: string, lang: string): Words {
  const rows = readFileSync(join(root, "words.tsv"), "utf8")
    .trimEnd()
    .split(/\r?\n/)
    .map((row) => row.split("\t"));
  return Object.fromEntries(
    rows.filter((r) => r[0] === lang).map(([, w, c]) => [w, c]),
  );
}
type EditionRow = {
  id: number;
  lang: string;
  day: string;
  title: string;
  voice: ClueVoice;
  paper: Paper;
  entries: string;
  clues: string;
  layout: string;
  feedback: string;
  picture: string;
};
export class Collection {
  readonly db: Database;
  constructor(
    readonly root: string,
    readonly directory = process.env.XWORD_DATA ||
      join(homedir(), ".local/share/irudd-xword"),
  ) {
    mkdirSync(directory, { recursive: true });
    this.db = new Database(join(directory, "editions.sqlite"), {
      create: true,
    });
    this.db.exec("PRAGMA busy_timeout=5000");
    this.db
      .transaction(() => {
        this.db.exec(
          "CREATE TABLE IF NOT EXISTS editions(id INTEGER PRIMARY KEY,lang TEXT,day TEXT,entries TEXT,clues TEXT,feedback TEXT DEFAULT '')",
        );
        const columns = this.db.query("PRAGMA table_info(editions)").all() as {
          name: string;
        }[];
        for (const [name, initial] of [
          ["picture", "illustration.png"],
          ["layout", "picture-first"],
          ["title", ""],
          ["voice", "classic"],
          ["paper", "newsprint"],
          ["editorial_note", ""],
        ]) {
          if (!columns.some((c) => c.name === name))
            this.db.exec(
              `ALTER TABLE editions ADD COLUMN ${name} TEXT DEFAULT '${initial}'`,
            );
        }
        this.db.exec(
          "CREATE UNIQUE INDEX IF NOT EXISTS named_editions ON editions(lang,day,title) WHERE title <> ''; CREATE TABLE IF NOT EXISTS marks(edition INTEGER,cell TEXT,guess TEXT,PRIMARY KEY(edition,cell)); CREATE TABLE IF NOT EXISTS panels(edition INTEGER,slot INTEGER,filename TEXT,rect TEXT,PRIMARY KEY(edition,slot))",
        );
      })
      .immediate();
  }
  list() {
    return this.db
      .query("SELECT id,lang,day,title FROM editions ORDER BY day DESC,id DESC")
      .values();
  }
  library() {
    const rows = this.db
      .query(
        "SELECT id,lang,day,title,entries,paper FROM editions ORDER BY day DESC,id DESC",
      )
      .all() as EditionRow[];
    const marks = this.db.query(
      "SELECT cell,guess FROM marks WHERE edition=? AND guess<>''",
    );
    return rows.map(({ id, lang, day, title, entries, paper }) => {
      const answers = JSON.parse(entries) as Entry[];
      const grid = inspect(answers);
      const total = grid.letters.size;
      let filled = 0,
        correct = 0;
      for (const [cell, guess] of marks.values(id) as string[][]) {
        if (!grid.letters.has(cell)) continue;
        filled++;
        if (grid.letters.get(cell) === guess.toUpperCase()) correct++;
      }
      // A tiny facsimile of the letter squares. Only coordinates leave the server.
      const squares = [...grid.letters.keys()]
        .map((key) => "M" + key + "h.88v.88h-.88z")
        .join("");
      return {
        id,
        lang,
        day,
        title,
        paper,
        total,
        filled,
        solved: total > 0 && correct === total,
        count: answers.length,
        squares,
        bounds: total
          ? [grid.left, grid.top, grid.width, grid.height]
          : [0, 0, 1, 1],
      };
    });
  }
  recentEditions(lang: string, day: string) {
    return this.db
      .query(
        "SELECT day,title,voice,paper,editorial_note,feedback FROM editions WHERE lang=? AND day<=? ORDER BY day DESC,id DESC LIMIT 6",
      )
      .all(lang, day);
  }
  history(lang: string) {
    return (
      this.db
        .query(
          "SELECT id,day,paper,voice,entries,feedback FROM editions WHERE lang=? ORDER BY id",
        )
        .all(lang) as EditionRow[]
    ).map(({ id, day, paper, voice, entries, feedback }) => ({
      id,
      day,
      voice,
      paper,
      entries: JSON.parse(entries) as Entry[],
      feedback,
    }));
  }
  row(id: number) {
    return this.db
      .query("SELECT * FROM editions WHERE id=?")
      .get(id) as EditionRow | null;
  }
  publicPuzzle(row: EditionRow) {
    const clues = JSON.parse(row.clues) as string[];
    const panels = this.db
      .query("SELECT slot,rect FROM panels WHERE edition=? ORDER BY slot")
      .all(row.id) as { slot: number; rect: string }[];
    return {
      panels: panels.map((p) => ({ ...p, rect: JSON.parse(p.rect) })),
      entries: (JSON.parse(row.entries) as Entry[]).map((e, i) => ({
        cells: cells(e),
        direction: e.slice(3),
        clue: clues[i],
      })),
      feedback: row.feedback,
      title: row.title,
      lang: row.lang,
      layout: row.layout,
      paper: row.paper,
      guesses: Object.fromEntries(
        this.db
          .query("SELECT cell,guess FROM marks WHERE edition=?")
          .values(row.id) as string[][],
      ),
    };
  }
  image(row: EditionRow, slot?: number) {
    const name =
      slot === undefined
        ? row.picture
        : (
            this.db
              .query("SELECT filename FROM panels WHERE edition=? AND slot=?")
              .get(row.id, slot) as { filename: string } | null
          )?.filename;
    if (name === "illustration.png") return Bun.file(join(this.root, name));
    if (name && /^[0-9a-f]{64}\.png$/.test(name))
      return Bun.file(join(this.directory, name));
  }
  check(row: EditionRow, guesses: Record<string, string>) {
    const { letters } = inspect(JSON.parse(row.entries));
    const wrong: string[] = [];
    let complete = true;
    for (const [cell, ch] of letters) {
      const g = guesses[cell]?.toUpperCase();
      if (g !== ch) {
        complete = false;
        if (g) wrong.push(cell);
      }
    }
    return { wrong, complete };
  }
  private storePicture(file: string) {
    const bytes = readFileSync(file);
    if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
      throw Error("Expected generated PNG");
    const name = createHash("sha256").update(bytes).digest("hex") + ".png";
    const target = join(this.directory, name);
    if (!existsSync(target)) {
      const temporary = target + "." + randomUUID();
      try {
        writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
        renameSync(temporary, target);
      } finally {
        rmSync(temporary, { force: true });
      }
    }
    return name;
  }
  publish(
    lang: string,
    file: string,
    options: { day?: string; voice?: string; paper?: string } = {},
  ) {
    if (!file) throw Error("An authored --pack FILE is required");
    if (lang !== "sv" && lang !== "en") throw Error("Choose sv or en");
    const layouts = ["picture-first", "grid-first", "side-by-side"];
    const pack: Pack = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(pack.entries) || !pack.entries.length)
      throw Error("An authored pack must include its grid entries");
    const day =
      options.day ?? pack.edition_day ?? new Date().toLocaleDateString("sv-SE");
    const { voice, paper } = dailyBrief(
      day,
      options.voice ?? pack.voice,
      undefined,
      options.paper ?? pack.paper,
    );
    const layout =
      pack.layout ?? layouts[this.history(lang).length % layouts.length];
    if (![...layouts, "illustrated-grid"].includes(layout))
      throw Error("Unknown layout");
    const anchor = pack.picture_answer.toUpperCase();
    const picture = this.storePicture(
      resolve(dirname(file), pack.art_by_paper?.[paper] ?? pack.generated_png),
    );
    const words = {
      ...clueBank(bank(this.root, lang), lang, voice),
      ...pack.words,
      [anchor]: pack.picture_clue,
    };
    const panels = new Map<string, string>();
    if (layout === "illustrated-grid") {
      panels.set(anchor, picture);
      for (const extra of pack.extra_pictures ?? []) {
        const w = extra.answer.toUpperCase();
        if (panels.has(w)) throw Error("Duplicate picture answer");
        panels.set(
          w,
          this.storePicture(
            resolve(
              dirname(file),
              extra.art_by_paper?.[paper] ?? extra.generated_png,
            ),
          ),
        );
        words[w] = extra.clue;
      }
    } else if (pack.extra_pictures?.length)
      throw Error("Additional pictures require illustrated-grid");
    for (const [w, c] of Object.entries(words))
      if (!/^[A-ZÅÄÖ]{2,30}$/.test(w) || typeof c !== "string" || !c.trim())
        throw Error("Invalid answer or blank clue");
    [...panels.keys()].forEach((w, i) => {
      words[w] = `Bild ${i + 1} · ${words[w]}`;
    });
    const entries = pack.entries;
    validate(entries, words);
    if (!entries.some((e) => e[0] === anchor))
      throw Error("Picture answer missing");
    if (pack.picture_rect) {
      if (panels.size !== 1)
        throw Error("An explicit rectangle needs one picture");
      checkRect(entries, pack.picture_rect);
    }
    const rects = pack.picture_rect
      ? [pack.picture_rect]
      : pictures(entries, [...panels.keys()]);
    return this.db.transaction(() => {
      const { lastInsertRowid: id } = this.db
        .query(
          "INSERT INTO editions(lang,day,entries,clues,picture,layout,title,voice,paper,editorial_note) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          lang,
          day,
          JSON.stringify(entries),
          JSON.stringify(entries.map((e) => words[e[0]])),
          picture,
          layout,
          pack.title?.trim() ?? "",
          voice,
          paper,
          pack.editorial_note?.trim() ?? "",
        );
      [...panels.values()].forEach((name, i) =>
        this.db
          .query("INSERT INTO panels VALUES(?,?,?,?)")
          .run(id, i + 1, name, JSON.stringify(rects[i])),
      );
      return Number(id);
    })();
  }
}
