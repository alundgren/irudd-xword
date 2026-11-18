import { BrowserWindow } from "electrobun/main";
import { resolve } from "node:path";

const player = resolve(import.meta.dir, "../player/app.py");
const server = Bun.spawn(
  [
    "python3",
    "-u",
    player,
    "serve",
    "--port",
    "0",
    "--parent",
    String(process.pid),
  ],
  {
    stdout: "pipe",
    stderr: "inherit",
  },
);
process.on("exit", () => server.kill());
const reader = server.stdout.getReader();
let line = "";
while (!line.includes("\n")) {
  const { done, value } = await reader.read();
  if (done) throw new Error("The local puzzle server could not start.");
  line += new TextDecoder().decode(value);
}
const port = Number(line.trim());
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid local port");
new BrowserWindow({
  title: "Morgonkryss",
  url: "http://127.0.0.1:" + port,
  sandbox: true,
  frame: { x: 80, y: 60, width: 980, height: 900 },
});
