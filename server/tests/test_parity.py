"""Web (JS) ve Python simülasyonlarının aynı sonucu verdiğini doğrular.

Çalıştırma (proje kökünden): cd server && python3 -m unittest -v
"""

import json
import math
import random
import subprocess
import unittest
from pathlib import Path

from driftwood_sim import sim

VECTORS_JS = Path(__file__).resolve().parents[2] / "web" / "tests" / "parity_vectors.mjs"
DAY = 20_752  # 26 Ekim 2026 (Pazartesi)
H = 3600
LEVELS = [0, 35, 230, 700, 2120, "inf"]  # boş ada, ilk dükkânlar, sağlık merkezi, liman, ikinci mahalle, tam ada


def sample_handles(n: int) -> list[str]:
    rng = random.Random(42)
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789._"
    handles = ["driftwood", "@Ali.Veli_", "zeynep_92"]
    while len(handles) < n:
        handles.append("".join(rng.choice(alphabet) for _ in range(rng.randint(3, 30))))
    return handles


def python_vectors(day: int, handles: list[str]) -> list[dict]:
    out = []
    for i, handle in enumerate(handles, start=1):
        r = {"handle": handle, "seed": sim.seed_of(handle), "slot": i * 977, "arrived_day": day - i % 60}
        if i % 7 == 3:
            r["overrides"] = {"meslek": "polis" if i % 2 else "muhtar"}
        elif i % 11 == 5:
            r["overrides"] = {"meslek": "okul_muduru" if i % 2 else "hakim"}
        out.append({
            "seed": r["seed"],
            "address": sim.address_text(r["slot"]),
            "job": sim.job(r)["id"],
            "dream": sim.dream_job(r)["id"],
            "workplace": sim.workplace(r)["name"],
            "title": sim.title(r, day),
            "pet": sim.pet(r, day),
            "hobby": sim.hobby(r)["id"],
            "look": sim.look(r),
            "plans": [sim.day_plan(r, d) for d in range(day, day + 7)],
        })
    return out


def js_vectors(day: int, level, handles: list[str]) -> list[dict]:
    result = subprocess.run(
        ["node", str(VECTORS_JS), str(day), str(level), *handles],
        capture_output=True, text=True, timeout=120, check=True,
    )
    return json.loads(result.stdout)


class ParityTest(unittest.TestCase):
    def tearDown(self):
        sim.set_town(math.inf)

    def test_js_matches_python(self):
        handles = sample_handles(300)
        for level in LEVELS:
            sim.set_town(math.inf if level == "inf" else level)
            expected = python_vectors(DAY, handles)
            actual = js_vectors(DAY, level, handles)
            self.assertEqual(len(actual), len(expected))
            for handle, a, e in zip(handles, actual, expected):
                self.assertEqual(a, e, f"{handle} (düzey {level})")

    def test_locked_workplaces_fall_back(self):
        # Boş adada kimse kilitli bir iş yerinde çalışmaz; her iş yeri türü gelişim tablosunda.
        sim.set_town(0)
        for handle in sample_handles(400):
            r = {"seed": sim.seed_of(handle), "slot": sim.seed_of(handle) % 5000, "arrived_day": DAY}
            wp = sim.workplace(r)
            self.assertTrue(sim.is_open(f"{wp['kind']}:{wp['index']}"), handle)
            self.assertIn(sim.job(r)["yer"], ("anakara", "ev", "fener"), handle)
        always = {"anakara", "ev", "fener"}
        for kind, names in sim.catalog()["isyerleri"].items():
            for i in range(len(names)):
                if kind not in always:
                    self.assertGreater(sim.stage_of(f"{kind}:{i}"), 0, f"{kind}:{i} gelişim tablosunda yok")

    def test_plans_cover_whole_day(self):
        for handle in sample_handles(500):
            r = {"seed": sim.seed_of(handle), "arrived_day": DAY}
            for d in range(DAY, DAY + 14):
                plan = sim.day_plan(r, d)
                self.assertEqual(plan[0]["bas"], 0, handle)
                self.assertEqual(plan[-1]["son"], 1440, handle)
                for prev, cur in zip(plan, plan[1:]):
                    self.assertEqual(prev["son"], cur["bas"], handle)
                    self.assertLess(cur["bas"], cur["son"], handle)

    def test_clock_matches_js(self):
        # Yaz saati geçişlerinin çevresi (±3 sa, 15 dk adım), yılbaşları ve gece yarısı sınırları, 2024-2040.
        unix = []
        for y in range(2024, 2041):
            for edge in (sim.nth_weekday(y, 3, 6, 2) * 86400 + 7 * H, sim.nth_weekday(y, 11, 6, 1) * 86400 + 6 * H):
                unix += [edge + k * 900 for k in range(-12, 13)] + [edge - 1, edge + 1]
            jan1 = sim.days_from_civil(y, 1, 1)
            unix += [jan1 * 86400 + 5 * H + k for k in (-1, 0, 1)]
        unix += [d * 86400 + o * H + k for d in range(DAY - 3, DAY + 40) for o in (4, 5) for k in (-1, 0, 1)]
        gunler = list(range(sim.days_from_civil(2024, 1, 1), sim.days_from_civil(2041, 1, 1)))
        yerel = [[d, m] for d in (sim.nth_weekday(2026, 3, 6, 2), sim.nth_weekday(2026, 11, 6, 1), DAY) for m in range(0, 1440, 30)]
        result = subprocess.run(["node", str(VECTORS_JS), "saat"], input=json.dumps({"unix": unix, "gunler": gunler, "yerel": yerel}),
                                capture_output=True, text=True, timeout=120, check=True)
        js = json.loads(result.stdout)
        for u, a in zip(unix, js["unix"]):
            self.assertEqual(a, [sim.tz_offset(u), sim.day_of(u), sim.minute_of(u)], u)
        for d, a in zip(gunler, js["gunler"]):
            self.assertEqual(a, [sim.weekday(d), sim.holiday_of(d), list(sim.civil_from_days(d))], d)
        for (d, m), a in zip(yerel, js["yerel"]):
            self.assertEqual(a, sim.unix_of(d, m), (d, m))

    def test_clock_matches_new_york(self):
        # Açık kural, IANA America/New_York ile aynı sonucu vermeli: her geçişin çevresi ve her ayın ortası, 2007-2050
        # (2007 öncesinde ABD'nin eski kuralı geçerliydi; ada bugünü yaşar).
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        ny = ZoneInfo("America/New_York")
        for y in range(2007, 2051):
            stamps = [sim.days_from_civil(y, m, 15) * 86400 for m in range(1, 13)]
            for edge in (sim.nth_weekday(y, 3, 6, 2) * 86400 + 7 * H, sim.nth_weekday(y, 11, 6, 1) * 86400 + 6 * H):
                stamps += [edge + k for k in (-3601, -1, 0, 1, 3599)]
            for u in stamps:
                local = datetime.fromtimestamp(u, timezone.utc).astimezone(ny)
                self.assertEqual(sim.tz_offset(u), int(local.utcoffset().total_seconds()), u)
                self.assertEqual(sim.civil_from_days(sim.day_of(u)), (local.year, local.month, local.day), u)
                self.assertEqual(sim.minute_of(u), local.hour * 60 + local.minute + local.second / 60, u)

    def test_transition_days(self):
        # 1 Kasım 2026: 25 saatlik gün (01:00-02:00 iki kez), 8 Mart 2026: 23 saatlik gün.
        fall, spring = sim.days_from_civil(2026, 11, 1), sim.days_from_civil(2026, 3, 8)
        self.assertEqual(sim.unix_of(fall + 1, 0) - sim.unix_of(fall, 0), 25 * H)
        self.assertEqual(sim.unix_of(spring + 1, 0) - sim.unix_of(spring, 0), 23 * H)
        self.assertEqual(sim.minute_of(sim.unix_of(spring, 150)), 210)  # 02:30 yaşanmaz → 03:30

    def test_us_holidays(self):
        d = sim.days_from_civil
        known = {d(2026, 1, 1): "new_year", d(2026, 1, 19): "mlk", d(2026, 2, 16): "presidents",
                 d(2026, 5, 25): "memorial", d(2026, 6, 19): "juneteenth", d(2026, 7, 3): "independence",
                 d(2026, 7, 4): "independence", d(2026, 9, 7): "labor", d(2026, 11, 11): "veterans",
                 d(2026, 11, 26): "thanksgiving", d(2026, 11, 27): "black_friday", d(2026, 12, 25): "christmas",
                 d(2027, 1, 18): "mlk", d(2027, 5, 31): "memorial", d(2027, 7, 5): "independence",
                 d(2027, 11, 25): "thanksgiving", d(2027, 12, 24): "christmas", d(2028, 2, 21): "presidents"}
        for day, name in known.items():
            self.assertEqual(sim.holiday_of(day), name, sim.civil_from_days(day))
        for day in (d(2026, 10, 31), d(2026, 7, 6), d(2026, 11, 2), d(2026, 10, 12)):
            self.assertEqual(sim.holiday_of(day), "", sim.civil_from_days(day))
        self.assertEqual(sim.weekday(DAY), 0)

    def test_known_hash_values(self):
        # FNV-1a referans değerleri
        self.assertEqual(sim.fnv1a(""), 0x811C9DC5)
        self.assertEqual(sim.fnv1a("a"), 0xE40C292C)
        self.assertEqual(sim.seed_of("@Driftwood "), sim.seed_of("driftwood"))


if __name__ == "__main__":
    unittest.main()
