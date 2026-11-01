"""tasinma.py uçtan uca: saatlik sayı, günde 3 taşınma, sıralama, bekleyenler, korumalar.

Gerçek bir Postgres ister; yalnız DRIFTWOOD_TEST_DB verilince çalışır (CI'da atlanır). Veritabanı her
testte sıfırdan kurulur, bu yüzden asıl veritabanının adı verilmemeli. Liste Worker'a yollanmaz
(geçici DRIFTWOOD_ROOT'ta secrets/yayin.json yok).

    docker run -d --rm --name driftwood-deneme -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54391:5432 postgres:17-alpine
    PGHOST=127.0.0.1 PGPORT=54391 PGUSER=postgres DRIFTWOOD_TEST_DB=driftwood_deneme python3 -m unittest tests.test_tasinma
"""

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
DB = os.environ.get("DRIFTWOOD_TEST_DB")


def sh(*cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw).stdout


@unittest.skipUnless(DB, "DRIFTWOOD_TEST_DB verilmedi")
class TasinmaTest(unittest.TestCase):
    def setUp(self):
        self.assertNotEqual(DB, "driftwood", "asıl veritabanında test çalıştırılmaz")
        sh("dropdb", "--if-exists", DB)
        sh("createdb", DB)
        sh("psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", str(SERVER / "schema.sql"))
        self.root = tempfile.mkdtemp()
        self.env = dict(os.environ, DRIFTWOOD_DB=DB, DRIFTWOOD_ROOT=self.root)

    def send(self, msg) -> tuple[int, dict]:
        p = subprocess.run([sys.executable, str(SERVER / "tasinma.py")], input=json.dumps(msg),
                           capture_output=True, text=True, env=self.env)
        if not p.stdout.strip():
            raise AssertionError(p.stderr[-2000:])
        return p.returncode, json.loads(p.stdout.strip().splitlines()[-1])

    def q(self, sql) -> str:
        return sh("psql", "-X", "-tA", "-d", DB, "-c", sql).strip()

    def published(self) -> dict:
        return json.loads((Path(self.root) / "public" / "sakinler.json").read_text())

    def test_bos_ada(self):
        # Yeni hesap: 0 takipçi, boş liste. Hata değil; iskelede kimse beklemez.
        code, out = self.send({"tur": "liste", "takipci": 0, "liste": []})
        self.assertEqual((code, out["nufus"], out["gelen"]), (0, 0, 0), out)
        # Profilde 1 takipçi ama listede yok (gizli hesap): beklemez, hata da değil.
        code, out = self.send({"tur": "liste", "takipci": 1, "liste": []})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.published()["bekleyen"], 0)

    def test_tasinma_akisi(self):
        # Saatlik sayı: henüz kimse taşınmadı, hepsi iskelede bekliyor.
        code, out = self.send({"tur": "sayi", "takipci": 10})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.published()["bekleyen"], 10)
        code, out = self.send({"tur": "sayi", "takipci": 10})
        self.assertEqual(out, {"takipci": 10, "degisiklik": False})

        # İlk taşınma: 12 kişi; b0..b3 aynı sayfada (aynı takip zamanı), sırayı 'sıra' belirler.
        liste = [["ilk", 100, 0], ["b3", 200, 3], ["b0", 200, 0], ["b2", 200, 2], ["b1", 200, 1]]
        liste += [[f"k{i:02d}", 300 + i, 0] for i in range(7)]
        code, out = self.send({"tur": "liste", "takipci": 13, "liste": liste})
        self.assertEqual(code, 0, out)
        self.assertEqual((out["gelen"], out["nufus"], out["ayrilan"]), (12, 12, 0))
        self.assertIn("Kahvehane", " ".join(out["acilan"]))
        order = self.q("SELECT string_agg(handle, ',' ORDER BY slot) FROM sakinler").split(",")
        self.assertEqual(order[:5], ["ilk", "b0", "b1", "b2", "b3"])
        # Profilde 13, listede 12: biri listede hiç görünmüyor (gizli hesap), iskelede beklemez.
        self.assertEqual((self.published()["bekleyen"], self.published()["zirve"]), (0, 12))

        # Aynı liste ikinci kez işlenmez.
        code, out = self.send({"tur": "liste", "takipci": 13, "liste": liste})
        self.assertEqual((code, out.get("atlandi")), (0, True))

        # Aradaki saatlerde 2 yeni takipçi: iskelede 2 kişi.
        self.send({"tur": "sayi", "takipci": 15})
        self.assertEqual(self.published()["bekleyen"], 2)

        # İkinci taşınma: 2 kişi bıraktı, 3 kişi geldi. Ayrılanların evi 7 gün tutulur.
        liste2 = [x for x in liste if x[0] not in ("k00", "k01")] + [["y0", 400, 0], ["y1", 401, 0], ["y2", 402, 0]]
        code, out = self.send({"tur": "liste", "takipci": 14, "liste": liste2})
        self.assertEqual((out["gelen"], out["ayrilan"], out["nufus"]), (3, 2, 13))
        self.assertEqual(self.q("SELECT min(slot) FROM sakinler WHERE handle LIKE 'y%'"), "12")
        self.assertEqual(self.published()["zirve"], 15)

        # Çıkan biri listede olsa da taşınmaz.
        sh(sys.executable, str(SERVER / "cikar.py"), "y2", env=self.env, cwd=SERVER)
        code, out = self.send({"tur": "liste", "takipci": 14, "liste": liste2 + [["z0", 500, 0]]})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.q("SELECT count(*) FROM sakinler WHERE handle = 'y2'"), "0")

    def test_yorum_istekleri(self):
        liste = [[f"k{i:02d}", 300 + i, 0] for i in range(4)] + [["ali", 400, 0], ["ayse", 401, 0]]
        self.assertEqual(self.send({"tur": "liste", "takipci": 6, "liste": liste})[0], 0)
        t = int(time.time()) - 3600
        yorumlar = [
            ["c1", "Ali", t, "meslek: balıkçı"],
            ["c2", "ayse", t, "adımı gizle lütfen"],
            ["c3", "yeni", t, "hobi: tavla"],              # henüz adada değil: bekler
            ["c4", "driftwoodlive", t, "meslek: doktor"],  # kendi yorumumuz
            ["c5", "ali", t - 600, "meslek: doktor"],      # daha eski: balıkçıyı ezmez
            ["c6", "k00", t, "çok güzel olmuş"],
            ["c7", "k01", t, None],
        ]
        msg = {"tur": "yorumlar", "hesap": "driftwoodlive", "yorumlar": yorumlar}
        code, out = self.send(msg)
        self.assertEqual(code, 0, out)
        self.assertEqual((out["istek"], out["bekleyen_istek"]), (4, 1), out)
        self.assertEqual(sorted(out["uygulanan"]), [["ali", "meslek", "balikci"], ["ayse", "gizle", "1"]])
        pub = {s[2]: s for s in self.published()["sakinler"]}
        self.assertEqual(pub[4][4], {"meslek": "balikci"})
        self.assertIsNone(pub[5][0])  # adı gizli
        # Aynı yorumlar ikinci kez gelirse yeni istek yok.
        code, out = self.send(msg)
        self.assertEqual((out["istek"], out["uygulanan"]), (0, []))

        # Sonradan yazılan istek geçer; geç okunan daha eski yorum ezmez.
        self.send({"tur": "yorumlar", "yorumlar": [["c8", "ali", t + 60, "hobim satranç, mesleğim aşçı"]]})
        self.send({"tur": "yorumlar", "yorumlar": [["c9", "ali", t - 60, "meslek: mimar"]]})
        self.assertEqual(self.q("SELECT overrides FROM sakinler WHERE handle = 'ali'"),
                         '{"hobi": "satranc", "meslek": "asci"}')
        self.send({"tur": "yorumlar", "yorumlar": [["c10", "ayse", t + 60, "adımı göster"]]})
        self.assertEqual(self.q("SELECT hidden FROM sakinler WHERE handle = 'ayse'"), "f")

        # "yeni" taşınınca bekleyen isteği uygulanır.
        code, out = self.send({"tur": "liste", "takipci": 7, "liste": liste + [["yeni", 500, 0]]})
        self.assertEqual(out["istek_uygulanan"], [["yeni", "hobi", "tavla"]])
        # İstek kaydı 30 gün tutulur (8 günlük durur), sonra silinir (etkisi sakinde kalır); çıkanın istekleri hemen silinir.
        self.q("UPDATE istekler SET created_at = now() - interval '8 days' WHERE handle = 'yeni'")
        self.send({"tur": "yorumlar", "yorumlar": []})
        self.assertEqual(self.q("SELECT count(*) FROM istekler WHERE handle = 'yeni'"), "1")
        self.q("UPDATE istekler SET created_at = now() - interval '31 days' WHERE handle = 'yeni'")
        self.send({"tur": "yorumlar", "yorumlar": []})
        self.assertEqual(self.q("SELECT count(*) FROM istekler WHERE handle = 'yeni'"), "0")
        self.assertEqual(self.q("SELECT overrides->>'hobi' FROM sakinler WHERE handle = 'yeni'"), "tavla")
        sh(sys.executable, str(SERVER / "cikar.py"), "ali", env=self.env, cwd=SERVER)
        self.assertEqual(self.q("SELECT count(*) FROM istekler WHERE handle = 'ali'"), "0")
        # Bozuk yorum listesi hata değil, bozuk satırlar geçilir; liste değilse hata.
        self.assertEqual(self.send({"tur": "yorumlar", "yorumlar": [["x"], 5, ["c", "b", "t", "m"]]})[1]["istek"], 0)
        self.assertEqual(self.send({"tur": "yorumlar", "yorumlar": "x"})[0], 1)

    def test_muhtar_koltugu(self):
        # Muhtar mahalle başına tek: önce isteyen olur, sonrakiler "dolu"; muhtar ayrılınca koltuk boşalır.
        liste = [[f"k{i:02d}", 300 + i, 0] for i in range(10)]
        self.assertEqual(self.send({"tur": "liste", "takipci": 10, "liste": liste})[0], 0)
        t = int(time.time()) - 3600
        code, out = self.send({"tur": "yorumlar", "yorumlar": [
            ["m1", "k01", t + 60, "meslek: muhtar"], ["m2", "k00", t, "Meslek:muhtar"], ["m3", "k02", t, "meslek: polis"]]})
        self.assertEqual(code, 0, out)
        self.assertEqual(sorted(out["uygulanan"]), [["k00", "meslek", "muhtar"], ["k02", "meslek", "polis"]])
        self.assertEqual(out["dolu"], [["k01", "muhtar"]])
        code, out = self.send({"tur": "yorumlar", "yorumlar": [["m4", "k03", t + 120, "muhtar olmak istiyorum"]]})
        self.assertEqual((out["uygulanan"], out["dolu"]), ([], [["k03", "muhtar"]]))
        # Muhtar takibi bırakır: koltuk boşalır, yeni istek geçer.
        self.assertEqual(self.send({"tur": "liste", "takipci": 9, "liste": liste[1:]})[0], 0)
        self.assertEqual(self.q("SELECT overrides FROM sakinler WHERE handle = 'k00'"), "{}")
        code, out = self.send({"tur": "yorumlar", "yorumlar": [["m5", "k03", t + 180, "meslek: muhtar"]]})
        self.assertEqual(out["uygulanan"], [["k03", "meslek", "muhtar"]])
        self.assertNotIn("dolu", out)
        # Okul müdürü de tek koltuk; muhtarlıktan bağımsız.
        code, out = self.send({"tur": "yorumlar", "yorumlar": [
            ["m6", "k04", t, "meslek: okul müdürü"], ["m7", "k05", t + 5, "okul müdürü olmak istiyorum"]]})
        self.assertEqual((out["uygulanan"], out["dolu"]), ([["k04", "meslek", "okul_muduru"]], [["k05", "okul_muduru"]]))
        # Fener bekçisi: adada tek koltuk (8. sakinin kadrosu, isteyen olursa isteyen alır).
        code, out = self.send({"tur": "yorumlar", "yorumlar": [
            ["m8", "k06", t, "meslek: fener bekçisi"], ["m9", "k08", t + 5, "fener bekçisi"]]})
        self.assertEqual((out["uygulanan"], out["dolu"]), ([["k06", "meslek", "fener_bekcisi"]], [["k08", "fener_bekcisi"]]))

    def test_belediye_secimi(self):
        # Belediye 100. sakinde açılır: ilk taşınmada seçim başlar.
        liste = [[f"k{i:03d}", 300 + i, 0] for i in range(100)]
        code, out = self.send({"tur": "liste", "takipci": 100, "liste": liste})
        self.assertEqual((code, out.get("secim")), (0, {"secim": "basladi"}), out)
        self.assertEqual(self.published()["secim"]["durum"], "acik")
        t = int(time.time()) + 60  # seçim açıldıktan sonra yazılan yorumlar (öncekiler sayılmaz)
        code, out = self.send({"tur": "yorumlar", "yorumlar": [
            ["s0", "k002", t - 30, "meslek: polis"], ["s9", "k007", t - 3600, "adayım"],
            ["s1", "k001", t - 20, "adayım"], ["s2", "k002", t - 10, "Başkan adayıyım!"],
            ["s3", "k003", t, "oy: @k001"], ["s4", "k004", t, "oyum @K002"],
            ["s5", "k005", t - 5, "oy @k001"], ["s6", "k005", t, "oy: @k002."],  # son oy geçer
            ["s7", "yabanci", t, "oy: @k001"],                                      # adada değil
            ["s8", "k006", t, "adaya yeni taşındım, oyun güzel @k001"]]})            # ne aday ne oy
        self.assertEqual((code, out["secim"]), (0, {"aday": 2, "oy": 3}), out)
        self.assertEqual(self.published()["secim"]["adaylar"], [["k002", 2], ["k001", 1]])
        # Süre dolar: sonraki taşınmada sonuç. Kazanan başkan olur, eski mesleği saklanır.
        self.q("UPDATE secimler SET son = now() - interval '1 second'")
        code, out = self.send({"tur": "liste", "takipci": 100, "liste": liste})
        self.assertEqual(out["secim"]["kazanan"], "k002", out)
        self.assertEqual(json.loads(self.q("SELECT overrides FROM sakinler WHERE handle = 'k002'")),
                         {"meslek": "belediye_baskani", "eski_meslek": "polis"})
        self.assertEqual(self.published()["secim"]["kazanan"], "k002")
        self.assertEqual(self.q("SELECT count(*) FROM secim_oylar"), "0")  # oylar silinir
        # Başkan adadan ayrılır: makam boşalır, önceki mesleği geri gelir.
        code, out = self.send({"tur": "liste", "takipci": 99, "liste": [x for x in liste if x[0] != "k002"]})
        self.assertEqual(json.loads(self.q("SELECT overrides FROM sakinler WHERE handle = 'k002'")), {"meslek": "polis"})

    def test_korumalar(self):
        liste = [[f"k{i:02d}", 300 + i, 0] for i in range(10)]
        self.assertEqual(self.send({"tur": "liste", "takipci": 10, "liste": liste})[0], 0)
        # Yarım liste (aktif nüfusun %80'inden az) işlenmez: ada boşalmaz.
        code, out = self.send({"tur": "liste", "takipci": 10, "liste": liste[:5]})
        self.assertEqual(code, 1)
        self.assertIn("Yarım liste", out["hata"])
        self.assertEqual(self.q("SELECT count(*) FROM sakinler WHERE left_day IS NULL"), "10")
        for bad in ({"tur": "liste", "takipci": 10, "liste": []}, {"tur": "x", "takipci": 1}, {"tur": "sayi"}):
            code, out = self.send(bad)
            self.assertEqual(code, 1, bad)
            self.assertIn("hata", out)
        p = subprocess.run([sys.executable, str(SERVER / "tasinma.py")], input="bozuk", capture_output=True,
                           text=True, env=self.env)
        self.assertEqual(p.returncode, 1)
        self.assertIn("hata", json.loads(p.stdout))


if __name__ == "__main__":
    unittest.main()
