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
  title: string;
  lang: string;
  paper: string;
  panels: { slot: number; rect: [number, number, number, number] }[];
  guesses: Record<string, string>;
  feedback: string;
};
type LibraryEntry = {
  id: number;
  lang: string;
  day: string;
  title: string;
  paper: string;
  total: number;
  filled: number;
  solved: boolean;
  count: number;
  squares: string;
  bounds: number[];
};
function editionTitle(item: { title: string; lang: string }, id: number) {
  return (
    item.title || (item.lang === "en" ? "Engelskt kryss " : "Minikryss ") + id
  );
}
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
  const { id, edition, selected, setSelected, guesses, mark, wrong } =
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
  const columns = 1 + Math.max(...positions.map((p) => p[0]));
  const size = `clamp(42px, calc((100cqw - ${columns + 2}px) / ${columns}), 62px)`;
  const tracks = (axis: number) =>
    "repeat(" +
    (1 + Math.max(...positions.map((p) => p[axis]))) +
    "," +
    (axis === 0 ? size : `minmax(${size}, max-content)`) +
    ")";
  const at = ([x, y]: Cell) => ({ gridColumn: x + 1, gridRow: y + 1 });
  const active = entries[selected].cells.map(String);
  return (
    <div id="scroll">
      <div
        id="grid"
        style={{ gridTemplateColumns: tracks(0), gridTemplateRows: tracks(1) }}
      >
        {edition.panels.map(
          ({
            slot,
            rect: [x, y, width, height],
          }: Edition["panels"][number]) => (
            <figure
              className="panel"
              key={slot}
              style={{
                gridColumn: x + 1 + " / span " + width,
                gridRow: y + 1 + " / span " + height,
              }}
            >
              <img src={`/panel/${id}/${slot}`} alt={`Bildledtråd ${slot}`} />
              <figcaption>{slot}</figcaption>
            </figure>
          ),
        )}
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
  const [preview, setPreview] = useState("");
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
  if (!edition)
    return (
      <p>
        <a href="/">← Alla kryss</a> {status}
      </p>
    );
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
      <header className="solver-tools">
        <a
          href="/"
          onClick={async (event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            await writes.current;
            location.assign("/");
          }}
        >
          ← Alla kryss
        </a>
        <h1>{editionTitle(edition, id)}</h1>
        <select
          aria-label="Tryckstil"
          value={preview}
          onChange={(e) => setPreview(e.target.value)}
        >
          <option value="">Utgåvans stil</option>
          <option value="newsprint">Tidningspapper</option>
          <option value="chalk">Krittavla</option>
          <option value="mechanical">Verkstadsritning</option>
        </select>
      </header>
      <div className={"page " + layout} data-print={preview || edition.paper}>
        {layout !== "grid-first" && layout !== "illustrated-grid" && picture}
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
function Library() {
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("Alla");
  const [creating, setCreating] = useState(false);
  const [lang, setLang] = useState("sv");
  useEffect(() => {
    function refresh() {
      request("/library")
        .then(setItems)
        .catch((e) => setError(e.message));
    }
    refresh();
    window.addEventListener("pageshow", refresh);
    return () => window.removeEventListener("pageshow", refresh);
  }, []);
  const state = (item: LibraryEntry) =>
    item.solved ? "Löst" : item.filled ? "Påbörjat" : "Orört";
  const visible = items.filter(
    (item) => filter === "Alla" || state(item) === filter,
  );
  const dates = [...new Set(visible.map((item) => item.day))];
  return (
    <div className="shelf">
      <header>
        <h1>Morgonkryss</h1>
        <div className="new-mini">
          <select
            aria-label="Språk för nytt minikryss"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="sv">Svenska</option>
            <option value="en">Engelska</option>
          </select>
          <button
            disabled={creating}
            onClick={async () => {
              setCreating(true);
              try {
                const result = await request("/generate", { lang });
                location.assign("?edition=" + result.id);
              } catch (e) {
                setError(String(e));
                setCreating(false);
              }
            }}
          >
            + Nytt minikryss
          </button>
        </div>
      </header>
      <nav aria-label="Filtrera kryss">
        {["Alla", "Orört", "Påbörjat", "Löst"].map((label) => (
          <button
            key={label}
            aria-pressed={filter === label}
            onClick={() => setFilter(label)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {dates.map((day) => (
        <section key={day}>
          <h2>
            {new Intl.DateTimeFormat("sv-SE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date(day + "T12:00:00"))}
          </h2>
          <div className="cards">
            {visible
              .filter((item) => item.day === day)
              .map((item) => (
                <a
                  className="edition-card"
                  key={item.id}
                  href={"?edition=" + item.id}
                >
                  <div className="cover" data-paper={item.paper}>
                    <img src={"/image/" + item.id} loading="lazy" alt="" />
                    <svg aria-hidden="true" viewBox={item.bounds.join(" ")}>
                      <path d={item.squares} />
                    </svg>
                  </div>
                  <div className="card-copy">
                    <small>{item.count} ledtrådar</small>
                    <h3>{editionTitle(item, item.id)}</h3>
                    <span className="progress-label">
                      <b aria-hidden="true">
                        {item.solved ? "✓" : item.filled ? "◐" : "○"}
                      </b>{" "}
                      {state(item)}
                      {item.filled > 0 &&
                        !item.solved &&
                        " · " + item.filled + "/" + item.total + " rutor"}
                    </span>
                  </div>
                </a>
              ))}
          </div>
        </section>
      ))}
      {!dates.length && !error && <p>Inga kryss i urvalet.</p>}
    </div>
  );
}
function App() {
  const id = Number(new URLSearchParams(location.search).get("edition"));
  return Number.isSafeInteger(id) && id > 0 ? <Puzzle id={id} /> : <Library />;
}
createRoot(document.getElementById("app")!).render(<App />);
