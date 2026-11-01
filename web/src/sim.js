// Driftwood simülasyonu: bir sakinin hayatı tohumdan (seed) ve günden hesaplanır; sunucuda kimsenin
// hayatı tutulmaz. server/driftwood_sim/sim.py ile bit bit aynı sonucu vermeli; kural değişirse ikisi
// birlikte değişir ve parite testi çalıştırılır (cd server && python3 -m unittest -v).
//
// Sakin nesnesi: {handle, seed, slot, arrived_day, overrides?}. overrides yorumdan gelen isteklerdir
// (ör. {meslek: "balikci", evcil: "Kedi"}).

let catalog = null;
let town = Infinity; // adanın gelişim düzeyi (en yüksek nüfus); varsayılan: her şey açık
let stageCache = null;
let branchCache = new Map();

/** Katalog dışarıdan verilir: tarayıcı JSON'u paketler, Node testi dosyadan okur. */
export function setCatalog(data) {
  catalog = data;
  stageCache = null;
  branchCache = new Map();
}

// --- gelişim: ada nüfusla parça parça açılır ---
//
// Katalogdaki "gelisim" tablosu hangi yerin kaçıncı sakinde açıldığını söyler (iş yerleri "tür:sıra",
// ör. "firin:0"; diğerleri yalnızca haritayı ilgilendirir). Tabloda olmayan anahtar baştan açıktır.
// Mahalle yerleri (cami, çay bahçesi...) ilk mahallede tablodan, sonrakilerde mahallenin dolmaya
// başladığı sayıdan aynı aralıkla açılır. Kilitli iş yerinin çalışanı o yer açılana kadar anakarada
// çalışır (vapurla gider gelir); açılınca asıl mesleğine geçer.

export function setTown(level) {
  town = level;
  branchCache = new Map();
}

export function townLevel() {
  return town;
}

function perMahalle() {
  return cap("daire_per_bina") * cap("bina_per_sokak") * cap("sokak_per_mahalle");
}

/** Anahtarın açıldığı nüfus (0: baştan açık). */
export function stageOf(key) {
  if (!stageCache) {
    stageCache = new Map();
    for (const st of catalog.gelisim ?? []) for (const k of st.acar) stageCache.set(k, st.nufus);
  }
  const hit = stageCache.get(key);
  if (hit !== undefined) return hit;
  const m = /^([a-z_]+):(\d+)$/.exec(key);
  if (m) {
    const n = Number(m[2]);
    if (m[1] === "carsi" && catalog.gelisim_dukkan) return catalog.gelisim_dukkan.ilk + n * catalog.gelisim_dukkan.aralik;
    const first = stageCache.get(m[1] + ":0");
    if (n > 0 && first !== undefined && (catalog.gelisim_mahalle ?? []).includes(m[1])) return n * perMahalle() + first;
  }
  return 0;
}

export function isOpen(key) {
  return town >= stageOf(key);
}

/** Bir iş yeri türünün açık şubeleri (sıra numaraları). */
function openBranches(kind) {
  let list = branchCache.get(kind);
  if (!list) {
    list = [];
    catalog.isyerleri[kind].forEach((_, i) => { if (isOpen(`${kind}:${i}`)) list.push(i); });
    branchCache.set(kind, list);
  }
  return list;
}

export function cat() {
  return catalog;
}

export function cap(key) {
  return catalog.kapasite[key];
}

// --- hash ---

export function mul32(a, b) {
  return Math.imul(a, b) >>> 0;
}

const encoder = new TextEncoder();
const fnvCache = new Map();

export function fnv1a(text) {
  let h = fnvCache.get(text);
  if (h !== undefined) return h;
  h = 0x811c9dc5;
  for (const byte of encoder.encode(text)) h = mul32((h ^ byte) >>> 0, 0x01000193);
  if (fnvCache.size < 4096) fnvCache.set(text, h);
  return h;
}

/** lowbias32 karıştırıcı (Chris Wellons). */
export function mix(x) {
  x = (x ^ (x >>> 16)) >>> 0;
  x = mul32(x, 0x7feb352d);
  x = (x ^ (x >>> 15)) >>> 0;
  x = mul32(x, 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function combine(a, b) {
  return mix((a ^ mul32(b >>> 0, 0x9e3779b1)) >>> 0);
}

/** Bir sakinin belirli bir konudaki (tag) ve isteğe bağlı gündeki (n) zar atışı. */
export function roll(seed, tag, n = 0) {
  return combine(combine(seed, fnv1a(tag)), n);
}

export function normalizeHandle(handle) {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export function seedOf(handle) {
  return fnv1a(normalizeHandle(handle));
}

// --- saat ve takvim: ada ABD Doğu saatiyle yaşar (America/New_York, yaz saatli) ---
//
// Kural açıkça burada (tz kütüphanesine güvenilmez; sim.py aynısını hesaplar): yaz saati (EDT, UTC−4) Mart'ın
// 2. pazarı 02:00 EST'de (= 07:00 UTC) başlar, Kasım'ın 1. pazarı 02:00 EDT'de (= 06:00 UTC) biter; diğer
// zamanlar EST (UTC−5). Geçiş günleri 23 ya da 25 saattir: yerel dakika ileri atlar ya da bir saat geri döner.
// Gün numarası yerel takvim günüdür (1970-01-01'den beri).

const H = 3600;

/** Yıl, ay (1-12), gün → 1970'ten beri gün (proleptik Gregoryen; Howard Hinnant, days_from_civil). */
export function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 1970'ten beri gün → [yıl, ay (1-12), gün] (civil_from_days). */
export function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [era * 400 + yoe + (m <= 2 ? 1 : 0), m, d];
}

/** 0 = Pazartesi ... 6 = Pazar (1 Ocak 1970 Perşembe). */
export function weekday(day) {
  return (((day + 3) % 7) + 7) % 7;
}

/** Ayın n. haftanın-günü (wd: 0 = Pazartesi); n = -1 ayın sonuncusu. Gün numarası döner. */
export function nthWeekday(y, m, wd, n) {
  if (n < 0) {
    const last = daysFromCivil(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1;
    return last - ((weekday(last) - wd + 7) % 7);
  }
  const first = daysFromCivil(y, m, 1);
  return first + ((wd - weekday(first) + 7) % 7) + 7 * (n - 1);
}

/** Yerel saatin UTC'den farkı (saniye): yaz saatinde −4 sa, değilse −5 sa. */
export function tzOffset(unix) {
  const y = civilFromDays(Math.floor((unix - 5 * H) / 86400))[0];
  const start = nthWeekday(y, 3, 6, 2) * 86400 + 7 * H;
  const end = nthWeekday(y, 11, 6, 1) * 86400 + 6 * H;
  return unix >= start && unix < end ? -4 * H : -5 * H;
}

export function dayOf(unix) {
  return Math.floor((unix + tzOffset(unix)) / 86400);
}

/** Yerel saat (dakika, kesirli). */
export function minuteOf(unix) {
  const s = (unix + tzOffset(unix)) % 86400;
  return (s < 0 ? s + 86400 : s) / 60;
}

/** Yerel gün + dakika → unix. Geri dönüşte iki kez yaşanan saat ilkini (EDT), ileri atlamada yaşanmayan saat
 * bir saat sonrasını verir. */
export function unixOf(day, minute) {
  const local = day * 86400 + minute * 60;
  return tzOffset(local + 4 * H) === -4 * H ? local + 4 * H : local + 5 * H;
}

export function formatMinute(minute) {
  const m = Math.floor(minute);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// --- adres: sıra numarasından (slot) ada → mahalle → sokak → bina → daire ---

export function addressParts(slot) {
  const perBina = cap("daire_per_bina");
  const perSokak = perBina * cap("bina_per_sokak");
  const perMahalle = perSokak * cap("sokak_per_mahalle");
  const mahalle = Math.floor(slot / perMahalle);
  const inMahalle = slot % perMahalle;
  return {
    ada: Math.floor(mahalle / cap("mahalle_per_ada")),
    mahalle,
    sokak: Math.floor(inMahalle / perSokak),
    bina: Math.floor((inMahalle % perSokak) / perBina),
    daire: inMahalle % perBina,
  };
}

export function adaName(ada) {
  const names = catalog.adalar;
  const name = names[ada % names.length];
  return ada < names.length ? name : `${name} ${Math.floor(ada / names.length) + 1}`;
}

export function mahalleName(mahalle) {
  const names = catalog.mahalleler;
  let name = names[mahalle % names.length];
  if (mahalle >= names.length) name += ` ${Math.floor(mahalle / names.length) + 1}`;
  return name + " Mahallesi";
}

export function sokakName(mahalle, sokak) {
  const names = catalog.sokaklar;
  return names[(sokak + mahalle * 7) % names.length] + " Sokağı";
}

export function addressText(slot) {
  const p = addressParts(slot);
  return `${sokakName(p.mahalle, p.sokak)} No ${p.bina + 1}, Daire ${p.daire + 1}, ` +
    `${mahalleName(p.mahalle)}, ${adaName(p.ada)}`;
}

// --- sakin ---

export const PLACE_HOME = "ev";
export const PLACE_WORK = "is";
const OUTING_LATEST_HOBBY = 1200; // 20:00
const OUTING_LATEST_MEYDAN = 1290; // 21:30

function pickWeighted(items, r) {
  const total = items.reduce((sum, item) => sum + item.agirlik, 0);
  let x = r % total;
  for (let i = 0; i < items.length; i++) {
    x -= items[i].agirlik;
    if (x < 0) return i;
  }
  return items.length - 1;
}

function find(items, id) {
  return items.findIndex((item) => item.id === id);
}

function override(r, key) {
  return String(r.overrides?.[key] ?? "");
}

/** Sakinin asıl mesleği (iş yeri henüz açılmamış olabilir). */
export function dreamJob(r) {
  const jobs = catalog.meslekler;
  let i = find(jobs, override(r, "meslek"));
  // Kadrolu işler (fener bekçisi, cankurtaran): geliş sırasına göre sabit kontenjan, nüfusla orantılı.
  if (i < 0) i = jobs.findIndex((j) => j.kadro && (r.slot ?? -1) % j.kadro.her === j.kadro.sira);
  if (i < 0) i = pickWeighted(jobs, roll(r.seed, "meslek"));
  return jobs[i];
}

/** Bugünkü mesleği: asıl mesleğinin iş yeri adada henüz yoksa anakarada çalışır. */
export function job(r) {
  const j = dreamJob(r);
  if (openBranches(j.yer).length) return j;
  return catalog.meslekler[find(catalog.meslekler, catalog.kilitli_meslek)];
}

export function workplace(r) {
  const j = job(r);
  const kind = j.yer;
  const names = catalog.isyerleri[kind];
  // Yerel işler (muhtar): kendi mahallesinin şubesi; şubesi belli meslekler (seramikçi seramik atölyesinde)
  // o şubelerden birinde; diğerleri kişiye göre bir şube.
  const own = j.subeler;
  let index = j.yerel ? addressParts(r.slot).mahalle % names.length
    : own ? own[roll(r.seed, "isyeri") % own.length] : roll(r.seed, "isyeri") % names.length;
  if (!isOpen(`${kind}:${index}`)) {
    // Kendi şubesi açılana kadar açık olanlardan birinde (varsa kendi şubelerinden) çalışır.
    const open = openBranches(kind);
    const mine = own ? open.filter((i) => own.includes(i)) : [];
    const pool = mine.length ? mine : open;
    index = pool[roll(r.seed, "isyeri") % pool.length];
  }
  return { kind, index, name: names[index] };
}

export function tenure(r, day) {
  return Math.max(0, day - r.arrived_day);
}

/** Terfiler kıdemle gelir; herkes aynı gün terfi almasın diye 0-6 gün kaydırılır. */
export function rank(r, day) {
  const shift = roll(r.seed, "terfi") % 7;
  const t = tenure(r, day);
  return catalog.terfi_gunleri.filter((threshold) => t >= threshold + shift).length;
}

export function title(r, day) {
  const ladder = job(r).kademeler;
  return ladder[Math.min(rank(r, day), ladder.length - 1)];
}

export function hobby(r) {
  const hobbies = catalog.hobiler;
  let i = find(hobbies, override(r, "hobi"));
  if (i < 0) i = roll(r.seed, "hobi") % hobbies.length;
  return hobbies[i];
}

/** Evcil hayvan yoksa "" döner. Sahiplenme gelişten 5-29 gün sonra olur. */
export function pet(r, day) {
  const requested = override(r, "evcil");
  if (requested !== "") return requested;
  if (roll(r.seed, "evcil") % 100 >= catalog.evcil_orani) return "";
  if (tenure(r, day) < 5 + (roll(r.seed, "evcil_gun") % 25)) return "";
  const pets = catalog.evcil_hayvanlar;
  return pets[roll(r.seed, "evcil_tur") % pets.length];
}

/** Görünüş cinsiyetten bağımsız; her parça katalogdaki seçenek sayısı içinde bir indeks. */
export function look(r) {
  const result = {};
  for (const [key, n] of Object.entries(catalog.gorunus)) result[key] = roll(r.seed, "gorunus_" + key) % n;
  result.boy = 92 + (roll(r.seed, "boy") % 17);
  return result;
}

/** Sakinin vardiyası: meslekte birden çok vardiya varsa kişiye göre biri (aynı kişi hep aynı vardiyada). */
export function shiftOf(r) {
  const v = job(r).vardiya;
  return Array.isArray(v) ? v[roll(r.seed, "vardiya") % v.length] : v;
}

// ABD tatilleri (federal; okullar kapalı). O gün yalnız hafta sonu da açık olan işler (diner, kafe, otel, sağlık,
// fırın, market, liman...) çalışır. Sabit tarihli olan cumartesiye denk gelirse cuma, pazara denk gelirse pazartesi
// tatil yapılır (observed). Değişken tarihliler "ayın n. haftanın-günü" kuralıyla; sim.py ile aynı hesap.
const FIXED_HOLIDAYS = { "1-1": "new_year", "6-19": "juneteenth", "7-4": "independence", "11-11": "veterans", "12-25": "christmas" };

function fixedHoliday(day) {
  const [, m, d] = civilFromDays(day);
  return FIXED_HOLIDAYS[`${m}-${d}`] ?? "";
}

/** O günün tatili ("" değilse kimliği: new_year, mlk, presidents, memorial, juneteenth, independence, labor,
 * veterans, thanksgiving, black_friday, christmas). Gözlenen (observed) gün de aynı kimliği verir. */
export function holidayOf(day) {
  const fixed = fixedHoliday(day);
  if (fixed) return fixed;
  const wd = weekday(day);
  if (wd === 4 && fixedHoliday(day + 1)) return fixedHoliday(day + 1);
  if (wd === 0 && fixedHoliday(day - 1)) return fixedHoliday(day - 1);
  const [y, m] = civilFromDays(day);
  if (m === 1 && day === nthWeekday(y, 1, 0, 3)) return "mlk";
  if (m === 2 && day === nthWeekday(y, 2, 0, 3)) return "presidents";
  if (m === 5 && day === nthWeekday(y, 5, 0, -1)) return "memorial";
  if (m === 9 && day === nthWeekday(y, 9, 0, 1)) return "labor";
  if (m === 11) {
    const tg = nthWeekday(y, 11, 3, 4);
    if (day === tg) return "thanksgiving";
    if (day === tg + 1) return "black_friday";
  }
  return "";
}

export function isHoliday(day) {
  return holidayOf(day) !== "";
}

export function worksOn(r, day) {
  if (job(r).calismaz) return false; // emekli
  if (!job(r).hafta_sonu && isHoliday(day)) return false;
  const wd = weekday(day);
  let works;
  if (!job(r).hafta_sonu) works = wd < 5;
  else {
    // Hafta sonu da açık iş yerlerinde çalışanların haftada iki izin günü var.
    const off = roll(r.seed, "izin") % 7;
    works = wd !== off && wd !== (off + 3) % 7;
  }
  // Yarı zamanlı çalışanlar (yaklaşık üçte biri) haftada iki gün daha evde ya da dışarıda.
  if (works && roll(r.seed, "yarim") % 100 < 30) {
    const p = roll(r.seed, "yarim_gun") % 5;
    if (wd === p || wd === (p + 2) % 5) works = false;
  }
  return works;
}

function end(plan) {
  return plan.length === 0 ? 0 : plan[plan.length - 1].son;
}

function add(plan, until, ne, yer) {
  const start = end(plan);
  if (until > start) plan.push({ bas: start, son: until, ne, yer });
}

function travel(plan, commute, from, to) {
  const start = end(plan);
  plan.push({ bas: start, son: start + commute, ne: "yol", nereden: from, nereye: to });
}

/** İş çıkışı: %40 hobi, %25 meydan, gerisi doğrudan ev (""). */
function eveningPlace(s, day, hobbyPlace) {
  const x = roll(s, "aksam", day) % 100;
  if (x < 25) return hobbyPlace;
  if (x < 55) return "meydan";
  return "";
}

function activityOf(place) {
  return place.startsWith("hobi:") ? "hobi" : place;
}

/** Akşam yemeğinden sonra bir kısmı yeniden çıkar (çarşı ya da mahalle çay bahçesi). */
function nightOut(plan, s, day, commute, sleep) {
  if (roll(s, "gece", day) % 100 >= 35) return;
  const start = Math.max(end(plan) + 45, 1230 + (roll(s, "gece_saat", day) % 60));
  const duration = 60 + (roll(s, "gece_sure", day) % 60);
  if (start + duration + commute > sleep - 10) return;
  add(plan, start - commute, "ev", PLACE_HOME);
  travel(plan, commute, PLACE_HOME, "meydan");
  add(plan, end(plan) + duration, "meydan", "meydan");
  travel(plan, commute, "meydan", PLACE_HOME);
}

/**
 * Cuma ve Cumartesi geceleri (ve tatil arifelerinde) bazıları gece yarısından sonra da dışarıdadır:
 * meydanda kalır, 00:30-01:30 arasında eve döner. Gece vardiyası olanlar ve ertesi sabah erken işe
 * gidenler bu gruba girmez.
 */
function lateNight(r, day) {
  const wd = weekday(day);
  if (!(wd === 4 || wd === 5 || isHoliday(day + 1))) return false;
  if (roll(r.seed, "gece_gec", day) % 100 >= 5) return false;
  if (worksOn(r, day) && shiftOf(r) === "gece") return false;
  if (worksOn(r, day + 1) && ["erken", "sabah", "gece"].includes(shiftOf(r))) return false;
  return true;
}

/** Gece geç saate kalanlar: evdeyse yeniden meydana çıkar; dışarıdan yeni döndüyse orada kalır. */
function goLate(plan, s, day, commute) {
  const e = end(plan);
  if (e + commute + 15 <= 1440) {
    // Evde en az 10 dakika kalır (iki yolculuk arka arkaya gelmez).
    const start = Math.min(Math.max(e + commute + 10, 1350 + (roll(s, "gece_gec_saat", day) % 50)), 1440 - 5);
    add(plan, start - commute, "ev", PLACE_HOME);
    travel(plan, commute, PLACE_HOME, "meydan");
    add(plan, 1440, "meydan", "meydan");
  } else {
    plan.pop(); // eve dönüş yolu
    plan[plan.length - 1].son = 1440;
  }
}

/** Günün planı: dakika aralıklarından oluşan kesintisiz liste (0-1440). */
export function dayPlan(r, day) {
  const s = r.seed;
  const commute = 15 + (roll(s, "yol") % 20);
  const hobbyPlace = "hobi:" + hobby(r).yer;
  const plan = [];
  if (lateNight(r, day - 1)) {
    // Dün gece geç saate kaldı: günün başında hâlâ meydanda, sonra eve dönüp uyur.
    add(plan, 30 + (roll(s, "gece_donus", day - 1) % 60), "meydan", "meydan");
    travel(plan, commute, "meydan", PLACE_HOME);
  }

  let sleep = 1350 + (roll(s, "uyku", day) % 80);
  if (worksOn(r, day) && job(r).yer === "ev") {
    // Evden çalışan: sabah evde masasında; çoğu öğle arasında kısa bir çıkış yapar; akşam işçiler gibi.
    const j = job(r);
    const shift = catalog.vardiyalar[shiftOf(r)];
    add(plan, shift.bas - 40 - (roll(s, "uyan", day) % 40), "uyku", PLACE_HOME);
    const lunch = 720 + (roll(s, "ogle_saat", day) % 45);
    if (roll(s, "ogle", day) % 100 < 45) {
      add(plan, lunch - commute, "ev", PLACE_HOME);
      travel(plan, commute, PLACE_HOME, "meydan");
      add(plan, end(plan) + 30 + (roll(s, "ogle_sure", day) % 30), "meydan", "meydan");
      travel(plan, commute, "meydan", PLACE_HOME);
    }
    const leave = shift.son + (roll(s, "gec_cikis", day) % 31);
    const outing = eveningPlace(s, day, hobbyPlace);
    const duration = 60 + (roll(s, "sure", day) % 120);
    const latest = outing.startsWith("hobi:") ? OUTING_LATEST_HOBBY : OUTING_LATEST_MEYDAN;
    if (outing !== "" && leave + commute <= latest && leave + 2 * commute + duration <= sleep - 10) {
      add(plan, leave, "ev", PLACE_HOME);
      travel(plan, commute, PLACE_HOME, outing);
      add(plan, end(plan) + duration, activityOf(outing), outing);
      travel(plan, commute, outing, PLACE_HOME);
    }
    nightOut(plan, s, day, commute, sleep);
  } else if (worksOn(r, day) && shiftOf(r) === "gece") {
    // Gece vardiyası (22:00-06:00): günün başında işte, sabah eve döner, kahvaltı edip öğleden sonraya
    // kadar uyur, akşam evde vakit geçirip 22:00'de yeniden işe gider.
    add(plan, 360 + (roll(s, "gec_cikis", day) % 16), "is", PLACE_WORK);
    travel(plan, commute, PLACE_WORK, PLACE_HOME);
    add(plan, end(plan) + 45, "ev", PLACE_HOME);
    add(plan, 870 + (roll(s, "uyan", day) % 60), "uyku", PLACE_HOME);
    add(plan, 1320 - commute - (roll(s, "erken_varis", day) % 20), "ev", PLACE_HOME);
    travel(plan, commute, PLACE_HOME, PLACE_WORK);
    add(plan, 1440, "is", PLACE_WORK);
    return plan;
  } else if (worksOn(r, day)) {
    const j = job(r);
    const vardiya = shiftOf(r);
    const shift = catalog.vardiyalar[vardiya];
    if (vardiya === "erken") sleep = 1290 + (roll(s, "uyku", day) % 60);
    // İşe 0-24 dk erken varılır, işten 0-15 dk geç çıkılır: herkes aynı otobüse/aynı dakikaya yığılmaz.
    const arrive = shift.bas - (roll(s, "erken_varis", day) % 25);
    const leave = shift.son + (roll(s, "gec_cikis", day) % 16);
    if (vardiya === "gec") {
      // Akşam vardiyası: sabah kalkar, işe gitmeden önce çoğu bir süre dışarı çıkar.
      const wake = 510 + (roll(s, "uyan", day) % 90);
      add(plan, wake, "uyku", PLACE_HOME);
      const out = wake + 60 + (roll(s, "sabah_cikis", day) % 60);
      const len = 60 + (roll(s, "sabah_sure", day) % 60);
      if (roll(s, "sabah", day) % 100 < 60 && out + len + commute <= arrive - commute - 30) {
        add(plan, out - commute, "ev", PLACE_HOME);
        travel(plan, commute, PLACE_HOME, "meydan");
        add(plan, end(plan) + len, "meydan", "meydan");
        travel(plan, commute, "meydan", PLACE_HOME);
      }
    } else {
      add(plan, arrive - commute - 45 - (roll(s, "uyan", day) % 30), "uyku", PLACE_HOME);
    }
    add(plan, arrive - commute, "ev", PLACE_HOME);
    travel(plan, commute, PLACE_HOME, PLACE_WORK);
    add(plan, leave, "is", PLACE_WORK);
    const outing = eveningPlace(s, day, hobbyPlace);
    const duration = 60 + (roll(s, "sure", day) % 120);
    // Hobiler 20:00'den, meydan buluşmaları 21:30'dan önce başlar.
    const latest = outing.startsWith("hobi:") ? OUTING_LATEST_HOBBY : OUTING_LATEST_MEYDAN;
    if (outing !== "" && leave + commute <= latest && leave + 3 * commute + duration <= sleep - 10) {
      travel(plan, commute, PLACE_WORK, outing);
      add(plan, end(plan) + duration, activityOf(outing), outing);
      travel(plan, commute, outing, PLACE_HOME);
    } else {
      travel(plan, commute, PLACE_WORK, PLACE_HOME);
    }
    nightOut(plan, s, day, commute, sleep);
  } else {
    const wake = 450 + (roll(s, "uyan", day) % 120);
    add(plan, wake, "uyku", PLACE_HOME);
    add(plan, Math.max(wake + 60, 600) + (roll(s, "cikis", day) % 60), "ev", PLACE_HOME);
    travel(plan, commute, PLACE_HOME, hobbyPlace);
    add(plan, end(plan) + 90 + (roll(s, "sure", day) % 90), "hobi", hobbyPlace);
    travel(plan, commute, hobbyPlace, PLACE_HOME);
    const evening = 1140 + (roll(s, "aksam_saat", day) % 90);
    // Öğleden sonra çoğu yeniden çıkar: çarşıda alışveriş ve kahve, mahallede çay bahçesi, park.
    const noon = Math.max(end(plan) + 40, 840 + (roll(s, "ogle_saat", day) % 180));
    const noonLen = Math.min(90 + (roll(s, "ogle_sure", day) % 90), evening - 2 * commute - 20 - noon);
    if (roll(s, "ogle", day) % 100 < 75 && noonLen >= 45) {
      add(plan, noon - commute, "ev", PLACE_HOME);
      travel(plan, commute, PLACE_HOME, "meydan");
      add(plan, end(plan) + noonLen, "meydan", "meydan");
      travel(plan, commute, "meydan", PLACE_HOME);
    }
    if (roll(s, "aksam", day) % 100 < 55 && evening + 90 + commute <= sleep - 10) {
      add(plan, evening - commute, "ev", PLACE_HOME);
      travel(plan, commute, PLACE_HOME, "meydan");
      add(plan, Math.min(end(plan) + 90 + (roll(s, "meydan_sure", day) % 90), sleep - 10 - commute), "meydan", "meydan");
      travel(plan, commute, "meydan", PLACE_HOME);
    }
  }
  if (lateNight(r, day)) {
    goLate(plan, s, day, commute);
    return plan;
  }
  add(plan, Math.max(sleep, end(plan)), "ev", PLACE_HOME);
  add(plan, 1440, "uyku", PLACE_HOME);
  return plan;
}

/** Verilen dakikadaki parça; yolculukta t ilerleme oranıdır (0-1). */
export function activityAt(plan, minute) {
  for (const seg of plan) {
    if (minute < seg.son) {
      if (seg.ne === "yol") {
        const t = Math.min(1, Math.max(0, (minute - seg.bas) / (seg.son - seg.bas)));
        return { ...seg, t };
      }
      return seg;
    }
  }
  return plan[plan.length - 1];
}
