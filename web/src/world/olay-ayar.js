// Driftwood'un olay ayarları (olay-plan.js okur; Mercanada'da kendi dosyası).
// Öğle videosu 18:30 Berlin = 12:30 ET; üretim 11:30 ET'de başlar: olay ondan önce (en geç ~11:20 ET) biter.
// Ada küçük (araç yolu, itfaiye yok): şimdilik doğa olayları; kaza/yangın açılınca kendiliğinden listeye girer.
export const ADA_TURLERI = ["firtina", "balina", "sis", "kaza", "yangin"];
/** Başlangıç pencereleri [en erken, en geç] (ET dakikası). */
export const PENCERE = { firtina: [450, 560], sis: [330, 380], balina: [480, 630], kaza: [480, 600], yangin: [480, 610], zeplin: [480, 600] };
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
  pencere: { firtina: [720, 800], balina: [750, 860], yunus: [750, 870], kaza: [750, 880], yangin: [750, 870], zeplin: [720, 840] },
  varsayilan: [740, 860], // penceresi yazılmamış tür (gün ışığında başlar)
  son: 950,
  yazSon: 950,
};
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
// --- ajan A (deniz ve kıyı olayları: olay-fok.js, olay-kopekbaligi.js, olay-hortum.js, olay-dalga.js) ---
/** Adaya özgü olay adları ({ tur: [ad, en] }). */
export const ADLAR = { fok: ["Liman fokları", "Harbor seals"], kopekbaligi: ["Köpekbalığı", "Shark sighting"], hortum: ["Su hortumu", "Waterspout"], dalga: ["Dev dalgalar", "Big waves"] };
/** Fok: bir grup liman foku (benekli, küçük). */
export const FOK = { tur: "liman", sayi: 5 };
/** Su hortumu: kıyıdan uzaklık (m) ve bulut tabanı yüksekliği (m). */
export const HORTUM = { uzak: 480, H: 320 };
/** Pencereler (ET dk; takvime alınınca geçerli): sabah olayları SABAH_SON'dan (11:20) önce, öğleden sonrakiler 15:50'den
 *  (gün batımı ~16:20) önce biter. fok/köpekbalığı/dalga 40–55 dk, hortum 25–35 dk. */
Object.assign(PENCERE, { fok: [480, 610], kopekbaligi: [480, 610], hortum: [480, 630], dalga: [470, 610] });
Object.assign(IKINCI.pencere, { fok: [740, 860], kopekbaligi: [740, 860], hortum: [740, 880], dalga: [740, 860] });
// --- ajan A sonu ---
