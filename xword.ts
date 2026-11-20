import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { bank, Collection } from "./collection";
import { draft } from "./newspaper";
import { metrics, validate, type Pack } from "./grid";
import { serve } from "./player";

import { dailyBrief, clueBank } from "./styles";

const usage =
  "bun run xword <brief|generate|context|find|validate|serve|draft|inspect> [options]";
function main() {
  const {
    values: v,
    positionals: [action, arg],
  } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      day: { type: "string" },
      paper: { type: "string" },
      voice: { type: "string" },
      corner: { type: "string" },
      lang: { type: "string", default: "sv" },
      pack: { type: "string" },
      port: { type: "string", default: "8765" },
      pattern: { type: "string", default: "???" },
      words: { type: "string" },
      answer: { type: "string" },
      image: { type: "string" },
      output: { type: "string" },
      seed: { type: "string" },
      avoid: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (v.help || !action) {
    console.log(
      usage +
        "\nBrief: brief [--day YYYY-MM-DD] [--voice classic|fieldnotes|wordplay] [--paper newsprint|chalk|mechanical] [--corner left|right]\nDraft: draft large|train --words FILE --answer WORD --image FILE --output FILE --seed N [--day DATE] [--voice VOICE] [--paper PAPER] [--corner SIDE]\nInspect: inspect PACK\nGenerate: generate [--lang sv|en] --pack FILE [--day DATE] [--voice VOICE] [--paper PAPER]\nServe: serve [--port PORT]",
    );
    return;
  }
  const root = import.meta.dir,
    lang = v.lang!;
  if (!["sv", "en"].includes(lang)) throw Error("Unknown language");
  if (action === "inspect") {
    if (!arg) throw Error("Expected pack path");
    const report = metrics(JSON.parse(readFileSync(arg, "utf8")));
    console.log(JSON.stringify(report));
    if (report.missing_clues) process.exitCode = 1;
    return;
  }
  const brief = () =>
    dailyBrief(
      v.day ?? new Date().toLocaleDateString("sv-SE"),
      v.voice,
      v.corner,
      v.paper,
    );
  if (action === "brief") {
    const plan = brief();
    const library = new Collection(root);
    try {
      console.log(
        JSON.stringify(
          {
            ...plan,
            recent_editions: library.recentEditions(lang, plan.edition_day),
          },
          null,
          2,
        ),
      );
    } finally {
      library.db.close();
    }
    return;
  }
  const known = bank(root, lang);
  if (action === "find") {
    for (const w of Object.keys(known))
      if (
        w.length === v.pattern!.length &&
        [...v.pattern!.toUpperCase()].every((c, i) => c === "?" || w[i] === c)
      )
        console.log(w);
    return;
  }
  if (action === "draft") {
    if (
      !arg ||
      !v.words ||
      !v.answer ||
      !v.image ||
      !v.output ||
      v.seed === undefined
    )
      throw Error("See xword --help for draft arguments");
    const vocabulary = new Map(Object.keys(known).map((w) => [w, 1000]));
    readFileSync(v.words, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        const w = line.toUpperCase().trim();
        if (/^[A-ZÅÄÖ]{3,30}$/.test(w) && !vocabulary.has(w))
          vocabulary.set(w, i + 3000);
      });
    if (v.avoid)
      for (const w of readFileSync(v.avoid, "utf8")
        .toUpperCase()
        .split(/\r?\n/))
        vocabulary.delete(w.trim());
    const theme = v.answer.toUpperCase();
    vocabulary.set(theme, 0);
    const { edition_day, voice, paper, picture_corner } = brief();
    const clues = clueBank(known, lang, voice);
    const { entries, rect } = draft(
      arg,
      theme,
      vocabulary,
      Number(v.seed),
      picture_corner,
    );
    const pack: Pack = {
      edition_day,
      voice,
      paper,
      layout: "illustrated-grid",
      generated_png: v.image,
      picture_answer: theme,
      picture_clue: "",
      picture_rect: rect,
      entries,
      words: Object.fromEntries(
        entries.filter((e) => e[0] !== theme).map(([w]) => [w, clues[w] ?? ""]),
      ),
    };
    writeFileSync(v.output, JSON.stringify(pack, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log("Private draft ready:", entries.length, "entries");
    return;
  }
  const collection = new Collection(root);
  switch (action) {
    case "generate":
      if (!v.pack) throw Error("An authored --pack FILE is required");
      console.log(
        "Edition",
        collection.publish(lang, v.pack, {
          day: v.day,
          voice: v.voice,
          paper: v.paper,
        }),
        "ready",
      );
      break;
    case "context":
      console.log(JSON.stringify(collection.history(lang)));
      break;
    case "validate":
      for (const p of collection.history(lang)) validate(p.entries);
      console.log("All stored grids passed");
      break;
    case "serve":
      console.log(serve(collection, Number(v.port)).port);
      return;
    default:
      throw Error(usage);
  }
  collection.db.close();
}
try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
