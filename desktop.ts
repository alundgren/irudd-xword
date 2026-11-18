import { BrowserWindow } from "electrobun/main";
import { resolve } from "node:path";
import { Collection } from "./collection";
import { serve } from "./player";

const player = serve(new Collection(resolve(import.meta.dir, "../player")), 0);
new BrowserWindow({
  title: "Morgonkryss",
  url: player.url.href,
  sandbox: true,
  frame: { x: 80, y: 60, width: 980, height: 900 },
});
