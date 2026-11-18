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
import { generate } from "./generate";

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
  history(lang: string) {
    return (
      this.db
        .query(
          "SELECT id,day,entries,feedback FROM editions WHERE lang=? ORDER BY id",
        )
        .all(lang) as EditionRow[]
    ).map(({ id, day, entries, feedback }) => ({
      id,
      day,
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
      layout: row.layout,
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
  publish(lang: string, file?: string) {
    if (lang !== "sv" && lang !== "en") throw Error("Choose sv or en");
    if (!file && lang === "sv") file = join(this.root, "coast.sv.json");
    const previous = this.history(lang);
    const layouts = ["picture-first", "grid-first", "side-by-side"];
    const pack: Partial<Pack> = file
      ? JSON.parse(readFileSync(file, "utf8"))
      : {};
    const layout = pack.layout ?? layouts[previous.length % 3];
    if (![...layouts, "illustrated-grid"].includes(layout))
      throw Error("Unknown layout");
    let words = bank(this.root, lang),
      picture = "illustration.png";
    const panels = new Map<string, string>();
    const anchor = file
      ? pack.picture_answer!.toUpperCase()
      : Object.keys(words)[0];
    if (file) {
      picture = this.storePicture(resolve(dirname(file), pack.generated_png!));
      delete words[Object.keys(words)[0]];
      words = {
        [anchor]: pack.picture_clue!,
        ...pack.words,
        ...Object.fromEntries(
          Object.entries(words).filter(
            ([w]) => w !== anchor && !Object.hasOwn(pack.words ?? {}, w),
          ),
        ),
      };
      if (layout === "illustrated-grid") {
        panels.set(anchor, picture);
        for (const extra of pack.extra_pictures ?? []) {
          const w = extra.answer.toUpperCase();
          if (panels.has(w)) throw Error("Duplicate picture answer");
          panels.set(
            w,
            this.storePicture(resolve(dirname(file), extra.generated_png)),
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
    }
    const entries =
      pack.entries ??
      generate(
        words,
        anchor,
        [...panels.keys()],
        pack.fill === "dense",
        (pack.fill === "dense" ? previous.slice(-5) : previous).flatMap(
          (p) => p.entries,
        ),
      );
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
    const day = pack.edition_day ?? new Date().toLocaleDateString("sv-SE");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day
    )
      throw Error("Invalid edition date");
    return this.db.transaction(() => {
      const { lastInsertRowid: id } = this.db
        .query(
          "INSERT INTO editions(lang,day,entries,clues,picture,layout,title) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          lang,
          day,
          JSON.stringify(entries),
          JSON.stringify(entries.map((e) => words[e[0]])),
          picture,
          layout,
          pack.title?.trim() ?? "",
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
