import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@ui-sdk/react/button";
import { pageLayout, nextCell } from "./layout";

type Cell = [number, number];
type Entry = { cells: Cell[]; direction: Cell; clue: string };
type Edition = {
  entries: Entry[];
  layout: string;
  guesses: Record<string, string>;
  feedback: string;
};
type Row = [number, string, string];
async function request(route: string, data?: object) {
  const response = await fetch(
    route,
    data && {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) throw Error("Kunde inte läsa eller spara krysset.");
  return response.json();
}
const Player = createContext<any>(null);
function Crossword() {
  const { edition, selected, setSelected, guesses, mark, wrong } =
    useContext(Player);
  const entries: Entry[] = edition.entries;
  const fields = useRef(new Map<string, HTMLInputElement>());
  const cells = new Map<string, Cell>();
  const clues = new Map<string, { pos: Cell; ids: number[] }>();
  entries.forEach(({ cells: path, direction: [dx, dy] }, i) => {
    const pos: Cell = [path[0][0] - dx, path[0][1] - dy];
    if (!clues.has(String(pos))) clues.set(String(pos), { pos, ids: [] });
    clues.get(String(pos))!.ids.push(i);
    path.forEach((pos) => cells.set(String(pos), pos));
  });
  const positions = [
    ...cells.values(),
    ...Array.from(clues.values(), (c) => c.pos),
  ];
  const tracks = (axis: number) =>
    "repeat(" +
    (1 + Math.max(...positions.map((p) => p[axis]))) +
    ",clamp(42px,6vw,62px))";
  const at = ([x, y]: Cell) => ({ gridColumn: x + 1, gridRow: y + 1 });
  const active = entries[selected].cells.map(String);
  return (
    <div id="scroll">
      <div
        id="grid"
        style={{ gridTemplateColumns: tracks(0), gridTemplateRows: tracks(1) }}
      >
        {[...clues].map(([key, { pos, ids }]) => (
          <div key={"clue" + key} className="box" style={at(pos)}>
            {ids.map((i) => (
              <button
                key={i}
                className="clue"
                onClick={() => {
                  fields.current.get(String(entries[i].cells[0]))?.focus();
                  setSelected(i);
                }}
              >
                {entries[i].clue} {entries[i].direction[0] ? "→" : "↓"}
              </button>
            ))}
          </div>
        ))}
        {[...cells].map(([key, pos]) => (
          <input
            key={key}
            style={at(pos)}
            aria-label={"Ruta " + key}
            autoComplete="off"
            maxLength={1}
            ref={(el) => {
              if (el) fields.current.set(key, el);
              else fields.current.delete(key);
            }}
            className={
              "cell " +
              (active.includes(key) ? "active " : "") +
              (wrong.includes(key) ? "bad" : "")
            }
            value={guesses[key] || ""}
            onFocus={(event) => {
              if (!active.includes(key))
                setSelected(
                  entries.findIndex((e) =>
                    e.cells.some((c) => String(c) === key),
                  ),
                );
              event.target.select();
            }}
            onKeyDown={(event) => {
              if (
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                !event.key.startsWith("Arrow")
              )
                return;
              const target = nextCell(pos, cells.values(), event.key);
              if (target) {
                event.preventDefault();
                fields.current.get(target)?.focus();
                const axis =
                  event.key === "ArrowLeft" || event.key === "ArrowRight"
                    ? 0
                    : 1;
                const aligned = entries.findIndex(
                  (e) =>
                    e.direction[axis] === 1 &&
                    e.cells.some((c) => String(c) === target),
                );
                if (aligned !== -1) setSelected(aligned);
              }
            }}
            onChange={(event) => {
              const value = event.target.value
                .toUpperCase()
                .replace(/[^A-ZÅÄÖ]/g, "")
                .slice(0, 1);
              mark(key, value);
              if (value)
                fields.current.get(active[active.indexOf(key) + 1])?.focus();
            }}
          />
        ))}
      </div>
    </div>
  );
}
function Puzzle({ id }: { id: number }) {
  const [edition, setEdition] = useState<Edition>();
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [selected, setSelected] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    request("/p/" + id)
      .then((p) => {
        if (live) {
          setEdition(p);
          setGuesses(p.guesses);
          setFeedback(p.feedback);
        }
      })
      .catch((e) => setStatus(e.message));
    return () => {
      live = false;
    };
  }, [id]);
  if (!edition) return <p>{status}</p>;
  function mark(cell: string, value: string) {
    setGuesses((g) => ({ ...g, [cell]: value }));
    setWrong((w) => w.filter((c) => c !== cell));
    setStatus("");
    writes.current = writes.current
      .then(() => request("/mark", { id, cell, value }))
      .catch((e) => setStatus(e.message));
  }
  const layout = pageLayout(edition.layout);
  const picture = <img src={"/image/" + id} alt="Bildledtråd" />;
  return (
    <Player.Provider
      value={{ id, edition, guesses, selected, setSelected, wrong, mark }}
    >
      <div className={"page " + layout}>
        {layout !== "grid-first" && picture}
        <Crossword />
        {layout === "grid-first" && picture}
      </div>
      <p id="hint">{edition.entries[selected].clue}</p>
      <Button
        className="action"
        onClick={async () => {
          try {
            const result = await request("/check", { id, guesses });
            setWrong(result.wrong);
            setStatus(
              result.complete
                ? "Hela krysset är rätt!"
                : result.wrong.length
                  ? "Kontrollera markerade rutor."
                  : Object.values(guesses).some(Boolean)
                    ? "Rätt hittills."
                    : "Inga ifyllda rutor.",
            );
          } catch (e) {
            setStatus(String(e));
          }
        }}
      >
        Kontrollera ifyllda rutor
      </Button>
      <section>
        <label htmlFor="note">Till nästa kryss</label>
        <textarea
          id="note"
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            setStatus("");
          }}
        />
        <Button
          className="action"
          onClick={() =>
            request("/feedback", { id, text: feedback })
              .then(() => setStatus("Feedback sparad."))
              .catch((e) => setStatus(e.message))
          }
        >
          Spara feedback
        </Button>
      </section>
      <p role="status">{status}</p>
    </Player.Provider>
  );
}
function App() {
  const [rows, setRows] = useState<Row[]>([]),
    [id, setId] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    request("/editions")
      .then((list) => {
        setRows(list);
        setId(list[0]?.[0] || 0);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <header>
        <h1>Morgonkryss</h1>
        <select
          aria-label="Utgåva"
          value={id}
          onChange={(e) => setId(Number(e.target.value))}
        >
          {rows.map(([n, lang, date]) => (
            <option key={n} value={n}>
              {date} · {lang.toUpperCase()} · {n}
            </option>
          ))}
        </select>
      </header>
      {error}
      {id > 0 && <Puzzle key={id} id={id} />}
    </>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
