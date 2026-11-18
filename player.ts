import { join } from "node:path";
import { Collection } from "./collection";
export function serve(collection: Collection, port: number, lang = "sv") {
  if (!collection.history(lang).length) collection.publish(lang);
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    maxRequestBodySize: 65536,
    fetch: async (req) => {
      const url = new URL(req.url),
        route = url.pathname;
      const fail = (code: number) => Response.json({}, { status: code });
      if (
        url.hostname !== "127.0.0.1" &&
        url.hostname !== "localhost" &&
        url.hostname !== "host.docker.internal"
      )
        return fail(403);
      const origin = req.headers.get("origin");
      if (origin && origin !== url.origin) return fail(403);
      try {
        if (req.method === "GET") {
          const asset = (
            {
              "/": "index.html",
              "/layout.js": "dist/layout.js",
              "/illustration.png": "illustration.png",
            } as Record<string, string>
          )[route];
          if (asset)
            return new Response(Bun.file(join(collection.root, asset)), {
              headers: { "Cache-Control": "no-store" },
            });
          if (route === "/editions") return Response.json(collection.list());
          const m = /^\/(p|image|panel)\/(\d+)(?:\/(\d+))?$/.exec(route);
          if (!m || (m[1] === "panel") !== Boolean(m[3])) return fail(404);
          const row = collection.row(Number(m[2]));
          if (!row) return fail(404);
          if (m[1] === "p") return Response.json(collection.publicPuzzle(row));
          const file = collection.image(row, m[3] ? Number(m[3]) : undefined);
          return file && (await file.exists()) ? new Response(file) : fail(404);
        }
        if (
          req.method !== "POST" ||
          !req.headers.get("content-type")?.startsWith("application/json")
        )
          return fail(400);
        const data = await req.json();
        if (route === "/generate") {
          if (!["sv", "en"].includes(data.lang)) return fail(400);
          return Response.json({ id: collection.publish(data.lang) });
        }
        if (!Number.isSafeInteger(data.id)) return fail(400);
        const row = collection.row(data.id);
        if (!row) return fail(404);
        if (
          route === "/check" &&
          data.guesses &&
          typeof data.guesses === "object" &&
          !Array.isArray(data.guesses)
        )
          return Response.json(collection.check(row, data.guesses));
        if (
          route === "/mark" &&
          typeof data.cell === "string" &&
          /^\d+,\d+$/.test(data.cell) &&
          typeof data.value === "string" &&
          /^[A-ZÅÄÖ]?$/.test(data.value)
        ) {
          collection.db
            .query("INSERT OR REPLACE INTO marks VALUES(?,?,?)")
            .run(row.id, data.cell, data.value);
          return Response.json({ saved: true });
        }
        if (route === "/feedback" && typeof data.text === "string") {
          collection.db
            .query("UPDATE editions SET feedback=? WHERE id=?")
            .run(data.text, row.id);
          return Response.json({ saved: true });
        }
        return fail(400);
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Invalid request" },
          { status: 400 },
        );
      }
    },
  });
}
