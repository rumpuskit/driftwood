// Driftwood'un olay ayarları (olay-plan.js okur; Mercanada'da kendi dosyası).
// Öğle videosu 18:30 Berlin = 12:30 ET; üretim 11:30 ET'de başlar: olay ondan önce (en geç ~11:20 ET) biter.
// Ada küçük (araç yolu, itfaiye yok): şimdilik doğa olayları; kaza/yangın açılınca kendiliğinden listeye girer.
export const ADA_TURLERI = ["firtina", "balina", "sis", "kaza", "yangin"];
/** Başlangıç pencereleri [en erken, en geç] (ET dakikası). */
export const PENCERE = { firtina: [450, 560], sis: [330, 380], balina: [480, 630], kaza: [480, 600], yangin: [480, 610], zeplin: [480, 600], balon: [450, 600], ucurtma: [540, 620], kus: [480, 620], moose: [480, 630] };
export const PENCERE = { firtina: [450, 560], sis: [330, 380], balina: [480, 630], kaza: [480, 600], yangin: [480, 610], zeplin: [480, 600] };
// --- ajan B --- liman/tekne olayları, sabah pencereleri (SABAH_SON 11:20'den önce biter).
Object.assign(PENCERE, { vapur: [480, 650], balik: [480, 630], tekne_yarisi: [480, 640] });
/** Sabah olayının en geç bitişi (ET dk): öğle üretimi 11:30 ET başlar; 11:20. */
export const SABAH_SON = 680;
/** Özel günler (olay yok): 4 Temmuz. */
export function ozelGun(day) {
  const d = new Date(day * 86400000);
  return d.getUTCMonth() === 6 && d.getUTCDate() === 4;
}
/** Öğleden sonra olayı (17 Kasım akşamı, kullanıcı: "ikinci videolar da olay videosu olacak"): akşam videosu (23:30 Berlin
 *  = 17:30 ET, üretim 16:30 ET) anlatır. Sis yok; tür sabahkinden farklı. Yunuslar yalnız öğleden sonra (sabah listesinde
 *  yok: balinayla aynı gün iki deniz olayı olabilir ama tür farklı). Pencereler ET dakikası; kışın gün batımı ~16:20 ET:
 *  deniz olayları gün ışığında. son: en geç bitiş 15:50 ET (fırtınanın 20 dk gökkuşağı dahil üretimden ≥20 dk önce);
 *  ABD ile Avrupa yaz saati çoğunlukla birlikte değiştiği için yazSon aynı. */
export const IKINCI = {
  turler: ["firtina", "balina", "yunus", "kaza", "yangin"],
  pencere: { firtina: [720, 800], balina: [750, 860], yunus: [750, 870], kaza: [750, 880], yangin: [750, 870], zeplin: [720, 840], balon: [720, 840], ucurtma: [720, 860], kus: [720, 860], moose: [720, 870] },
  varsayilan: [740, 860], // penceresi yazılmamış tür (gün ışığında başlar)
  son: 950,
  yazSon: 950,
};
// --- ajan B --- öğleden sonra pencereleri (gün ışığında biter; yarışta tekneler başlangıçtan 37 dk sonra açığa gider).
Object.assign(IKINCI.pencere, { vapur: [740, 900], balik: [740, 880], tekne_yarisi: [740, 890] });
/** Olay modüllerinin dili ve adları (olay-zeplin.js). Driftwood'un zeplini 150. sakinde açılır; o zamana dek inen
 *  zeplin adanın üstünden geçen yabancı bir zeplindir. */
export const DIL = "en";
export const ZEPLIN = {
  kendi: { ad: "the Driftwood Blimp" },
  ziyaretci: { ad: "an ad blimp" },
  saha: { ad: "the ball field" },
  yedekSaha: { ad: "the Town Green" },
};
/** Tür listesi sürümleri (olay-plan.js): yeni türler yalnız sürümün gününden itibaren takvime girer; önceki günler değişmez. */
export const TUR_SURUMLERI = [
  // 19 Kasım: zeplin acil inişi (olay-zeplin.js; Driftwood'da zeplin açılana dek adanın üstünden geçen reklam zeplini).
  { gun: "2026-11-19", sabah: [...ADA_TURLERI, "zeplin"], ikinci: [...IKINCI.turler, "zeplin"] },
];
// --- ajan D --- (olay-balon.js, olay-ucurtma.js, olay-kus.js, olay-moose.js)
/** Island-specific event names (olay-plan.js OLAYLAR: [tr, en]). */
export const ADLAR = { kus: ["Kel kartal", "Bald eagle"] };
/** Bird event (olay-kus.js): a bald eagle circles the bay, dives for a fish, perches in a shore tree; own phases. */
export const KUS = { tur: "kartal", evre: [[0.14, "gorundu"], [0.3, "dalis"], [0.86, "agacta"], [1, "uzaklasma"]] };
/** Kite festival (olay-ucurtma.js): on the Town Green. */
export const UCURTMA = { yer: "cimen", ad: "the Town Green" };
// --- ajan D sonu ---
