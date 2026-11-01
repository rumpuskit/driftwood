// Görünen biçimler (Amerikan İngilizcesi): 12 saatlik saat, "Oct 31" tarih, Pazartesi'den başlayan gün adları,
// binlik ayraçlı sayılar, imperial birimler. Arayüzde elle biçimlendirme yerine bunlar kullanılır; iç birimler
// (dakika, gün numarası, metre, m/s) değişmez.

/** Pazartesi'den başlar (sim.weekday: 0 = Pazartesi). */
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const NUM = new Intl.NumberFormat("en-US");
/** 3000 → "3,000". */
export const num = (n) => NUM.format(n);

/** Günün dakikası → "9:30 PM" (24:00 ve sonrası ertesi güne sarar). */
export function clockText(minute) {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Gün numarası (1970'ten beri, sim.dayOf) → "Oct 31". */
export function dateText(day) {
  const d = new Date(day * 86400000);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Gün numarası → "Sunday, November 1, 2026". */
export function longDateText(day) {
  const d = new Date(day * 86400000);
  return `${DAYS[(d.getUTCDay() + 6) % 7]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Metre → "203 ft". */
export const feet = (m) => `${num(Math.round(m * 3.28084))} ft`;
/** m/s → "12 mph". */
export const mph = (ms) => `${num(Math.round(ms * 2.23694))} mph`;

/** "1 resident", "3 residents". */
export const plural = (n, one, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;

/** 1 → "1st", 22 → "22nd", 113 → "113th". */
export function ordinal(n) {
  const t = n % 100, s = t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${num(n)}${s}`;
}
