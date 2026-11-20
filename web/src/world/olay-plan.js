// Günün olayı (16 Kasım 2026, kullanıcı: "yaşayan bir şehir … doğal olaylar, kazalar, önemli anlar, dikkat çekici olaylar
// gibi kurgular olsun"). Saf modül (three yok): site (olay.js) ve video betiği (video/gunluk.mjs) aynı planı hesaplar.
//
// Her gün (özel günler hariç) adada İKİ olay olur (17 Kasım akşamı, kullanıcı: "ikinci videolar da olay videosu olacak
// … tek düze olmaması için"): yuva 0 sabah (öğle videosu anlatır), yuva 1 öğleden sonra (akşam videosu anlatır; türü
// sabahkinden farklı, saatleri olay-ayar.js IKINCI). Her olay; tür, saat ve tohum yalnız güne ve adada neyin açık olduğuna bağlıdır
// (deterministik): video kaydı günün herhangi bir dakikasını yeniden çizebilir, sitedeki ziyaretçi de aynı olayı görür.
// Olaylar zararsız kurgudur: kimse yaralanmaz, gerçek bir sakin suçlanmaz ya da kazaya karıştırılmaz (sakinler yalnız
// seyirci, itfaiyeci/polis/doktor olarak görev başında ya da tanık olarak görünür).
//
// Tür tablosu: saat penceresi [en erken başlangıç, en geç başlangıç] (yerel dakika), süre (dk), gerek (isOpen ile).
// Adaya özgü ayarlar (türler, saat pencereleri, özel günler) olay-ayar.js'te; bu dosya üç adada (city-game, driftwood,
// wattenoog) birebir aynıdır (social-management mac/ada/olay_esit.sh denetler).
import * as AYAR from "./olay-ayar.js";
import { ADA_TURLERI, PENCERE, ozelGun } from "./olay-ayar.js";
export { ADA_TURLERI, ozelGun };
// İkinci (öğleden sonra) olay: { turler, pencere: {tur: [en erken, en geç başlangıç]}, son (en geç bitiş, yerel dk),
// yazSon (Avrupa yaz saatinde en geç bitiş) }. Ayar yoksa ikinci olay yok.
const IKINCI = AYAR.IKINCI ?? null;
// Tür listesi sürümleri (17 Kasım akşamı: yeni tür eklenince blok karıştırması değişip geçmiş günlerin, yayınlanmış
// videoların olayı geriye dönük değişiyordu). olay-ayar.js TUR_SURUMLERI: [{ gun: "YYYY-MM-DD", sabah: [...], ikinci:
// [...] }]; o günden itibaren o listeler geçerli, öncesi ADA_TURLERI / IKINCI.turler (ya da önceki sürüm).
const SURUMLER = (AYAR.TUR_SURUMLERI ?? []).map((s) => ({ ...s, d: Date.parse(s.gun + "T00:00:00Z") / 86400000 })).sort((a, b) => a.d - b.d);
function surum(day) { let r = null; for (const s of SURUMLER) if (s.d <= day) r = s; return r; }
export const sabahTurleri = (day) => surum(day)?.sabah ?? ADA_TURLERI;
export const ikinciTurleri = (day) => surum(day)?.ikinci ?? IKINCI?.turler ?? [];

// Tür tablosu: pencere [en erken, en geç başlangıç] (yerel dakika; olay-ayar.js PENCERE ezer), süre (dk),
// gerek(open, day) (isOpen ve gün: mevsimlik türler o gün uygun mu; gün verilmeyen eski türler yalnız open'a bakar),
// yuva (1: yalnız öğleden sonra), pencereGun(P, day) (o günün penceresi: gün batımına bağlı türler; yoksa P).
const TURLER = {
  firtina: { ad: "Fırtına", en: "Storm", pencere: [510, 640], sure: [85, 110], gerek: () => true },
  sis: { ad: "Sis", en: "Fog", pencere: [370, 420], sure: [230, 280], gerek: () => true },
  yangin: { ad: "Yangın", en: "Fire", pencere: [540, 700], sure: [55, 65], gerek: (open) => open("itfaiye") },
  kaza: { ad: "Trafik kazası", en: "Car crash", pencere: [510, 720], sure: [40, 48], gerek: (open) => open("cevre_yolu") && open("karakol:0") },
  yunus: { ad: "Yunuslar", en: "Dolphins", pencere: [540, 730], sure: [32, 40], gerek: () => true },
  balina: { ad: "Balina", en: "Whale", pencere: [540, 730], sure: [32, 40], gerek: () => true },
  // Yeni türler (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"); görünüm modülleri
  // olay-moduller.js. Adada çıkması için olay-ayar.js ADA_TURLERI / IKINCI.turler listesine girmeleri gerekir.
  zeplin: { ad: "Zeplin acil inişi", en: "Blimp emergency landing", pencere: [600, 740], sure: [45, 60], gerek: () => true },
  dugun: { ad: "Düğün konvoyu", en: "Wedding convoy", pencere: [580, 720], sure: [38, 44], gerek: (open) => open("cevre_yolu") },
  fok: { ad: "Fok", en: "Seals", pencere: [560, 730], sure: [40, 55], gerek: () => true },
  hortum: { ad: "Su hortumu", en: "Waterspout", pencere: [560, 720], sure: [25, 35], gerek: () => true },
  gemi: { ad: "Dev gemi", en: "Giant ship", pencere: [560, 690], sure: [75, 85], gerek: (open) => open("liman:0") },
  moose: { ad: "Geyik", en: "Moose in town", pencere: [480, 690], sure: [35, 45], gerek: () => true },
  // --- ajan B (liman ve tekne olayları; olay-gemi.js, olay-vapur.js, olay-balik.js, olay-yaris.js) ---
  // vapur: izgara [adım, kalan]: başlangıç vapur seferlerine hizalanır (bas ≡ 17 (mod 20): ferry.js VAPUR_OLAY, A = bas + 3).
  vapur: { ad: "Vapur arızası", en: "Ferry breakdown", pencere: [560, 720], sure: [30, 30], izgara: [20, 17], gerek: () => true },
  balik: { ad: "Dev balık", en: "Giant catch", pencere: [560, 720], sure: [38, 46], gerek: (open) => open("balikci_koyu:0") },
  tekne_yarisi: { ad: "Tekne yarışı", en: "Lobster boat race", pencere: [560, 720], sure: [36, 36], gerek: (open) => open("balikci_koyu:0") },
  // --- ajan B sonu ---
  kopekbaligi: { ad: "Köpekbalığı", en: "Shark sighting", pencere: [560, 700], sure: [40, 55], gerek: () => true },
  // --- ajan E ---
  // Kar (mevsimlik: yalnız 1 Aralık–28 Şubat): kar yağar, ada beyazlar, kar gün boyu kalır (olay-kar.js).
  kar: { ad: "Kar", en: "Snow", pencere: [480, 600], sure: [70, 95], gerek: (open, day) => karMevsimi(day) },
  // Elektrik kesintisi (yalnız öğleden sonra, yalnız gün batımından sonra sığan kısa günlerde; olay-elektrik.js). Pencere
  // her gün gün batımından hesaplanır (olay-ayar.js gunBatimi; tanımlı olmayan adada hiç çıkmaz).
  elektrik: { ad: "Elektrik kesintisi", en: "Power outage", pencere: [1050, 1090], sure: [30, 38], yuva: 1,
    gerek: (open, day) => elektrikPenceresi(day) != null, pencereGun: (P, day) => elektrikPenceresi(day, P) ?? P },
  // --- ajan E sonu ---
  // --- ajan D --- gökyüzü ve doğa (olay-balon.js, olay-ucurtma.js, olay-kus.js; moose: olay-moose.js, yalnız Driftwood).
  // kus: adaya göre (olay-ayar.js KUS, ADLAR): Mercanada leylek göçü, Driftwood kel kartal; evreleri KUS.evre ezer.
  balon: { ad: "Sıcak hava balonları", en: "Hot air balloons", pencere: [480, 640], sure: [55, 70], gerek: () => true },
  ucurtma: { ad: "Uçurtma şenliği", en: "Kite festival", pencere: [600, 700], sure: [45, 60], gerek: () => true },
  kus: { ad: "Kuşlar", en: "Birds", pencere: [540, 680], sure: [35, 50], gerek: () => true },
  // --- ajan D sonu ---
  // --- ajan C (kasaba ve insan olayları; görünüm olay-film/yaris/marti.js) ---
  film: { ad: "Film çekimi", en: "Film shoot", pencere: [570, 700], sure: [45, 55], gerek: () => true },
  yaris: { ad: "Bisiklet yarışı", en: "Fun run", pencere: [570, 710], sure: [40, 46], gerek: () => true },
  marti: { ad: "Martı simit kaptı", en: "Seagull steals a hot dog", pencere: [570, 730], sure: [18, 24], gerek: () => true },
  // --- ajan A (deniz ve kıyı: olay-dalga.js) ---
  dalga: { ad: "Dev dalgalar", en: "Big waves", pencere: [540, 680], sure: [40, 55], gerek: () => true },
  // --- ajan A sonu ---
};
// Temalar (18 Kasım, kullanıcı: "aynı temada videoları neredeyse peşpeşe üretmiş": Mercanada'da kaza 17 Kasım öğle ve
// 18 Kasım akşam videosunda, Driftwood'da sis ve fırtına art arda, iki adanın öğleden sonra olayı aynı karıştırma tuzuyla
// sık sık AYNI tür: 19 Kasım'da ikisinde martı). Tür değil tema tekrar etmez ve iki ada BİRLİKTE planlanır: yayın sırası
// (Mercanada 12:30, Driftwood 18:30, Mercanada 18:30, Driftwood 23:30) "küresel yuva" dizisidir; art arda 5 küresel yuvanın
// teması birbirinden farklıdır (bir adada art arda 3 olay, iki adada art arda 5 video). Tema dizisi yalnız güne bağlı ve
// iki depoda aynı (bu dosya iki adada birebir aynıdır): her ada öbürünün temasını kendi verisi olmadan bilir. Tema içinde
// tür, o adada en uzun süredir çıkmamış uygun tür (gerek, yuva, mevsim).
export const TEMA = {
  kaza: "acil", yangin: "acil", elektrik: "acil",
  firtina: "hava", sis: "hava", hortum: "hava", dalga: "hava", kar: "hava",
  yunus: "deniz", balina: "deniz", fok: "deniz", kopekbaligi: "deniz",
  kus: "canli", marti: "canli", moose: "canli",
  zeplin: "gok", balon: "gok", ucurtma: "gok",
  gemi: "liman", vapur: "liman", balik: "liman",
  dugun: "kasaba", film: "kasaba", yaris: "kasaba", tekne_yarisi: "kasaba", // insan etkinlikleri (iki yarış aynı tema)
};
const TEMA_ADLARI = ["acil", "hava", "deniz", "canli", "gok", "liman", "kasaba"];
// Küresel yuva sırası: [ada, yuva]. Ada adı olay-ayar.js ADA. İlk sürümün sırası (iki ada); sonraki sürümler kendi
// sırasını taşır (sira): 22 Kasım'dan üç ada (Wattenoog eklendi). Bir adanın "son olayları" sabit adımla değil, o adanın
// küresel yuva listesinden bulunur: gün başına yuva sayısı sürüme göre değişebilir, geçmiş günler değişmez.
const TEMA_SIRA = [["mercanada", 0], ["driftwood", 0], ["mercanada", 1], ["driftwood", 1]];
// Sürümler (geçmiş günler değişmesin: yeni sürüm satırı EKLE, eskisini değiştirme). adalar: o adanın tema kümesi (her temada
// her gün ve iki yuvada en az bir türün çıkabildiği temalar; Driftwood'da kaza/yangın açılınca "acil" yeni sürümle girer).
// turler: adaların tür listeleri (sabah, öğleden sonra; ada kendi olay-ayar.js TUR_SURUMLERI listesinde olmayanı
// kullanmaz). onceki (yalnız ilk sürüm): sürüm gününden önceki küresel yuvaların türleri (eskiden yeniye; 15–18 Kasım).
// sira: küresel yuva sırası (yoksa TEMA_SIRA); pencere / adaPencere / adaAgirlik: aşağıdaki kuralın o sürümdeki değerleri;
// turPencere: tür, son N küresel yuvada (hangi adada olursa olsun) çıkmadıysa seçilir (temada başka uygun tür varsa).
const ORTAK = ["zeplin", "fok", "hortum", "dalga", "kar", "kus", "marti", "film", "balik", "yaris", "balon", "vapur", "ucurtma"];
const TURLER_V1 = {
  mercanada: [["yangin", "firtina", "yunus", "kaza", "sis", "dugun", "gemi", ...ORTAK], ["yangin", "firtina", "yunus", "kaza", "dugun", "elektrik", ...ORTAK]],
  driftwood: [["firtina", "balina", "sis", "kaza", "yangin", "kopekbaligi", "moose", "tekne_yarisi", ...ORTAK], ["firtina", "balina", "yunus", "kaza", "yangin", "kopekbaligi", "moose", "tekne_yarisi", ...ORTAK]],
};
const ADALAR_V1 = { mercanada: ["acil", "hava", "deniz", "canli", "gok", "liman", "kasaba"], driftwood: ["hava", "deniz", "canli", "gok", "liman", "kasaba"] };
const TEMA_SURUMLERI = [
  { gun: "2026-11-19",
    adalar: ADALAR_V1,
    turler: TURLER_V1,
    onceki: ["firtina", "firtina", "yangin", "balina", "yangin", "balina", "firtina", "firtina", "kaza", "sis", "yunus", "yunus", "sis", "firtina", "kaza", "balina"] },
  // 22 Kasım: Wattenoog (Almanya, Kuzey Denizi) katıldı. Yayın sırası Berlin saatiyle: M 12:30, W 13:30, D 18:30, M 18:30,
  // W 20:00, D 23:30 (her adanın adımı 3). Mercanada ve Driftwood'un tema kümeleri ve tür listeleri değişmedi.
  { gun: "2026-11-22",
    sira: [["mercanada", 0], ["wattenoog", 0], ["driftwood", 0], ["mercanada", 1], ["wattenoog", 1], ["driftwood", 1]],
    pencere: 4, adaPencere: 3, adaAgirlik: 16, turPencere: 6,
    // Wattenoog 0 sakinle açıldı: listeler yalnız bugün çıkabilen türler (Kutterhafen 15, Feuerwehr 30, Polizei 40, yollar
    // 200, Versorgungshafen 600 sakinde açılır). Plan adanın açık yerlerini bilmez (üç depoda aynı olmalı): listede olup
    // açılmamış tür yedeğe düşer, yedek de temayı tekrarlatır (benzetim: 0 sakinde feribot 2 günde bir). Yer açılınca
    // mac/ada/olay_kademe.mjs aşağıya "ekle" satırı yazar (2 gün sonrasından; geçmiş günler değişmez).
    adalar: { ...ADALAR_V1, wattenoog: ["hava", "deniz", "canli", "gok", "liman", "kasaba"] },
    turler: { ...TURLER_V1,
      wattenoog: [["firtina", "sis", "fok", "yunus", "zeplin", "hortum", "balon", "ucurtma", "kus", "film", "yaris", "marti", "dalga", "kar", "vapur"],
        ["firtina", "fok", "yunus", "zeplin", "hortum", "balon", "ucurtma", "kus", "film", "yaris", "marti", "dalga", "kar", "vapur"]] } },
  // Kademe satırları (olay_kademe.mjs yazar; elle de eklenebilir): { gun, kademe: "açıklama", ekle: { <ada>: { tema: [...],
  // sabah: [...], ikinci: [...] } } }. Önceki satırın her şeyini devralır, yalnız listelere ekler.
  // KADEME-SON (olay_kademe.mjs yeni satırı bu satırın önüne yazar)
].map((s) => ({ ...s, d: Date.parse(s.gun + "T00:00:00Z") / 86400000 })).sort((a, b) => a.d - b.d).reduce((l, s) => [...l, s.ekle ? genislet(l.at(-1), s) : s], []);
// "ekle" satırı: önceki sürümün sırası, ayarları, tema kümeleri ve tür listeleri + eklenenler (tema sırası TEMA_ADLARI).
function genislet(p, s) {
  const { onceki, gun, d, kademe, ...miras } = p;
  const adalar = { ...p.adalar }, turler = { ...p.turler }, tek = (l) => [...new Set(l)];
  for (const [ada, e] of Object.entries(s.ekle)) {
    adalar[ada] = TEMA_ADLARI.filter((a) => (p.adalar[ada] ?? []).includes(a) || (e.tema ?? []).includes(a));
    const [sa, ik] = p.turler[ada] ?? [[], []];
    turler[ada] = [tek([...sa, ...(e.sabah ?? [])]), tek([...ik, ...(e.ikinci ?? [])])];
  }
  return { ...miras, sira: p.sira ?? TEMA_SIRA, adalar, turler, gun: s.gun, d: s.d, kademe: s.kademe };
}
// Kesin kural: önceki `pencere` (4) küresel yuvanın ve bu adanın son `adaPencere` (3) olayının temasından farklı (aynı adada
// tema en az 2 gün, adalar arasında ~1 gün tekrar etmez). Tercih: bütün adalarda en uzun süredir çıkmamış tema; tema içinde
// en uzun süredir çıkmamış tür (aynı adadaki kullanım `adaAgirlik` küresel yuva daha yakın sayılır: 2 gün).
const temaSurum = (day) => { let r = null; for (const s of TEMA_SURUMLERI) if (s.d <= day) r = s; return r; };
const siraOf = (S) => S.sira ?? TEMA_SIRA;
const ayarOf = (S) => ({ pencere: S.pencere ?? 4, adaPencere: S.adaPencere ?? 3, adaAgirlik: S.adaAgirlik ?? 8 });
const hepAcik = () => true;
// Küresel dizi her depoda aynı olmalı: türün o gün uygunluğu adanın kendi ayarına (gün batımı, öğleden sonra sınırı)
// bağlı olamaz. İlk sürümde elektrik kesintisi adanın gunBatimi'ne bakıyordu (Driftwood'da hiç, Mercanada'da 29 Ekim–18
// Ocak): iki depo 23 Kasım'dan itibaren farklı dizi hesaplıyordu. sira'lı sürümlerde sabit takvim penceresi; ada o gün
// sığdıramazsa kendi yedeğini seçer (temaTurleri).
const elektrikMevsimi = (day) => { const d = new Date(day * 86400000), m = d.getUTCMonth() + 1, g = d.getUTCDate(); return (m === 10 && g >= 29) || m === 11 || m === 12 || (m === 1 && g <= 18); };
const kureselGerek = (S, t, day) => (S.sira && t === "elektrik" ? elektrikMevsimi(day) : OLAYLAR[t].gerek(hepAcik, day));
/** d gününün ilk küresel yuvasının sırası (ilk sürüm gününden itibaren; onceki hariç). */
function gunBasi(d) {
  const s0 = TEMA_SURUMLERI[0];
  let n = 0;
  TEMA_SURUMLERI.forEach((S, i) => {
    const lo = Math.max(S.d, s0.d), hi = Math.min(d, TEMA_SURUMLERI[i + 1]?.d ?? Infinity);
    if (hi > lo) n += (hi - lo) * siraOf(S).length;
  });
  return n;
}
// Küresel dizi (yalnız güne bağlı, saf; adanın açık yerlerine bakmaz): gün gün, her gün o günün sürümünün sırasıyla.
// adaIdx: her adanın küresel yuva sıraları (onceki dahil). Önbellekli.
const T = { tur: [], aile: [], sonAile: {}, sonTur: {}, sonAda: {}, adaIdx: {}, gunSon: null };
function temaDizisi(dayEnd) {
  const s0 = TEMA_SURUMLERI[0];
  if (!s0) return null;
  if (!T.tur.length) {
    T.on = s0.onceki.length;
    const q = siraOf(s0);
    s0.onceki.forEach((t, i) => {
      const ada = q[i % q.length][0];
      T.tur.push(t); T.aile.push(TEMA[t]); T.sonAile[TEMA[t]] = T.sonTur[t] = i - T.on; (T.sonAda[ada] ??= {})[t] = i - T.on;
      (T.adaIdx[ada] ??= []).push(i);
    });
    T.gunSon = s0.d - 1;
  }
  while (T.gunSon < dayEnd) {
    const day = T.gunSon + 1, S = temaSurum(day), q = siraOf(S), { pencere, adaPencere, adaAgirlik } = ayarOf(S);
    const bugunSabah = {};
    q.forEach(([ada, y], k) => {
      const n = T.tur.length, g = n - T.on, kume = S.adalar[ada] ?? [];
      const sabah = y === 1 ? bugunSabah[ada] ?? null : null; // aynı adanın bugünkü sabah türü
      const liste = (S.turler[ada]?.[y] ?? []).filter((t) => OLAYLAR[t] && TEMA[t] && (y === 1 || OLAYLAR[t].yuva !== 1) && kureselGerek(S, t, day) && t !== sabah);
      const idx = T.adaIdx[ada] ?? [];
      const yasakOf = (p, ap) => {
        const y = new Set(T.aile.slice(-p));
        for (let j = 1; j <= ap; j++) if (idx.length - j >= 0) y.add(T.aile[idx[idx.length - j]]); // bu adanın son olayları
        return y;
      };
      const dolu = (a) => liste.some((t) => TEMA[t] === a);
      let yasak = yasakOf(pencere, adaPencere);
      // turPencere'li sürümde izinli tema kalmazsa kurallar kademeli gevşer: önce adanın en eski olayı, sonra küresel pencere.
      if (S.turPencere) for (const [p, ap] of [[pencere, adaPencere - 1], [pencere - 1, adaPencere], [pencere - 1, adaPencere - 1], [pencere - 2, adaPencere - 1]]) {
        if (kume.some((a) => !yasak.has(a) && dolu(a))) break;
        yasak = yasakOf(p, ap);
      }
      // turPencere'li sürümde tür kuralları (aşağıda) temayı seçerken de gözetilir: yasaklı olmayan temalardan, içinde iki
      // kurala da uyan türü olanlar önce.
      const yakinda = S.turPencere ? new Set(T.tur.slice(-S.turPencere)) : null;
      const kendi = S.turPencere ? new Set((T.adaIdx[ada] ?? []).slice(-6).map((p) => T.tur[p])) : null;
      const temiz = (a) => liste.some((t) => TEMA[t] === a && !yakinda.has(t) && !kendi.has(t));
      let izin = kume.filter((a) => !yasak.has(a) && dolu(a));
      const yarim = (a) => liste.some((t) => TEMA[t] === a && !yakinda.has(t));
      if (S.turPencere) { if (izin.some(temiz)) izin = izin.filter(temiz); else if (izin.some(yarim)) izin = izin.filter(yarim); }
      if (!izin.length) izin = kume.filter((a) => !T.aile.slice(-2).includes(a) && dolu(a));
      if (!izin.length) izin = kume.filter(dolu);
      // En uzun süredir çıkmamış iki temadan biri (tekdüze bir döngü olmasın diye ikisi arasında karma seçer).
      izin.sort((a, b) => (T.sonAile[a] ?? -1e9) - (T.sonAile[b] ?? -1e9) || kesir("tema", day, k, a) - kesir("tema", day, k, b));
      const aile = izin.length > 1 && kesir("temaSec", day, k) < 0.5 ? izin[1] : izin[0] ?? null;
      const sonAda = (T.sonAda[ada] ??= {}), yakin = (t) => Math.max(T.sonTur[t] ?? -1e9, (sonAda[t] ?? -1e9) + adaAgirlik);
      let aday = liste.filter((t) => TEMA[t] === aile);
      if (S.turPencere) {
        // Önce iki kural birlikte: tür bu adada son 3 günde (adanın son 6 yuvası) ve herhangi bir adada son turPencere
        // küresel yuvada çıkmamış olsun; olmazsa adalar arası kural + adada son 2 gün, sonra ada kuralı, sonra adalar arası.
        const sec = (f) => { const r = aday.filter(f); if (r.length) { aday = r; return true; } return false; };
        const kendi4 = new Set((T.adaIdx[ada] ?? []).slice(-4).map((p) => T.tur[p])); // adanın son 2 günü
        sec((t) => !yakinda.has(t) && !kendi.has(t)) || sec((t) => !yakinda.has(t) && !kendi4.has(t)) || sec((t) => !kendi.has(t)) || sec((t) => !yakinda.has(t));
      }
      const tur = aday.sort((a, b) => yakin(a) - yakin(b) || kesir("temaTur", day, k, a) - kesir("temaTur", day, k, b))[0] ?? null;
      T.tur.push(tur); T.aile.push(aile);
      if (aile) T.sonAile[aile] = g;
      if (tur) T.sonTur[tur] = sonAda[tur] = g;
      (T.adaIdx[ada] ??= []).push(n);
      if (y === 0) bugunSabah[ada] = tur;
    });
    T.gunSon = day;
  }
  return T;
}
/** O günün tema sürümünün tema kümeleri ve tür listeleri (mac/ada/olay_kademe.mjs okur; sürüm öncesi null). */
export function temaKumesi(day) {
  const S = temaSurum(day);
  return S ? { gun: S.gun, adalar: S.adalar, turler: S.turler, sira: siraOf(S) } : null;
}
/** Bir günün küresel yuvalarının türü ve teması, o günün sürüm sırasıyla (sürüm öncesi null). 19–21 Kasım: [M sabah,
 *  D sabah, M öğleden sonra, D öğleden sonra]; 22 Kasım'dan: [M, W, D sabah; M, W, D öğleden sonra]. Ada o türü açamıyorsa
 *  (gerek) kendi seçer: temaTurleri. */
export function gununTemalari(day) {
  const s0 = TEMA_SURUMLERI[0];
  if (!s0 || day < s0.d) return null;
  const t = temaDizisi(day), S = temaSurum(day), g = gunBasi(day) + t.on, q = siraOf(S);
  return t.tur.slice(g, g + q.length).map((tur, i) => ({ tur, tema: t.aile[g + i], ada: q[i][0], yuva: q[i][1] }));
}
/** Tema düzeninde bu adanın (olay-ayar.js ADA) günün iki türü [sabah, öğleden sonra] (sürüm öncesi, ada o günün sırasında
 *  yoksa ya da ADA yoksa undefined: eski blok karıştırma). Küresel dizinin türü; ada onu açamıyorsa (gerek, kendi listesi)
 *  aynı temada en uzun süredir çıkmamış uygun tür, o da yoksa penceredeki temalar dışında en uzun süredir çıkmamış tür (sürüm
 *  gününden zincirlenir; sıra sürümden önceki 14 günün eski düzendeki olaylarıyla başlar). */
function temaTurleri(day, open, o) {
  const ada = AYAR.ADA, s0 = TEMA_SURUMLERI[0];
  if (!ada || !s0 || day < s0.d || !siraOf(temaSurum(day)).some(([a]) => a === ada)) return undefined;
  const ozel = o.ozel ?? ozelGun, t = temaDizisi(day + 2); // yedek seçimi sonraki küresel yuvalara da bakar
  const yuvaK = (d, y) => siraOf(temaSurum(d)).findIndex(([a, yy]) => a === ada && yy === y);
  let son = null, sonuc = null;
  for (let d = s0.d; d <= day; d++) {
    const gun = [null, null];
    if (!ozel(d)) for (const y of [0, 1]) {
      const k = yuvaK(d, y);
      if (k < 0) continue; // ada o gün tema düzeninde değil (katılmadan önce)
      const g0 = gunBasi(d) + t.on + k;
      const taban = y === 0 ? sabahTurleri(d) : ikinciTurleri(d);
      const uygun = (x) => taban.includes(x) && OLAYLAR[x] && (y === 1 || OLAYLAR[x].yuva !== 1) && x !== gun[0] && OLAYLAR[x].gerek(open, d);
      let tur = t.tur[g0];
      if (!tur || !uygun(tur)) {
        const liste = taban.filter(uygun);
        // Yedek (nadir): adanın kendi geçmişiyle en uzun süredir çıkmamış tür.
        if (!son) {
          son = {};
          for (let e = s0.d - 14; e < d; e++) for (const z of [0, 1]) {
            const kz = e < s0.d ? -1 : yuvaK(e, z);
            const p = e < s0.d ? olayGunu(e, open, { ozel, yuva: z })?.tur : kz >= 0 ? t.tur[gunBasi(e) + t.on + kz] : null;
            if (p) son[p] = (e - s0.d) * 2 + z;
          }
        }
        const Sd = temaSurum(d), P = ayarOf(Sd).pencere;
        const yasak = t.aile.slice(Math.max(0, g0 - P), g0);
        const enEski = (l) => l.sort((a, b) => (son[a] ?? -1e9) - (son[b] ?? -1e9) || kesir("temaYedek", d, y, a) - kesir("temaYedek", d, y, b))[0] ?? null;
        if (Sd.sira) {
          // sira'lı sürümde (20 Kasım: Wattenoog 0 sakinle açıldı; Kutterhafen 15, Feuerwehr 30, yollar 200 sakinde açılır)
          // yedek sık çıkar: aynı temanın tek uygun türü (feribot) 2 günde bir tekrar ediyordu. Yedek tür adanın son 3
          // gününde (kendi 6 yuvası) çıkmamış olsun; aynı temada yoksa önceki VE sonraki P küresel yuvanın temaları dışından.
          const simdi = (d - s0.d) * 2 + y, yeni = (x, n) => (son[x] ?? -1e9) < simdi - n;
          const komsu = new Set([...yasak, ...t.aile.slice(g0 + 1, g0 + 1 + P)]);
          const ayni = liste.filter((x) => TEMA[x] === t.aile[g0]), disari = liste.filter((x) => !komsu.has(TEMA[x]));
          tur = enEski(ayni.filter((x) => yeni(x, 6))) ?? enEski(disari.filter((x) => yeni(x, 6))) ?? enEski(ayni.filter((x) => yeni(x, 4)))
            ?? enEski(disari.filter((x) => yeni(x, 4))) ?? enEski(liste.filter((x) => !yasak.includes(TEMA[x]) && yeni(x, 4)))
            ?? enEski(ayni) ?? enEski(liste.filter((x) => !yasak.includes(TEMA[x]))) ?? enEski(liste);
        } else
        tur = enEski(liste.filter((x) => TEMA[x] === t.aile[g0])) ?? enEski(liste.filter((x) => !yasak.includes(TEMA[x]))) ?? enEski(liste);
      }
      gun[y] = tur;
      if (son && tur) son[tur] = (d - s0.d) * 2 + y;
    }
    if (d === day) sonuc = gun;
  }
  return sonuc;
}
// Ada adları (olay-ayar.js ADLAR: { tur: [ad, en] }; ör. Mercanada "Akdeniz foku", Driftwood "Seals on the dock").
/** Kar mevsimi: 1 Aralık–28 Şubat (29 Şubat yok). Gün verilmezse (eski çağrı) false. */
function karMevsimi(day) {
  if (day == null) return false;
  const d = new Date(day * 86400000), m = d.getUTCMonth() + 1;
  return m === 12 || m === 1 || (m === 2 && d.getUTCDate() <= 28);
}
/** Elektrik kesintisinin o günkü başlangıç penceresi [en erken, en geç] (yerel dk) ya da null (o gün sığmaz): kesinti
 *  lambalar yandıktan sonra başlar (gün batımı + 7 dk: güneş −1,5°'nin altında) ve öğleden sonra sınırından (IKINCI.son,
 *  yaz saatinde yazSon) önce biter; karanlık olsun diye sınıra en yakın 10 dk'lık dilimde başlar. P (ayardaki pencere) verilirse kesişim alınır (boşsa hesaplanan). */
function elektrikPenceresi(day, P) {
  if (day == null || !AYAR.gunBatimi || !IKINCI) return null;
  const sinir = avrupaYazi(day) && IKINCI.yazSon ? IKINCI.yazSon : IKINCI.son;
  const b = sinir - TURLER.elektrik.sure[1], a = Math.max(AYAR.gunBatimi(day) + 7, b - 10); // olabildiğince geç: karanlık
  if (a > b) return null;
  if (P && Math.max(a, P[0]) <= Math.min(b, P[1])) return [Math.max(a, P[0]), Math.min(b, P[1])];
  return [a, b];
}
export const OLAYLAR = Object.fromEntries(Object.entries(TURLER).map(([k, v]) => [k, { ...v, pencere: PENCERE[k] ?? v.pencere, ad: AYAR.ADLAR?.[k]?.[0] ?? v.ad, en: AYAR.ADLAR?.[k]?.[1] ?? v.en }]));

// Küçük, kararlı karma (xmur3 + mulberry32): aynı (gün, tuz) her yerde aynı sayıyı verir.
function karma(...parca) {
  let h = 1779033703;
  for (const ch of parca.join("|")) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
export const kesir = (...p) => karma(...p) / 4294967296;

/**
 * Günün olayı.
 *   day: gün sayısı (sim.dayOf), open: (anahtar) => açık mı (sim.isOpen), o: { turler: ["yunus", …] (bu adanın türleri),
 *   ozel: (day) => özel gün mü (anma vb.; o gün olay yok), zorla: "yangin" (deneme: türü zorla), saat: dakika (deneme),
 *   yuva: 0 sabah (varsayılan) | 1 öğleden sonra }
 * Dönüş: { tur, ad, en, bas, son, tohum, day, yuva } ya da null.
 */
export function olayGunu(day, open, o = {}) {
  if (o.yuva === 1) return ikinciOlay(day, open, o);
  if ((o.ozel ?? ozelGun)(day) && !o.zorla) return null;
  const uygun = (d) => (t) => OLAYLAR[t] && OLAYLAR[t].yuva !== 1 && OLAYLAR[t].gerek(open, d);
  const taban = o.turler ?? sabahTurleri(day), turler = taban.filter(uygun(day));
  if (!turler.length) return null;
  let tur = o.zorla && OLAYLAR[o.zorla] ? o.zorla : null;
  // Tema düzeni (19 Kasım'dan; o.turler verilmişse eski düzen).
  const tema = tur || o.turler || o.ic ? undefined : temaTurleri(day, open, o);
  if (tema !== undefined) { tur = tema[0]; if (!tur) return null; }
  if (!tur) {
    // Blok karıştırma: türler her blokta (blok = tür sayısı kadar gün) bir kez çıkar. Bloğun ilk türü önceki bloğun son
    // türüyle aynıysa bloğun ilk iki türü yer değiştirir (yalnız ilk ikisi değişir, son tür değişmez: özyineleme yok).
    // Böylece aynı tür art arda iki gün gelmez (n ≥ 3).
    const n = turler.length;
    const ham = (blok) => turler.map((t) => [kesir("olaySira", blok, t), t]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const sira = (blok) => {
      const s = ham(blok);
      if (n > 2 && s[0] === ham(blok - 1)[n - 1]) [s[0], s[1]] = [s[1], s[0]];
      return s;
    };
    const s = sira(Math.floor(day / n)), k = ((day % n) + n) % n;
    tur = s[k];
    // Mevsim sınırı (kar 1 Aralık'ta girer, 1 Mart'ta çıkar): liste dünden farklıysa blok kayar ve dünkü tür yeniden
    // gelebilir; o gün bloktan ne dünkü ne yarınki (aynı bloktaki sıradaki) olan bir tür seçilir. Mevsimlik tür yoksa
    // listeler hep aynıdır: takvim değişmez.
    if (!o.ic && n > 2 && taban.filter(uygun(day - 1)).length !== n) {
      const dun = olayGunu(day - 1, open, { ...o, ic: true, saat: undefined })?.tur;
      if (dun === tur) tur = [2, 3, 1].map((j) => s[(k + j) % n]).find((t) => t !== dun && (k === n - 1 || t !== s[k + 1])) ?? tur;
    }
  }
  const T = OLAYLAR[tur];
  const bas = o.saat ?? Math.round(T.pencere[0] + kesir("olaySaat", day, tur) * (T.pencere[1] - T.pencere[0]));
  const sure = Math.round(T.sure[0] + kesir("olaySure", day, tur) * (T.sure[1] - T.sure[0]));
  // Yaz saati (17 Kasım QC): Avrupa yaz saatinde öğle üretimi ada saatiyle bir saat erken başlar (Mercanada: 11:30 Berlin
  // = 12:30 TR). Olay ayardaki YAZ_SON'dan (yerel dakika) önce bitecek kadar erkene alınır; kış günleri değişmez.
  let b0 = bas;
  if (AYAR.YAZ_SON && o.saat == null && avrupaYazi(day) && b0 + sure > AYAR.YAZ_SON) b0 = AYAR.YAZ_SON - sure;
  // Genel sınır (17 Kasım akşamı: yeni türlerin varsayılan penceresi Driftwood'un öğle üretimini geçiyordu): sabah olayı
  // olay-ayar.js SABAH_SON'dan (yerel dk) sonra bitmez.
  if (AYAR.SABAH_SON && o.saat == null && b0 + sure > AYAR.SABAH_SON) b0 = AYAR.SABAH_SON - sure;
  b0 = hizala(b0, T);
  return { tur, ad: T.ad, en: T.en, bas: b0, son: b0 + sure, tohum: karma("olay", day, tur), day, yuva: 0 };
}

/** Günün iki olayı [sabah, öğleden sonra] (yoksa null'lar). o: olayGunu seçenekleri; o.yuva verilirse zorla/saat yalnız o
 *  yuvaya uygulanır (deneme: ?olayyuva=1). */
export function gunOlaylari(day, open, o = {}) {
  const y = o.yuva ?? 0, ham = { ...o, zorla: undefined, saat: undefined };
  return [0, 1].map((i) => olayGunu(day, open, i === y ? { ...o, yuva: i } : { ...ham, yuva: i }));
}

/** Öğleden sonra olayı: türü sabahkinden farklı (sis yok: IKINCI.turler), kendi blok karıştırması ve saat penceresi. */
function ikinciOlay(day, open, o) {
  if (!IKINCI || ((o.ozel ?? ozelGun)(day) && !o.zorla)) return null;
  const liste = (d) => ikinciTurleri(d).filter((t) => OLAYLAR[t] && OLAYLAR[t].gerek(open, d));
  let tur = o.zorla && OLAYLAR[o.zorla] ? o.zorla : null;
  const tema = tur ? undefined : temaTurleri(day, open, o);
  if (tema !== undefined) { tur = tema[1]; if (!tur) return null; }
  if (!tur) {
    // Blok karıştırma (ayrı tuz) + iki kısıt: sabahkinden farklı, önceki günün öğleden sonrakinden farklı. Önceki gün
    // 32 günlük sabit blokların başından zincirlenir (her gün için aynı sonuç; blok başında yalnız sabah kısıtı).
    const sec = (d, dun) => {
      if ((o.ozel ?? ozelGun)(d)) return null;
      const hepsi = liste(d), n = hepsi.length;
      if (!n) return null;
      const sira = (b) => hepsi.map((t) => [kesir("olaySira2", b, t), t]).sort((a, c) => a[0] - c[0]).map((x) => x[1]);
      const sabahOf = (g) => olayGunu(g, open, { ...o, yuva: 0, zorla: undefined, saat: undefined })?.tur;
      const sabah = sabahOf(d);
      const s = sira(Math.floor(d / n)), aday = [s[((d % n) + n) % n], ...s];
      // Komşu günlerin sabah olayından da farklı (sürümde komsu: true; 17 Kasım akşamı: bir tür akşam videosunda ve ertesi
      // sabahın videosunda art arda çıkıyordu). Sabah planı öğleden sonraya bağlı olmadığı için özyineleme yok.
      if (surum(d)?.komsu) {
        const dunSabah = sabahOf(d - 1), yarinSabah = sabahOf(d + 1);
        const t = aday.find((x) => x !== sabah && x !== dun && x !== dunSabah && x !== yarinSabah);
        if (t) return t;
      }
      return aday.find((t) => t !== sabah && t !== dun) ?? aday.find((t) => t !== sabah) ?? null;
    };
    let dun = null;
    for (let d = day - (((day % 32) + 32) % 32); d < day; d++) dun = sec(d, dun) ?? dun;
    tur = sec(day, dun);
    if (!tur) return null;
  }
  // Penceresi verilmemiş tür öğleden sonra varsayılanına (IKINCI.varsayilan) düşer, sabah penceresine DEĞİL (17 Kasım akşamı:
  // öğleden sonra yuvasındaki zeplin 10:55'te başlıyordu).
  const T = OLAYLAR[tur], P0 = IKINCI.pencere[tur] ?? IKINCI.varsayilan ?? [IKINCI.son - 240, IKINCI.son - 120];
  const P = T.pencereGun ? T.pencereGun(P0, day) : P0;
  const sure = Math.round(T.sure[0] + kesir("olaySure2", day, tur) * (T.sure[1] - T.sure[0]));
  let bas = o.saat ?? Math.round(P[0] + kesir("olaySaat2", day, tur) * (P[1] - P[0]));
  // En geç bitiş (akşam üretiminden önce): kışın IKINCI.son, Avrupa yaz saatinde IKINCI.yazSon (yerel dk).
  const sonSinir = avrupaYazi(day) && IKINCI.yazSon ? IKINCI.yazSon : IKINCI.son;
  if (o.saat == null && sonSinir && bas + sure > sonSinir) bas = sonSinir - sure;
  bas = hizala(bas, T);
  return { tur, ad: T.ad, en: T.en, bas, son: bas + sure, tohum: karma("olay2", day, tur), day, yuva: 1 };
}

/** Izgaralı tür (TURLER izgara [adım, kalan]: vapur seferleri): başlangıç ızgaranın bir önceki noktasına çekilir (sınırların
 *  içinde kalır; ?olaysaat ile zorlanan saat de hizalanır: site, video ve vapur düzeni aynı anı kullanır). */
function hizala(b, T) {
  if (!T.izgara) return b;
  const [adim, kalan] = T.izgara;
  return b - ((((b - kalan) % adim) + adim) % adim);
}

/** Avrupa yaz saati mi (Mart'ın son pazarından Ekim'in son pazarına; gün sayısı UTC gün başı). */
export function avrupaYazi(day) {
  const y = new Date(day * 86400000).getUTCFullYear();
  const sonPazar = (ay) => { const d = Date.UTC(y, ay + 1, 0) / 86400000; return d - new Date(d * 86400000).getUTCDay(); };
  return day >= sonPazar(2) && day < sonPazar(9);
}

/** Olayın evresi (0–1 ilerleme ve ad); olay dışındaysa null. Görsel modüller ve video aynı evre adlarını kullanır. */
export function olayEvre(o, minute) {
  if (!o) return null;
  const sure = o.son - o.bas, u = (minute - o.bas) / sure;
  // Fırtınanın ardından gökkuşağı (20 dk), yangının ardından gün boyu is izi: "sonra" evresi.
  // Kar yağışı bitince kar gün boyu yerde kalır ("sonra"; ertesi gün yeni plan: kar yok).
  const sonra = { firtina: 20, yangin: 24 * 60, kar: 24 * 60 }[o.tur] ?? 0;
  if (minute < o.bas || minute > o.son + sonra) return null;
  if (minute > o.son) return { ad: "sonra", u: (minute - o.son) / Math.max(1, sonra), t: minute - o.bas };
  const E = {
    firtina: [[0.16, "yaklasma"], [0.84, "yagmur"], [1, "dinme"]],
    sis: [[0.18, "gelis"], [0.78, "yogun"], [1, "dagilma"]],
    yangin: [[0.07, "duman"], [0.17, "alarm"], [0.6, "sondurme"], [1, "tutuyor"]],
    kaza: [[0.14, "kaza"], [0.42, "polis"], [1, "cekici"]],
    yunus: [[0.15, "gorundu"], [0.85, "oyun"], [1, "uzaklasma"]],
    balina: [[0.15, "gorundu"], [0.85, "oyun"], [1, "uzaklasma"]],
    zeplin: [[0.18, "alcalma"], [0.3, "inis"], [0.78, "yerde"], [1, "kalkis"]],
    dugun: [[0.15, "toplanma"], [0.4, "konvoy"], [1, "halay"]],
    fok: [[0.15, "gorundu"], [0.85, "kayada"], [1, "uzaklasma"]],
    hortum: [[0.2, "olusma"], [0.8, "hortum"], [1, "dagilma"]],
    gemi: [[0.15, "gorundu"], [0.5, "yanasma"], [1, "limanda"]],
    moose: [[0.15, "gorundu"], [0.85, "kasabada"], [1, "uzaklasma"]],
    // --- ajan B ---
    vapur: [[0.1, "ariza"], [0.47, "romorkor"], [0.67, "cekme"], [0.77, "yanasma"], [1, "yanasti"]],
    balik: [[0.3, "donus"], [0.42, "yanasma"], [0.58, "indirme"], [1, "foto"]],
    tekne_yarisi: [[0.29, "toplanma"], [0.44, "yaris"], [1, "kutlama"]],
    // --- ajan B sonu ---
    kopekbaligi: [[0.12, "gorundu"], [0.3, "bosaltma"], [0.88, "kapali"], [1, "acildi"]],
    // --- ajan E ---
    kar: [[0.15, "baslangic"], [0.75, "yogun"], [1, "seyrelme"]],
    elektrik: [[0.08, "kesinti"], [0.84, "karanlik"], [1, "donus"]],
    // --- ajan D ---
    balon: [[0.22, "sisirme"], [0.32, "kalkis"], [0.72, "suzulme"], [0.84, "inis"], [1, "yerde"]],
    ucurtma: [[0.12, "toplanma"], [0.5, "senlik"], [0.76, "takildi"], [1, "kurtuldu"]],
    kus: AYAR.KUS?.evre ?? [[0.15, "gelis"], [0.75, "termik"], [1, "gidis"]],
    // --- ajan D sonu ---
    // --- ajan C ---
    film: [[0.15, "kurulum"], [0.85, "cekim"], [1, "toplama"]],
    yaris: [[0.15, "hazirlik"], [0.8, "yaris"], [1, "bitis"]],
    marti: [[0.3, "simit"], [0.36, "kapma"], [0.8, "kovalama"], [1, "dagilma"]],
    // --- ajan A ---
    dalga: [[0.15, "yukselme"], [0.85, "dovme"], [1, "durulma"]],
    // --- ajan A sonu ---
  }[o.tur] ?? [[1, "olay"]];
  const [, ad] = E.find(([s]) => u <= s) ?? E[E.length - 1];
  return { ad, u, t: minute - o.bas };
}
