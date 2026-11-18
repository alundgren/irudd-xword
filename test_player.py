import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.request import Request, urlopen

from engine import ROOT, check_layout


class PlayerTest(unittest.TestCase):
    def test_disconnected_authored_grid(self):
        with self.assertRaisesRegex(ValueError, 'crossing'):
            check_layout([['AAA', 1, 1, 1, 0], ['BBB', 1, 5, 1, 0]], {'AAA', 'BBB'})

    def test_local_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            env = dict(os.environ, XWORD_DATA=directory)
            cli = [sys.executable, str(ROOT / 'app.py')]
            subprocess.run(cli + ['generate', '--lang', 'en'], env=env, check=True, capture_output=True)
            server = subprocess.Popen(cli + ['serve', '--port', '0'], env=env,
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            try:
                url = 'http://127.0.0.1:' + server.stdout.readline().strip()
                def read(route, data=None):
                    body = json.dumps(data).encode() if data else None
                    with urlopen(Request(url+route, body, {'Content-Type':'application/json'}), timeout=5) as response:
                        return json.load(response)
                rows = read('/editions')
                self.assertEqual({r[1] for r in rows}, {'en', 'sv'})
                edition = rows[0][0]
                route = '/p/' + str(edition)
                p = read(route)
                self.assertTrue(all(set(e) == {'cells','direction','clue'} for e in p['entries']))
                self.assertEqual(p['layout'], 'illustrated-grid')
                self.assertEqual(len(p['panels']), 2)
                lengths = [len(e['cells']) for e in p['entries']]
                self.assertLessEqual(min(lengths), 3)
                self.assertGreaterEqual(max(lengths), 8)
                occupied = set()
                for entry in p['entries']:
                    occupied.update(map(tuple, entry['cells']))
                    x,y = entry['cells'][0]
                    dx,dy = entry['direction']
                    occupied.add((x-dx,y-dy))
                for panel in p['panels']:
                    x,y,w,h = panel['rect']
                    cells = {(i,j) for i in range(x,x+w) for j in range(y,y+h)}
                    self.assertTrue(cells.isdisjoint(occupied))
                    occupied.update(cells)
                    with urlopen(f"{url}/panel/{edition}/{panel['slot']}") as img:
                        self.assertEqual(img.read(8), b'\x89PNG\r\n\x1a\n')
                self.assertEqual(read('/p/'+str(rows[1][0]))['panels'], [])
                cell = ','.join(map(str,p['entries'][0]['cells'][0]))
                read('/mark', dict(id=edition,cell=cell,value='A'))
                self.assertEqual(read(route)['guesses'], {cell:'A'})
                read('/feedback', dict(id=edition,text='More wordplay'))
                context = json.loads(subprocess.check_output(cli+['context'],env=env))[-1]
                self.assertEqual(context['feedback'], 'More wordplay')
                from engine import path
                solution = {f'{x},{y}': c for e in context['entries'] for (x,y),c in zip(path(e),e[0])}
                self.assertTrue(read('/check',dict(id=edition,guesses=solution))['complete'])
                del solution[cell]
                self.assertFalse(read('/check',dict(id=edition,guesses=solution))['complete'])
            finally:
                server.terminate()
                server.wait(timeout=5)
                server.stdout.close()
