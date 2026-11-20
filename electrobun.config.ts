export default {
  app: { name: "Irudd Xword", identifier: "dev.irudd.xword", version: "0.1.0" },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "desktop.ts" },
    copy: {
      "dist/xword.js": "player/xword.js",
      ...Object.fromEntries(
        [
          "fonts/Krysskrita.otf",
          "fonts/Rutverk.otf",
          "words.tsv",
          "index.html",
          "illustration.png",
          "dist/layout.js",
        ].map((file) => [file, "player/" + file]),
      ),
    },
  },
};
