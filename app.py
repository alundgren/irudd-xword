import argparse
import json
import os
import re
import sqlite3
from hashlib import sha256
from pathlib import Path
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit

from dense import generate_dense
from engine import ROOT, bank, check_layout, generate, inspect, locate_pictures, path, picture_cells

DATA = Path(os.environ.get('XWORD_DATA', Path.home() / '.local/share/irudd-xword'))
DATA.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(DATA / 'editions.sqlite')
db.execute("CREATE TABLE IF NOT EXISTS editions (id INTEGER PRIMARY KEY, lang TEXT, day TEXT, entries TEXT, clues TEXT, feedback TEXT DEFAULT '')")

if 'picture' not in [r[1] for r in db.execute('PRAGMA table_info(editions)')]:
    db.execute("ALTER TABLE editions ADD COLUMN picture TEXT DEFAULT 'illustration.png'")

LAYOUTS = ('picture-first', 'grid-first', 'side-by-side')
if 'layout' not in [r[1] for r in db.execute('PRAGMA table_info(editions)')]:
    db.execute("ALTER TABLE editions ADD COLUMN layout TEXT DEFAULT 'picture-first'")
if 'title' not in [r[1] for r in db.execute('PRAGMA table_info(editions)')]:
    db.execute("ALTER TABLE editions ADD COLUMN title TEXT DEFAULT ''")
db.execute("CREATE UNIQUE INDEX IF NOT EXISTS named_editions ON editions(lang,day,title) WHERE title <> ''")
db.execute("CREATE TABLE IF NOT EXISTS marks (edition INTEGER, cell TEXT, guess TEXT, PRIMARY KEY(edition,cell))")


db.execute("CREATE TABLE IF NOT EXISTS panels (edition INTEGER, slot INTEGER, filename TEXT, rect TEXT, PRIMARY KEY(edition,slot))")


def picture_path(filename):
    return (ROOT if filename == 'illustration.png' else DATA) / filename


def store_picture(filename):
    image = filename.read_bytes()
    if not image.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Expected generated PNG')
    name = sha256(image).hexdigest() + '.png'
    picture_path(name).write_bytes(image)
    return name


def history(lang):
    return [dict(id=i, day=d, entries=json.loads(e), feedback=f)
            for i, d, e, f in db.execute('SELECT id,day,entries,feedback FROM editions WHERE lang=? ORDER BY id', (lang,))]


def edition(lang, pack=None):
    words = bank(lang)
    picture = 'illustration.png'
    layout = LAYOUTS[len(history(lang)) % len(LAYOUTS)]
    spec = {}
    pictures = {}
    if not pack and lang == "sv":
        pack = ROOT / "coast.sv.json"
    if pack:
        spec = json.loads(Path(pack).read_text())
        layout = spec.get('layout', layout)
        if layout not in (*LAYOUTS, 'illustrated-grid'):
            raise ValueError('Unknown layout')
        folder = Path(pack).parent
        picture = store_picture(folder / spec['generated_png'])
        anchor = spec['picture_answer'].upper()
        words = {anchor: spec['picture_clue'], **spec.get('words', {})}
        if layout == 'illustrated-grid':
            pictures[anchor] = picture
            for extra in spec.get('extra_pictures', []):
                word = extra['answer'].upper()
                if word in pictures:
                    raise ValueError('Use a different answer for each picture')
                pictures[word] = store_picture(folder / extra['generated_png'])
                words[word] = extra['clue']
            for slot, word in enumerate(pictures, 1):
                words[word] = f"Bild {slot} · {words[word]}"
        elif spec.get('extra_pictures'):
            raise ValueError('Additional pictures require illustrated-grid')
        for w, c in bank(lang).items():
            if w != next(iter(bank(lang))):
                words.setdefault(w, c)
        for w, c in words.items():
            if not re.fullmatch('[A-ZÅÄÖ]{2,30}', w) or not isinstance(c, str) or not c.strip():
                raise ValueError('Expected uppercase entries of 2–30 letters and nonempty clues')
    entries = spec.get('entries')
    if entries is None and spec.get("fill") == "dense":
        entries = generate_dense(words, tuple(pictures), history(lang))
    elif entries is None:
        entries = generate(lang, history(lang), words=words, picture_answers=tuple(pictures))
    check_layout(entries, words)
    if not any(e[0] == next(iter(words)) for e in entries):
        raise ValueError('The grid must include the picture answer')
    if 'picture_rect' in spec:
        rect = spec['picture_rect']
        if len(pictures) != 1:
            raise ValueError('An explicit rectangle requires exactly one picture')
        picture_cells(entries, rect)
        rectangles = [rect]
    else:
        rectangles = locate_pictures(entries, pictures) if pictures else []
    day = date.fromisoformat(spec.get('edition_day', date.today().isoformat())).isoformat()
    title = spec.get('title', '').strip()
    with db:
        row = db.execute('INSERT INTO editions(lang,day,entries,clues,picture,layout,title) VALUES(?,?,?,?,?,?,?)',
                         (lang, day, json.dumps(entries), json.dumps([words[e[0]] for e in entries]), picture, layout, title))
        db.executemany("INSERT INTO panels VALUES(?,?,?,?)",
                       [(row.lastrowid, n, filename, json.dumps(rect)) for n, (filename, rect) in enumerate(zip(pictures.values(), rectangles), 1)])
    return row.lastrowid


class Handler(BaseHTTPRequestHandler):
    def reply(self, data, mime='application/json', status=200):
        data = data if isinstance(data, bytes) else json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == '/layout.js':
            return self.reply((ROOT / 'dist/layout.js').read_bytes(), 'text/javascript')
        if route in ['/', '/illustration.png']:
            file, mime = ('index.html', 'text/html; charset=utf-8') if route == '/' else ('illustration.png', 'image/png')
            return self.reply((ROOT / file).read_bytes(), mime)
        m = re.fullmatch(r'/image/(\d+)', route)
        if m:
            row = db.execute('SELECT picture FROM editions WHERE id=?', m.groups()).fetchone()
            if row:
                return self.reply(picture_path(row[0]).read_bytes(), 'image/png')
        panel = re.fullmatch(r'/panel/(\d+)/(\d+)', route)
        if panel:
            row = db.execute('SELECT filename FROM panels WHERE edition=? AND slot=?', panel.groups()).fetchone()
            if row:
                return self.reply(picture_path(row[0]).read_bytes(), 'image/png')
        if route == '/editions':
            rows = db.execute('SELECT id,lang,day,title FROM editions ORDER BY day DESC,id DESC').fetchall()
            return self.reply(rows)
        match = re.fullmatch(r'/p/(\d+)', route)
        if match:
            row = db.execute('SELECT entries,clues,feedback,layout FROM editions WHERE id=?', match.groups()).fetchone()
            if row:
                entries, clues, feedback, layout = row
                guesses = dict(db.execute("SELECT cell, guess FROM marks WHERE edition=?", match.groups()))
                panels = [dict(slot=i, rect=json.loads(rect)) for i,rect in db.execute(
                    'SELECT slot,rect FROM panels WHERE edition=? ORDER BY slot', match.groups())]
                return self.reply(dict(panels=panels, entries=[dict(cells=path(e), direction=e[3:], clue=c)
                                                for e, c in zip(json.loads(entries), json.loads(clues))], feedback=feedback, layout=layout, guesses=guesses))
        self.reply({}, status=404)

    def do_POST(self):
        if self.headers.get('Content-Type') != 'application/json' or int(self.headers.get('Content-Length', 0)) > 65536:
            return self.reply({}, status=400)
        try:
            data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            row = db.execute('SELECT entries FROM editions WHERE id=?', (data['id'],)).fetchone()
            if not row:
                return self.reply({}, status=404)
            if self.path == '/mark':
                cell, value = data['cell'], data['value']
                if not re.fullmatch(r'\d+,\d+', cell) or not re.fullmatch('[A-ZÅÄÖ]?', value):
                    return self.reply({}, status=400)
                with db:
                    db.execute('INSERT OR REPLACE INTO marks VALUES(?,?,?)', (data['id'], cell, value))
                return self.reply(dict(saved=True))
            if self.path == '/check':
                letters, _ = inspect(json.loads(row[0]))
                guesses = data['guesses']
                wrong = [k for (x,y), ch in letters.items() if (k := f'{x},{y}') in guesses and guesses[k] and guesses[k].upper() != ch]
                complete = all(guesses.get(f'{x},{y}', '').upper() == ch for (x,y), ch in letters.items())
                return self.reply(dict(wrong=wrong, complete=complete))
            if self.path == '/feedback' and isinstance(data['text'], str):
                with db:
                    db.execute('UPDATE editions SET feedback=? WHERE id=?', (data['text'], data['id']))
                return self.reply(dict(saved=True))
        except (KeyError, ValueError, AttributeError, TypeError):
            return self.reply({}, status=400)
        self.reply({}, status=404)


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('action', choices=['serve','generate','context','find','validate'])
    cli.add_argument('--lang', choices=['sv','en'], default='sv')
    cli.add_argument('--pattern', default='???', help='One ? per unknown letter')
    cli.add_argument('--pack', help='Agent-authored picture and clue JSON')
    cli.add_argument('--parent', type=int)
    cli.add_argument('--port', type=int, default=8765)
    args = cli.parse_args()
    if args.action == 'generate':
        print('Edition', edition(args.lang, args.pack), 'ready')
    elif args.action == 'context':
        print(json.dumps(history(args.lang), ensure_ascii=False))
    elif args.action == 'find':
        pat = args.pattern.upper()
        print('\n'.join(w for w in bank(args.lang) if len(w)==len(pat) and all(a=='?' or a==b for a,b in zip(pat,w))))
    elif args.action == 'validate':
        for p in history(args.lang):
            check_layout(p['entries'], {e[0] for e in p['entries']})
        print('All stored crossings and clue positions passed')
    else:
        if not history(args.lang):
            edition(args.lang)
        server = HTTPServer(('127.0.0.1', args.port), Handler)
        print(server.server_port, flush=True)
        server.timeout = 2
        while args.parent is None or os.getppid() == args.parent:
            server.handle_request()
