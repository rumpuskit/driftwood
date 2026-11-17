// Şehir hatları vapuru: 06:00-23:00 arası 20 dakikada bir sefer. Her döngüde vapur iskelede 8 dakika
// yolcu alır, kalkar (3 dk açılır), görünmez olur ve döngünün son 3 dakikasında yeni sefer yanaşır.
// Hem vapurun hareketi hem yolcuların bekleme/iniş saatleri buradan gelir (aynı anda herkes aynı şeyi görür).
export const FERRY = { period: 20, depart: 8, first: 360, last: 1380 };

// Vapur arızası (olay "vapur", 17 Kasım akşamı; görünüm olay-vapur.js): A varışlı sefer iskelenin açığında durur, römorkör
// çekip bir sonraki seferin varış anında (A2 = A + 20) yanaştırır; arada iskeleden kalkış yoktur, sonra düzen olağan.
// Zamanlar olayın başından (bas = A − 3, vapurun ufukta belirdiği an) dakika. Olay planı bas'ı bu ızgaraya hizalar
// (olay-plan.js TURLER.vapur.izgara), video (gunluk.mjs) ve site aynı gecikmeyi kurar (vapurGecikmesi).
export const VAPUR_OLAY = { ariza: 1.5, romorkor: 3, baglama: 14, cekSon: 20, yanSon: 23, gecikme: 20, uDur: 0.6, uCek: 0.22 };
let GEC = null; // { A, A2 } (bugünün arızalı seferi) ya da null

/** Olay planından gecikme (bas = A − 3); vapur olayı değilse null. */
export function vapurOlayGecikme(o) {
  return o && o.tur === "vapur" ? { A: o.bas + 3, A2: o.bas + 3 + VAPUR_OLAY.gecikme } : null;
}
/** Bugünün gecikmesini kurar (olay-vapur.js gün başında; video betiği planından). null: gecikme yok. */
export function vapurGecikmesi(g) { GEC = g; }

/** Dakika m'den sonraki (m dahil) ilk kalkış. */
export function nextDeparture(m) {
  const { period, depart, first } = FERRY;
  const t = Math.max(m, first);
  const k = Math.ceil((t - first - depart) / period);
  const d = first + depart + Math.max(0, k) * period;
  return GEC && d === GEC.A + depart ? GEC.A2 + depart : d; // arızalı seferin kalkışı yok: yolcular bir sonrakine biner
}

/** Dakika m'den sonraki (m dahil) ilk varış (yolcuların indiği an). */
export function nextArrival(m) {
  const { period, first } = FERRY;
  const t = Math.max(m, first);
  const a = first + Math.ceil((t - first) / period) * period;
  return GEC && a === GEC.A ? GEC.A2 : a;
}

/** Arıza olayında vapurun iskeleden uzaklığı (ferryOut ile aynı ölçek): yaklaşır, durur, çekilir, itilip yanaşır. */
function olayOut(m) {
  const V = VAPUR_OLAY, t = m - (GEC.A - 3), s = (x) => x * x * (3 - 2 * x), c = (x) => Math.max(0, Math.min(1, x));
  if (t < V.ariza) return 1 - (1 - V.uDur) * (1 - (1 - t / V.ariza) ** 2);
  if (t < V.baglama) return V.uDur;
  if (t < V.cekSon) return V.uDur - (V.uDur - V.uCek) * s(c((t - V.baglama) / (V.cekSon - V.baglama)));
  if (t < V.cekSon + 1) return V.uCek;
  return V.uCek * (1 - s(c((t - V.cekSon - 1) / (V.yanSon - V.cekSon - 1))));
}

/** Vapurun iskeleden uzaklığı 0 (yanaşmış) .. 1 (açıkta, görünmez). */
export function ferryOut(m) {
  const { period, depart, first, last } = FERRY;
  if (GEC && m >= GEC.A - 3 && m < GEC.A2) return olayOut(m);
  if (m < first || m > last + period) return 0;
  const u = (((m - first) % period) + period) % period;
  const s = (x) => x * x * (3 - 2 * x);
  if (u < depart) return 0;
  if (u < depart + 3) return s((u - depart) / 3);
  if (u < period - 3) return 1;
  return 1 - s((u - (period - 3)) / 3);
}
