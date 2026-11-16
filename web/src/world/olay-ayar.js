// Driftwood'un olay ayarları (olay-plan.js okur; Mercanada'da kendi dosyası).
// Öğle videosu 18:30 Berlin = 12:30 ET; üretim 11:30 ET'de başlar: olay ondan önce (en geç ~11:20 ET) biter.
// Ada küçük (araç yolu, itfaiye yok): şimdilik doğa olayları; kaza/yangın açılınca kendiliğinden listeye girer.
export const ADA_TURLERI = ["firtina", "balina", "sis", "kaza", "yangin"];
/** Başlangıç pencereleri [en erken, en geç] (ET dakikası). */
export const PENCERE = { firtina: [450, 560], sis: [330, 380], balina: [480, 630], kaza: [480, 600], yangin: [480, 610] };
/** Özel günler (olay yok): 4 Temmuz. */
export function ozelGun(day) {
  const d = new Date(day * 86400000);
  return d.getUTCMonth() === 6 && d.getUTCDate() === 4;
}
