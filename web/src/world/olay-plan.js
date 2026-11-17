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
// Adaya özgü ayarlar (türler, saat pencereleri, özel günler) olay-ayar.js'te; bu dosya iki adada aynıdır.
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
  dugun: { ad: "Düğün konvoyu", en: "Wedding convoy", pencere: [600, 740], sure: [35, 45], gerek: (open) => open("cevre_yolu") },
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
  // --- ajan A (deniz ve kıyı: olay-dalga.js) ---
  dalga: { ad: "Dev dalgalar", en: "Big waves", pencere: [540, 680], sure: [40, 55], gerek: () => true },
  // --- ajan A sonu ---
};
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
  if (!tur) {
    // Blok karıştırma (ayrı tuz) + iki kısıt: sabahkinden farklı, önceki günün öğleden sonrakinden farklı. Önceki gün
    // 32 günlük sabit blokların başından zincirlenir (her gün için aynı sonuç; blok başında yalnız sabah kısıtı).
    const sec = (d, dun) => {
      if ((o.ozel ?? ozelGun)(d)) return null;
      const hepsi = liste(d), n = hepsi.length;
      if (!n) return null;
      const sira = (b) => hepsi.map((t) => [kesir("olaySira2", b, t), t]).sort((a, c) => a[0] - c[0]).map((x) => x[1]);
      const sabah = olayGunu(d, open, { ...o, yuva: 0, zorla: undefined, saat: undefined })?.tur;
      const s = sira(Math.floor(d / n)), aday = [s[((d % n) + n) % n], ...s];
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
    dugun: [[0.15, "toplanma"], [0.7, "konvoy"], [1, "halay"]],
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
    // --- ajan A ---
    dalga: [[0.15, "yukselme"], [0.85, "dovme"], [1, "durulma"]],
    // --- ajan A sonu ---
  }[o.tur] ?? [[1, "olay"]];
  const [, ad] = E.find(([s]) => u <= s) ?? E[E.length - 1];
  return { ad, u, t: minute - o.bas };
}
