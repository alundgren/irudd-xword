import random
import unittest
from collections import Counter

from newspaper import layout, fill
from engine import picture_cells


class NewspaperTests(unittest.TestCase):
    def test_profiles_leave_picture_room_and_crossings(self):
        for profile, expected in [('large',(17,19)),('train',(8,10))]:
            for seed in range(10):
                slots, rect = layout(profile, random.Random(seed))
                visits = Counter(cell for run in slots for cell in run)
                self.assertEqual(tuple(max(c[k] for c in visits)+1 for k in (0,1)), expected)
                self.assertGreaterEqual(min(sum(visits[c]==2 for c in run) for run in slots),2)
                x,y,w,h = rect
                self.assertFalse(any((i,j) in visits for i in range(x,x+w) for j in range(y,y+h)))

    def test_solver_keeps_theme_and_distinct_crossing_words(self):
        slots=[[(1,1),(2,1)],[(1,2),(2,2)],[(1,1),(1,2)],[(2,1),(2,2)]]
        vocabulary={w:i for i,w in enumerate(['IS','TE','IT','SE'])}
        answer=fill(slots,'IS',vocabulary,random.Random(4))
        self.assertEqual(set(answer.values()),set(vocabulary))
        self.assertEqual(answer[0][0],answer[2][0])
        self.assertEqual(answer[0][1],answer[3][0])
        self.assertEqual(answer[1][0],answer[2][1])
        self.assertEqual(answer[1][1],answer[3][1])

    def test_panel_rejects_overlap(self):
        with self.assertRaisesRegex(ValueError,'covers'):
            picture_cells([['ABC',1,1,1,0],['BED',2,1,0,1]], [1,1,1,1])
