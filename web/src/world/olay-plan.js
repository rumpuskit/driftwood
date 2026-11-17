// Günün olayı (16 Kasım 2026, kullanıcı: "yaşayan bir şehir … doğal olaylar, kazalar, önemli anlar, dikkat çekici olaylar
// gibi kurgular olsun"). Saf modül (three yok): site (olay.js) ve video betiği (video/gunluk.mjs) aynı planı hesaplar.
//
// Her gün (özel günler hariç) adada BİR olay olur; tür, saat ve tohum yalnız güne ve adada neyin açık olduğuna bağlıdır
// (deterministik): video kaydı günün herhangi bir dakikasını yeniden çizebilir, sitedeki ziyaretçi de aynı olayı görür.
// Olaylar zararsız kurgudur: kimse yaralanmaz, gerçek bir sakin suçlanmaz ya da kazaya karıştırılmaz (sakinler yalnız
// seyirci, itfaiyeci/polis/doktor olarak görev başında ya da tanık olarak görünür).
//
// Tür tablosu: saat penceresi [en erken başlangıç, en geç başlangıç] (yerel dakika), süre (dk), gerek (isOpen ile).
// Adaya özgü ayarlar (türler, saat pencereleri, özel günler) olay-ayar.js'te; bu dosya iki adada aynıdır.
import * as AYAR from "./olay-ayar.js";
import { ADA_TURLERI, PENCERE, ozelGun } from "./olay-ayar.js";
export { ADA_TURLERI, ozelGun };

// Tür tablosu: pencere [en erken, en geç başlangıç] (yerel dakika; olay-ayar.js PENCERE ezer), süre (dk), gerek (isOpen).
const TURLER = {
  firtina: { ad: "Fırtına", en: "Storm", pencere: [510, 640], sure: [85, 110], gerek: () => true },
  sis: { ad: "Sis", en: "Fog", pencere: [370, 420], sure: [230, 280], gerek: () => true },
  yangin: { ad: "Yangın", en: "Fire", pencere: [540, 700], sure: [55, 65], gerek: (open) => open("itfaiye") },
  kaza: { ad: "Trafik kazası", en: "Car crash", pencere: [510, 720], sure: [40, 48], gerek: (open) => open("cevre_yolu") && open("karakol:0") },
  yunus: { ad: "Yunuslar", en: "Dolphins", pencere: [540, 730], sure: [32, 40], gerek: () => true },
  balina: { ad: "Balina", en: "Whale", pencere: [540, 730], sure: [32, 40], gerek: () => true },
};
export const OLAYLAR = Object.fromEntries(Object.entries(TURLER).map(([k, v]) => [k, { ...v, pencere: PENCERE[k] ?? v.pencere }]));

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
 *   ozel: (day) => özel gün mü (anma vb.; o gün olay yok), zorla: "yangin" (deneme: türü zorla), saat: dakika (deneme) }
 * Dönüş: { tur, ad, en, bas, son, tohum, day } ya da null.
 */
export function olayGunu(day, open, o = {}) {
  if ((o.ozel ?? ozelGun)(day) && !o.zorla) return null;
  const turler = (o.turler ?? ADA_TURLERI).filter((t) => OLAYLAR[t] && OLAYLAR[t].gerek(open));
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
    tur = sira(Math.floor(day / n))[((day % n) + n) % n];
  }
  const T = OLAYLAR[tur];
  const bas = o.saat ?? Math.round(T.pencere[0] + kesir("olaySaat", day, tur) * (T.pencere[1] - T.pencere[0]));
  const sure = Math.round(T.sure[0] + kesir("olaySure", day, tur) * (T.sure[1] - T.sure[0]));
  // Yaz saati (17 Kasım QC): Avrupa yaz saatinde öğle üretimi ada saatiyle bir saat erken başlar (Mercanada: 11:30 Berlin
  // = 12:30 TR). Olay ayardaki YAZ_SON'dan (yerel dakika) önce bitecek kadar erkene alınır; kış günleri değişmez.
  let b0 = bas;
  if (AYAR.YAZ_SON && o.saat == null && avrupaYazi(day) && b0 + sure > AYAR.YAZ_SON) b0 = AYAR.YAZ_SON - sure;
  return { tur, ad: T.ad, en: T.en, bas: b0, son: b0 + sure, tohum: karma("olay", day, tur), day };
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
  const sonra = { firtina: 20, yangin: 24 * 60, kaza: 0, sis: 0, yunus: 0, balina: 0 }[o.tur] ?? 0;
  if (minute < o.bas || minute > o.son + sonra) return null;
  if (minute > o.son) return { ad: "sonra", u: (minute - o.son) / Math.max(1, sonra), t: minute - o.bas };
  const E = {
    firtina: [[0.16, "yaklasma"], [0.84, "yagmur"], [1, "dinme"]],
    sis: [[0.18, "gelis"], [0.78, "yogun"], [1, "dagilma"]],
    yangin: [[0.07, "duman"], [0.17, "alarm"], [0.6, "sondurme"], [1, "tutuyor"]],
    kaza: [[0.14, "kaza"], [0.42, "polis"], [1, "cekici"]],
    yunus: [[0.15, "gorundu"], [0.85, "oyun"], [1, "uzaklasma"]],
    balina: [[0.15, "gorundu"], [0.85, "oyun"], [1, "uzaklasma"]],
  }[o.tur];
  const [, ad] = E.find(([s]) => u <= s) ?? E[E.length - 1];
  return { ad, u, t: minute - o.bas };
}
