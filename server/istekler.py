#!/usr/bin/env python3
"""Sakinlerin istekleri: videolarımızın altına yazılan yorumlardan (tik.ninja üzerinden, tasinma.py)
ya da elle (DM, canlı yayın) gelir ve sakinin overrides alanına işlenir.

Yorumdaki biçim (büyük/küçük harf ve Türkçe karakter fark etmez, birkaçı aynı yorumda olabilir):
    meslek: balıkçı      mesleğim yazılımcı olsun      balıkçı olmak istiyorum
    hobi: satranç        evcil: kedi                   adımı gizle / adımı göster
Yalnız katalogdaki seçenekler geçer (kadrolu işler, ör. cankurtaran, istenemez; "istenebilir" olanlar, ör. polis ve
fener bekçisi, hariç). İstek yalnız yorumu yazanın kendisi için ve yalnız adada oturuyorsa uygulanır; henüz
taşınmamışsa 30 gün bekler (ISTEK_GUN).
Aynı konuda birden çok istek varsa en son yazılan geçer.

Yorum metni saklanmaz: yalnız ayrıştırılmış istek (kullanıcı adı, tür, değer, yorum kimliği) tutulur
ve 30 gün sonra silinir; isteğin etkisi sakinin kaydında kalır.

Kullanım (sunucuda, driftwood kullanıcısıyla):
    python3 istekler.py dene "mesleğim balıkçı olsun"     # ayrıştırmayı dene, kaydetme
    python3 istekler.py ekle kullaniciadi meslek balikci  # DM ya da canlı yayından gelen istek
    python3 istekler.py liste [--gun 30]                  # son isteklerin dökümü (haftalık video)
"""

import argparse
import json
import re
import sys
import time
from functools import cache

from driftwood_sim import sim
import ortak  # noqa: E402
from ortak import DB, ISTEK_GUN, psql, publish

TURLER = ("meslek", "hobi", "evcil", "gizle")
MAX_METIN = 300
# Katalogda adı geçmeyen ama sık yazılacak karşılıklar.
EK_MESLEK = {"ciftci": "zeytinci", "yazilim": "yazilimci", "programci": "yazilimci", "hekim": "doktor",
             "kaptan": "balikci", "polislik": "polis", "polis memuru": "polis",
             "futbol": "futbolcu", "football": "futbolcu", "footballer": "futbolcu"}
# Birden çok mesleğin basamağı olabilecek genel unvanlar meslek adı sayılmaz.
GENEL = {"mudur", "uzman", "stajyer", "cirak", "komi", "sef"}
EK_HOBI = {"balik": "balik", "kitap": "kitap", "resim": "resim", "bisiklet": "bisiklet", "yuzme": "yuzme",
           "ucurtma": "ucurtma", "gitar": "gitar", "fotograf": "fotograf", "kosu": "kosu", "kosmak": "kosu"}

_FOLD = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def katla(text: str) -> str:
    """Küçük harf (Türkçe kurala göre), Türkçe karakterler Latin, noktalama boşluk."""
    t = text.replace("İ", "i").replace("I", "ı").lower().translate(_FOLD)
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


def _sozluk(pairs) -> list[tuple[str, str]]:
    """(takma ad, değer) çiftleri; birden çok değere giden belirsiz adlar (ör. "komi") çıkarılır.
    Uzun ad önce denenir ("usta balikci" "balikci"den önce)."""
    seen: dict[str, set] = {}
    for alias, value in pairs:
        if alias and value:
            seen.setdefault(alias, set()).add(value)
    return sorted(((a, v.pop()) for a, v in seen.items() if len(v) == 1), key=lambda x: -len(x[0]))


@cache
def secenekler() -> dict[str, list[tuple[str, str]]]:
    c = sim.catalog()
    # Seçimle gelen makamlar (belediye başkanı) istenemez: secim.py.
    meslekler = [j for j in c["meslekler"] if (not j.get("kadro") or j.get("istenebilir")) and not j.get("secimle")
                 and j["id"] != c["kilitli_meslek"]]
    meslek = [(katla(j["id"].replace("_", " ")), j["id"]) for j in meslekler]
    meslek += [(katla(k), j["id"]) for j in meslekler for k in j["kademeler"] if katla(k) not in GENEL]
    meslek += list(EK_MESLEK.items())
    hobi = [(katla(h["id"]), h["id"]) for h in c["hobiler"]] + [(katla(h["ad"]), h["id"]) for h in c["hobiler"]]
    hobi += list(EK_HOBI.items())
    evcil = [(katla(p), p) for p in c["evcil_hayvanlar"]]
    return {"meslek": _sozluk(meslek), "hobi": _sozluk(hobi), "evcil": _sozluk(evcil)}


# Sitedeki yorumla doğrulama kodu: "kod 1234", "kod: 1234", "kodum 1234".
KOD = re.compile(r"\bkod\w*\s*:?\s*(\d{4})\b")
TETIK = re.compile(r"\b(?:(?P<meslek>mesle[kg]\w*)|(?P<hobi>hobi\w*)|(?P<evcil>evcil\w*))\b")
# "X olmak istiyorum" ve konuşma dilindeki "X olucam / olcam / olacağım" (yorumlarda sık).
OLMAK = re.compile(r"\b((?:\w+ ){0,2}\w+) (?:olmak isti|(?:olucam|olcam|olacagim|olacam|olcagim)\b)")
GIZLE = re.compile(r"\b(?:adimi|ismimi|adim|ismim|beni)\b(?: \w+){0,2} (?P<ne>gizle|goster)\w*"
                   r"|\b(?P<ne2>gizle|goster)\w*(?: \w+){0,2} (?:adimi|ismimi)\b")


def _bul(tur: str, parca: str) -> str | None:
    """Parçada ilk geçen seçenek (kelime başından eşleşir: "balikciyim" → balikci)."""
    best = None
    for alias, value in secenekler()[tur]:
        m = re.search(r"\b" + re.escape(alias), parca)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), value)
    return best[1] if best else None


def cozumle(text: str) -> dict[str, str]:
    """Yorumdaki istekler: {tür: değer}. Değerler katalog kimliği (evcil: hayvanın adı; gizle: "1"/"0")."""
    t = katla(text[:MAX_METIN])
    out: dict[str, str] = {}
    tetikler = list(TETIK.finditer(t))
    for n, m in enumerate(tetikler):
        tur = m.lastgroup
        son = tetikler[n + 1].start() if n + 1 < len(tetikler) else len(t)
        deger = _bul(tur, t[m.end():son])
        if deger and tur not in out:
            out[tur] = deger
    if "meslek" not in out:
        for m in OLMAK.finditer(t):
            deger = _bul("meslek", m.group(1))
            if deger:
                out["meslek"] = deger
                break
    if not out:
        # Yorumun tamamı bir meslek adıysa ("okul müdürü", "polis 👮") o da istektir; cümle içinde geçen
        # ad ("balıkçı amca çok iyi") istek sayılmaz.
        tam = dict(secenekler()["meslek"]).get(t)
        if tam:
            out["meslek"] = tam
    g = GIZLE.search(t)
    if g:
        out["gizle"] = "1" if (g.group("ne") or g.group("ne2")) == "gizle" else "0"
    return out


KAYDET_SQL = """
INSERT INTO istekler (handle, tur, deger, kaynak, kaynak_id, created_at)
SELECT x->>0, x->>1, x->>2, :'kaynak', x->>3, to_timestamp((x->>4)::bigint)
FROM json_array_elements(:'veri'::json) AS x
ON CONFLICT (kaynak, kaynak_id) DO NOTHING;
"""

# Her (kullanıcı, tür) için en son yazılan istek geçer: o henüz uygulanmadıysa ve kişi adada oturuyorsa
# uygulanır; ondan eski bekleyenler eskir (geç okunan eski bir yorum yeni isteği ezmez).
UYGULA_SQL = """
BEGIN;
CREATE TEMP TABLE son ON COMMIT DROP AS
SELECT DISTINCT ON (i.handle, i.tur) i.id, i.handle, i.tur, i.deger, i.durum, i.created_at, {koltuk_a} AS koltuk
FROM istekler i
JOIN sakinler s ON s.platform = 'tt' AND s.handle = i.handle AND s.left_day IS NULL
WHERE i.durum IN ('bekliyor', 'uygulandi')
ORDER BY i.handle, i.tur, i.created_at DESC, i.id DESC;

-- Tek koltuklu meslekler (muhtar, okul müdürü): adadan ayrılan koltuğu bırakır; koltuk doluysa ya da aynı
-- mahallede daha önce isteyen varsa istek 'dolu' olur (kişinin eski mesleği sürer).
UPDATE sakinler SET overrides = overrides - 'meslek'
WHERE platform = 'tt' AND left_day IS NOT NULL AND overrides->>'meslek' IN ({tek});
CREATE TEMP TABLE dolu ON COMMIT DROP AS
SELECT a.id, a.handle, a.tur FROM son a
WHERE a.durum = 'bekliyor' AND a.tur = 'meslek' AND a.deger IN ({tek}) AND (
  EXISTS (SELECT 1 FROM sakinler o WHERE o.platform = 'tt' AND o.left_day IS NULL AND o.handle <> a.handle
          AND o.overrides->>'meslek' = a.deger AND {koltuk_o} = a.koltuk)
  OR EXISTS (SELECT 1 FROM son b WHERE b.durum = 'bekliyor' AND b.tur = 'meslek' AND b.deger = a.deger
             AND b.koltuk = a.koltuk AND b.handle <> a.handle AND (b.created_at, b.id) < (a.created_at, a.id)));
UPDATE istekler i SET durum = CASE WHEN i.id = d.id THEN 'dolu' ELSE 'eskidi' END
FROM dolu d WHERE i.handle = d.handle AND i.tur = d.tur AND i.durum = 'bekliyor';
DELETE FROM son WHERE id IN (SELECT id FROM dolu);

-- Kişi başına tek güncelleme (UPDATE ... FROM aynı satırı birden çok eşleşmeyle yalnız bir kez günceller).
UPDATE sakinler s SET overrides = s.overrides || o.yeni
FROM (SELECT handle, jsonb_object_agg(tur, deger) AS yeni FROM son
      WHERE durum = 'bekliyor' AND tur <> 'gizle' GROUP BY handle) o
WHERE s.platform = 'tt' AND s.handle = o.handle;
UPDATE sakinler s SET hidden = (son.deger = '1')
FROM son WHERE son.durum = 'bekliyor' AND son.tur = 'gizle' AND s.platform = 'tt' AND s.handle = son.handle;

UPDATE istekler i SET durum = CASE WHEN i.id = son.id THEN 'uygulandi' ELSE 'eskidi' END
FROM son WHERE i.handle = son.handle AND i.tur = son.tur AND i.durum = 'bekliyor';

DELETE FROM istekler WHERE created_at < now() - make_interval(days => {gun});
SELECT coalesce(json_agg(json_build_array(handle, tur, deger) ORDER BY handle, tur), '[]')
FROM son WHERE durum = 'bekliyor';
COMMIT;
"""


def kaydet(satirlar: list, kaynak: str, db: str = DB) -> int:
    """[[kullanıcı adı, tür, değer, kaynak kimliği, unix zaman], ...] → yeni eklenen sayısı."""
    if not satirlar:
        return 0
    once = int(psql("SELECT count(*) FROM istekler", db))
    psql(KAYDET_SQL, db, ["-v", f"kaynak={kaynak}", "-v", "veri=" + json.dumps(satirlar, ensure_ascii=False)])
    return int(psql("SELECT count(*) FROM istekler", db)) - once


def uygula(db: str = DB) -> list:
    """Bekleyen istekleri adada oturanlara uygular, 30 günden eski kayıtları siler (yayın yapmaz)."""
    c = sim.catalog()
    # Tek koltuklu meslekler (muhtar, okul müdürü, fener bekçisi): koltuk, mahallenin şubesidir (sim.workplace ile aynı:
    # mahalle % şube sayısı; okul sayısı mahalleden azsa iki mahalle aynı okulu paylaşır; tek fener: adada bir koltuk).
    tekler = [j for j in c["meslekler"] if j.get("tek") == "mahalle"]
    tek = ", ".join(f"'{j['id']}'" for j in tekler) or "NULL"
    mahalle = sim.cap("daire_per_bina") * sim.cap("bina_per_sokak") * sim.cap("sokak_per_mahalle")
    koltuk = "CASE {} ELSE 0 END".format(" ".join(f"WHEN '{j['id']}' THEN {{s}}.slot / {mahalle} % {len(c['isyerleri'][j['yer']])}" for j in tekler)) if tekler else "0"
    sql = UYGULA_SQL.format(gun=ISTEK_GUN, tek=tek, koltuk_a=koltuk.replace("{s}", "s").replace("CASE", "CASE i.deger"),
                            koltuk_o=koltuk.replace("{s}", "o").replace("CASE", "CASE a.deger"))
    return json.loads(psql(sql, db) or "[]")


def yorumlar(items: list, hesap: str | None = None, db: str = DB) -> dict:
    """tasinma.py'den: [[yorum kimliği, kullanıcı adı, unix zaman, metin], ...]. Metinler ayrıştırılıp
    atılır; kendi hesabımızın yorumları ve bozuk satırlar geçilir."""
    satirlar, kodlar = [], []
    for it in items:
        if not (isinstance(it, list) and len(it) == 4 and isinstance(it[3], str) and isinstance(it[2], int)):
            continue
        cid, handle = str(it[0])[:40], sim.normalize_handle(str(it[1]))
        if not cid or not handle or handle == hesap:
            continue
        if m := KOD.search(katla(it[3][:200])):
            kodlar.append([m.group(1), handle])
        for tur, deger in cozumle(it[3]).items():
            # Aynı yorumda birden çok istek: kaynak kimliği türle ayrılır.
            satirlar.append([handle, tur, deger, f"{cid}:{tur}", it[2]])
    # Sitedeki yorumla doğrulama: "kod 1234" yazanın kodu Worker'da o kullanıcı adına verildiyse bağlanır.
    onay = (ortak.kayit("POST", "/api/onayla", {"ciftler": kodlar}) or {}).get("onaylanan", []) if kodlar else []
    yeni = kaydet(satirlar, "yorum", db)
    dolu = "SELECT coalesce(json_agg(json_build_array(handle, deger) ORDER BY id), '[]') FROM istekler WHERE durum = 'dolu'"
    once = json.loads(psql(dolu, db))
    uygulanan = uygula(db)
    bekleyen = int(psql("SELECT count(*) FROM istekler WHERE durum = 'bekliyor'", db))
    # Koltuğu dolu olduğu için geçmeyen istekler (muhtar): yorumu yazana cevapta söylemek için.
    reddedilen = [d for d in json.loads(psql(dolu, db)) if d not in once]
    return {"yorum": len(items), "istek": yeni, "uygulanan": uygulanan, "bekleyen_istek": bekleyen,
            **({"dolu": reddedilen} if reddedilen else {}), **({"dogrulanan": onay} if onay else {})}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="komut", required=True)
    p = sub.add_parser("dene", help="metni ayrıştır, kaydetme")
    p.add_argument("metin")
    p = sub.add_parser("ekle", help="elle istek (DM, canlı yayın)")
    p.add_argument("handle")
    p.add_argument("tur", choices=TURLER)
    p.add_argument("deger", help="katalog kimliği ya da adı (gizle için: evet/hayir)")
    p.add_argument("--kaynak", default="dm", choices=["dm", "canli"])
    p = sub.add_parser("liste", help="son isteklerin dökümü")
    p.add_argument("--gun", type=int, default=ISTEK_GUN)
    parser.add_argument("--db", default=DB)
    args = parser.parse_args()

    if args.komut == "dene":
        print(json.dumps(cozumle(args.metin), ensure_ascii=False))
        return
    if args.komut == "ekle":
        if args.tur == "gizle":
            deger = {"evet": "1", "hayir": "0", "1": "1", "0": "0"}.get(katla(args.deger))
        else:
            deger = _bul(args.tur, katla(args.deger))
        if deger is None:
            sys.exit(f"HATA: '{args.deger}' geçerli bir {args.tur} değil")
        handle = sim.normalize_handle(args.handle)
        now = int(time.time())
        kaydet([[handle, args.tur, deger, f"{args.kaynak}:{handle}:{args.tur}:{now}", now]], args.kaynak, args.db)
        uygulanan = uygula(args.db)
        durum = "uygulandı" if any(u[0] == handle for u in uygulanan) else f"adada değil, taşınınca uygulanacak ({ISTEK_GUN} gün)"
        print(json.dumps({"istek": [handle, args.tur, deger], "durum": durum,
                          "yayin": publish(args.db) if uygulanan else None}, ensure_ascii=False))
        return
    rows = psql(f"""SELECT coalesce(json_agg(json_build_array(handle, tur, deger, kaynak, durum,
                        to_char(created_at AT TIME ZONE 'America/New_York', 'MM/DD HH24:MI')) ORDER BY created_at), '[]')
                    FROM istekler WHERE created_at > now() - make_interval(days => {int(args.gun)})""", args.db)
    for r in json.loads(rows):
        print("\t".join(map(str, r)))


if __name__ == "__main__":
    main()
