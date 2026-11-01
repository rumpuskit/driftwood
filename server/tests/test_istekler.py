"""Yorumdan istek ayrıştırma (veritabanı gerektirmez, CI'da çalışır)."""

import unittest

from istekler import cozumle, katla, secenekler


class CozumleTest(unittest.TestCase):
    def test_gecerli(self):
        cases = {
            "meslek: balıkçı": {"meslek": "balikci"},
            "Mesleğim YAZILIMCI olsun lütfen": {"meslek": "yazilimci"},
            "balıkçı olmak istiyorum": {"meslek": "balikci"},
            "İzmirli öğretmen olmak istiyorum": {"meslek": "ogretmen"},
            "Mesleğim: Seramik sanatçısı": {"meslek": "seramikci"},
            "meslek balıkçı, hobi satranç, evcil kedi": {"meslek": "balikci", "hobi": "satranc", "evcil": "Kedi"},
            "evcil hayvanım köpek olsun": {"evcil": "Köpek"},
            "hobim kitap okumak": {"hobi": "kitap"},
            "hobi: yüzmek": {"hobi": "yuzme"},
            "adımı gizle": {"gizle": "1"},
            "ADIMI GÖSTERİN": {"gizle": "0"},
            "ismimi gizler misiniz": {"gizle": "1"},
            # Polis kadrolu ama istenebilir; muhtar mahalle başına tek (koltuk sunucuda denetlenir).
            "polis olmak istiyorum": {"meslek": "polis"},
            "meslek: komiser": {"meslek": "polis"},
            "Meslek:muhtar": {"meslek": "muhtar"},
            "okul müdürü olmak istiyorum": {"meslek": "okul_muduru"},
            "hâkim olmak istiyorum": {"meslek": "hakim"},
            "okul müdürü": {"meslek": "okul_muduru"},
            "meslek: fener bekçisi": {"meslek": "fener_bekcisi"},  # tek koltuk (8. sakin avukatlığı seçti)
            "Polis 👮": {"meslek": "polis"},
            "Meslek Football": {"meslek": "futbolcu"},
            "Meslek çaycı/kahveci": {"meslek": "kahveci"},
            "abla takipteyim balıkcı olucam": {"meslek": "balikci"},
            "ben polis olcam": {"meslek": "polis"},
            "doktor olacağım": {"meslek": "doktor"},
        }
        for text, want in cases.items():
            self.assertEqual(cozumle(text), want, text)

    def test_istek_degil(self):
        for text in ("çok güzel olmuş", "balıkçı amca çok iyi", "balıkçı olmak istemiyorum", "balıkçı olmayacağım",
                     "itfaiyeci olmak istiyorum", "belediye başkanı olmak istiyorum", "kahve içmek istiyorum", "meslek: şef", "meslek: müdür",
                     # Kadrolu işler (kontenjanlı) ve "anakara" istenemez.
                     "meslek: cankurtaran", "meslek: uzman"):
            self.assertEqual(cozumle(text), {}, text)

    def test_katla(self):
        self.assertEqual(katla("  İĞNE, Işık!  çöp "), "igne isik cop")

    def test_belirsiz_ad_yok(self):
        # Her takma ad tek bir değere gider; katalog değişip iki mesleğe aynı unvan eklenirse çıkarılır.
        for tur, pairs in secenekler().items():
            aliases = [a for a, _ in pairs]
            self.assertEqual(len(aliases), len(set(aliases)), tur)


if __name__ == "__main__":
    unittest.main()


class DogrulamaKoduTest(unittest.TestCase):
    """Sitedeki yorumla doğrulama: yorumdaki kod Worker'a [kod, kullanıcı adı] olarak gider, istek sayılmaz."""

    def test_kod(self):
        from istekler import KOD
        for text, want in {"kod 4821": "4821", "Kod: 4821 ben buradayım": "4821", "kodum 1234": "1234",
                           "kod4821": "4821", "KOD 12345": None, "kodlar çok güzel": None}.items():
            m = KOD.search(katla(text))
            self.assertEqual(m and m.group(1), want, text)
        self.assertEqual(cozumle("kod 4821"), {})

    def test_worker_cagrisi(self):
        import istekler
        import ortak
        gelen = []
        eski_kayit, eski_kaydet, eski_psql, eski_uygula = ortak.kayit, istekler.kaydet, istekler.psql, istekler.uygula
        ortak.kayit = lambda method, path, body=None: (gelen.append((method, path, body)), {"onaylanan": ["ali"]})[1]
        istekler.kaydet = lambda satirlar, kaynak, db=None: 0
        istekler.psql = lambda sql, db=None, extra=None: "[]" if "json_agg" in sql else "0"
        istekler.uygula = lambda db=None: []
        try:
            out = istekler.yorumlar([["c1", "Ali", 1, "kod 4821"], ["c2", "veli", 2, "meslek: balıkçı"], ["c3", "biz", 3, "kod 1111"]], hesap="biz")
        finally:
            ortak.kayit, istekler.kaydet, istekler.psql, istekler.uygula = eski_kayit, eski_kaydet, eski_psql, eski_uygula
        self.assertEqual(gelen, [("POST", "/api/onayla", {"ciftler": [["4821", "ali"]]})])
        self.assertEqual(out["dogrulanan"], ["ali"])
