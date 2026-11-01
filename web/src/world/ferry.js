// Şehir hatları vapuru: 06:00-23:00 arası 20 dakikada bir sefer. Her döngüde vapur iskelede 8 dakika
// yolcu alır, kalkar (3 dk açılır), görünmez olur ve döngünün son 3 dakikasında yeni sefer yanaşır.
// Hem vapurun hareketi hem yolcuların bekleme/iniş saatleri buradan gelir (aynı anda herkes aynı şeyi görür).
export const FERRY = { period: 20, depart: 8, first: 360, last: 1380 };

/** Dakika m'den sonraki (m dahil) ilk kalkış. */
export function nextDeparture(m) {
  const { period, depart, first } = FERRY;
  const t = Math.max(m, first);
  const k = Math.ceil((t - first - depart) / period);
  return first + depart + Math.max(0, k) * period;
}

/** Dakika m'den sonraki (m dahil) ilk varış (yolcuların indiği an). */
export function nextArrival(m) {
  const { period, first } = FERRY;
  const t = Math.max(m, first);
  return first + Math.ceil((t - first) / period) * period;
}

/** Vapurun iskeleden uzaklığı 0 (yanaşmış) .. 1 (açıkta, görünmez). */
export function ferryOut(m) {
  const { period, depart, first, last } = FERRY;
  if (m < first || m > last + period) return 0;
  const u = (((m - first) % period) + period) % period;
  const s = (x) => x * x * (3 - 2 * x);
  if (u < depart) return 0;
  if (u < depart + 3) return s((u - depart) / 3);
  if (u < period - 3) return 1;
  return 1 - s((u - (period - 3)) / 3);
}
