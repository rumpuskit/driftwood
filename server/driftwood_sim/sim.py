"""Driftwood simülasyonunun Python karşılığı.

web/src/sim.js ile bit bit aynı sonucu vermeli; kural değişirse ikisi birlikte değişir
ve tests/test_parity.py çalıştırılır. Sakin sözlüğü: {handle, seed, slot, arrived_day, overrides?}.
"""

import json
import math
from functools import cache
from pathlib import Path

MASK = 0xFFFFFFFF
H = 3600
PLACE_HOME = "ev"
PLACE_WORK = "is"
OUTING_LATEST_HOBBY = 1200   # 20:00
OUTING_LATEST_MEYDAN = 1290  # 21:30

CATALOG_PATH = Path(__file__).resolve().parents[2] / "data" / "catalog.json"


@cache
def catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def cap(key: str) -> int:
    return int(catalog()["kapasite"][key])


# --- hash (mhash.gd) ---

def mul32(a: int, b: int) -> int:
    return (a * b) & MASK


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for byte in text.encode("utf-8"):
        h = mul32(h ^ byte, 0x01000193)
    return h


def mix(x: int) -> int:
    x ^= x >> 16
    x = mul32(x, 0x7FEB352D)
    x ^= x >> 15
    x = mul32(x, 0x846CA68B)
    x ^= x >> 16
    return x


def combine(a: int, b: int) -> int:
    return mix(a ^ mul32(b & MASK, 0x9E3779B1))


def roll(seed: int, tag: str, n: int = 0) -> int:
    return combine(combine(seed, fnv1a(tag)), n)


def normalize_handle(handle: str) -> str:
    return handle.strip().removeprefix("@").lower()


def seed_of(handle: str) -> int:
    return fnv1a(normalize_handle(handle))


# --- saat ve takvim: ABD Doğu saati, yaz saatli (sim.js ile aynı açık kural; tz kütüphanesi yok) ---
# Yaz saati (EDT, UTC−4) Mart'ın 2. pazarı 02:00 EST (= 07:00 UTC) → Kasım'ın 1. pazarı 02:00 EDT (= 06:00 UTC);
# diğer zamanlar EST (UTC−5). Gün numarası yerel takvim günüdür.

def days_from_civil(y: int, m: int, d: int) -> int:
    y -= 1 if m <= 2 else 0
    era = y // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def civil_from_days(z: int) -> tuple[int, int, int]:
    z += 719468
    era = z // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + (3 if mp < 10 else -9)
    return era * 400 + yoe + (1 if m <= 2 else 0), m, d


def weekday(day: int) -> int:
    """0 = Pazartesi ... 6 = Pazar (1 Ocak 1970 Perşembe)."""
    return (day + 3) % 7


def nth_weekday(y: int, m: int, wd: int, n: int) -> int:
    """Ayın n. haftanın-günü (wd: 0 = Pazartesi); n = -1 ayın sonuncusu."""
    if n < 0:
        last = days_from_civil(y + 1 if m == 12 else y, 1 if m == 12 else m + 1, 1) - 1
        return last - (weekday(last) - wd + 7) % 7
    first = days_from_civil(y, m, 1)
    return first + (wd - weekday(first) + 7) % 7 + 7 * (n - 1)


def tz_offset(unix: float) -> int:
    y = civil_from_days(math.floor((unix - 5 * H) / 86400))[0]
    start = nth_weekday(y, 3, 6, 2) * 86400 + 7 * H
    end = nth_weekday(y, 11, 6, 1) * 86400 + 6 * H
    return -4 * H if start <= unix < end else -5 * H


def day_of(unix: float) -> int:
    return math.floor((unix + tz_offset(unix)) / 86400.0)


def minute_of(unix: float) -> float:
    return ((unix + tz_offset(unix)) % 86400) / 60


def unix_of(day: int, minute: float) -> float:
    local = day * 86400 + minute * 60
    return local + 4 * H if tz_offset(local + 4 * H) == -4 * H else local + 5 * H


# --- adres (address.gd) ---

def address_parts(slot: int) -> dict:
    per_bina = cap("daire_per_bina")
    per_sokak = per_bina * cap("bina_per_sokak")
    per_mahalle = per_sokak * cap("sokak_per_mahalle")
    mahalle, in_mahalle = divmod(slot, per_mahalle)
    return {
        "ada": mahalle // cap("mahalle_per_ada"),
        "mahalle": mahalle,
        "sokak": in_mahalle // per_sokak,
        "bina": (in_mahalle % per_sokak) // per_bina,
        "daire": in_mahalle % per_bina,
    }


def ada_name(ada: int) -> str:
    names = catalog()["adalar"]
    name = names[ada % len(names)]
    return name if ada < len(names) else f"{name} {ada // len(names) + 1}"


def mahalle_name(mahalle: int) -> str:
    names = catalog()["mahalleler"]
    return names[mahalle % len(names)]


def sokak_name(mahalle: int, sokak: int) -> str:
    names, ekler = catalog()["sokaklar"], catalog()["sokak_ekleri"]
    g = (mahalle % cap("mahalle_per_ada")) * cap("sokak_per_mahalle") + sokak
    n = g % len(names)
    return f"{names[n]} {ekler[(g // len(names) + n) % len(ekler)]}"


def housing_of(mahalle: int) -> dict:
    mi = mahalle % cap("mahalle_per_ada")
    return next(k for k in catalog()["konut"] if k.get("son") is None or mi <= k["son"])


def house_of(slot: int) -> dict:
    p = address_parts(slot)
    k = housing_of(p["mahalle"])
    i = p["bina"] * cap("daire_per_bina") + p["daire"]
    return {"tip": k["tip"], "birim": k["birim"], "ev": i // k["birim"], "apt": i % k["birim"] + 1 if k["birim"] > 1 else 0}


def street_address(slot: int) -> str:
    p, h = address_parts(slot), house_of(slot)
    return f"{h['ev'] + 1} {sokak_name(p['mahalle'], p['sokak'])}" + (f", Apt {h['apt']}" if h["apt"] else "")


def address_text(slot: int) -> str:
    p = address_parts(slot)
    return f"{street_address(slot)}, {mahalle_name(p['mahalle'])}, {ada_name(p['ada'])}"


# --- sakin (resident_sim.gd) ---

def _pick_weighted(items: list, r: int) -> int:
    x = r % sum(int(item["agirlik"]) for item in items)
    for i, item in enumerate(items):
        x -= int(item["agirlik"])
        if x < 0:
            return i
    return len(items) - 1


def _find(items: list, id_: str) -> int:
    return next((i for i, item in enumerate(items) if item["id"] == id_), -1)


def _override(r: dict, key: str) -> str:
    return str((r.get("overrides") or {}).get(key, ""))


# --- gelişim: ada nüfusla parça parça açılır (sim.js'teki açıklamaya bak) ---

_town: float = math.inf
_branch_cache: dict = {}


def set_town(level: float) -> None:
    global _town
    _town = level
    _branch_cache.clear()


def _per_mahalle() -> int:
    return cap("daire_per_bina") * cap("bina_per_sokak") * cap("sokak_per_mahalle")


@cache
def _stage_map() -> dict:
    return {k: int(st["nufus"]) for st in catalog().get("gelisim", []) for k in st["acar"]}


def stage_of(key: str) -> int:
    stages = _stage_map()
    if key in stages:
        return stages[key]
    kind, _, num = key.rpartition(":")
    if kind and num.isdigit():
        n = int(num)
        dukkan = catalog().get("gelisim_dukkan")
        if kind == "carsi" and dukkan:
            return int(dukkan["ilk"]) + n * int(dukkan["aralik"])
        first = stages.get(kind + ":0")
        if n > 0 and first is not None and kind in catalog().get("gelisim_mahalle", []):
            return n * _per_mahalle() + first
    return 0


def is_open(key: str) -> bool:
    return _town >= stage_of(key)


def _open_branches(kind: str) -> list:
    if kind not in _branch_cache:
        _branch_cache[kind] = [i for i in range(len(catalog()["isyerleri"][kind])) if is_open(f"{kind}:{i}")]
    return _branch_cache[kind]


def dream_job(r: dict) -> dict:
    jobs = catalog()["meslekler"]
    i = _find(jobs, _override(r, "meslek"))
    if i < 0:
        # Kadrolu işler (fener bekçisi, cankurtaran): geliş sırasına göre sabit kontenjan, nüfusla orantılı.
        slot = int(r.get("slot", -1))
        i = next((k for k, j in enumerate(jobs) if j.get("kadro") and slot >= 0 and slot % int(j["kadro"]["her"]) == int(j["kadro"]["sira"])), -1)
    if i < 0:
        i = _pick_weighted(jobs, roll(r["seed"], "meslek"))
    return jobs[i]


def job(r: dict) -> dict:
    j = dream_job(r)
    if _open_branches(j["yer"]):
        return j
    jobs = catalog()["meslekler"]
    return jobs[_find(jobs, catalog()["kilitli_meslek"])]


def workplace(r: dict) -> dict:
    j = job(r)
    kind = j["yer"]
    names = catalog()["isyerleri"][kind]
    # Yerel işler (muhtar): kendi mahallesinin şubesi; şubesi belli meslekler (seramikçi seramik atölyesinde)
    # o şubelerden birinde; diğerleri kişiye göre bir şube.
    own = j.get("subeler")
    if j.get("yerel"):
        index = address_parts(int(r["slot"]))["mahalle"] % len(names)
    elif own:
        index = own[roll(r["seed"], "isyeri") % len(own)]
    else:
        index = roll(r["seed"], "isyeri") % len(names)
    if not is_open(f"{kind}:{index}"):
        # Kendi şubesi açılana kadar açık olanlardan birinde (varsa kendi şubelerinden) çalışır.
        open_ = _open_branches(kind)
        mine = [i for i in open_ if i in own] if own else []
        pool = mine or open_
        index = pool[roll(r["seed"], "isyeri") % len(pool)]
    return {"kind": kind, "index": index, "name": names[index]}


def tenure(r: dict, day: int) -> int:
    return max(0, day - int(r["arrived_day"]))


def rank(r: dict, day: int) -> int:
    shift = roll(r["seed"], "terfi") % 7
    t = tenure(r, day)
    return sum(1 for threshold in catalog()["terfi_gunleri"] if t >= int(threshold) + shift)


def title(r: dict, day: int) -> str:
    ladder = job(r)["kademeler"]
    return ladder[min(rank(r, day), len(ladder) - 1)]


def hobby(r: dict) -> dict:
    hobbies = catalog()["hobiler"]
    i = _find(hobbies, _override(r, "hobi"))
    if i < 0:
        i = roll(r["seed"], "hobi") % len(hobbies)
    return hobbies[i]


def pet(r: dict, day: int) -> str:
    requested = _override(r, "evcil")
    if requested:
        return requested
    if roll(r["seed"], "evcil") % 100 >= int(catalog()["evcil_orani"]):
        return ""
    if tenure(r, day) < 5 + roll(r["seed"], "evcil_gun") % 25:
        return ""
    pets = catalog()["evcil_hayvanlar"]
    return pets[roll(r["seed"], "evcil_tur") % len(pets)]


def look(r: dict) -> dict:
    result = {key: roll(r["seed"], "gorunus_" + key) % int(n) for key, n in catalog()["gorunus"].items()}
    result["boy"] = 92 + roll(r["seed"], "boy") % 17
    return result


def shift_of(r: dict) -> str:
    """Sakinin vardiyası: meslekte birden çok vardiya varsa kişiye göre biri (aynı kişi hep aynı vardiyada)."""
    v = job(r)["vardiya"]
    return v[roll(r["seed"], "vardiya") % len(v)] if isinstance(v, list) else v


# ABD tatilleri (sim.js holidayOf ile aynı): sabit tarihli olan cumartesiye denk gelirse cuma, pazara denk gelirse
# pazartesi gözlenir; değişkenler ayın n. haftanın-günü.
FIXED_HOLIDAYS = {(1, 1): "new_year", (6, 19): "juneteenth", (7, 4): "independence", (11, 11): "veterans", (12, 25): "christmas"}


def _fixed_holiday(day: int) -> str:
    _, m, d = civil_from_days(day)
    return FIXED_HOLIDAYS.get((m, d), "")


def holiday_of(day: int) -> str:
    if fixed := _fixed_holiday(day):
        return fixed
    wd = weekday(day)
    if wd == 4 and _fixed_holiday(day + 1):
        return _fixed_holiday(day + 1)
    if wd == 0 and _fixed_holiday(day - 1):
        return _fixed_holiday(day - 1)
    y, m, _ = civil_from_days(day)
    if m == 1 and day == nth_weekday(y, 1, 0, 3):
        return "mlk"
    if m == 2 and day == nth_weekday(y, 2, 0, 3):
        return "presidents"
    if m == 5 and day == nth_weekday(y, 5, 0, -1):
        return "memorial"
    if m == 9 and day == nth_weekday(y, 9, 0, 1):
        return "labor"
    if m == 11:
        tg = nth_weekday(y, 11, 3, 4)
        if day == tg:
            return "thanksgiving"
        if day == tg + 1:
            return "black_friday"
    return ""


def is_holiday(day: int) -> bool:
    return holiday_of(day) != ""


def works_on(r: dict, day: int) -> bool:
    if job(r).get("calismaz"):
        return False  # emekli
    if not job(r)["hafta_sonu"] and is_holiday(day):
        return False
    wd = weekday(day)
    if not job(r)["hafta_sonu"]:
        works = wd < 5
    else:
        # Hafta sonu da açık iş yerlerinde çalışanların haftada iki izin günü var.
        off = roll(r["seed"], "izin") % 7
        works = wd != off and wd != (off + 3) % 7
    # Yarı zamanlı çalışanlar (yaklaşık üçte biri) haftada iki gün daha evde ya da dışarıda.
    if works and roll(r["seed"], "yarim") % 100 < 30:
        p = roll(r["seed"], "yarim_gun") % 5
        if wd == p or wd == (p + 2) % 5:
            works = False
    return works


def _end(plan: list) -> int:
    return plan[-1]["son"] if plan else 0


def _add(plan: list, until: int, ne: str, yer: str) -> None:
    start = _end(plan)
    if until > start:
        plan.append({"bas": start, "son": until, "ne": ne, "yer": yer})


def _travel(plan: list, commute: int, from_: str, to: str) -> None:
    start = _end(plan)
    plan.append({"bas": start, "son": start + commute, "ne": "yol", "nereden": from_, "nereye": to})


def _evening_place(s: int, day: int, hobby_place: str) -> str:
    x = roll(s, "aksam", day) % 100
    if x < 25:
        return hobby_place
    if x < 55:
        return "meydan"
    return ""


def _activity_of(place: str) -> str:
    return "hobi" if place.startswith("hobi:") else place


def _night_out(plan: list, s: int, day: int, commute: int, sleep: int) -> None:
    """Akşam yemeğinden sonra bir kısmı yeniden çıkar (çarşı ya da mahalle çay bahçesi)."""
    if roll(s, "gece", day) % 100 >= 35:
        return
    start = max(_end(plan) + 45, 1230 + roll(s, "gece_saat", day) % 60)
    duration = 60 + roll(s, "gece_sure", day) % 60
    if start + duration + commute > sleep - 10:
        return
    _add(plan, start - commute, "ev", PLACE_HOME)
    _travel(plan, commute, PLACE_HOME, "meydan")
    _add(plan, _end(plan) + duration, "meydan", "meydan")
    _travel(plan, commute, "meydan", PLACE_HOME)


def _late_night(r: dict, day: int) -> bool:
    """Cuma/Cumartesi geceleri ve tatil arifelerinde bazıları gece yarısından sonra da dışarıdadır."""
    wd = weekday(day)
    if not (wd in (4, 5) or is_holiday(day + 1)):
        return False
    if roll(r["seed"], "gece_gec", day) % 100 >= 5:
        return False
    if works_on(r, day) and shift_of(r) == "gece":
        return False
    if works_on(r, day + 1) and shift_of(r) in ("erken", "sabah", "gece"):
        return False
    return True


def _go_late(plan: list, s: int, day: int, commute: int) -> None:
    e = _end(plan)
    if e + commute + 15 <= 1440:
        start = min(max(e + commute + 10, 1350 + roll(s, "gece_gec_saat", day) % 50), 1440 - 5)
        _add(plan, start - commute, "ev", PLACE_HOME)
        _travel(plan, commute, PLACE_HOME, "meydan")
        _add(plan, 1440, "meydan", "meydan")
    else:
        plan.pop()  # eve dönüş yolu
        plan[-1]["son"] = 1440


def day_plan(r: dict, day: int) -> list:
    s = r["seed"]
    commute = 15 + roll(s, "yol") % 20
    hobby_place = "hobi:" + hobby(r)["yer"]
    plan: list = []
    if _late_night(r, day - 1):
        _add(plan, 30 + roll(s, "gece_donus", day - 1) % 60, "meydan", "meydan")
        _travel(plan, commute, "meydan", PLACE_HOME)

    sleep = 1350 + roll(s, "uyku", day) % 50
    if works_on(r, day) and job(r)["yer"] == "ev":
        # Evden çalışan: sabah evde masasında; çoğu öğle arasında kısa bir çıkış yapar; akşam işçiler gibi.
        shift = catalog()["vardiyalar"][shift_of(r)]
        start, end = int(shift["bas"]), int(shift["son"])
        _add(plan, start - 40 - roll(s, "uyan", day) % 40, "uyku", PLACE_HOME)
        lunch = 720 + roll(s, "ogle_saat", day) % 45
        if roll(s, "ogle", day) % 100 < 45:
            _add(plan, lunch - commute, "ev", PLACE_HOME)
            _travel(plan, commute, PLACE_HOME, "meydan")
            _add(plan, _end(plan) + 30 + roll(s, "ogle_sure", day) % 30, "meydan", "meydan")
            _travel(plan, commute, "meydan", PLACE_HOME)
        leave = end + roll(s, "gec_cikis", day) % 31
        outing = _evening_place(s, day, hobby_place)
        duration = 60 + roll(s, "sure", day) % 120
        latest = OUTING_LATEST_HOBBY if outing.startswith("hobi:") else OUTING_LATEST_MEYDAN
        if outing and leave + commute <= latest and leave + 2 * commute + duration <= sleep - 10:
            _add(plan, leave, "ev", PLACE_HOME)
            _travel(plan, commute, PLACE_HOME, outing)
            _add(plan, _end(plan) + duration, _activity_of(outing), outing)
            _travel(plan, commute, outing, PLACE_HOME)
        _night_out(plan, s, day, commute, sleep)
    elif works_on(r, day) and shift_of(r) == "gece":
        # Gece vardiyası (22:00-06:00): günün başında işte, sabah eve döner, kahvaltı edip öğleden sonraya
        # kadar uyur, akşam evde vakit geçirip 22:00'de yeniden işe gider.
        _add(plan, 360 + roll(s, "gec_cikis", day) % 16, "is", PLACE_WORK)
        _travel(plan, commute, PLACE_WORK, PLACE_HOME)
        _add(plan, _end(plan) + 45, "ev", PLACE_HOME)
        _add(plan, 870 + roll(s, "uyan", day) % 60, "uyku", PLACE_HOME)
        _add(plan, 1320 - commute - roll(s, "erken_varis", day) % 20, "ev", PLACE_HOME)
        _travel(plan, commute, PLACE_HOME, PLACE_WORK)
        _add(plan, 1440, "is", PLACE_WORK)
        return plan
    elif works_on(r, day):
        vardiya = shift_of(r)
        shift = catalog()["vardiyalar"][vardiya]
        start, end = int(shift["bas"]), int(shift["son"])
        if vardiya == "erken":
            sleep = 1290 + roll(s, "uyku", day) % 60
        # İşe 0-24 dk erken varılır, işten 0-15 dk geç çıkılır: herkes aynı otobüse/aynı dakikaya yığılmaz.
        arrive = start - roll(s, "erken_varis", day) % 25
        leave = end + roll(s, "gec_cikis", day) % 16
        if vardiya == "gec":
            # Akşam vardiyası: sabah kalkar, işe gitmeden önce çoğu bir süre dışarı çıkar.
            wake = 510 + roll(s, "uyan", day) % 90
            _add(plan, wake, "uyku", PLACE_HOME)
            out = wake + 60 + roll(s, "sabah_cikis", day) % 60
            length = 60 + roll(s, "sabah_sure", day) % 60
            if roll(s, "sabah", day) % 100 < 60 and out + length + commute <= arrive - commute - 30:
                _add(plan, out - commute, "ev", PLACE_HOME)
                _travel(plan, commute, PLACE_HOME, "meydan")
                _add(plan, _end(plan) + length, "meydan", "meydan")
                _travel(plan, commute, "meydan", PLACE_HOME)
        else:
            _add(plan, arrive - commute - 45 - roll(s, "uyan", day) % 30, "uyku", PLACE_HOME)
        _add(plan, arrive - commute, "ev", PLACE_HOME)
        _travel(plan, commute, PLACE_HOME, PLACE_WORK)
        _add(plan, leave, "is", PLACE_WORK)
        outing = _evening_place(s, day, hobby_place)
        duration = 60 + roll(s, "sure", day) % 120
        # Hobiler 20:00'den, meydan buluşmaları 21:30'dan önce başlar.
        latest = OUTING_LATEST_HOBBY if outing.startswith("hobi:") else OUTING_LATEST_MEYDAN
        if outing and leave + commute <= latest and leave + 3 * commute + duration <= sleep - 10:
            _travel(plan, commute, PLACE_WORK, outing)
            _add(plan, _end(plan) + duration, _activity_of(outing), outing)
            _travel(plan, commute, outing, PLACE_HOME)
        else:
            _travel(plan, commute, PLACE_WORK, PLACE_HOME)
        _night_out(plan, s, day, commute, sleep)
    else:
        wake = 450 + roll(s, "uyan", day) % 120
        _add(plan, wake, "uyku", PLACE_HOME)
        _add(plan, max(wake + 60, 600) + roll(s, "cikis", day) % 60, "ev", PLACE_HOME)
        _travel(plan, commute, PLACE_HOME, hobby_place)
        _add(plan, _end(plan) + 90 + roll(s, "sure", day) % 90, "hobi", hobby_place)
        _travel(plan, commute, hobby_place, PLACE_HOME)
        evening = 1140 + roll(s, "aksam_saat", day) % 90
        # Öğleden sonra çoğu yeniden çıkar: çarşıda alışveriş ve kahve, mahallede çay bahçesi, park.
        noon = max(_end(plan) + 40, 840 + roll(s, "ogle_saat", day) % 180)
        noon_len = min(90 + roll(s, "ogle_sure", day) % 90, evening - 2 * commute - 20 - noon)
        if roll(s, "ogle", day) % 100 < 75 and noon_len >= 45:
            _add(plan, noon - commute, "ev", PLACE_HOME)
            _travel(plan, commute, PLACE_HOME, "meydan")
            _add(plan, _end(plan) + noon_len, "meydan", "meydan")
            _travel(plan, commute, "meydan", PLACE_HOME)
        if roll(s, "aksam", day) % 100 < 55 and evening + 90 + commute <= sleep - 10:
            _add(plan, evening - commute, "ev", PLACE_HOME)
            _travel(plan, commute, PLACE_HOME, "meydan")
            _add(plan, min(_end(plan) + 90 + roll(s, "meydan_sure", day) % 90, sleep - 10 - commute), "meydan", "meydan")
            _travel(plan, commute, "meydan", PLACE_HOME)
    if _late_night(r, day):
        _go_late(plan, s, day, commute)
        return plan
    _add(plan, max(sleep, _end(plan)), "ev", PLACE_HOME)
    _add(plan, 1440, "uyku", PLACE_HOME)
    return plan
