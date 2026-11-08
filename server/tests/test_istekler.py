"""Yorumdan istek ayrıştırma (veritabanı gerektirmez, CI'da çalışır)."""

import unittest

from istekler import cozumle, katla, secenekler


class CozumleTest(unittest.TestCase):
    def test_gecerli(self):
        cases = {
            "job: fisherman": {"meslek": "balikci"},
            "Job, fisherman": {"meslek": "balikci"},
            "JOB FISHERMAN": {"meslek": "balikci"},
            "I want to be a fisherman": {"meslek": "balikci"},
            "i wanna be a cop": {"meslek": "polis"},
            "I wanna be a cop lol": {"meslek": "polis"},
            "make me a baker": {"meslek": "firinci"},
            "fisherman please": {"meslek": "balikci"},
            "teacher pls 🙏": {"meslek": "ogretmen"},
            "I'm gonna be a nurse": {"meslek": "hemsire"},
            "I’d like to be an architect": {"meslek": "mimar"},
            "lemme be the lighthouse keeper": {"meslek": "fener_bekcisi"},
            "can I be the lighthouse keeper?": {"meslek": "fener_bekcisi"},
            "may I be a doctor? 🙂‍↕️": {"meslek": "doktor"},
            "could I become a nurse": {"meslek": "hemsire"},
            "My job: software developer": {"meslek": "yazilimci"},
            "job: programmer": {"meslek": "yazilimci"},
            "job: doctor": {"meslek": "doktor"},
            "job: doc": {"meslek": "doktor"},
            "job: farmer": {"meslek": "ciftci"},
            "job: cranberry farmer": {"meslek": "ciftci"},
            "job: chef": {"meslek": "asci"},
            "job: short-order cook": {"meslek": "kahveci"},
            "job: quarterback": {"meslek": "futbolcu"},
            "job: football player": {"meslek": "futbolcu"},
            "job: blimp pilot": {"meslek": "zeplin_pilotu"},
            "I want to be a blimp pilot": {"meslek": "zeplin_pilotu"},
            "job: principal": {"meslek": "okul_muduru"},
            "job: neighborhood association president": {"meslek": "muhtar"},
            "job: judge": {"meslek": "hakim"},
            "job: district attorney": {"meslek": "savci"},
            "job: sergeant": {"meslek": "polis"},
            "job: retired": {"meslek": "emekli"},
            "job: bakers": {"meslek": "firinci"},
            "Police officer 👮": {"meslek": "polis"},
            "lighthouse keeper": {"meslek": "fener_bekcisi"},
            "job fisherman, hobby chess, pet cat": {"meslek": "balikci", "hobi": "satranc", "evcil": "Cat"},
            "hobby: chess": {"hobi": "satranc"},
            "hobby: kite flying": {"hobi": "ucurtma"},
            "my hobby is grilling": {"hobi": "mangal"},
            "hobby: bbq": {"hobi": "mangal"},
            "hobby cornhole": {"hobi": "cornhole"},
            "pet: cat": {"evcil": "Cat"},
            "my pet is a dog": {"evcil": "Dog"},
            "pet: puppy": {"evcil": "Dog"},
            "hide my name": {"gizle": "1"},
            "Hide my username please": {"gizle": "1"},
            "make me private": {"gizle": "1"},
            "show my name": {"gizle": "0"},
            "unhide my name": {"gizle": "0"},
        }
        for text, want in cases.items():
            self.assertEqual(cozumle(text), want, text)

    def test_istek_degil(self):
        for text in ("this is so cute", "the fisherman looks cute", "I don't want to be a fisherman", "I'd never be a cop",
                     "good job", "nice job guys", "I want to be a firefighter", "I want to be the mayor", "I want coffee",
                     "job: manager", "job: intern", "job: store manager",
                     # Kontenjanlı işler (lifeguard) ve "mainland" istenemez; Mayor seçimle gelir.
                     "job: lifeguard", "job: mayor", "job: associate"):
            self.assertEqual(cozumle(text), {}, text)

    def test_katla(self):
        self.assertEqual(katla("  I’m a Café   OWNER!! "), "im a cafe owner")

    def test_belirsiz_ad_yok(self):
        # Her takma ad tek bir değere gider; katalog değişip iki mesleğe aynı unvan eklenirse çıkarılır.
        for tur, pairs in secenekler().items():
            aliases = [a for a, _ in pairs]
            self.assertEqual(len(aliases), len(set(aliases)), tur)

    def test_her_meslek_istenebilir(self):
        # İstenebilen her meslek en az kendi ana unvanıyla ("Fisherman", "Short-Order Cook") tanınır.
        from driftwood_sim import sim
        c = sim.catalog()
        for j in c["meslekler"]:
            if (j.get("kadro") and not j.get("istenebilir")) or j.get("secimle") or j["id"] == c["kilitli_meslek"]:
                continue
            ad = j["kademeler"][1] if len(j["kademeler"]) > 1 else j["kademeler"][0]
            self.assertEqual(cozumle(f"job: {ad}").get("meslek"), j["id"], ad)


if __name__ == "__main__":
    unittest.main()


class DogrulamaKoduTest(unittest.TestCase):
    """Sitedeki yorumla doğrulama: yorumdaki kod Worker'a [kod, kullanıcı adı] olarak gider, istek sayılmaz."""

    def test_kod(self):
        from istekler import KOD
        for text, want in {"code 4821": "4821", "Code: 4821 it's me": "4821", "my code is 1234": "1234",
                           "code4821": "4821", "CODE 12345": None, "codes are cool": None}.items():
            m = KOD.search(katla(text))
            self.assertEqual(m and m.group(1), want, text)
        self.assertEqual(cozumle("code 4821"), {})
        from istekler import kodlar_bul
        for text, want in [("code 1234", [("1234", True)]), ("my code is 3674", [("3674", True)]), ("8538", [("8538", True)]),
                           ("4521 that's me!", [("4521", False)]), ("1234 is my code 🏠", [("1234", True)]),
                           ("Posted my CODE: 9087 ✨", [("9087", True)]), ("call 5551234567", []), ("i want to be a cop", [])]:
            self.assertEqual(kodlar_bul(text), want, text)

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
            out = istekler.yorumlar([["c1", "Ali", 1, "code 4821"], ["c2", "veli", 2, "job: fisherman"], ["c3", "biz", 3, "code 1111"]], hesap="biz")
        finally:
            ortak.kayit, istekler.kaydet, istekler.psql, istekler.uygula = eski_kayit, eski_kaydet, eski_psql, eski_uygula
        self.assertEqual(gelen, [("POST", "/api/onayla", {"ciftler": [["4821", "ali", True]]})])
        self.assertEqual(out["dogrulanan"], ["ali"])
