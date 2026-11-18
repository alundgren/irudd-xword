import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { bank, Collection } from "./collection";
import { draft } from "./newspaper";
import { metrics, validate, type Pack } from "./grid";
import { serve } from "./player";

const usage =
  "bun run xword <generate|context|find|validate|serve|draft|inspect> [options]";
function main() {
  const {
    values: v,
    positionals: [action, arg],
  } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
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
        "\nDraft: draft large|train --words FILE --answer WORD --image FILE --output FILE --seed N\nInspect: inspect PACK\nGenerate: generate [--lang sv|en] [--pack FILE]\nServe: serve [--port PORT]",
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
    const { entries, rect } = draft(arg, theme, vocabulary, Number(v.seed));
    const pack: Pack = {
      layout: "illustrated-grid",
      generated_png: v.image,
      picture_answer: theme,
      picture_clue: "",
      picture_rect: rect,
      entries,
      words: Object.fromEntries(
        entries.filter((e) => e[0] !== theme).map(([w]) => [w, known[w] ?? ""]),
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
      console.log("Edition", collection.publish(lang, v.pack), "ready");
      break;
    case "context":
      console.log(JSON.stringify(collection.history(lang)));
      break;
    case "validate":
      for (const p of collection.history(lang)) validate(p.entries);
      console.log("All stored grids passed");
      break;
    case "serve":
      console.log(serve(collection, Number(v.port), lang).port);
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
