"""Gate scanner client (Phase 16).

USB keyboard-type reader -> this window -> local SQLite queue -> background upload to the school's API.
Store-first: every scan is saved to disk before anything else; the screen answers from a cached roster,
so the line never waits for the internet. The server stays authoritative (it re-evaluates every scan).

Standard library only, Python 3.8+ (Windows 7 compatible). Config: gate.ini next to the program.
"""
import configparser
import json
import logging
import logging.handlers
import os
import re
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

VERSION = "1.0.0"

BATCH_SIZE = 200
HTTP_TIMEOUT = 3  # seconds; a weak link fails fast and the scan stays queued
ROSTER_TIMEOUT = 15
HEARTBEAT_EVERY = 60
ROSTER_EVERY = 3600
MAX_BACKOFF = 60
# ponytail: the server falls back to its own clock for scans older than 24 h, which would turn a
# scan from days ago into today's arrival; such scans are dropped here instead (and logged).
MAX_QUEUE_AGE = timedelta(hours=20)
ALREADY_RESULTS = ("PRESENT", "TARDY")

log = logging.getLogger("gate")


def utcnow():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))  # 3.8's fromisoformat has no "Z"


def normalize(raw, drop_leading_zeros=False):
    """Same rule as the server's normalizeCredential (used only for the local lookup)."""
    s = re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "", raw.strip()).upper()
    return re.sub(r"^0+(?=.)", "", s) if drop_leading_zeros else s


class Gate:
    """Queue, roster cache and server sync. No UI here, so it can be checked headless."""

    def __init__(self, data_dir, server_url, api_key):
        self.server_url = server_url.rstrip("/")
        self.api_key = api_key
        self.lock = threading.Lock()
        self.db = sqlite3.connect(os.path.join(data_dir, "gate.db"), check_same_thread=False)
        self.db.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS scans (
              event_id TEXT PRIMARY KEY, credential TEXT NOT NULL, norm TEXT NOT NULL,
              scanned_at TEXT NOT NULL, local TEXT NOT NULL,
              sent INTEGER NOT NULL DEFAULT 0, server TEXT);
            CREATE INDEX IF NOT EXISTS scans_unsent ON scans (sent, scanned_at);
            CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
            """
        )
        self.clock_offset = timedelta(0)  # server time - PC time; only for the on-screen verdict
        self.online = None  # None until the first contact
        self.auth_error = False
        self.latest_version = None
        row = self.db.execute("SELECT v FROM kv WHERE k='roster'").fetchone()
        self.roster = None
        if row:
            self.use_roster(json.loads(row[0]), save=False)

    # ---------- scanning (UI thread) ----------

    def record_scan(self, raw, now=None):
        """Saves the scan, then returns (code, student) for the screen. Never touches the network."""
        raw = raw.strip()
        now = now or utcnow()
        roster = self.roster
        norm = normalize(raw, roster["dropLeadingZeros"] if roster else False)
        with self.lock:
            code, student = self._verdict(norm, now)
            self.db.execute(
                "INSERT INTO scans (event_id, credential, norm, scanned_at, local) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), raw, norm, iso(now), code),
            )
            self.db.commit()
        return code, student

    def _verdict(self, norm, now):
        roster = self.roster
        if not roster:
            return "QUEUED", None  # first start without internet: saved, judged by the server later
        student = roster["byBadge"].get(norm)
        if not student:
            return "NOT_FOUND", None
        local = now + self.clock_offset + timedelta(minutes=roster["utcOffsetMinutes"])
        midnight = now - timedelta(hours=local.hour, minutes=local.minute, seconds=local.second)
        seen = self.db.execute(
            "SELECT 1 FROM scans WHERE norm=? AND scanned_at>=? AND local IN (?,?) LIMIT 1",
            (norm, iso(midnight), *ALREADY_RESULTS),
        ).fetchone()
        if seen:
            return "ALREADY_SCANNED", student
        h, m = (int(x) for x in roster["schoolStartTime"].split(":"))
        start, minutes = h * 60 + m, local.hour * 60 + local.minute
        if minutes >= start + roster["absenceCutoffMinutes"]:
            return "OUTSIDE_WINDOW", student
        return ("PRESENT" if minutes <= start + roster["tardyGraceMinutes"] else "TARDY"), student

    def pending(self):
        with self.lock:
            return self.db.execute("SELECT COUNT(*) FROM scans WHERE sent=0").fetchone()[0]

    # ---------- server sync (sender thread) ----------

    def _request(self, method, path, body=None, timeout=HTTP_TIMEOUT):
        req = urllib.request.Request(
            self.server_url + path,
            data=None if body is None else json.dumps(body).encode(),
            method=method,
            headers={"Authorization": "Bearer " + self.api_key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                data = json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            self.online = True
            self.auth_error = e.code in (401, 403)
            raise
        except Exception:
            self.online = False
            raise
        self.online, self.auth_error = True, False
        return data

    def _learn_clock(self, server_time, sent):
        self.clock_offset = parse_iso(server_time) - (sent + (utcnow() - sent) / 2)

    def flush(self):
        """Uploads one batch. Returns the number of scans settled; raises when the server can't be reached."""
        with self.lock:
            cutoff = iso(utcnow() - MAX_QUEUE_AGE)
            expired = self.db.execute("UPDATE scans SET sent=-1, server='EXPIRED' WHERE sent=0 AND scanned_at<?", (cutoff,)).rowcount
            self.db.commit()
            rows = self.db.execute(
                "SELECT event_id, credential, scanned_at, local FROM scans WHERE sent=0 ORDER BY scanned_at LIMIT ?",
                (BATCH_SIZE,),
            ).fetchall()
        if expired:
            log.warning("dropped %d scans older than %s (PC was offline too long)", expired, MAX_QUEUE_AGE)
        if not rows:
            return 0
        events = [{"eventId": r[0], "credentialUid": r[1], "scannedAt": r[2]} for r in rows]
        try:
            data = self._request("POST", "/attendance/scans", {"sentAt": iso(utcnow()), "events": events})
        except urllib.error.HTTPError as e:
            if e.code != 400:
                raise
            # A batch the server will never accept would block the queue forever: set it aside, keep it on disk.
            log.error("server rejected batch of %d: %s", len(rows), e.read()[:500])
            with self.lock:
                self.db.executemany("UPDATE scans SET sent=-1, server='REJECTED' WHERE event_id=?", [(r[0],) for r in rows])
                self.db.commit()
            return len(rows)
        local = {r[0]: r[3] for r in rows}
        with self.lock:
            for res in data["results"]:
                self.db.execute("UPDATE scans SET sent=1, server=? WHERE event_id=?", (res["result"], res["eventId"]))
                if local.get(res["eventId"]) not in (res["result"], "QUEUED"):
                    log.info("event %s: screen showed %s, server says %s", res["eventId"], local[res["eventId"]], res["result"])
            self.db.commit()
        return len(rows)

    def heartbeat(self):
        sent = utcnow()
        data = self._request("POST", "/gate/heartbeat", {"pending": self.pending()})
        self._learn_clock(data["serverTime"], sent)
        self.latest_version = data.get("latestGateVersion")

    def refresh_roster(self):
        sent = utcnow()
        data = self._request("GET", "/gate/roster", timeout=ROSTER_TIMEOUT)
        self._learn_clock(data["serverTime"], sent)
        self.use_roster(data)
        log.info("roster refreshed: %d students", len(data["students"]))

    def use_roster(self, data, save=True):
        if save:  # kept on disk so a restart without internet still answers from the roster
            with self.lock:
                self.db.execute("INSERT OR REPLACE INTO kv (k, v) VALUES ('roster', ?)", (json.dumps(data),))
                self.db.commit()
        drop = data["dropLeadingZeros"]
        data["byBadge"] = {normalize(s["credentialUid"], drop): s for s in data["students"]}
        self.roster = data

    def run_sender(self, wake):
        """Background loop: upload whenever there is something queued, heartbeat every minute, roster every hour."""
        backoff, next_hb, next_roster = 0, 0, 0
        while True:
            wake.wait(backoff or 1)
            wake.clear()
            try:
                while self.flush() == BATCH_SIZE:  # scans first: they matter more than the roster
                    pass
                if time.monotonic() >= next_hb:
                    self.heartbeat()
                    next_hb = time.monotonic() + HEARTBEAT_EVERY
                if time.monotonic() >= next_roster:
                    self.refresh_roster()
                    next_roster = time.monotonic() + ROSTER_EVERY
                backoff = 0
            except Exception as e:  # offline, timeout, 5xx, bad key: keep everything queued and retry
                backoff = min(MAX_BACKOFF, backoff * 2 or 2)
                log.warning("sync failed (%s); retry in %ss, %d pending", e, backoff, self.pending())


# ---------- screen ----------

SCREENS = {
    # code: (background, title, beeps [(Hz, ms)])
    "PRESENT": ("#15803d", "Bienvenido", [(1000, 150)]),
    "TARDY": ("#d97706", "Retardo", [(800, 150), (800, 150)]),
    "ALREADY_SCANNED": ("#1d4ed8", "Ya registrado", [(1200, 80)]),
    "NOT_FOUND": ("#b91c1c", "Credencial no encontrada", [(400, 600)]),
    "OUTSIDE_WINDOW": ("#b91c1c", "Fuera de horario, acude a dirección", [(300, 250), (300, 250), (300, 250)]),
    "QUEUED": ("#475569", "Registrado", [(1000, 150)]),
}
IDLE_BG = "#0f172a"
RESULT_SECONDS = 3


def beep(tones):
    try:
        import winsound

        for hz, ms in tones:
            winsound.Beep(hz, ms)
    except ImportError:  # not Windows (development)
        sys.stdout.write("\a")
        sys.stdout.flush()


def run_ui(gate, wake, title, fullscreen):
    import tkinter as tk

    root = tk.Tk()
    root.title("Asistencia - " + title)
    root.configure(bg=IDLE_BG)
    if fullscreen:
        root.attributes("-fullscreen", True)
        root.attributes("-topmost", True)
    else:
        root.geometry("900x600")
    big = tk.Label(root, fg="white", bg=IDLE_BG, font=("Segoe UI", 56, "bold"), wraplength=1100)
    big.pack(expand=True, fill="both")
    who = tk.Label(root, fg="white", bg=IDLE_BG, font=("Segoe UI", 32))
    who.pack(fill="x", pady=(0, 40))
    bar = tk.Frame(root, bg="#1e293b")
    bar.pack(fill="x", side="bottom")
    banner = tk.Label(bar, fg="white", bg="#1e293b", font=("Segoe UI", 20, "bold"), anchor="w", padx=16, pady=8)
    banner.pack(side="left", fill="x", expand=True)
    tk.Label(bar, text="%s  v%s" % (title, VERSION), fg="#94a3b8", bg="#1e293b", font=("Segoe UI", 12), padx=16).pack(side="right")
    entry = tk.Entry(root, font=("Segoe UI", 1), bg=IDLE_BG, fg=IDLE_BG, insertbackground=IDLE_BG, relief="flat")
    entry.place(x=-100, y=-100)  # off-screen: the reader types here, nobody needs to see it

    state = {"clear": None}

    def show(bg, title_text, name_text):
        for w in (root, big, who):
            w.configure(bg=bg)
        big.configure(text=title_text)
        who.configure(text=name_text)

    def idle():
        show(IDLE_BG, "Acerque su credencial", "")

    def on_scan(_event=None):
        raw = entry.get()
        entry.delete(0, "end")
        if not raw.strip():
            return
        try:
            code, student = gate.record_scan(raw)
        except Exception:
            log.exception("could not save scan %r", raw)
            show("#b91c1c", "Error al guardar, avise a dirección", "")
            threading.Thread(target=beep, args=([(400, 600)],), daemon=True).start()
            return
        wake.set()
        bg, text, tones = SCREENS[code]
        name = "%s  ·  %s°%s" % (student["name"], student["grade"], student["group"]) if student else ""
        show(bg, text, name)
        threading.Thread(target=beep, args=(tones,), daemon=True).start()
        if state["clear"]:
            root.after_cancel(state["clear"])
        state["clear"] = root.after(RESULT_SECONDS * 1000, idle)

    def tick():
        # Keep focus so the keyboard-type reader always types into this window.
        if root.focus_get() is not entry:
            root.focus_force()
            entry.focus_set()
        n = gate.pending()
        if gate.auth_error:
            banner.configure(text="Clave de escáner inválida, avise a soporte", bg="#b91c1c")
        elif gate.online is False:
            banner.configure(text="Sin conexión, %d pendientes" % n, bg="#ea580c")
        elif gate.online is None:
            banner.configure(text="Conectando…" + (" %d pendientes" % n if n else ""), bg="#1e293b")
        elif gate.latest_version and gate.latest_version != VERSION:
            banner.configure(text="Actualización disponible (v%s)" % gate.latest_version, bg="#1e293b")
        elif gate.roster is None:
            banner.configure(text="Descargando lista de alumnos…", bg="#1e293b")
        else:
            banner.configure(text="En línea" + (", enviando %d" % n if n else ""), bg="#1e293b")
        root.after(1000, tick)

    entry.bind("<Return>", on_scan)
    entry.bind("<KP_Enter>", on_scan)
    root.bind_all("<Control-q>", lambda _e: root.destroy())  # support staff exit; readers never send Ctrl
    idle()
    tick()
    root.mainloop()


def main():
    base = os.path.dirname(sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__))
    handler = logging.handlers.RotatingFileHandler(os.path.join(base, "gate.log"), maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    logging.basicConfig(level=logging.INFO, handlers=[handler], format="%(asctime)s %(levelname)s %(message)s")
    cfg = configparser.ConfigParser()
    if not cfg.read(os.path.join(base, "gate.ini"), encoding="utf-8-sig"):
        sys.exit("Falta gate.ini junto al programa (ver gate.ini.example)")
    c = cfg["gate"]
    gate = Gate(base, c["server_url"], c["api_key"])
    log.info("gate v%s started, %d pending", VERSION, gate.pending())
    wake = threading.Event()
    threading.Thread(target=gate.run_sender, args=(wake,), daemon=True).start()
    run_ui(gate, wake, c.get("label", "Entrada"), c.getboolean("fullscreen", True))


if __name__ == "__main__":
    main()
