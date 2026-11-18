export default {
  app: { name: "Irudd Xword", identifier: "dev.irudd.xword", version: "0.1.0" },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "desktop.ts" },
    copy: Object.fromEntries(
      [
        "app.py",
        "engine.py",
        "dense.py",
        "words.tsv",
        "index.html",
        "illustration.png",
        "coastal-detail.png",
        "coast.sv.json",
        "dist/layout.js",
      ].map((file) => [file, "player/" + file]),
    ),
  },
};
