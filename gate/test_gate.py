"""Self-check for the gate's local logic (no server needed): python test_gate.py"""
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from gate import Gate, normalize

# Mexico City (UTC-6), school 08:00, grace 10, window 30 → PRESENT ≤ 08:10, TARDY < 08:30.
ROSTER = {
    "serverTime": "2026-10-06T13:55:00.000Z", "utcOffsetMinutes": -360, "schoolStartTime": "08:00",
    "tardyGraceMinutes": 10, "absenceCutoffMinutes": 30, "dropLeadingZeros": False,
    "students": [{"credentialUid": "CARD-1A-01", "name": "Ana Pérez", "grade": 1, "group": "A"}],
}


def mx(hhmm, day=6):
    h, m = map(int, hhmm.split(":"))
    return datetime(2026, 10, day, h + 6, m, tzinfo=timezone.utc)


class GateTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.gate = Gate(self.dir.name, "http://127.0.0.1:9", "ak_test")
        self.gate.use_roster(dict(ROSTER))

    def tearDown(self):
        self.gate.db.close()
        self.dir.cleanup()

    def test_normalize_matches_server_rule(self):
        self.assertEqual(normalize("  ;card-1a-01?\r"), "CARD-1A-01")
        self.assertEqual(normalize("0004521873", True), "4521873")
        self.assertEqual(normalize("0000", True), "0")

    def test_window(self):
        g = self.gate
        self.assertEqual(g.record_scan("CARD-1A-01", mx("08:10"))[0], "PRESENT")
        self.assertEqual(g.record_scan("card-1a-01", mx("08:12"))[0], "ALREADY_SCANNED")
        self.assertEqual(g.record_scan("CARD-1A-01", mx("08:12", day=7))[0], "TARDY")  # next day starts fresh
        self.assertEqual(g.record_scan("CARD-1A-01", mx("08:30", day=8))[0], "OUTSIDE_WINDOW")
        self.assertEqual(g.record_scan("CARD-1A-01", mx("08:00", day=8))[0], "PRESENT")  # outside scan didn't count
        self.assertEqual(g.record_scan("NOPE", mx("08:00"))[0], "NOT_FOUND")
        self.assertEqual(g.pending(), 6)  # every scan is stored, whatever the screen said

    def test_server_clock_corrects_the_verdict(self):
        self.gate.clock_offset = timedelta(minutes=7)  # PC clock 7 min slow: 08:05 on the PC is 08:12
        self.assertEqual(self.gate.record_scan("CARD-1A-01", mx("08:05"))[0], "TARDY")

    def test_no_roster_yet_still_saves(self):
        self.gate.roster = None
        self.assertEqual(self.gate.record_scan("CARD-1A-01", mx("08:00")), ("QUEUED", None))
        self.assertEqual(self.gate.pending(), 1)

    def test_queue_survives_restart_and_offline_upload_fails_safely(self):
        self.gate.record_scan("CARD-1A-01")
        with self.assertRaises(Exception):
            self.gate.flush()  # nothing listens on port 9
        self.assertIs(self.gate.online, False)
        self.gate.db.close()
        again = Gate(self.dir.name, "http://127.0.0.1:9", "ak_test")
        self.assertEqual(again.pending(), 1)
        self.assertIsNotNone(again.roster)  # cached roster reloads without internet
        self.gate = again

    def test_very_old_scans_are_dropped_not_sent(self):
        self.gate.record_scan("CARD-1A-01", datetime.now(timezone.utc) - timedelta(hours=21))
        self.assertEqual(self.gate.flush(), 0)
        self.assertEqual(self.gate.pending(), 0)


if __name__ == "__main__":
    unittest.main()
