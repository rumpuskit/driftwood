// Sakinler: günlük planına göre evden çıkar, işe gider, hobisini yapar, meydanda arkadaşlarıyla buluşur.
// Plan simülasyondan gelir (sim.js); burada o planın sokakta nasıl yaşandığı kurulur.
//
//  - Gün başında herkese, gideceği her yer için bir "rol" ayrılır: oturacağı bank ya da masa, katılacağı
//    sohbet grubu, olta atacağı iskele noktası, seyir noktası... Ayırma, varış saatine göre sırayla yapılır;
//    aynı yere aynı anda iki kişi düşmez ve kişinin yeri gün içinde değişmez.
//  - Yolculuk: kapının içinden çıkar, kaldırımdan (her yolun kendi kaldırım çizgisinden) yürür, köşeleri
//    yuvarlak döner, meydanda çeşmenin çevresinden dolanır, ayrılan yerine varır; oturacaksa oturur.
//    Erken kalırsa yolda kısa molalar verir. Kapıdan girerken kapı açılır.
//  - Yürüyenler birbirine çok yaklaşırsa yana çekilir; durağan insanların ve engellerin içinden geçilmez.
import { Color } from "three";
import { activityAt, dayPlan, dreamJob, hobby, isHoliday, job, look, pet, roll, workplace, worksOn } from "../sim.js";
import { Crowd, HAT_HAIR, phonePose } from "./human.js";
import { PedNav } from "./nav.js";
import { pedWait } from "./signals.js";
import { ferryOut, nextArrival, nextDeparture } from "./ferry.js";
import { ETKINLIK, buildCinema, chooseActivity, dayTheme, favorites } from "./etkinlik.js";
import { sunPosition, sunTimes } from "./sky.js";
import { dateKey, prefOf } from "../tercih.js";
import { craneSeat, forkliftSeat, portMotion, shipWalkY, stackerSeat } from "./port.js";
import { pointAt } from "./traffic.js";
import { playgroundItems } from "./layout.js";
import * as P from "./palette.js";

// Meslek kıyafetleri: işte ve işe gidip gelirken giyilir. top/bottom yoksa kişinin kendi giysisi; hat: başlık
// (human.js EXTRAS). Ofis çalışanı, öğretmen, kütüphaneci, ressam gibi işlerde kıyafet serbest.
const UNIFORMS = {
  polis: { top: "#1f3f73", bottom: "#1a2a48", sleeves: true, hat: "kep", hatColor: "#1f3f73" },
  doktor: { top: "#f4f6f8", sleeves: true },
  hemsire: { top: "#4fa3a5", bottom: "#4fa3a5" },
  asci: { top: "#f4f4f2", bottom: "#2a2a2e", sleeves: true, hat: "asci", hatColor: "#f4f4f2" },
  firinci: { top: "#f4f4f2", bottom: "#f0ece4", hat: "asci", hatColor: "#f4f4f2" },
  garson: { top: "#f4f4f2", bottom: "#1d1d22", sleeves: true },
  barista: { top: "#5a3e2b", bottom: "#2a2a2e" },
  kasiyer: { top: "#2f8a57" },
  resepsiyonist: { top: "#2f4a6d", bottom: "#1d1d22", sleeves: true },
  memur: { top: "#dfe7ee", bottom: "#2c3a52", sleeves: true },
  avukat: { top: "#2b2b30", bottom: "#2b2b30", sleeves: true },
  liman_iscisi: { top: "#f28c28", bottom: "#2c3a52", hat: "kask", hatColor: "#f2c230" },
  gemi_ustasi: { top: "#33507a", bottom: "#33507a", sleeves: true, hat: "kask", hatColor: "#f4f4f2" },
  balikci: { top: "#f2c230", bottom: "#2c3a52", sleeves: true, hat: "bere", hatColor: "#2f3f5f" },
  fener_bekcisi: { top: "#2f3f5f", bottom: "#2c3a52", sleeves: true, hat: "bere", hatColor: "#8a2f2f" },
  cankurtaran: { top: "#e0463c", bottom: "#e0463c", shorts: true, sleeves: false, hat: "sapka", hatColor: "#e0463c" },
  bahcivan: { top: "#6a8f3c", bottom: "#5a4636", hat: "sapka", hatColor: "#4f6d2c" },
  zeytinci: { top: "#7d8a4e", bottom: "#5a4636", hat: "hasir", hatColor: "#e3c77e" },
  marangoz: { top: "#8a6a4a", bottom: "#4a6589" },
  seramikci: { top: "#bfb3a2" },
  rehber: { top: "#3e8a86", sleeves: true },
  muhtar: { top: "#3a3f4a", bottom: "#3a3f4a", sleeves: true },
  okul_muduru: { top: "#2c3a52", bottom: "#2c3a52", sleeves: true },
  kahveci: { top: "#f4f4f2", bottom: "#1d1d22", sleeves: true },
  futbolcu: { top: "#c8312f", bottom: "#f4f4f2", shorts: true, sleeves: false }, // Driftwood Gulls forması
  zeplin_pilotu: { top: "#f4f4f2", bottom: "#1d3156", sleeves: true, hat: "kep", hatColor: "#1d3156" }, // pilot gömleği ve kepi
  hakim: { top: "#1d1d22", bottom: "#1d1d22", sleeves: true }, // cübbe
  savci: { top: "#1d1d22", bottom: "#1d1d22", sleeves: true },
};
const uniformOf = (u) => u && {
  top: new Color(u.top), bottom: u.bottom ? new Color(u.bottom) : null, sleeves: u.sleeves,
  shorts: !!u.shorts, hat: u.hat ?? null, hatColor: u.hatColor ? new Color(u.hatColor) : null,
};
const TEAM_COLORS = ["#c8312f", "#2f5fb5", "#1d1d22"].map((c) => new Color(c));
const WHITE = new Color("#f4f4f2");
// Sakin olmayan figürler (öğrenciler, parktaki çocuklar, pazarcılar...) adanın nüfusuyla orantılıdır:
// 3.200 sakinde tam kalabalık, boş adada hiç. Her figür kendi tohumuyla seçilir; nüfus arttıkça yenileri eklenir,
// var olanlar kaybolmaz.
export const FULL_TOWN = 3200;
export function keepExtra(lively, seed) {
  return lively >= 1 || (Math.imul((seed ^ 0x9e3779b9) | 0, 2654435761) >>> 0) / 4294967296 < lively;
}
const SUITCASES = [new Color("#3d5a80"), new Color("#9c2f3c"), new Color("#2f5d50"), new Color("#7a5c3a"), new Color("#4a4a52")];
const SCHOOL_TOPS = [new Color("#2f4a6d"), new Color("#2f4a6d"), new Color("#f4f1ea")]; // okul forması
const DRIVER_TOP = new Color("#3b5a7a"), FIRE_TOP = new Color("#b8231f"), MEDIC_TOP = new Color("#e9eef2"), COP_TOP = new Color("#f28c28");
const DOG_COLORS = ["#8a5a32", "#2b2622", "#e8dcc4", "#c9954f", "#6b6b6b"].map((c) => new Color(c));
const HUB = [0, 0];
const POSE_KEYS = ["y", "lie", "drop", "lean", "twist", "headYaw", "headPitch", "hipL", "hipR", "kneeL", "kneeR", "shL", "shR", "abL", "abR", "elL", "elR"];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (n) => (n % 10000) / 10000;
const smooth = (t) => t * t * (3 - 2 * t);

function lengths(pts) {
  const lens = [0];
  for (let j = 1; j < pts.length; j++) lens.push(lens[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  return lens;
}

/** Çizgi üzerinde `d` metredeki nokta ve yön. */
function along(pts, lens, d, out) {
  let j = 1;
  while (j < lens.length - 1 && lens[j] < d) j++;
  const span = lens[j] - lens[j - 1] || 1;
  const u = clamp((d - lens[j - 1]) / span, 0, 1);
  out.x = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u;
  out.z = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
  out.heading = Math.atan2(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
  return out;
}

/** Çizgiyi yana kaydırır (uç noktalar sabit): herkes kaldırımda tek bir çizgiden yürümesin. */
function offsetPath(pts, o) {
  if (Math.abs(o) < 0.01 || pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, pz] = pts[i - 1], [x, z] = pts[i], [nx, nz] = pts[i + 1];
    let ax = x - px, az = z - pz, bx = nx - x, bz = nz - z;
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    let mx = -(az + bz), mz = ax + bx;
    const lm = Math.hypot(mx, mz);
    if (lm < 1e-3) { mx = -az; mz = ax; } else { mx /= lm; mz /= lm; }
    const cos = Math.max(0.5, mx * -az + mz * ax);
    out.push([x + (mx * o) / cos, z + (mz * o) / cos]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Köşeleri kavisle döner (köşeden en çok r metre önce başlayan ikinci derece eğri): yön bir anda değişmez. */
function roundCorners(pts, r) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz);
    if (l1 < 0.05 || l2 < 0.05) { out.push(pts[i]); continue; }
    const d1x = (bx - ax) / l1, d1z = (bz - az) / l1, d2x = (cx - bx) / l2, d2z = (cz - bz) / l2;
    const turn = Math.acos(clamp(d1x * d2x + d1z * d2z, -1, 1));
    if (turn < 0.2) { out.push(pts[i]); continue; }
    const d = Math.min(r, l1 / 2, l2 / 2);
    const p1 = [bx - d1x * d, bz - d1z * d], p2 = [bx + d2x * d, bz + d2z * d];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, u = 1 - t;
      out.push([u * u * p1[0] + 2 * u * t * bx + t * t * p2[0], u * u * p1[1] + 2 * u * t * bz + t * t * p2[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Duraklı yürüyüş döngüsü: pts = [[x, z, bakışX, bakışZ]], her noktada `dwell` saniye durur. Noktalar arası
 * yürüyüş uçlarda hızlanıp yavaşlar; yön durakta bakış noktasına yarım saniyede döner.
 * Döner: {x, z, heading, moving, dist (adım evresi için yol), stopT (duraktaki süre)}.
 */
function stopGo(pts, speed, dwell, t, out) {
  const n = pts.length;
  if (n < 2) { out.x = pts[0][0]; out.z = pts[0][1]; out.heading = 0; out.moving = false; out.dist = 0; out.stopT = t; return out; }
  let T = 0;
  const legs = pts.map((a, k) => { const b = pts[(k + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return { a, b, L, w: L / speed }; });
  for (const l of legs) T += l.w + dwell;
  let u = ((t % T) + T) % T, walked = 0;
  const lerpAng = (a, b, v) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * v;
  for (let k = 0; k < n; k++) {
    const l = legs[k], prev = legs[(k - 1 + n) % n];
    const dir = Math.atan2(l.b[0] - l.a[0], l.b[1] - l.a[1]);
    const faceA = Math.atan2(l.a[2] - l.a[0], l.a[3] - l.a[1]), faceB = Math.atan2(l.b[2] - l.b[0], l.b[3] - l.b[1]);
    if (u < l.w) {
      const d = easeEnds(u * speed, l.L, 0.7), f = l.L ? d / l.L : 1;
      out.x = l.a[0] + (l.b[0] - l.a[0]) * f; out.z = l.a[1] + (l.b[1] - l.a[1]) * f;
      out.heading = lerpAng(faceA, dir, Math.min(1, u / 0.5)); out.moving = true; out.dist = walked + d; out.stopT = 0;
      return out;
    }
    u -= l.w; walked += l.L;
    if (u < dwell) {
      out.x = l.b[0]; out.z = l.b[1]; out.heading = lerpAng(dir, faceB, Math.min(1, u / 0.5)); out.moving = false; out.dist = walked; out.stopT = u;
      return out;
    }
    u -= dwell;
    void prev;
  }
  out.x = pts[0][0]; out.z = pts[0][1]; out.heading = 0; out.moving = false; out.dist = 0; out.stopT = 0;
  return out;
}

/** Yolun başında hızlanma, sonunda yavaşlama: ilk ve son `a` metrede konum yumuşar (hız 0'dan başlar, 0'a iner). */
function easeEnds(d, L, a = 1.1) {
  const f = (u) => u * u * (2 - u); // f(0)=0, f(1)=1, f'(0)=0, f'(1)=1: yürüme hızına kesintisiz bağlanır
  const A = Math.min(a, L / 2);
  if (A <= 0.01) return d;
  if (d < A) return A * f(d / A);
  if (d > L - A) return L - A * f((L - d) / A);
  return d;
}

/** Bacak için iki kemikli ters kinematik: kalçadan ayağa (öne dz, yukarı dy) → {hip, knee}. */
function legIK(dz, dy, L1 = 0.45, L2 = 0.47) {
  const d = clamp(Math.hypot(dz, dy), 0.25, L1 + L2 - 0.005);
  const alpha = Math.atan2(dz, -dy);
  const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const beta = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  return { hip: alpha + beta, knee };
}

// --- duruşlar ---

export function resetPose(p) {
  p.lie = 0; p.drop = 0; p.lean = 0; p.twist = 0; p.headYaw = 0; p.headPitch = 0;
  p.hipL = 0; p.hipR = 0; p.kneeL = 0.05; p.kneeR = 0.05;
  p.shL = 0; p.shR = 0; p.abL = 0; p.abR = 0; p.elL = 0.12; p.elR = 0.12;
  p.props = null; p.moving = false; p.radius = 0.32; p.dog = false; p.door = null;
  p.inVehicle = false; p.vehicleKey = null; p.waiting = false;
}

/** Yürüyüş: φ adım evresi; koşu için run = 1. Topuk vuruşu, kalça salınımı, kol sallama. */
export function walkPose(p, phi, run = 0) {
  const s = Math.sin(phi), c = Math.cos(phi);
  const hipA = run ? 0.62 : 0.4, kneeA = run ? 1.3 : 0.75;
  p.hipL = hipA * s; p.hipR = -hipA * s;
  // Diz, bacak öne salınırken bükülür; yere basarken hafifçe esner.
  p.kneeL = 0.08 + kneeA * Math.max(0, c) ** 1.4 + 0.06 * Math.max(0, -s);
  p.kneeR = 0.08 + kneeA * Math.max(0, -c) ** 1.4 + 0.06 * Math.max(0, s);
  p.shL = -(run ? 0.6 : 0.3) * s; p.shR = (run ? 0.6 : 0.3) * s;
  p.abL = p.abR = 0.04;
  p.elL = run ? 1.5 : 0.18 + 0.22 * Math.max(0, -s); p.elR = run ? 1.5 : 0.18 + 0.22 * Math.max(0, s);
  p.lean = run ? 0.18 : 0.04;
  p.twist = (run ? 0.1 : 0.07) * s;
  p.headYaw = -0.03 * s;
  p.y += (run ? 0.06 : 0.028) * Math.abs(Math.cos(phi)) - (run ? 0.02 : 0.01);
  p.moving = true;
}

export function sitPose(p, top, k) {
  p.y = top + 0.06 - 0.92 * k;
  p.hipL = p.hipR = 1.5; p.kneeL = p.kneeR = 1.45;
  p.shL = p.shR = 0.35; p.elL = p.elR = 0.9; p.abL = p.abR = -0.02;
  p.lean = -0.05;
}

export function idleGesture(p, t, phase, talk) {
  // Ağırlığını bir bacaktan ötekine verir, başını çevirir, konuşurken elleriyle anlatır.
  const shift = Math.sin(t * 0.21 + phase);
  p.twist = 0.05 * Math.sin(t * 0.4 + phase);
  p.headYaw = 0.25 * Math.sin(t * 0.3 + phase * 2);
  if (talk) {
    const g = Math.max(0, Math.sin(t * 0.9 + phase));
    p.shR = 0.35 + 0.5 * g; p.elR = 0.6 + 0.9 * g; p.abR = 0.05 * g;
    p.shL = 0.1 * g; p.elL = 0.3;
  }
  if (p.hipL < 1) {
    p.kneeL = 0.05 + 0.1 * Math.max(0, shift);
    p.kneeR = 0.05 + 0.1 * Math.max(0, -shift);
  }
}

function blendPose(p, a, b, t) {
  for (const key of POSE_KEYS) p[key] = a[key] + (b[key] - a[key]) * t;
}

export class People {
  constructor(world, residents, traffic) {
    this.traffic = traffic;
    this.world = world;
    this.residents = residents;
    this.n = residents.length;
    this.lively = Math.min(1, this.n / FULL_TOWN);
    this.waiting = 0; // takip etmiş ama henüz taşınmamış olanlar: vapur iskelesinde valizleriyle bekler
    this.day = null;
    this.visibleCount = 0;
    this.athome = new Uint8Array(this.n);
    this.positions = new Float32Array(this.n * 3);
    this.visible = new Uint8Array(this.n);
    this.activities = new Array(this.n);
    this.travelCache = new Array(this.n);
    this.poses = Array.from({ length: this.n }, () => ({}));
    this.slotToIndex = new Map(residents.map((r, i) => [r.slot, i]));
    this.homeActs = new Array(this.n);
    this.currentPlace = new Array(this.n);
    this.currentAct = new Array(this.n); // dışarıdaki etkinliğin kimliği (etkinlik.js), kart metni için
    this.favs = residents.map((r) => favorites(r.seed));
    this.theme = null;
    this.dollhouse = null;
    this.openDoors = new Set();

    this.homes = residents.map((r) => world.homeOf(r.slot));
    this.works = residents.map((r) => ({ wp: workplace(r), loc: world.workplaceOf(workplace(r)), job: job(r).id }));
    this.hobbies = residents.map((r) => hobby(r));
    this.speeds = residents.map((r) => 1.1 + frac(roll(r.seed, "hiz")) * 0.4);
    this.colors = residents.map((r, i) => {
      const l = look(r);
      // Asıl mesleğin kıyafeti: iş yeri henüz adada yoksa da (anakarada çalışırken) giyilir.
      const uniform = uniformOf(UNIFORMS[dreamJob(r).id]);
      return {
        style: l.sac % 8, height: 1.75 * (l.boy / 100),
        skin: P.SKIN[l.ten % P.SKIN.length], hairColor: P.HAIR[l.sac_renk % P.HAIR.length],
        top: P.CLOTHES[l.ust % P.CLOTHES.length], bottom: P.BOTTOMS[l.alt % P.BOTTOMS.length],
        sleeves: roll(r.seed, "kol") % 3 !== 0,
        beard: roll(r.seed, "sakal") % 5 === 0,
        glasses: roll(r.seed, "gozluk") % 6 === 0,
        uniform,
      };
    });

    this.nav = new PedNav(world);
    // Araç sahipliği (yaklaşık üçte bir) ve evin önündeki sabit park yeri.
    // Araçlar çevre yoluyla gelir; öncesinde herkes yürür (otobüs ve taksi de yok).
    this.hasCar = residents.map((r) => world.vehicles && roll(r.seed, "araba") % 100 < 45);
    this.carColor = residents.map((r) => roll(r.seed, "arabaRenk") % 10);
    this.homeSlot = residents.map((r, i) => (this.hasCar[i] && traffic ? traffic.takeSlot(...this.homes[i].door, -1, 1e9, 220) : null));
    this.homeSlot.forEach((slot, i) => { if (slot == null) this.hasCar[i] = false; });
    this.cinema = buildCinema(world); // plajda açık hava sineması (cumartesi akşamı)
    this._buildPools();
    this.crowd = new Crowd(this.n + 320); // sakinler + şoförler, pazarcılar, öğrenciler
    this.group = this.crowd.group;
    if (this.cinema) this.group.add(this.cinema.group);
    this._at = {};
    this._tmp = {};
    this._stand = {};
    this._sit = {};
  }

  // --- yer havuzları: oturaklar, durma noktaları, sohbet grupları ---

  _buildPools() {
    const w = this.world;
    const pools = {};
    const add = (name, item) => (pools[name] ??= []).push({ ...item, busy: [] });
    for (const s of w.seats) add("seat:" + s.place, s);
    for (const s of w.places.iskele?.spots ?? []) add("fish", s);
    // İskele dolunca (ya da henüz yoksa) kıyıdan balık tutulur: sahil yolunun deniz kenarında, 3,5 m arayla.
    for (let x = -300; x <= 25; x += 3.5) {
      if (Math.abs(x - (w.places.iskele?.spots[0].x ?? -1e4)) < 6 || Math.abs(x) < 9 || Math.abs(x + 218) < 22) continue; // iskeleler ve balıkçı koyu hariç
      const [cx, cz] = w.coastPoint(x, 60, 0, 1, 1.6);
      if (w.isWalkable(cx, cz) && w.height(cx, cz) > 0.2) add("fish", { x: cx, z: cz, heading: 0 });
    }
    // Fotoğrafçılar: fenerin seyir noktaları (birbirine en az 2,5 m), sahil yolunun deniz kenarı, tepenin
    // zirvesi ve vapur iskelesinin ucu. Hepsi aynı yere yığılmaz.
    const views = [];
    const addView = (s) => { if (!views.some((v) => Math.hypot(v.x - s.x, v.z - s.z) < 2.5)) { views.push(s); add("view", s); } };
    for (const s of w.places.fener.spots.slice(1)) addView(s); // ilki fener bekçisinin
    for (let x = -160; x <= 25; x += 12) {
      const [cx, cz] = w.coastPoint(x + 3.5, 60, 0, 1, 2.2);
      if (w.isWalkable(cx, cz) && w.height(cx, cz) > 0.2) addView({ x: cx, z: cz, heading: 0 });
    }
    const summit = w.places.tepe.anchors[0];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, [x, z] = w.nearestWalkable(summit[0] + Math.cos(a) * 9, summit[1] + Math.sin(a) * 9, 3);
      addView({ x, z, heading: Math.atan2(x - summit[0], z - summit[1]) });
    }
    const pier = w.ferryPier;
    if (pier) for (const dx of [-3, 0, 3]) addView({ x: (pier.x0 + pier.x1) / 2 + dx, z: pier.z1 - 1.5, heading: 0 });
    // Park (şövale), plaj (yoga, yüzme), tepe (uçurtma): engelsiz noktalar.
    const scatter = (name, cx, cz, radius, count, heading, salt, accept = (x, z) => w.isWalkable(x, z)) => {
      for (let k = 0, tries = 0; k < count && tries < count * 20; tries++) {
        const a = frac(roll(salt, name, tries)) * Math.PI * 2, r = Math.sqrt(frac(roll(salt + 1, name, tries))) * radius;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!accept(x, z)) continue;
        if ((pools[name] ?? []).some((q) => Math.hypot(q.x - x, q.z - z) < 2.4)) continue;
        add(name, { x, z, heading: typeof heading === "function" ? heading(x, z) : heading });
        k++;
      }
    };
    const park = w.plazas.find((p) => p.kind === "park");
    const pond = w.features.find((f) => f.type === "gol");
    if (park && pond) scatter("easel", (park.x0 + park.x1) / 2, (park.z0 + park.z1) / 2, 40, 14, (x, z) => Math.atan2(pond.x - x, pond.z - z), 11);
    else {
      // Göletli park açılana kadar ressamlar tepenin eteğinde, denize bakarak çalışır.
      const [hx, hz] = w.places.tepe.anchors[0];
      scatter("easel", hx - 30, hz + 25, 18, 6, Math.PI * 0.85, 11);
    }
    const beach = w.places.plaj.anchors;
    const sea = (x, z) => w.height(x, z) > 0.35 && w.height(x, z) < 1.6 && !w.obstacles.has(w._obKey(x, z));
    for (const [bx, bz] of beach) scatter("yoga", bx, bz, 6, 2, Math.PI, 13 + Math.round(bx), sea);
    for (const [bx, bz] of beach) scatter("swim", bx, bz + 22, 10, 2, 0, 17 + Math.round(bx), (x, z) => w.height(x, z) < -0.6 && w.height(x, z) > -3);
    for (const [bx, bz] of beach) scatter("towel", bx, bz, 7, 3, Math.PI, 19 + Math.round(bx), sea);
    const top = w.places.tepe.anchors[0];
    scatter("kite", top[0], top[1], 16, 10, (x, z) => Math.atan2(x - top[0], z - top[1]), 23);
    for (const [bx, bz] of beach.filter((_, j) => j % 3 === 0)) scatter("kite", bx, bz - 2, 6, 2, 0, 29 + Math.round(bx), sea);

    // Gün batımı: fenerin seyir noktaları, tepenin zirve halkası, batı kıyısı ve vapur iskelesinin ucu (bakış
    // yönü güneşe göre o an hesaplanır). Yıldızlar: tepenin çimeninde sırtüstü uzanılacak yerler.
    for (const v of pools.view ?? []) add("sunset", v);
    scatter("stars", top[0] - 12, top[1] + 6, 16, 10, 0, 37);
    // Vapur iskelesinin korkulukları (iki yan, denize bakarak) ve kumsalın su kenarı (taş sektirme).
    if (pier) {
      for (let z = pier.z0 + 12; z < pier.z1 - 2; z += 3.2) {
        add("pier", { x: pier.x0 + 0.55, z, heading: -Math.PI / 2 });
        add("pier", { x: pier.x1 - 0.55, z: z + 1.6, heading: Math.PI / 2 });
      }
    }
    const wet = (x, z) => w.isWalkable(x, z) && w.height(x, z) > 0.2 && w.height(x, z) < 0.9;
    for (const [bx, bz] of beach) scatter("skip", bx, bz + 6, 7, 2, 0, 41 + Math.round(bx), wet);
    // Plajda sinema sandalyeleri.
    for (const st of this.cinema?.seats ?? []) add("seat:sinema", st);

    // Sohbet grupları: meydanda çeşme ile banklar arasında ve dışında; diğer yerlerde çapanın çevresinde.
    const groups = {};
    const addGroup = (place, x, z, cap) => {
      if (!w.isWalkable(x, z)) return;
      (groups[place] ??= []).push({ x, z, cap, slots: Array.from({ length: cap }, () => []) });
    };
    for (let g = 0; g < 44; g++) {
      const a = g * 2.39996, r = 9.8 + ((g * 7) % 16);
      addGroup("meydan", Math.cos(a) * r, Math.sin(a) * r, 2 + (g % 4));
    }
    for (const place of ["park", "tepe", "sahil_yolu", "plaj", "pazar", "fener", ...Object.keys(w.places).filter((k) => k.startsWith("mahalle:"))]) {
      const pl = w.places[place];
      if (!pl) continue;
      pl.anchors.forEach(([ax, az], i) => {
        if (place === "fener" && i % 4) return; // fenerin dibi kalabalık olmasın: seyir noktalarının dörtte biri
        for (let g = 0; g < 3; g++) {
          const a = g * 2.1 + i, r = 3 + g * 2.5;
          const [x, z] = w.nearestWalkable(ax + Math.cos(a) * r, az + Math.sin(a) * r, 5);
          addGroup(place, x, z, 2 + ((g + i) % 3));
        }
      });
    }
    // Dışarıdaki iş yerlerinde her çalışana ayrı bir çalışma noktası. Yük limanında görev yerleri sabit.
    for (const [kind, list] of Object.entries(w.workplaces)) {
      list.forEach((loc, idx) => {
        if (!loc?.outdoor) return;
        if (kind === "liman" && w.port) { for (const q of w.port.posts) add(`work:${kind}:${idx}`, { ...q }); return; }
        if (kind === "tersane" && w.tersane) { for (const q of w.tersane.posts) add(`work:${kind}:${idx}`, { ...q }); return; }
        if (kind === "balikci_koyu" && w.koy) { for (const q of w.koy.posts) add(`work:${kind}:${idx}`, { ...q }); return; }
        const center = loc.anchor;
        // Nokta sayısı alanın büyüklüğüne göre: tarla geniş, kıyıdaki iş yerleri dar. Noktası olmayan
        // çalışan görünmez (atölyenin içinde, denizde, tarlanın uzak ucunda) — kimse bir noktaya yığılmaz.
        const count = { tarla: 30, balikci_koyu: 10, tersane: 10, plaj: 8, fener: 2 }[kind] ?? 14;
        const rad = kind === "tarla" ? 34 : Math.max(9, (loc.spread ?? 6) * 1.6);
        const toward = (x, z) => Math.atan2(center[0] - x, center[1] - z);
        scatter(`work:${kind}:${idx}`, center[0], center[1], rad, count, toward, 31 + idx * 7 + kind.length);
      });
    }
    // Piknik: tepenin eteğindeki çimende, kumsalın gerisinde ve parkta örtü yerleri (dört-altı kişilik).
    const grass = (x, z) => w.isWalkable(x, z) && !w.obstacles.has(w._obKey(x, z));
    const picnic = (cx, cz, radius, count, salt) => {
      for (let n = 0, tries = 0; n < count && tries < count * 30; tries++) {
        const a = frac(roll(salt, "piknik", tries)) * Math.PI * 2, r = Math.sqrt(frac(roll(salt + 1, "piknik", tries))) * radius;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (![[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].every(([dx, dz]) => grass(x + dx, z + dz))) continue;
        if ((groups.piknik ?? []).some((g) => Math.hypot(g.x - x, g.z - z) < 6)) continue;
        (groups.piknik ??= []).push({ x, z, cap: 4 + (n % 3), slots: Array.from({ length: 4 + (n % 3) }, () => []), picnic: true });
        n++;
      }
    };
    picnic(top[0] - 40, top[1] + 10, 30, 6, 51);
    for (const [bx, bz] of beach.filter((_, j) => j % 4 === 1)) picnic(bx, bz - 8, 8, 1, 53 + Math.round(bx));
    if (park) picnic((park.x0 + park.x1) / 2, (park.z0 + park.z1) / 2, 35, 6, 57);
    this.groupPools = groups;
    this.pools = pools;
  }

  /** Akşam buluşması (simülasyonda "meydan"): yarısı kendi mahallesinin çay bahçesine/parkına gider. */
  _placeOf(i, k) {
    const ov = this.override?.[i]?.get(k);
    if (ov) return ov;
    const seg = this.plans[i][k];
    if (!seg || seg.ne !== "meydan") return seg?.yer;
    // Buluşma yeri saatine göre, mekânların kapasitesiyle orantılı seçilir: kimse tek bir meydana yığılmaz.
    const local = "mahalle:" + this.homes[i].parts.mahalle;
    const t = seg.bas;
    // Yaz (Haziran–Eylül) gündüzü plaj da buluşma yeridir: şezlonglarda güneşlenilir.
    const month = new Date(this.day * 86400000).getUTCMonth();
    const beach = month >= 5 && month <= 8 && this.world.beach ? 22 : 0;
    const table = t >= 1290
      ? [[local, 45], ["meydan", 40], ["kahvehane", 15]]
      : t < 1080
        ? [[local, 25], ["meydan", 24], ["park", 20], ["sahil_yolu", 16], ["pazar", 10], ["kahvehane", 5], ["plaj", beach]]
        : [[local, 30], ["meydan", 27], ["sahil_yolu", 19], ["park", 14], ["kahvehane", 10], ["plaj", Math.round(beach / 2)]];
    const opts = table.filter(([name, wgt]) => wgt > 0 && this.world.places[name]);
    const total = opts.reduce((a, [, wgt]) => a + wgt, 0);
    let x = roll(this.residents[i].seed, "mekan", this.day * 16 + k) % total;
    for (const [name, wgt] of opts) { if (x < wgt) return name; x -= wgt; }
    return "meydan";
  }

  /** Bir sakinin bir yerdeki modu: ne yapacak? */
  _mode(i, seg, k) {
    const s = this.residents[i].seed;
    if (seg.ne === "is") return `work:${this.works[i].wp.kind}:${this.works[i].wp.index}`;
    if (seg.ne === "hobi") {
      const mode = {
        balik: "fish", kitap: "seat:park", resim: "easel", bisiklet: "bike", kosu: "jog", yuzme: "swim",
        yoga: "yoga", ucurtma: "kite", gitar: "seat:meydan", satranc: "seat:meydan", fotograf: "view", tavla: "seat:kahvehane",
      }[this.hobbies[i].id];
      if (this._usable(mode)) return mode;
      if (this.hobbies[i].id === "kitap" && this._usable("seat:meydan")) return "seat:meydan"; // park yokken meydanda bankta okur
      return "group:" + seg.yer.replace("hobi:", "");
    }
    if (seg.ne === "meydan") {
      const m = roll(s, "meydanMod", this.day * 16 + k) % 100;
      const pl = this._placeOf(i, k);
      if (pl === "sahil_yolu") return "stroll"; // sahil yolunda akşam yürüyüşü
      if (pl === "pazar" && m % 3) return "stroll"; // pazarda koridorlarda gezinir (kalanı sohbette)
      // Kahvehane çoğunlukla içeridedir (tavla, okey); dışarıdaki birkaç masaya yer varsa oturulur.
      if (pl === "kahvehane") return m < 35 ? "seat:kahvehane" : "inside:kahvehane";
      if (pl !== "meydan") return m < 55 ? "seat:" + pl : "group:" + pl;
      const mode = m < 22 ? "seat:meydan" : m < 50 ? "seat:kafe" : m < 72 ? "shop" : "group:meydan";
      return this._usable(mode) ? mode : "group:meydan";
    }
    return "group:meydan";
  }

  /**
   * Bu etkinliğin yeri adada var mı? (Gelişimle açılan yerler: göletli park, sahil yolu, çarşı, kafe
   * masaları...) Yoksa sakin o vakti meydanda ya da hobisinin yerinde sohbetle geçirir.
   */
  _usable(mode) {
    if (!mode) return false;
    const w = this.world;
    if (mode === "bike" || mode === "jog") return !!w.promenade;
    if (mode === "shop") return !!w.carsiWalks;
    if (["hike", "beachwalk", "jog:plaj", "kapi", "cleanup", "stroll"].includes(mode) || mode.startsWith("inside:")) return true;
    if (mode.startsWith("group:")) return true;
    return !!this.pools[mode]?.length;
  }

  /** Gün başı: herkesin her yer ziyareti için rolünü varış sırasıyla ayırır. */
  _schedule() {
    for (const list of Object.values(this.pools)) for (const it of list) it.busy = [];
    for (const list of Object.values(this.groupPools)) for (const g of list) g.slots = g.slots.map(() => []);
    const free = (busy, a, b) => busy.every(([x, y]) => y <= a || x >= b);
    const requests = [];
    this.roles = this.plans.map(() => []);
    this.plans.forEach((plan, i) => {
      plan.forEach((seg, k) => {
        if (seg.ne === "yol" || seg.ne === "ev" || seg.ne === "uyku") return;
        if (seg.ne === "is" && !this.works[i].loc.outdoor) return;
        requests.push({ i, k, seg, mode: this._mode(i, seg, k) });
      });
    });
    requests.sort((a, b) => a.seg.bas - b.seg.bas || a.i - b.i);
    // Maçlar: boş zamanı maç saatine denk gelenlerden 22 oyuncu ve bir hakem; bir kısmı tribüne gelir.
    this.override = this.residents.map(() => null);
    this.matches = this._matchWindows(this.day).map((w, mi) => ({ ...w, id: this.day * 4 + mi, players: [] }));
    for (const m of this.matches) {
      for (const q of requests) {
        if (q.seg.ne !== "hobi" && q.seg.ne !== "meydan") continue;
        if (q.seg.bas > m.start + 10 || q.seg.son < m.start + 30) continue;
        if (this.override[q.i]?.has(q.k)) continue;
        const s = this.residents[q.i].seed;
        if (m.players.length < 23 && roll(s, "futbol", m.id) % 100 < 35) {
          const num = m.players.length;
          m.players.push(q.i);
          q.mode = "football";
          q.match = m;
          q.num = num;
          (this.override[q.i] ??= new Map()).set(q.k, "saha");
        } else if (roll(s, "seyirci", m.id) % 100 < 30) {
          q.mode = "seat:tribun";
          (this.override[q.i] ??= new Map()).set(q.k, "saha");
        }
      }
    }
    // Dışarı çıkışlar: günün olayına, saate, açık yerlere ve kişinin sevdiklerine göre bir etkinlik. Hobi
    // çıkışlarının da bir kısmı (her gün %25) başka bir etkinliğe döner: kimse her gün aynı şeyi yapmaz.
    this.theme = dayTheme(this.day, this.world);
    this.acts = this.residents.map(() => null);
    const ctx = {
      w: this.world, pools: this.pools, groupPools: this.groupPools, sun: sunTimes(this.day), theme: this.theme,
      workplace: (kind) => this.world.workplaces[kind]?.find(Boolean), dog: false,
    };
    // Doğrulanmış sakinlerin bugün için seçtikleri (sitede "Benim evim"): etkinlik ve karşılıklı buluşma.
    const today = dateKey(this.day);
    const dayPref = this.residents.map((r) => { const g = prefOf(r.handle)?.gun; return g?.tarih === today ? g : null; });
    const fits = (id, seg) => { const e = ETKINLIK[id]; return !!e && (!e.gerek || e.gerek(ctx)) && (!e.saat || e.saat(seg, ctx)); };
    const setAct = (q, id) => {
      const e = ETKINLIK[id];
      q.mode = e.mode; q.act = id;
      (this.override[q.i] ??= new Map()).set(q.k, e.yer);
      (this.acts[q.i] ??= new Map()).set(q.k, id);
    };
    this.meet = this.residents.map(() => -1);
    const byHandle = new Map(this.residents.map((r, i) => [r.handle, i]));
    const outings = (i) => requests.filter((q) => q.i === i && (q.seg.ne === "meydan" || q.seg.ne === "hobi") && !this.override[i]?.has(q.k));
    for (let a = 0; a < this.n; a++) {
      const b = byHandle.get(dayPref[a]?.bulusma);
      if (b == null || b <= a || dayPref[b]?.bulusma !== this.residents[a].handle) continue;
      this.meet[a] = b; this.meet[b] = a;
      // Çakışan çıkışlarında (en az yarım saat) ikisi de aynı etkinliği seçer: önce birinin istediği, olmazsa kafe,
      // piknik ya da meydan.
      for (const qa of outings(a)) for (const qb of outings(b)) {
        if (Math.min(qa.seg.son, qb.seg.son) - Math.max(qa.seg.bas, qb.seg.bas) < 30 || qa.act || qb.act) continue;
        const both = (id) => ETKINLIK[id]?.sosyal && fits(id, qa.seg) && fits(id, qb.seg);
        const id = [dayPref[a].etkinlik, dayPref[b].etkinlik, "kafe", "piknik", "kahvehane_bahce"].find((x) => x && both(x)) ?? "meydan_sohbet";
        if (id === "meydan_sohbet") { for (const q of [qa, qb]) { q.mode = "group:meydan"; q.act = id; (this.override[q.i] ??= new Map()).set(q.k, "meydan"); (this.acts[q.i] ??= new Map()).set(q.k, id); } }
        else { setAct(qa, id); setAct(qb, id); }
      }
    }
    for (const q of requests) {
      if (q.seg.ne !== "meydan" && q.seg.ne !== "hobi") continue;
      if (this.override[q.i]?.has(q.k)) continue; // maçta ya da buluşmada
      const want = dayPref[q.i]?.etkinlik;
      if (want && fits(want, q.seg)) {
        if (want === "meydan_sohbet") { q.mode = "group:meydan"; q.act = want; (this.override[q.i] ??= new Map()).set(q.k, "meydan"); (this.acts[q.i] ??= new Map()).set(q.k, want); }
        else setAct(q, want);
        continue;
      }
      const s = this.residents[q.i].seed;
      if (q.seg.ne === "hobi" && roll(s, "hobiDegis", this.day * 16 + q.k) % 100 >= 25) {
        // Hobinin yeri adada henüz yoksa (koşu ve bisiklet sahil yolunu ister) kumsalda yapılır.
        const alt = !this.world.promenade && { kosu: "kosu", bisiklet: "plaj_yuruyus" }[this.hobbies[q.i].id];
        if (alt) {
          q.mode = ETKINLIK[alt].mode; q.act = alt;
          (this.override[q.i] ??= new Map()).set(q.k, ETKINLIK[alt].yer);
          (this.acts[q.i] ??= new Map()).set(q.k, alt);
        }
        continue;
      }
      ctx.dog = this.dogs[q.i];
      const id = chooseActivity(s, this.day, q.k, q.seg, ctx, this.favs[q.i]);
      if (!id || id === "meydan_sohbet") continue; // eski seçim (meydan, çay bahçesi, kahvehane...) geçerli
      const e = ETKINLIK[id];
      let yer = e.yer;
      if (id === "kopek") yer = ["plaj", "tepe", ...(this.world.places.sahil_yolu ? ["sahil_yolu"] : [])][roll(s, "kopekYer", this.day) % (this.world.places.sahil_yolu ? 3 : 2)];
      q.mode = e.mode;
      q.act = id;
      (this.override[q.i] ??= new Map()).set(q.k, yer);
      (this.acts[q.i] ??= new Map()).set(q.k, id);
    }
    for (const q of requests) {
      const { i, k, seg } = q;
      const s = this.residents[i].seed;
      let mode = q.mode;
      let role = { mode };
      const pool = this.pools[mode] ?? (mode.startsWith("seat:") ? this.pools[mode] : null);
      if (pool?.length) {
        const start = roll(s, "yer" + mode, this.day) % pool.length;
        let item = null;
        // En yakın arkadaşı aynı anda aynı yerdeyse onun masasına otur.
        const f = this.meet?.[i] >= 0 ? this.meet[i] : this.stories?.friend[i] ?? -1; // buluşan ya da can dostu
        const fRole = f >= 0 ? this.roles[f]?.find((r, kk) => r?.item?.table && r.mode === mode && this.plans[f][kk].bas < seg.son && this.plans[f][kk].son > seg.bas) : null;
        if (fRole) item = pool.find((c) => c !== fRole.item && c.table && c.table[0] === fRole.item.table[0] && c.table[1] === fRole.item.table[1] && free(c.busy, seg.bas - 2, seg.son + 2)) ?? null;
        for (let n = 0; n < pool.length && !item; n++) {
          const cand = pool[(start + n) % pool.length];
          if (free(cand.busy, seg.bas - 2, seg.son + 2)) item = cand;
        }
        if (item) {
          item.busy.push([seg.bas - 2, seg.son + 2]);
          role = { mode, item };
        } else if (mode.startsWith("work:")) {
          role = { mode };
        } else if (mode === "seat:kahvehane") {
          mode = "inside:kahvehane"; // dışarıda boş masa yok: içeride oturur
          role = { mode };
        } else if (q.act) {
          // Etkinliğin yeri dolu: o yerde sohbet grubuna katılır (yoksa çevresinde dolaşır).
          const yer = this.override[i].get(k);
          mode = this.groupPools[yer]?.length ? "group:" + yer : yer === "sinema" ? "group:plaj" : "stroll";
          role = { mode };
        } else {
          mode = "group:" + (mode.startsWith("seat:") ? mode.slice(5).replace("kafe", "meydan").replace("kahvehane", "meydan") : seg.yer.replace("hobi:", ""));
          role = { mode };
        }
      }
      if (mode.startsWith("group:")) {
        const key = mode.slice(6);
        const groups = this.groupPools[key];
        if (groups?.length) {
          let g0 = roll(s, "grup", this.day + k) % groups.length;
          // Arkadaşının grubu varsa önce ona katılmayı dener.
          const f = this.meet?.[i] >= 0 ? this.meet[i] : this.stories?.friend[i] ?? -1;
          const fRole = f >= 0 ? this.roles[f]?.find((r, kk) => r?.groupRef && r.mode === mode && this.plans[f][kk].bas < seg.son && this.plans[f][kk].son > seg.bas) : null;
          if (fRole) g0 = groups.indexOf(fRole.groupRef);
          for (let n = 0; n < groups.length && !role.group; n++) {
            const g = groups[(g0 + n) % groups.length];
            const slot = g.slots.findIndex((busy) => free(busy, seg.bas - 1, seg.son + 1));
            if (slot >= 0) {
              g.slots[slot].push([seg.bas - 1, seg.son + 1]);
              const a = (slot / g.cap) * Math.PI * 2 + (g.x * 0.37 + g.z * 0.11);
              const r = 0.5 + 0.13 * g.cap;
              const [x, z] = this.world.nearestWalkable(g.x + Math.cos(a) * r, g.z + Math.sin(a) * r, 2);
              role.group = { x, z, heading: Math.atan2(g.x - x, g.z - z) };
              role.groupRef = g;
            }
          }
        }
      }
      if (q.mode === "football") role = { mode: "football", match: q.match, num: q.num };
      if (q.act) role.act = q.act;
      this.roles[i][k] = role;
    }
  }

  /** Günün maç saatleri: her akşam 19:30, hafta sonu ayrıca 15:00. */
  _matchWindows(day) {
    if (!this.world.pitch) return []; // futbol sahası henüz yok
    const wd = (day + 3) % 7;
    const out = [{ start: 1170, end: 1260 }];
    if (wd >= 5 || isHoliday(day)) out.unshift({ start: 900, end: 1005 });
    return out;
  }

  /** Maç anı: top ve 23 kişinin (iki takım + hakem) konumu; maç kimliği ve dakikaya göre. */
  footballState(match, minute) {
    const key = match.id * 100000 + Math.round(minute * 60 * 4);
    if (this._fbKey === key) return this._fb;
    const P = this.world.pitch;
    const t = Math.max(0, (minute - match.start) * 60);
    const ph = (n) => ((match.id * 7919 + n * 104729) % 1000) / 159;
    const halfL = (P.x1 - P.x0) / 2 - 2, halfW = (P.z1 - P.z0) / 2 - 2;
    const ballAt = (tt) => [
      P.cx + halfL * (0.78 * Math.sin(tt * 0.045 + ph(1)) + 0.18 * Math.sin(tt * 0.19 + ph(2))),
      P.cz + halfW * (0.7 * Math.sin(tt * 0.061 + ph(3)) + 0.22 * Math.sin(tt * 0.27 + ph(4))),
    ];
    const [bx, bz] = ballAt(t);
    const live = minute >= match.start && minute <= match.end;
    // 4-4-2 dizilişi (kendi yarısında), topa doğru kayar; en yakın ikisi topa koşar.
    const base = [[-0.95, 0], [-0.62, -0.6], [-0.62, -0.2], [-0.62, 0.2], [-0.62, 0.6], [-0.3, -0.65], [-0.3, -0.22], [-0.3, 0.22], [-0.3, 0.65], [-0.05, -0.25], [-0.05, 0.25]];
    const players = [];
    for (let team = 0; team < 2; team++) {
      const dir = team ? -1 : 1;
      const list = base.map(([fx, fz], n) => {
        let x = P.cx + dir * fx * halfL, z = P.cz + fz * halfW;
        if (n === 0) z = P.cz + (bz - P.cz) * 0.3;
        else { x += (bx - P.cx) * 0.45; z += (bz - P.cz) * 0.3; }
        return { x, z, n };
      });
      const chase = list.slice(1).map((q) => [Math.hypot(q.x - bx, q.z - bz), q.n]).sort((a, b) => a[0] - b[0]).slice(0, 2).map((c) => c[1]);
      for (const q of list) {
        if (live && chase.includes(q.n)) {
          const w = q.n === chase[0] ? 0.92 : 0.6;
          q.x += (bx - 1.2 * dir - q.x) * w; q.z += (bz + (q.n % 2 ? 1 : -1) * 0.8 - q.z) * w;
        }
        players.push({ x: q.x + Math.sin(t * 0.3 + q.n) * 0.6, z: q.z + Math.cos(t * 0.27 + q.n) * 0.6, team, keeper: q.n === 0 });
      }
    }
    players.push({ x: bx - 8, z: bz + 6, team: 2 }); // hakem
    this._fb = { ball: [bx, bz, live ? 0.11 + Math.abs(Math.sin(t * 2.3)) * 0.5 : 0.11], players, live, t };
    this._fbKey = key;
    return this._fb;
  }

  setDay(day) {
    if (day === this.day) return;
    this.day = day;
    this.plans = this.residents.map((r) => dayPlan(r, day));
    // Evden çalışanlar bugün mesaide mi (ev etkinliği "çalışma" olur).
    this.homeWork = this.residents.map((r, i) => this.works[i].job === "uzaktan" && worksOn(r, day));
    this.dogs = this.residents.map((r) => pet(r, day) === "Köpek");
    this.travelCache.fill(null);
    this.tripStore = this.residents.map(() => new Map());
    if (this.traffic) { this.traffic.busRequests = new Map(); this.traffic.stopRiders = new Map(); } // yolculuklar yeniden kurulurken duraklar yeniden bildirilir
    if (this.traffic) {
      // Günlük park kayıtları sıfırlanır; evlerin önündeki sabit yerler korunur.
      this.traffic.resetBookings();
      this.homeSlot.forEach((slot) => { if (slot != null) this.traffic.slots[slot].busy.push([-1, 1e9]); });
    }
    this._schedule();
    this._bookCars();
  }

  /** Plan parçası k'nin başındaki ya da sonundaki konum (yolculuk uçları için). */
  _endpoint(i, k, atEnd) {
    const seg = this.plans[i][k];
    if (!seg) return this.homes[i].door;
    if (seg.ne === "ev" || seg.ne === "uyku" || seg.ne === "yol") return this.homes[i].door; // (yol: olmamalı)
    if (seg.ne === "is" && !this.works[i].loc.outdoor) return this.works[i].loc.door;
    if (this.roles[i]?.[k]?.mode?.startsWith("inside:")) return this._insideDoor(this.roles[i][k].mode.slice(7)) ?? this.homes[i].door;
    const p = this._tmp;
    p.height = this.colors[i].height;
    resetPose(p);
    if (!this._placeState(i, k, atEnd ? seg.son - 0.001 : seg.bas, 0, p)) {
      // O yerde görünmüyor (ör. ambarın içinde çalışıyor): yolculuk iç kapıda biter.
      const loc = seg.ne === "is" ? this.works[i].loc : null;
      return loc?.innerDoor ?? loc?.door ?? this.homes[i].door;
    }
    return [p.x, p.z];
  }

  /** İçeride geçen etkinliğin kapısı (kahvehane, market, fırın, cami). */
  _insideDoor(kind) {
    if (kind === "kahvehane") return this.world.places.kahvehane?.anchors[0];
    return this.world.workplaces[kind]?.find(Boolean)?.door;
  }

  /** Bir sonraki yolculuğun başladığı dakika (park kaydı bu saate kadar). */
  _nextTravel(i, k) {
    const plan = this.plans[i];
    for (let j = k + 1; j < plan.length; j++) if (plan[j].ne === "yol") return plan[j].bas;
    return 1440;
  }

  /**
   * Gün başı: araba sahiplerinin hangi yolculukta arabayı kullanacağı ve nereye park edeceği, saat
   * sırasıyla ayrılır (herkes için aynı sonuç). Uzak yolculuklarda araba kullanılır; araba evden uzakta
   * kaldıysa eve dönüşte mutlaka onunla dönülür.
   */
  _bookCars() {
    this.carPlan = this.residents.map(() => null);
    if (!this.traffic) return;
    const reqs = [];
    for (let i = 0; i < this.n; i++) {
      if (!this.hasCar[i]) continue;
      this.plans[i].forEach((seg, k) => { if (seg.ne === "yol") reqs.push({ i, k, seg }); });
    }
    reqs.sort((a, b) => a.seg.bas - b.seg.bas || a.i - b.i);
    const cur = this.homeSlot.slice();
    for (const { i, k, seg } of reqs) {
      if (cur[i] == null) continue;
      const A = this._endpoint(i, k - 1, true), B = this._endpoint(i, k + 1, false);
      // Arabası olan, birkaç yüz metreden uzak yere çoğunlukla arabasıyla gider.
      const dist = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const far = dist > 480 || (dist > 240 && roll(this.residents[i].seed, "arabaTercih", this.day * 16 + k) % 100 < 80);
      const fetch = seg.nereye === "ev" && cur[i] !== this.homeSlot[i];
      if (!far && !fetch) continue;
      const toSlot = seg.nereye === "ev" ? this.homeSlot[i] : this.traffic.takeSlot(B[0], B[1], seg.son - 1, this._nextTravel(i, k) + 1, 260);
      if (toSlot == null || toSlot === cur[i]) continue;
      (this.carPlan[i] ??= new Map()).set(k, { fromSlot: cur[i], toSlot });
      cur[i] = toSlot;
    }
  }

  /** Arabanın plan parçası k başındaki park yeri. */
  carSlotBefore(i, k) {
    let slot = this.homeSlot[i];
    for (const [j, cp] of this.carPlan?.[i] ?? []) if (j < k) slot = cp.toSlot;
    return slot;
  }

  /**
   * Tarla işçisinin duraklı rotası (fields.js çizimiyle aynı ızgara): zeytinde bir ağaç sırası boyunca ağaçların
   * yanı, bağda iki asma sırası arasındaki yol, sebzede iki öbek sırası arası, buğdayda tarla kenarı. Gidiş ve
   * dönüş tek döngü. Döner: {pts: [[x, z, bakışX, bakışZ]], speed, dwell, act}.
   */
  _fieldWork(f, s) {
    const key = `${f.x0},${f.z0},${s % 97}`;
    const cache = (this._fieldJobs ??= new Map());
    if (cache.has(key)) return cache.get(key);
    const pts = [];
    let job;
    if (f.ekin === "zeytin") {
      const rows = Math.max(1, Math.floor((f.z1 - f.z0 - 6) / 7) + 1), z = f.z0 + 4 + 7 * (s % rows);
      for (let x = f.x0 + 4; x < f.x1 - 2; x += 7) pts.push([x, z - 1.3, x, z]);
      job = { speed: 0.9, dwell: 16, act: "silk" };
    } else if (f.ekin === "bag") {
      const rows = Math.max(1, Math.floor((f.z1 - f.z0 - 3) / 2.6)), z = f.z0 + 2 + 2.6 * (s % rows) + 1.3;
      for (let x = f.x0 + 3; x < f.x1 - 2; x += 3.5) pts.push([x, z, x, z - 1.3 * (pts.length % 2 ? 1 : -1)]);
      job = { speed: 0.8, dwell: 8, act: "kes" };
    } else if (f.ekin === "sebze") {
      const rows = Math.max(1, Math.floor((f.z1 - f.z0 - 2.5) / 1.6)), z = f.z0 + 1.5 + 1.6 * (s % rows) + 0.8;
      for (let x = f.x0 + 1.8; x < f.x1 - 1; x += 2.4) pts.push([x, z, x, z - 0.8]);
      job = { speed: 0.7, dwell: 7, act: "topla" };
    } else {
      const z = (s % 2 ? f.z0 - 0.8 : f.z1 + 0.8);
      for (let x = f.x0 + 4; x < f.x1 - 2; x += 9) pts.push([x, z, x, (f.z0 + f.z1) / 2]);
      job = { speed: 1.0, dwell: 5, act: "yokla" };
    }
    // Gidiş ve dönüş: sıranın sonundan geri gelir (dönüşte de durur).
    job.pts = [...pts, ...pts.slice(1, -1).reverse()];
    cache.set(key, job);
    return job;
  }

  /** Yaya rotası (kaldırımlar ve geçitler); kişiye özgü küçük yan kayma ile. */
  _walkRoute(i, A, B, k) {
    const r = this.nav.route(A, B);
    const s = this.residents[i].seed;
    // Herkes yürüdüğü yönün sağından yürür (0,3–0,8 m, kişiye göre): karşıdan gelenle yan yana geçer, içinden
    // geçmez. Köşeler kavisle dönülür.
    const off = 0.3 + frac(roll(s, "serit")) * 0.5;
    const pts = roundCorners(offsetPath(r.pts, off), 1.2);
    const lens = lengths(pts);
    const L = lens[lens.length - 1];
    const base = lengths(r.pts).at(-1) || 1;
    return { pts, lens, L, crossings: r.crossings.map((c) => ({ ...c, d: (c.d * L) / base })) };
  }

  /**
   * Yürüyüş zaman çizelgesi: kişinin kendi hızında; ışıklı geçitlerde araçlar kırmızıya dönene kadar
   * bekler. start verilirse o dakikada çıkar; end verilirse o dakikada varacak şekilde geriye doğru kurulur.
   */
  _walkLeg(i, route, { start = null, end = null }) {
    const v = this.speeds[i];
    const build = (t0) => {
      let t = t0 * 60, d = 0;
      const segs = [];
      for (const c of route.crossings) {
        if (c.d > d) { const dt = (c.d - d) / v; segs.push({ t0: t, t1: t + dt, d0: d, d1: c.d }); t += dt; d = c.d; }
        if (c.signal) {
          const w = pedWait(c.node, c.group, t, c.len / v + 1);
          if (w > 0) { segs.push({ t0: t, t1: t + w, d0: d, d1: d, cross: true }); t += w; }
        } else {
          // Işıksız geçit: kaldırım kenarında bir an durur, sağına soluna bakar.
          const w = 1.2 + (roll(this.residents[i].seed, "bak", Math.round(c.d)) % 10) * 0.12;
          segs.push({ t0: t, t1: t + w, d0: d, d1: d, cross: true, look: true }); t += w;
        }
      }
      if (route.L > d) { const dt = (route.L - d) / v; segs.push({ t0: t, t1: t + dt, d0: d, d1: route.L }); t += dt; }
      return { segs, t1: t / 60 };
    };
    if (start != null) {
      const b = build(start);
      return { kind: "walk", ...route, segs: b.segs, t0: start, t1: b.t1 };
    }
    let t0 = end - (route.L / v + 15 * route.crossings.filter((c) => c.signal).length + 2 * route.crossings.filter((c) => !c.signal).length) / 60;
    let b = build(t0);
    for (let it = 0; it < 4 && Math.abs(b.t1 - end) > 0.02; it++) { t0 -= b.t1 - end; b = build(t0); }
    return { kind: "walk", ...route, segs: b.segs, t0, t1: b.t1 };
  }

  /** Yolculuğu kurar: yürüyüş, araba, otobüs ya da taksi. */
  _trip(i, seg, k) {
    const store = this.tripStore[i];
    if (store.has(k)) return store.get(k);
    // Anakaradan dönenler vapur iskeleye yanaştığında iner: yolculuk o an başlar.
    const ferry = this.works[i].wp.kind === "anakara" || this.works[i].wp.kind === "zeplin"; // zeplin üssü anakarada
    if (ferry && seg.nereden === "is") {
      // Yolcular vapurdan birkaç dakika içinde sırayla iner (hepsi aynı anda aynı noktadan çıkmaz).
      const arr = nextArrival(seg.bas) + (this.residents[i].seed % 40) / 10;
      if (arr < seg.son - 4) seg = { ...seg, bas: arr };
    }
    const A = this._endpoint(i, k - 1, true), B = this._endpoint(i, k + 1, false);
    const dist = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const s = this.residents[i].seed;
    let trip = null;
    const cp = this.carPlan?.[i]?.get(k);
    if (cp) trip = this._carTrip(i, seg, k, A, B, cp);
    else if (this.traffic && this.world.vehicles && (dist > 520 || (dist > 300 && roll(s, "otobusTercih", this.day * 16 + k) % 100 < 70))) {
      // Arabası olmayan uzak yola otobüsle (bulamazsa kimi taksiyle) gider; kısa yolu yürür.
      trip = this._busTrip(i, seg, k, A, B);
      if (!trip && dist > 450 && roll(s, "taksi", this.day * 16 + k) % 100 < 45) trip = this._taxiTrip(i, seg, k, A, B);
    }
    trip ??= this._walkTrip(i, seg, k, A, B);
    trip.seg = k;
    trip.toFerry = ferry && seg.nereye === "is";
    trip.fromWork = seg.nereden === "is";
    trip.doorA = seg.nereden === "ev" ? this.homes[i].building : seg.nereden === "is" && !this.works[i].loc.outdoor ? this.works[i].loc.building : null;
    trip.doorB = seg.nereye === "ev" ? this.homes[i].building : seg.nereye === "is" && !this.works[i].loc.outdoor ? this.works[i].loc.building : null;
    // Binası olmayan kapalı iş yeri (vapurla anakara): orada beklerken görünmez (vapurdadır).
    const away = !this.works[i].loc.outdoor && !this.works[i].loc.building;
    trip.hideAtA = !!trip.doorA || seg.nereden === "ev" || (seg.nereden === "is" && away);
    trip.hideAtB = !!trip.doorB || seg.nereye === "ev" || (seg.nereye === "is" && away);
    // Başta ve sonda kalan süre: önceki yerde oyalanır / vardığı yerde beklemeye başlar.
    const first = trip.legs[0], last = trip.legs[trip.legs.length - 1];
    const segBas = this.plans[i][k].bas; // vapur için kaydırılmış olabilir: önceki yerde bekleme gerçek başlangıçtan
    if (first.t0 > segBas + 0.01) trip.legs.unshift({ kind: "before", t0: segBas, t1: first.t0 });
    if (last.t1 < seg.son - 0.01) trip.legs.push({ kind: "after", t0: last.t1, t1: seg.son });
    store.set(k, trip);
    return trip;
  }

  _walkTrip(i, seg, k, A, B) {
    const route = this._walkRoute(i, A, B, k);
    let leg = this._walkLeg(i, route, { end: seg.son });
    if (leg.t0 < seg.bas) leg = this._walkLeg(i, route, { start: seg.bas });
    return { mode: "yaya", legs: [leg] };
  }

  /** Park yerinin kaldırım tarafındaki biniş noktası. */
  _curbSide(slot) {
    const sl = this.traffic.slots[slot];
    const h = sl.heading;
    // Arabanın sağı (yerel -x): (-cos h, sin h).
    return [sl.x - Math.cos(h) * 1.5, sl.z + Math.sin(h) * 1.5];
  }

  /** Kendi arabası: kapıdan arabaya yürür, biner, sürer, park eder, iner, yürür. */
  _carTrip(i, seg, k, A, B, cp) {
    const T = this.traffic;
    const route = T.routeSlots(cp.fromSlot, cp.toSlot);
    if (!route) return null;
    const pa = this._curbSide(cp.fromSlot), pb = this._curbSide(cp.toSlot);
    const drive = route.len / 8 / 60 + 0.5;
    let walk2 = this._walkLeg(i, this._walkRoute(i, pb, B, k + 1), { end: seg.son });
    let d1 = walk2.t0 - 0.25, d0 = d1 - drive;
    const r1 = this._walkRoute(i, A, pa, k);
    let walk1 = this._walkLeg(i, r1, { end: d0 - 0.3 });
    if (walk1.t0 < seg.bas) {
      walk1 = this._walkLeg(i, r1, { start: seg.bas });
      d0 = walk1.t1 + 0.3; d1 = d0 + drive;
      walk2 = this._walkLeg(i, this._walkRoute(i, pb, B, k + 1), { start: d1 + 0.25 });
    }
    const sl = T.slots[cp.fromSlot], sl2 = T.slots[cp.toSlot];
    const key = `car:${i}:${this.day}:${k}`;
    return {
      mode: "araba", color: this.carColor[i], carTo: cp.toSlot,
      legs: [
        walk1,
        { kind: "wait", t0: walk1.t1, t1: d0, x: pa[0], z: pa[1], heading: Math.atan2(sl.x - pa[0], sl.z - pa[1]) },
        { kind: "drive", t0: d0, t1: d1, route, key, exit: pb, exitHeading: Math.atan2(pb[0] - sl2.x, pb[1] - sl2.z) },
        { kind: "wait", t0: d1, t1: walk2.t0, x: pb[0], z: pb[1], heading: Math.atan2(pb[0] - sl2.x, pb[1] - sl2.z) },
        walk2,
      ],
    };
  }

  /** Yol kenarı: taşıt yolunda durma noktası ve kaldırımda bekleme noktası (P'ye bakan yanda). */
  _curbPoint(P) {
    const T = this.traffic;
    const l = T.locate(P, 45, ["cadde", "sokak", "koy"]);
    if (!l) return null;
    const e = T.edges[l.edge];
    const c = pointAt(e.center, e.cumC, l.along);
    const r = [-Math.cos(c.heading), Math.sin(c.heading)];
    const side = (P[0] - c.x) * r[0] + (P[1] - c.z) * r[1] >= 0 ? 1 : -1;
    const hc = e.road.carriage / 2;
    return { car: [c.x + r[0] * side * (hc - 1.1), c.z + r[1] * side * (hc - 1.1)], walk: [c.x + r[0] * side * (hc + 0.8), c.z + r[1] * side * (hc + 0.8)], heading: c.heading + (side > 0 ? 0 : Math.PI) };
  }

  _taxiTrip(i, seg, k, A, B) {
    const T = this.traffic;
    const pa = this._curbPoint(A), pb = this._curbPoint(B);
    if (!pa || !pb) return null;
    const route = T.route(pa.car, pb.car);
    if (!route) return null;
    const drive = route.len / 8 / 60 + 0.5;
    let walk2 = this._walkLeg(i, this._walkRoute(i, pb.walk, B, k + 1), { end: seg.son });
    let d1 = walk2.t0 - 0.2, d0 = d1 - drive;
    const r1 = this._walkRoute(i, A, pa.walk, k);
    let walk1 = this._walkLeg(i, r1, { end: d0 - 1.2 });
    if (walk1.t0 < seg.bas) {
      walk1 = this._walkLeg(i, r1, { start: seg.bas });
      d0 = walk1.t1 + 1.2; d1 = d0 + drive;
      walk2 = this._walkLeg(i, this._walkRoute(i, pb.walk, B, k + 1), { start: d1 + 0.2 });
    }
    const key = `taxi:${i}:${this.day}:${k}`;
    const face = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]);
    return {
      mode: "taksi",
      legs: [
        walk1,
        { kind: "wait", t0: walk1.t1, t1: d0, x: pa.walk[0], z: pa.walk[1], heading: face(pa.walk, pa.car), taxi: { at: pa.car, heading: pa.heading } },
        { kind: "drive", t0: d0, t1: d1, route, key, taxi: true, exit: pb.walk, exitHeading: face(pb.car, pb.walk) },
        walk2,
      ],
    };
  }

  /** Otobüs: durağa yürür, gelen otobüse biner, iner, yürür. Randevuya yetişen en geç sefer seçilir. */
  _busTrip(i, seg, k, A, B) {
    const T = this.traffic;
    let best = null;
    T.lines.forEach((line, li) => {
      const sa = T.stopNearOnLine(li, A[0], A[1]), sb = T.stopNearOnLine(li, B[0], B[1]);
      if (!sa || !sb || sb.stop <= sa.stop || sa.d > 480 || sb.d > 480) return;
      if (!best || sa.d + sb.d < best.sa.d + best.sb.d) best = { li, sa, sb, line };
    });
    if (!best) return null;
    const { line, li, sa, sb } = best;
    const stA = line.stops[sa.stop], stB = line.stops[sb.stop];
    const r1 = this._walkRoute(i, A, stA.wait, k), r2 = this._walkRoute(i, stB.curb, B, k + 1);
    const w1 = this._walkLeg(i, r1, { start: seg.bas });
    const ride = T.rideMinutes(line, sa.stop, sb.stop);
    // Yetişilen seferlerden biri seçilir: herkes son sefere yığılmasın diye son üç seferden kişiye göre
    // biri (aynı sakin için herkes aynı seferi görür; seçim yolculukların kurulma sırasına bağlı değil).
    const viable = [];
    for (let nb = T.nextBus(line, sa.stop, w1.t1 + 0.3); nb; nb = T.nextBus(line, sa.stop, nb.t + 0.01)) {
      const w2 = this._walkLeg(i, r2, { start: nb.t + ride + 0.45 });
      if (w2.t1 > seg.son + 0.5) break;
      viable.push({ nb, w2 });
      if (nb.t > seg.son) break;
    }
    if (!viable.length) return null;
    const pickBack = roll(this.residents[i].seed, "sefer", this.day * 16 + k) % Math.min(3, viable.length);
    const chosen = viable[viable.length - 1 - pickBack];
    const { nb, w2 } = chosen;
    // Otobüs yalnızca binen ya da inen olan duraklarda durur: binişi ve inişi sefere bildir.
    const queue = T.requestStop(li, nb.dep, sa.stop);
    T.requestStop(li, nb.dep, sb.stop);
    let walk1 = this._walkLeg(i, r1, { end: nb.t - 1.0 });
    if (walk1.t0 < seg.bas) walk1 = w1;
    const wait = stA.wait;
    const heading = Math.atan2(stA.x - wait[0], stA.z - wait[1]);
    return {
      mode: "otobus", line: li,
      legs: [
        walk1,
        { kind: "wait", t0: walk1.t1, t1: nb.t + 0.1, x: wait[0], z: wait[1], heading, queue },
        { kind: "bus", t0: nb.t + 0.1, t1: nb.t + ride + 0.45, line: li, dep: nb.dep, a: sa.stop, b: sb.stop, exit: stB.curb },
        w2,
      ],
    };
  }

  /** Sakinin şu an bulunduğu nokta: dışarıdaysa kendisi, içerideyse bulunduğu binanın kapısı. */
  focusPoint(i) {
    if (this.visible[i]) return [this.positions[i * 3], this.positions[i * 3 + 2]];
    const seg = this.activities[i];
    if (!seg || seg.ne === "uyku" || seg.ne === "ev" || seg.ne === "yol") return this.homes[i].door;
    if (seg.ne === "is") return this.works[i].loc.door;
    return this.homes[i].door;
  }

  /** Bir yerde (plan parçası k) verilen dakikadaki konum ve duruş. Görünmüyorsa false. */
  _placeState(i, k, minute, t, p, bounds = null) {
    const w = this.world;
    const seg = this.plans[i][k];
    const role = this.roles[i]?.[k] ?? { mode: "group:meydan" };
    if (role.mode.startsWith("inside:")) return false; // kahvehanenin içinde: sokakta görünmez
    const s = this.residents[i].seed;
    const kk = p.height / 1.75;
    const ph = frac(s) * 6.283;
    const sec = minute * 60;
    const at = this._at;
    const stand = (x, z, heading) => { p.x = x; p.z = z; p.heading = heading; p.y = w.groundY(x, z); };
    const pingPong = (pts, speed, offset = 0) => {
      const lens = lengths(pts);
      const L = lens[lens.length - 1];
      let d = (sec * speed + offset) % (2 * L);
      const back = d > L;
      if (back) d = 2 * L - d;
      along(pts, lens, d, at);
      return { d, back, heading: back ? at.heading + Math.PI : at.heading };
    };
    const it = role.item;

    if (role.mode.startsWith("work:")) {
      const loc = this.works[i].loc;
      if (!it && this.works[i].job !== "fener_bekcisi") return false; // görev noktası yok: görünmeyen yerde çalışıyor
      const [ax, az] = it ? [it.x, it.z] : loc.anchor;
      switch (this.works[i].job) {
        case "liman_iscisi": {
          // Yük limanında görev yeri (post) olan çalışır; görevi olmayanlar ambarın içindedir.
          const PT = w.port;
          if (!PT || !it?.post) return false;
          const M = portMotion(PT, t);
          const seat = (q, look = 0) => {
            p.x = q.x; p.z = q.z; p.heading = q.heading; p.y = q.y;
            sitPose(p, q.y, kk);
            p.shL = p.shR = 0.95; p.elL = p.elR = 0.7; p.lean = 0.1; p.headYaw = look;
          };
          switch (it.post) {
            case "vinc": {
              // Kabinde, aşağıya (kıskaca) bakarak kollarla kumanda eder.
              seat(craneSeat(PT, M));
              p.headPitch = 0.55; p.shR = 0.7 + 0.15 * Math.sin(t * 1.3); p.elR = 1.1;
              return true;
            }
            case "istif": {
              const q = stackerSeat(PT, M);
              seat(q, M.stacker.y > PT.top + 4 ? 0 : 0.1 * Math.sin(t * 0.5));
              return true;
            }
            case "forklift": {
              const q = forkliftSeat(PT, M);
              seat(q, q.rev ? 2.2 : 0);
              return true;
            }
            case "isaretci": {
              // Vinç hareket ederken kollarıyla yön gösterir; yeleği turuncu, gözü kıskaçta.
              stand(it.x, it.z, Math.atan2(PT.crane.x - it.x, M.crane.z - it.z));
              const busy = M.crane.y < PT.top + 17;
              if (busy) { p.shR = 1.6 + 0.4 * Math.sin(t * 2.6); p.elR = 0.3; p.shL = 0.6; p.elL = 0.4; p.headPitch = -0.35; }
              else idleGesture(p, t, ph, false);
              return true;
            }
            case "bagci": {
              // Geminin yan geçidinde bölmeler arasında yürür, ara ara eğilip bağları yoklar.
              const side = it.k % 2 ? 1 : -1;
              const lz = PT.ship.z - side * 5.5;
              const x0 = PT.crane.x - 26 + it.k * 3, x1 = PT.crane.x + 26 - it.k * 2;
              const r = pingPong([[x0, lz], [x1, lz]], 0.45, ph * 30);
              const stop = Math.sin(sec * 0.08 + ph * 3) > 0.7;
              p.x = at.x; p.z = at.z; p.heading = stop ? (side > 0 ? 0 : Math.PI) : r.heading; p.y = shipWalkY(PT, M);
              if (stop) { p.lean = 0.6; p.shL = p.shR = 1.0; p.elL = p.elR = 0.6; p.kneeL = p.kneeR = 0.3; }
              else walkPose(p, r.d / (0.72 * kk) * Math.PI);
              return true;
            }
            case "palamar": {
              stand(it.x, it.z, 0);
              idleGesture(p, t, ph, (s >> 2) % 2 === 0);
              return true;
            }
            case "kontrol": {
              // İstif sahasının önünde tabletiyle konteyner numaralarını kontrol eder.
              const z = PT.stack.z1 + 2.2 + it.k * 1.4;
              const r = pingPong([[PT.stack.x0, z], [PT.stack.x1, z]], 0.35, ph * 40);
              const stop = Math.sin(sec * 0.11 + ph * 5) > 0.5;
              stand(at.x, at.z, stop ? Math.PI : r.heading);
              if (stop) { phonePose(p); p.shL = 0.6; p.elL = 1.6; p.props = ["telefon"]; }
              else walkPose(p, r.d / (0.72 * kk) * Math.PI);
              return true;
            }
            case "bekci": {
              const [bx, bz] = PT.booth;
              p.x = bx - 0.5; p.z = bz - 0.25; p.heading = Math.PI; p.y = PT.top;
              sitPose(p, PT.top + 0.5, kk);
              p.headYaw = 0.4 * Math.sin(t * 0.2 + ph);
              return true;
            }
            case "ambar": {
              // Ambar kapısı ile palet yığını arasında koli taşır.
              const wz = PT.warehouse.z + PT.warehouse.d / 2 + 0.8;
              const r = pingPong([[56 + it.k * 2, wz], [67.5, wz + 2.2 + it.k * 0.6]], 0.8, ph * 25 + it.k * 7);
              stand(at.x, at.z, r.heading);
              walkPose(p, r.d / (0.72 * kk) * Math.PI);
              if (!r.back) { p.props = ["kasa"]; p.shL = p.shR = 0.9; p.elL = p.elR = 1.1; }
              return true;
            }
            case "sofor": {
              stand(it.x, it.z, it.heading);
              idleGesture(p, t, ph, false);
              phonePose(p); p.props = ["telefon"];
              return true;
            }
            case "mola": {
              p.x = it.x; p.z = it.z; p.heading = it.heading; p.y = PT.top;
              sitPose(p, PT.top + 0.49, kk);
              const sip = Math.max(0, Math.sin(t * 0.35 + ph)) ** 10;
              idleGesture(p, t, ph, sip < 0.1);
              p.shR = Math.max(p.shR, 0.5 + 0.9 * sip); p.elR = Math.max(p.elR, 1.2 + 1.0 * sip);
              return true;
            }
          }
          return false;
        }
        case "zeytinci": {
          // Çiftliğin dört parselinden birinde (kişiye göre), parselin ekinine göre iş: zeytinde ağaçtan ağaca
          // yürüyüp dalları silker, bağda iki asma sırası arasında durup üzüm keser, sebzede çömelip toplar,
          // buğdayda kenar boyunca durup başakları yoklar. Yürüyüş durakta yavaşlar, sonra devam eder.
          const farm = w.plazas.filter((q) => q.kind === "tarla" && Math.hypot((q.x0 + q.x1) / 2 - ax, (q.z0 + q.z1) / 2 - az) < 110);
          const f = farm.length ? farm[s % farm.length] : null;
          if (f) {
            const job = this._fieldWork(f, s);
            const st = stopGo(job.pts, job.speed, job.dwell, sec + ph * 61, this._sg ??= {});
            stand(st.x, st.z, st.heading);
            if (st.moving) { walkPose(p, (st.dist / (0.72 * kk)) * Math.PI); return true; }
            const u = st.stopT;
            if (job.act === "silk") { // zeytin: kollar dallara, silkeleme
              const sh = Math.sin(t * 7 + ph);
              p.shL = p.shR = 2.6 + 0.12 * sh; p.elL = p.elR = 0.35; p.headPitch = -0.5; p.lean = -0.05;
            } else if (job.act === "kes") { // bağ: göğüs hizasında budama makası
              p.lean = 0.25; p.shR = 0.95; p.elR = 1.1 + 0.25 * Math.max(0, Math.sin(t * 3 + ph)); p.shL = 0.8; p.elL = 1.2; p.headPitch = 0.3;
            } else if (job.act === "topla") { // sebze: çömelip toplar
              const b = smooth(clamp(u / 1.2, 0, 1));
              p.lean = 0.9 * b; p.hipL = p.hipR = 0.6 * b; p.kneeL = p.kneeR = 1.1 * b; p.drop = 0.32 * b;
              p.shL = p.shR = 1.1 * b; p.elL = p.elR = 0.3 + 0.3 * Math.sin(t * 2 + ph) * b;
            } else { // buğday: başakları yoklar
              p.lean = 0.35; p.shR = 0.8; p.elR = 0.5; p.headPitch = 0.5; idleGesture(p, t, ph, false);
            }
            return true;
          }
          // Parsel yoksa (eski düzen): sıra boyunca ağır ağır ilerleyip eğilerek toplar.
          const row = ((s % 7) - 3) * 2.4;
          const r = pingPong([[ax - 32, az + row], [ax + 32, az + row]], 0.06, ph * 50);
          stand(at.x, at.z, r.heading);
          return true;
        }
        case "bahcivan": {
          // Bahçıvan: sıra boyunca ağır ağır ilerleyip eğilerek çalışır.
          const row = ((s % 7) - 3) * 2.4;
          const r = pingPong([[ax - 32, az + row], [ax + 32, az + row]], 0.06, ph * 50);
          stand(at.x, at.z, r.heading);
          const bend = Math.max(0, Math.sin(t * 0.6 + ph));
          p.lean = 0.25 + 0.75 * bend; p.hipL = p.hipR = 0.3 * bend; p.kneeL = p.kneeR = 0.35 * bend;
          p.shL = p.shR = 0.6 + 0.6 * bend; p.elL = p.elR = 0.4;
          return true;
        }
        case "cankurtaran": {
          // Biri kulede gözcülük yapar; diğerleri kıyı boyunca devriye gezer, ara ara dürbünle bakar.
          const tower = w.features.find((f) => f.type === "cankurtaran");
          const idx = this.pools[role.mode]?.indexOf(it) ?? 0;
          if (tower && idx > 0) {
            const shore = w.places.plaj.anchors;
            const a = shore[(idx * 3) % shore.length], b = shore[(idx * 3 + 4) % shore.length];
            const r = pingPong([[a[0], a[1] + 3], [b[0], b[1] + 3]], 0.55, ph * 30);
            const look = Math.sin(sec * 0.07 + ph * 4) > 0.75;
            stand(at.x, at.z, look ? 0 : r.heading);
            if (look) { p.shL = p.shR = 1.3; p.elL = p.elR = 2.2; p.props = ["durbun"]; }
            else walkPose(p, r.d / (0.72 * kk) * Math.PI);
            return true;
          }
          if (tower) {
            stand(tower.x, tower.z, Math.PI * 0.05);
            p.y = w.groundY(tower.x, tower.z);
            sitPose(p, w.groundY(tower.x, tower.z) + 2.75, kk);
            p.headYaw = 0.7 * Math.sin(t * 0.15 + ph);
            return true;
          }
          break;
        }
        case "fener_bekcisi": {
          // Kapısının önünde durur, arada uçurum kenarındaki seyir noktasına yürüyüp denizi gözetler.
          const view = w.places.fener.spots[0];
          const door = w.fener.door;
          const cycle = (sec / 60 + ph * 10) % 40; // dakika
          if (cycle < 26) {
            stand(door[0], door[1], Math.atan2(view.x - door[0], view.z - door[1]));
            idleGesture(p, t, ph, false);
          } else if (cycle < 30 || cycle > 36) {
            const u = cycle < 30 ? (cycle - 26) / 4 : 1 - (cycle - 36) / 4;
            const x = door[0] + (view.x - door[0]) * u, z = door[1] + (view.z - door[1]) * u;
            stand(x, z, Math.atan2((view.x - door[0]) * (cycle < 30 ? 1 : -1), (view.z - door[1]) * (cycle < 30 ? 1 : -1)));
            walkPose(p, (u * Math.hypot(view.x - door[0], view.z - door[1])) / (0.72 * kk) * Math.PI);
          } else {
            stand(view.x, view.z, view.heading);
            p.shL = p.shR = 1.3; p.elL = p.elR = 2.2; p.headPitch = -0.05;
            p.props = ["durbun"];
          }
          return true;
        }
        case "balikci": {
          // Koyda görev yeri olanlar: ağ örer, kasa taşır, iskelede halat toplar, sandal boyar, çay içer.
          const K = w.koy;
          if (!K || !it?.post) return false; // denizde
          switch (it.post) {
            case "ag": case "cay": {
              p.x = it.x; p.z = it.z; p.heading = it.heading; p.y = w.groundY(it.x, it.z);
              sitPose(p, p.y + 0.45, kk);
              if (it.post === "ag") { const u = Math.sin(t * 2.4 + ph); p.shL = p.shR = 0.9; p.elL = 1.2 + 0.2 * u; p.elR = 1.2 - 0.2 * u; p.lean = 0.2; p.headPitch = 0.3; }
              else { const sip = Math.max(0, Math.sin(t * 0.35 + ph)) ** 10; idleGesture(p, t, ph, sip < 0.1); p.shR = Math.max(p.shR, 0.5 + 0.9 * sip); p.elR = Math.max(p.elR, 1.2 + 1.0 * sip); }
              return true;
            }
            case "kasa": {
              const hut = [K.racks[0][0] + 6 + it.k * 12, K.racks[0][1] - 4];
              const r = pingPong([[K.crates[0] + it.k * 0.8, K.crates[1] - 0.8], hut], 0.7, ph * 20 + it.k * 11);
              stand(at.x, at.z, r.heading);
              walkPose(p, r.d / (0.72 * kk) * Math.PI);
              if (!r.back) { p.props = ["kasa"]; p.shL = p.shR = 0.9; p.elL = p.elR = 1.1; }
              return true;
            }
            case "iskele": {
              stand(it.x, it.z, it.heading);
              p.drop = 0.38 * kk; p.hipL = p.hipR = 1.25; p.kneeL = p.kneeR = 2.0; p.lean = 0.35;
              p.shL = p.shR = 0.8 + 0.3 * Math.sin(t * 1.8 + ph); p.elL = p.elR = 0.9;
              return true;
            }
            default: {
              stand(it.x, it.z, it.heading);
              const u = Math.sin(t * 1.5 + ph);
              p.shR = 0.9 + 0.3 * u; p.elR = 0.6; p.shL = 0.5; p.lean = 0.35; p.headPitch = 0.3;
              return true;
            }
          }
        }
        case "gemi_ustasi": {
          // Tersanede görev yeri: iskelede, teknenin dibinde, kereste taşırken; yoksa atölyede.
          const S = w.tersane;
          if (!S || !it?.post) return false;
          switch (it.post) {
            case "iskele1": case "iskele2": {
              p.x = it.x; p.z = it.z; p.heading = it.heading; p.y = S.top + (it.level === 2 ? 2.8 : 1.4) + 0.03;
              const hit = Math.max(0, Math.sin(t * 2.2 + ph));
              if (s % 2) { p.shR = 1.0 + 1.0 * hit; p.elR = 0.4 + 0.8 * (1 - hit); p.shL = 0.8; p.elL = 0.7; }
              else { const u = Math.sin(t * 1.6 + ph); p.shL = p.shR = 1.2 + 0.25 * u; p.elL = p.elR = 0.5; p.twist = 0.1 * u; }
              p.lean = 0.12;
              return true;
            }
            case "boya": {
              stand(it.x, it.z, it.heading);
              const u = Math.sin(t * 1.4 + ph);
              p.shL = p.shR = 1.15 + 0.45 * u; p.elL = p.elR = 0.45; p.headPitch = -0.2;
              return true;
            }
            case "kaynak": {
              stand(it.x, it.z, it.heading);
              p.drop = 0.38 * kk; p.hipL = p.hipR = 1.25; p.kneeL = p.kneeR = 2.0; p.lean = 0.4;
              p.shL = p.shR = 1.0; p.elL = p.elR = 0.9 + 0.05 * Math.sin(t * 9 + ph); p.headPitch = 0.4;
              return true;
            }
            case "tasima": {
              const a = [S.timber[0] + 1.6 + it.k * 0.8, S.timber[1] + 3.5], b = [S.x0 + 0.8 + it.k * 0.6, S.boat.z - S.boat.len / 2 - 1.5];
              const r = pingPong([a, b], 0.75, ph * 20 + it.k * 9);
              stand(at.x, at.z, r.heading);
              walkPose(p, r.d / (0.72 * kk) * Math.PI);
              if (!r.back) { p.props = ["kasa"]; p.shL = p.shR = 0.9; p.elL = p.elR = 1.1; }
              return true;
            }
            case "vinc": {
              stand(it.x, it.z, it.heading);
              p.shR = 0.7; p.elR = 1.6; p.headPitch = -0.45;
              return true;
            }
            default: {
              stand(it.x, it.z, it.heading);
              idleGesture(p, t, ph, false);
              phonePose(p); p.props = ["telefon"];
              return true;
            }
          }
        }
      }
      stand(ax, az, it?.heading ?? ph);
      idleGesture(p, t, ph, true);
      return true;
    }

    // Oturanlar: bankta, kafede, kahvehanede. Yaklaşır, oturur; kalkar, gider.
    if (role.mode.startsWith("seat:") && it) {
      const since = (minute - (bounds?.start ?? seg.bas)) * 60, until = ((bounds?.end ?? seg.son) - minute) * 60;
      const u = smooth(clamp(Math.min(since, until) / 1.6, 0, 1));
      const fx = Math.sin(it.heading), fz = Math.cos(it.heading);
      const ax = it.x + fx * 0.55, az = it.z + fz * 0.55;
      p.x = ax + (it.x - ax) * u; p.z = az + (it.z - az) * u; p.heading = it.heading;
      const st = this._stand, si = this._sit;
      st.height = si.height = p.height;
      resetPose(st); st.y = w.groundY(ax, az);
      resetPose(si); sitPose(si, it.top, kk);
      blendPose(p, st, si, u);
      if (u >= 1 && it.sunbed) {
        // Şezlongda: çoğu sırtüstü uzanıp güneşlenir (ayakları deniz tarafında), kimi oturup kitap okur ya da
        // telefona bakar. Plaj kıyafeti: kısa kollu, şort.
        p.sleeves = false; p.shorts = true;
        if (roll(s, "sezlong", this.day) % 3) {
          resetPose(p);
          p.height = st.height; p.sleeves = false; p.shorts = true;
          p.x = it.x + fx * 0.95; p.z = it.z + fz * 0.95; p.heading = it.heading;
          p.y = it.top; p.lie = Math.PI / 2;
          p.shL = p.shR = 0.1; p.abL = p.abR = 0.2; p.elL = p.elR = 0.25; p.kneeL = 0.15;
          p.headYaw = 0.35 * Math.sin(t * 0.05 + ph);
        } else {
          const okur = roll(s, "okur") % 2;
          if (okur) { p.shL = p.shR = 0.7; p.elL = p.elR = 1.5; p.headPitch = 0.45; } else phonePose(p);
          p.props = [okur ? "kitap" : "telefon"];
        }
        return true;
      }
      if (u >= 1) {
        const hobbyId = seg.ne === "hobi" ? this.hobbies[i].id : null;
        if (hobbyId === "kitap") { p.shL = p.shR = 0.7; p.elL = p.elR = 1.5; p.headPitch = 0.45; p.props = ["kitap"]; }
        else if (hobbyId === "gitar") { p.shR = 0.5; p.elR = 1.3 + 0.25 * Math.sin(t * 6 + ph); p.shL = 0.8; p.abL = 0.3; p.elL = 1.6; p.headPitch = 0.25; p.props = ["gitar"]; }
        else if (it.table && seg.ne === "hobi") {
          const move = Math.max(0, Math.sin(t * 0.7 + ph)) ** 6;
          p.lean = 0.25; p.shL = 0.6; p.elL = 1.4; p.shR = 0.7 + 0.5 * move; p.elR = 1.3 - 0.6 * move; p.headPitch = 0.4;
        } else if (it.table) {
          const sip = Math.max(0, Math.sin(t * 0.35 + ph)) ** 10;
          idleGesture(p, t, ph, sip < 0.1 && roll(s, "konuskan") % 2 === 0);
          p.shR = Math.max(p.shR, 0.5 + 0.9 * sip); p.elR = Math.max(p.elR, 1.2 + 1.0 * sip); p.lean = 0.12;
        } else if (it.place === "sinema") {
          // Sinemada perdeye bakar; arada yanındakine eğilip bir şey söyler.
          p.headPitch = -0.12; p.shL = p.shR = 0.35; p.elL = p.elR = 0.9;
          if (Math.sin(t * 0.13 + ph) > 0.93) { p.headYaw = 0.6; p.lean = 0.1; }
        } else {
          idleGesture(p, t, ph, roll(s, "konuskan") % 2 === 0);
          p.shL = 0.35; p.elL = 0.9;
          if (roll(s, "telefoncu") % 4 === 0) { phonePose(p); p.props = ["telefon"]; }
        }
      } else {
        p.moving = since < 1.6 || until < 1.6;
      }
      return true;
    }

    if (role.mode === "football") {
      const m = role.match;
      const st = this.footballState(m, minute);
      const me = st.players[role.num] ?? st.players[0];
      const P = w.pitch;
      if (!st.live) {
        // Maçtan önce ve sonra: kenarda ısınır / sohbet eder.
        const bench = [P.x0 + 30 + role.num * 2.2, P.z1 + 2.2];
        stand(bench[0], bench[1], Math.PI);
        idleGesture(p, t, ph, true);
      } else {
        const prev = this.footballState(m, minute - 0.5 / 60);
        const pm = prev.players[role.num] ?? me;
        const speed = Math.hypot(me.x - pm.x, me.z - pm.z) / 0.5;
        stand(me.x, me.z, speed > 0.3 ? Math.atan2(me.x - pm.x, me.z - pm.z) : Math.atan2(st.ball[0] - me.x, st.ball[1] - me.z));
        if (speed > 0.3) walkPose(p, sec * (speed > 3 ? 2.6 : 1.6), speed > 3 ? 1 : 0);
        else idleGesture(p, t, ph, false);
        if (me.keeper && speed <= 0.3) { p.shL = p.shR = 0.5; p.abL = p.abR = 0.4; p.kneeL = p.kneeR = 0.35; p.hipL = p.hipR = 0.3; }
      }
      p.team = me.team;
      p.shorts = true; p.sleeves = false;
      return true;
    }

    switch (role.mode) {
      case "fish": {
        stand(it.x, it.z, it.heading);
        const cast = Math.max(0, Math.sin(t * 0.08 + ph)) ** 8;
        p.shR = 0.75 + 1.0 * cast; p.elR = 0.9 - 0.6 * cast; p.shL = 0.55; p.elL = 1.0;
        p.props = ["olta"];
        return true;
      }
      case "view": {
        stand(it.x, it.z, it.heading + 0.3 * Math.sin(t * 0.05 + ph));
        p.shR = 1.25; p.elR = 2.1; p.shL = 1.15; p.elL = 2.0; p.abL = -0.2;
        p.props = ["fotograf"];
        return true;
      }
      case "easel": {
        stand(it.x, it.z, it.heading);
        p.shR = 1.3 + 0.15 * Math.sin(t * 1.5 + ph); p.elR = 0.5; p.headPitch = 0.05;
        p.props = ["sovale"];
        return true;
      }
      case "kite": {
        stand(it.x, it.z, it.heading + 0.3 * Math.sin(t * 0.05 + ph));
        p.shL = p.shR = 1.7; p.elL = p.elR = 0.4; p.headPitch = -0.55;
        p.props = ["ucurtma"];
        return true;
      }
      case "yoga": {
        stand(it.x, it.z, it.heading);
        const pose = Math.floor((t / 20 + ph) % 3);
        if (pose === 0) { p.shL = p.shR = 3.0; p.elL = p.elR = 0; p.kneeR = 0.6; p.hipR = 0.9; p.abR = 0.5; }
        else if (pose === 1) { p.abL = p.abR = 1.5; p.hipL = 0.6; p.kneeL = 0.6; p.hipR = -0.4; p.headYaw = 1.2; }
        else { p.lean = 1.3; p.shL = p.shR = 2.6; }
        p.props = ["mat"];
        return true;
      }
      case "swim": {
        // Yüzer; arada kumsaldaki havlusuna uzanır.
        if (Math.floor(sec / 900 + ph) % 5 >= 3) {
          const towel = this.pools.towel?.[s % (this.pools.towel?.length || 1)];
          if (towel) {
            p.x = towel.x; p.z = towel.z; p.heading = Math.PI; p.y = w.groundY(towel.x, towel.z) + 0.12; p.lie = Math.PI / 2;
            p.shL = p.shR = 0.1; p.abL = p.abR = 0.15; p.elL = p.elR = 0.2;
            p.props = ["havlu"]; p.sleeves = false; p.shorts = true;
            return true;
          }
        }
        const a = sec * 0.012 + ph;
        p.x = it.x + Math.cos(a) * 4; p.z = it.z + Math.sin(a) * 3;
        p.heading = Math.atan2(-Math.sin(a), Math.cos(a));
        p.y = -1.25 * kk; p.lean = 0.9;
        p.shL = 1.5 + 1.6 * Math.sin(t * 2 + ph); p.shR = 1.5 + 1.6 * Math.sin(t * 2 + ph + Math.PI);
        p.elL = p.elR = 0.3; p.radius = 0;
        return true;
      }
      case "bike": case "jog": {
        const prom = w.promenade;
        const run = role.mode === "jog";
        const lane = prom.map(([x, z]) => [x, z + (run ? -1.7 : 1.7)]);
        const r = pingPong(lane, run ? 2.7 : 4.5, ph * 400);
        stand(at.x, at.z, r.heading);
        if (run) {
          walkPose(p, r.d / (1.1 * kk) * Math.PI, 1);
          p.sleeves = false;
        } else {
          // Bisiklet: sele 0,95 m'de; ayaklar pedala kilitli (ters kinematik).
          const ground = p.y;
          p.y = ground + 0.95 - 0.92 * kk;
          p.groundY = ground;
          const crank = r.d / 2.1;
          for (const [sideAng, hipKey, kneeKey] of [[0, "hipL", "kneeL"], [Math.PI, "hipR", "kneeR"]]) {
            const fz = 0.32 + 0.17 * Math.sin(crank + sideAng), fy = 0.3 + 0.17 * Math.cos(crank + sideAng);
            const ik = legIK(fz / kk, (fy - 0.95) / kk);
            p[hipKey] = ik.hip; p[kneeKey] = ik.knee;
          }
          p.lean = 0.42; p.shL = p.shR = 1.0; p.elL = p.elR = 0.35; p.abL = p.abR = 0.06; p.headPitch = -0.3;
          p.props = ["bisiklet"]; p.radius = 0.6;
          p.moving = true;
        }
        return true;
      }
      case "sunset": {
        // Gün batımı: yüzü güneşe dönük; kimi telefonla fotoğraf çeker, kimi kollarını kavuşturup izler.
        const sp = sunPosition(this.day, minute);
        const sx = Math.sin(sp.az), sz = -Math.cos(sp.az);
        stand(it.x, it.z, Math.atan2(sx, sz) + 0.25 * Math.sin(t * 0.04 + ph));
        if (roll(s, "gbFoto", this.day) % 3 === 0 && Math.sin(t * 0.09 + ph) > 0.2) { phonePose(p); p.shR = 1.35; p.elR = 1.3; p.props = ["telefon"]; }
        else if (roll(s, "gbKol") % 2) { p.shL = p.shR = 0.55; p.elL = p.elR = 2.2; p.abL = p.abR = 0.25; }
        else idleGesture(p, t, ph, false);
        p.dog = true;
        return true;
      }
      case "pier": {
        // Vapur iskelesinde korkuluğa yaslanır; vapur yanaşırken el sallar.
        stand(it.x, it.z, it.heading + 0.15 * Math.sin(t * 0.05 + ph));
        const f = ferryOut(minute), g = ferryOut(minute - 0.5);
        if (f < 0.98 && f < g) { p.shR = 2.7 + 0.25 * Math.sin(t * 7 + ph); p.elR = 0.35; p.headYaw = 0; }
        else { p.lean = 0.18; p.shL = p.shR = 1.05; p.elL = p.elR = 1.35; p.headPitch = 0.1; }
        return true;
      }
      case "skip": {
        // Su kenarında taş sektirir: birkaç saniyede bir eğilip yandan fırlatır, sonra taşın gidişine bakar.
        const cyc = (sec + ph * 9) % 7;
        stand(it.x, it.z, it.heading + 0.2 * Math.sin(ph));
        if (cyc < 1.2) { const u = cyc / 1.2; p.lean = 0.45 * Math.sin(u * Math.PI); p.twist = -0.5 + u * 0.9; p.shR = 0.4 + 1.3 * u; p.abR = 0.9 - 0.6 * u; p.elR = 0.3; p.kneeL = p.kneeR = 0.3 * Math.sin(u * Math.PI); }
        else { idleGesture(p, t, ph, false); p.headPitch = -0.05; }
        return true;
      }
      case "hike": case "beachwalk": case "jog:plaj": case "cleanup": {
        // Tepe patikası ya da kumsal boyunca gidip gelir; koşanlar hızlı; temizlik yapanlar durup eğilip toplar.
        const pts = role.mode === "hike" ? this._hikePath() : this._beachPath(role.mode === "cleanup" ? 1.5 : 3);
        if (!pts) break;
        const run = role.mode === "jog:plaj", clean = role.mode === "cleanup";
        const speed = run ? 2.6 : clean ? 0.45 : role.mode === "hike" ? 1.05 : 0.9;
        const r = pingPong(pts, speed, ph * 300 + (s % 97) * 13);
        const stop = clean && Math.sin(sec * 0.35 + ph * 4) > 0.45;
        stand(at.x, at.z, stop ? r.heading + 0.6 : r.heading);
        if (stop) { p.lean = 0.85; p.hipL = p.hipR = 0.45; p.kneeL = p.kneeR = 0.5; p.drop = 0.12; p.shL = p.shR = 1.0; p.elR = 0.3 + 0.3 * Math.sin(t * 2 + ph); }
        else { walkPose(p, r.d / ((run ? 1.1 : 0.72) * kk) * Math.PI, run ? 1 : 0); if (run) p.sleeves = false; }
        p.dog = !run && !clean;
        return true;
      }
      case "kapi": {
        // Kapı önü: aynı binadan komşular kapının birkaç metre önünde halka olur, sohbet eder.
        const h = this.homes[i], b = h.building;
        const [dx, dz] = h.door;
        let ox = b ? dx - b.x : 0, oz = b ? dz - b.z : 1;
        const L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L;
        const cx = dx + ox * 3.2, cz = dz + oz * 3.2;
        const a = ((this.residents[i].slot % 7) / 7) * Math.PI * 2 + ph * 0.2;
        const [x, z] = w.nearestWalkable(cx + Math.cos(a) * 1.05, cz + Math.sin(a) * 1.05, 3);
        stand(x, z, Math.atan2(cx - x, cz - z));
        idleGesture(p, t, ph, roll(s, "konuskan") % 2 === 0);
        p.dog = true;
        return true;
      }
      case "stars": {
        // Tepenin çimeninde sırtüstü uzanır, gökyüzüne bakar.
        p.x = it.x; p.z = it.z; p.heading = ph; p.y = w.groundY(it.x, it.z) + 0.12; p.lie = Math.PI / 2;
        p.shL = p.shR = 0.25; p.abL = p.abR = 0.5; p.elL = p.elR = 1.9; p.kneeL = 0.5; p.hipL = 0.3;
        p.props = ["havlu"];
        return true;
      }
      case "shop": {
        const walk = w.carsiWalks[roll(s, "carsiYol", this.day) % w.carsiWalks.length];
        // 40 sn yürür, 15 sn vitrine bakar: bakarken yerinde durur (kaymaz).
        const P = 55, n = Math.floor((sec + ph * 30) / P), rr = (sec + ph * 30) % P;
        const look = rr > 40;
        const walked = n * 40 + Math.min(rr, 40);
        const spd = 0.85 + frac(roll(s, "gezHiz")) * 0.35;
        const lensW = lengths(walk), LW = lensW[lensW.length - 1];
        let dd = (walked * spd + ph * 200) % (2 * LW);
        const back = dd > LW;
        if (back) dd = 2 * LW - dd;
        along(walk, lensW, dd, at);
        const r = { d: dd, heading: back ? at.heading + Math.PI : at.heading };
        const alongX = walk[0][1] === walk[1][1];
        const shopSide = alongX ? (walk[0][1] < 0 ? Math.PI : 0) : walk[0][0] < 0 ? -Math.PI / 2 : Math.PI / 2;
        stand(at.x, at.z, look ? shopSide : r.heading);
        if (!look) walkPose(p, r.d / (0.72 * kk) * Math.PI);
        else idleGesture(p, t, ph, false);
        p.dog = true;
        return true;
      }
    }

    // Sohbet grubu (ya da yer kalmadıysa yerin yakınında durma).
    const g = role.group;
    if (g && role.groupRef?.picnic) {
      // Piknik: örtünün çevresinde yere oturur, bacaklar önde; ara ara bir şey alıp yer, sohbet eder.
      const G = role.groupRef, gy = w.groundY(G.x, G.z);
      stand(g.x, g.z, g.heading);
      p.x = G.x + (g.x - G.x) * 0.72; p.z = G.z + (g.z - G.z) * 0.72; // örtünün kenarında, üstünde
      sitPose(p, gy + 0.1, kk);
      p.kneeL = p.kneeR = 0.35; p.hipL = p.hipR = 1.45; p.lean = 0.12;
      const eat = Math.max(0, Math.sin(t * 0.4 + ph)) ** 8;
      idleGesture(p, t, ph, eat < 0.1);
      p.shR = Math.max(p.shR, 0.6 + 1.1 * eat); p.elR = Math.max(p.elR, 1.0 + 1.2 * eat);
      p.ortu = [G.x, gy, G.z];
      p.props = ["ortu"];
      return true;
    }
    if (g) {
      stand(g.x, g.z, g.heading);
    } else {
      // Yerde boş köşe kalmadı: tek noktaya yığılmak yerine yerin çevresinde ağır ağır dolaşır.
      let key = (this._placeOf(i, k) ?? seg.yer).replace("hobi:", "");
      if (key === "iskele") key = "sahil_yolu"; // balık tutacak yer bulamayan sahilde yürür
      const loop = this._strollLoop(key);
      if (loop) {
        const d = (sec * 0.75 + frac(roll(s, "gezinti", k)) * loop.L) % loop.L;
        along(loop.pts, loop.lens, d, at);
        const lat = ((s % 5) - 2) * 0.55;
        const nx = at.x + Math.cos(at.heading) * lat, nz = at.z - Math.sin(at.heading) * lat;
        stand(w.isWalkable(nx, nz) ? nx : at.x, w.isWalkable(nx, nz) ? nz : at.z, at.heading);
        walkPose(p, (d / (0.72 * kk)) * Math.PI);
        p.dog = true;
        return true;
      }
      const place = w.placeOf(key);
      const a = place.anchors[s % place.anchors.length];
      const [x, z] = w.nearestWalkable(a[0] + ((s % 7) - 3) * 1.4, a[1] + (((s >> 3) % 7) - 3) * 1.4, 6);
      stand(x, z, ph);
    }
    idleGesture(p, t, ph, true);
    p.dog = true;
    return true;
  }

  /** Tepe patikası (kasabadan zirveye; gidip gelme için). */
  _hikePath() {
    if (this._hike !== undefined) return this._hike;
    const tp = this.world.places.tepe;
    const pts = tp?.path ? tp.path.slice(0, -1).reverse() : null; // yol kasaba ucundan zirveye
    return (this._hike = pts && pts.length >= 2 ? pts.slice(Math.max(0, pts.length - 4)) : null);
  }

  /** Kumsal boyunca, su kenarına yakın yürüyüş çizgisi (deniz yönünde off metre). */
  _beachPath(off) {
    (this._beachPaths ??= new Map());
    if (this._beachPaths.has(off)) return this._beachPaths.get(off);
    const w = this.world;
    const a = [...(w.places.plaj?.anchors ?? [])].sort((p, q) => p[0] - q[0]).map(([x, z]) => w.nearestWalkable(x, z + off, 3));
    const pts = a.length >= 2 ? a : null;
    this._beachPaths.set(off, pts);
    return pts;
  }

  /**
   * Bir yerin çevresinde gezinti halkası: yerin noktalarının ortasından 24 yönde, yürünebilir ve
   * aralarındaki doğru boyunca engelsiz noktalar. Bulunamazsa null.
   */
  _strollLoop(key) {
    this._loops ??= new Map();
    if (this._loops.has(key)) return this._loops.get(key);
    const w = this.world;
    const place = w.places[key];
    let loop = null;
    if (place?.anchors?.length) {
      const cx = place.anchors.reduce((a, q) => a + q[0], 0) / place.anchors.length;
      const cz = place.anchors.reduce((a, q) => a + q[1], 0) / place.anchors.length;
      const spreadR = Math.max(...place.anchors.map((q) => Math.hypot(q[0] - cx, q[1] - cz)));
      const R0 = Math.max(14, spreadR + 10, Math.min(30, (place.spread ?? 0) * 0.8));
      // Önce geniş, olmazsa daha dar halkalar denenir (meydan gibi engelli yerlerde de bir halka bulunsun).
      for (const R of [R0, R0 * 0.75, R0 * 0.55, 14, 11]) {
        const pts = [];
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const [x, z] = w.nearestWalkable(cx + Math.cos(a) * R, cz + Math.sin(a) * R, 3);
          if (!w.isWalkable(x, z) || w.height(x, z) < 0.3) continue;
          const prev = pts[pts.length - 1];
          if (prev) {
            const L = Math.hypot(x - prev[0], z - prev[1]);
            let ok = L > 1.5;
            for (let u = 0.5; ok && u < L; u += 0.8) ok = w.isWalkable(prev[0] + ((x - prev[0]) * u) / L, prev[1] + ((z - prev[1]) * u) / L);
            if (!ok) continue;
          }
          pts.push([x, z]);
        }
        if (pts.length >= 10) {
          pts.push(pts[0]);
          const lens = lengths(pts);
          loop = { pts, lens, L: lens[lens.length - 1] };
          break;
        }
      }
    }
    // Pazar: iki koridor boyunca dolaşılır.
    if (key === "pazar" && place?.aisles) {
      const [a, b] = place.aisles;
      const pts = [[a[0], a[2]], [a[1], a[2]], [b[1], b[2]], [b[0], b[2]], [a[0], a[2]]];
      const lens = lengths(pts);
      loop = { pts, lens, L: lens[lens.length - 1] };
    }
    // Sahil yolu: gezinti yolu boyunca gidip gelinir (halka yerine yolun kendisi).
    if (key === "sahil_yolu" && w.promenade?.length > 2) {
      const pts = [...w.promenade, ...[...w.promenade].reverse().slice(1)];
      const lens = lengths(pts);
      loop = { pts, lens, L: lens[lens.length - 1] };
    }
    this._loops.set(key, loop);
    return loop;
  }

  /** Durakta bekleme yeri: geliş sırasına göre kaldırım boyunca 12'şerli sıralar (u: yerine geçme 0→1). */
  _queuePos(i, leg, u = 1) {
    const w = this.world;
    const slot = leg.queue ?? this.residents[i].seed % 10, h = leg.heading ?? 0;
    const row = Math.floor(slot / 12);
    const lat = ((slot % 12) - 5.5) * 0.72 + (row % 2) * 0.36, back = Math.min(row, 3) * 0.7 + Math.max(0, row - 3) * 0.35;
    const x = leg.x + (Math.cos(h) * lat - Math.sin(h) * back) * u, z = leg.z + (-Math.sin(h) * lat - Math.cos(h) * back) * u;
    // Sundurma ya da direk araya giriyorsa en yakın boş yere (durağın tam ortasına değil).
    return w.isWalkable(x, z) ? [x, z] : w.nearestWalkable(x, z, 2.5);
  }

  /** Yürüyüş anı: zaman çizelgesinden konum, ışıkta bekleme ya da yürüme duruşu. */
  _walkState(i, leg, minute, time, p, c) {
    const t = minute * 60;
    const segs = leg.segs;
    let d = leg.L, cross = null, spread = 0;
    if (segs.length && t < segs[segs.length - 1].t1) {
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (segs[m].t1 <= t) lo = m + 1; else hi = m; }
      const sg = segs[lo];
      if (t <= sg.t0) d = sg.d0;
      else d = sg.d0 + (sg.d1 - sg.d0) * ((t - sg.t0) / ((sg.t1 - sg.t0) || 1));
      if (sg.cross) { cross = sg; spread = sg.look ? 0 : 1; }
      // Işık yeşile dönünce bekleme yerinden geçit çizgisine birkaç adımda süzülür.
      else if (lo > 0 && segs[lo - 1].cross && !segs[lo - 1].look) spread = Math.max(0, 1 - (t - sg.t0) / 2.5);
    }
    if (t < leg.t0 * 60) d = 0;
    // Kalkışta hızlanır, varışta yavaşlar (adım evresi de buna göre: ayak kaymaz).
    if (!cross && !spread) d = easeEnds(d, leg.L);
    along(leg.pts, leg.lens, d, this._at);
    p.x = this._at.x; p.z = this._at.z; p.heading = this._at.heading;
    if (spread > 0) {
      // Işıkta bekleyenler üst üste yığılmaz: geçidin önünde (kaldırım boyunca) yana ve geriye dağılır.
      const s = this.residents[i].seed;
      along(leg.pts, leg.lens, Math.min(leg.L, d + 1.5), this._at2 ??= {});
      const hx = this._at2.x - p.x, hz = this._at2.z - p.z, hl = Math.hypot(hx, hz) || 1;
      const fx = hx / hl, fz = hz / hl;
      const row = (s >>> 3) % 3, lat = ((s % 5) - 2) * 0.5 + (row % 2 ? 0.25 : 0), back = row * 0.55;
      const nx = p.x + (-fz * lat - fx * back) * spread, nz = p.z + (fx * lat - fz * back) * spread;
      if (this.world.isWalkable(nx, nz)) { p.x = nx; p.z = nz; }
    }
    p.y = this.world.groundY(p.x, p.z);
    if (cross || d >= leg.L - 0.01) {
      // Işıkta bekliyor (karşıya bakar), ışıksız geçitte sağına soluna bakıyor ya da varmış.
      if (cross) { along(leg.pts, leg.lens, Math.min(leg.L, d + 1.5), this._at); p.heading = Math.atan2(this._at.x - p.x, this._at.z - p.z); p.waiting = true; }
      idleGesture(p, time, i, false);
      if (cross?.look) {
        const u = (t - cross.t0) / ((cross.t1 - cross.t0) || 1);
        p.headYaw = 0.75 * Math.sin(u * Math.PI * 2) * (i % 2 ? 1 : -1);
      }
    } else {
      walkPose(p, d / (0.72 * (c.height / 1.75)) * Math.PI);
    }
    p.phase = d;
    return d;
  }

  /** Araçta oturan (sürücü ya da yolcu): aracın konumuna göre koltukta. */
  _seatIn(veh, lx, lz, seatH, p) {
    const pos = this.traffic.pose ? this.traffic.pose(veh) : veh.route.position(veh.s);
    const h = pos.heading;
    p.x = pos.x + Math.cos(h) * lx + Math.sin(h) * lz;
    p.z = pos.z - Math.sin(h) * lx + Math.cos(h) * lz;
    p.heading = h;
    const ground = this.world.surfaceY(pos.x, pos.z) + 0.06;
    sitPose(p, ground + seatH, p.height / 1.75);
    p.shL = p.shR = 0.95; p.elL = p.elR = 0.7;
    p.radius = 0;
    p.inVehicle = true;
    p.vehicleKey = veh.key;
  }

  /** Yolculuk anı. false: görünmüyor (içeride, araçta görünmüyor). */
  _travelState(i, k, trip, leg, minute, time, p, c) {
    const w = this.world;
    switch (leg.kind) {
      case "before": {
        if (trip.hideAtA) return false;
        return this._placeState(i, k - 1, minute, time, p, { end: leg.t1 });
      }
      case "after": {
        // Vapura gidenler: iskelede sıraya girer, kalkışta biner (sonra görünmez).
        if (trip.toFerry) {
          if (minute >= nextDeparture(leg.t0)) return false;
          const q = this.works[i].loc.queue, slot = this.residents[i].seed % 300;
          const qx = q.x0 + (slot % 12) * ((q.x1 - q.x0) / 11), qz = q.z - Math.floor(slot / 12) * 0.75;
          const u = Math.min(1, (minute - leg.t0) * 20);
          const last = trip.legs.findLast((l) => l.kind === "walk");
          const ex = last ? last.pts[last.pts.length - 1] : [qx, qz];
          p.x = ex[0] + (qx - ex[0]) * u; p.z = ex[1] + (qz - ex[1]) * u; p.y = this.world.groundY(p.x, p.z);
          p.heading = 0;
          if (u < 1) walkPose(p, u * 6);
          else {
            idleGesture(p, time, i, (this.residents[i].seed >> 3) % 3 === 0);
            if (this.residents[i].seed % 3 === 0) { phonePose(p); p.props = ["telefon"]; }
          }
          return true;
        }
        if (trip.hideAtB) return false;
        const next = this.plans[i][k + 1];
        if (!next || next.ne === "ev" || next.ne === "uyku") return false;
        return this._placeState(i, k + 1, minute, time, p, { start: leg.t0 });
      }
      case "walk": {
        const d = this._walkState(i, leg, minute, time, p, c);
        // Köpek yalnızca gezmeye çıkarken yanında; işe (ya da vapura) köpekle gidilmez.
        const seg = this.plans[i][k];
        p.dog = trip.mode === "yaya" && seg?.nereden !== "is" && seg?.nereye !== "is";
        if (leg === trip.legs.find((l) => l.kind === "walk") && trip.doorA && d < 2.5) this.openDoors.add(trip.doorA);
        if (leg === trip.legs.findLast((l) => l.kind === "walk") && trip.doorB && leg.L - d < 2.5) this.openDoors.add(trip.doorB);
        return true;
      }
      case "wait": {
        const [wx, wz] = this._queuePos(i, leg, Math.min(1, (minute - leg.t0) * 30));
        p.x = wx; p.z = wz; p.y = w.groundY(wx, wz); p.heading = leg.heading ?? 0;
        idleGesture(p, time, i, false);
        if (roll(this.residents[i].seed, "durakTel") % 2) { phonePose(p); p.props = ["telefon"]; }
        // Taksi son yarım dakikada gelip kaldırım kenarında bekler.
        if (leg.taxi && (leg.t1 - minute) * 60 < 30) this.staticCars.push({ x: leg.taxi.at[0], z: leg.taxi.at[1], heading: leg.taxi.heading, taxi: true });
        return true;
      }
      case "drive": {
        const T = this.traffic;
        const veh = T.ensure(leg.key, { route: leg.route, t0: leg.t0, t1: leg.t1, owner: i, color: trip.color ?? 0, taxi: !!leg.taxi }, minute);
        if (veh && !veh.parked) {
          if (leg.taxi) {
            this._seatIn(veh, -0.4, -0.75, 0.42, p);
            this.extras.push({ veh, lx: 0.4, lz: 0.1, kind: "taksici" });
          } else {
            this._seatIn(veh, 0.4, 0.05, 0.42, p);
          }
          return true;
        }
        // Araç park etti (ya da artık yok): kaldırım tarafında iner, bekler.
        const ex = leg.exit;
        p.x = ex[0]; p.z = ex[1]; p.y = w.groundY(ex[0], ex[1]); p.heading = leg.exitHeading ?? 0;
        idleGesture(p, time, i, false);
        return true;
      }
      case "bus": {
        const T = this.traffic;
        const veh = T.busVehicle(leg.line, leg.dep);
        const line = T.lines[leg.line];
        if (veh && veh.served <= leg.a && veh.s < line.stops[leg.a].s - 1) {
          // Otobüs gecikti: durakta beklemeye devam.
          const prev = this.travelCache[i].legs.find((l) => l.kind === "wait");
          if (prev) { const [qx, qz] = this._queuePos(i, prev, 1); p.x = qx; p.z = qz; p.y = w.groundY(qx, qz); p.heading = prev.heading; idleGesture(p, time, i, false); return true; }
          return false;
        }
        if (veh && veh.served <= leg.b) {
          const n = (this.busSeat.get(veh) ?? 0);
          this.busSeat.set(veh, n + 1);
          if (n < 18) {
            // 9 sıra çift koltuk.
            const row = Math.floor(n / 2), side = n % 2 ? -0.62 : 0.62;
            this._seatIn(veh, side, 4.0 - row * 1.05, 0.88, p);
            p.shL = p.shR = 0.35; p.elL = p.elR = 0.9;
            return true;
          }
          if (n < 30) {
            // Koridorda ayakta, tutamağa tutunarak.
            this._seatIn(veh, ((n % 2) - 0.5) * 0.25, 3.6 - (n - 18) * 0.62, 0, p);
            resetPose(p);
            const sp = this.traffic.pose ? this.traffic.pose(veh) : veh.route.position(veh.s);
            const h = sp.heading, lx = ((n % 2) - 0.5) * 0.25, lz = 3.6 - (n - 18) * 0.62;
            p.x = sp.x + Math.cos(h) * lx + Math.sin(h) * lz; p.z = sp.z - Math.sin(h) * lx + Math.cos(h) * lz;
            p.y = w.surfaceY(sp.x, sp.z) + 0.06 + 0.38; p.heading = h; p.inVehicle = true; p.vehicleKey = veh.key; p.radius = 0;
            p.shR = 2.6; p.elR = 0.2; p.headYaw = 0.3 * Math.sin(time * 0.3 + i);
            return true;
          }
          return false; // dolu otobüste camdan görünmeyen yolcular
        }
        if (!veh) return false;
        const ex = leg.exit;
        p.x = ex[0]; p.z = ex[1]; p.y = w.groundY(ex[0], ex[1]); p.heading = 0;
        idleGesture(p, time, i, false);
        return true;
      }
    }
    return false;
  }

  /** Sakinlerin konumlarını verilen dakikaya göre günceller ve çizim listesini kurar. */
  update(minute, time) {
    this.cinema?.update(this.theme, minute, time, this.day);
    const crowd = this.crowd, at = this._at;
    const w = this.world;
    this.openDoors.clear();
    this.staticCars = [];
    this.extras = [];
    this.busSeat = new Map();
    const shown = [];
    for (let i = 0; i < this.n; i++) {
      const plan = this.plans[i];
      let k = 0;
      while (k < plan.length - 1 && minute >= plan[k].son) k++;
      const seg = activityAt(plan, minute);
      this.activities[i] = seg;
      this.currentPlace[i] = seg.ne === "meydan" ? this._placeOf(i, k) : null;
      this.currentAct[i] = seg.ne === "meydan" || seg.ne === "hobi" ? this.acts?.[i]?.get(k) ?? null : null;
      this.athome[i] = seg.ne === "ev" ? 1 : 0;
      const c = this.colors[i];
      const p = this.poses[i];
      resetPose(p);
      p.height = c.height; p.t = time; p.sleeves = c.sleeves; p.shorts = false; p.atWork = false;
      let atWork = false;

      if (seg.ne === "uyku" || seg.ne === "ev") {
        this.homeActs[i] = null;
        if (this.dollhouse?.contains(i) && this.dollhouse.pose(i, seg, minute, time, p)) {
          this.homeActs[i] = p.activity;
          shown.push(i);
          p.indoor = true;
          continue;
        }
        this.visible[i] = 0;
        continue;
      }
      p.indoor = false;

      if (seg.ne === "yol") {
        const trip = this._trip(i, seg, k);
        this.travelCache[i] = trip;
        const leg = trip.legs.find((l) => minute < l.t1) ?? trip.legs[trip.legs.length - 1];
        p.mode = trip.mode;
        if (!this._travelState(i, k, trip, leg, minute, time, p, c)) { this.visible[i] = 0; continue; }
        atWork = trip.fromWork || seg.nereye === "is"; // işe giderken de üniformalı
      } else {
        if (seg.ne === "is" && !this.works[i].loc.outdoor) {
          // İçeride çalışıyor: iş yerinin içi açıksa masasında/tezgâhında görünür.
          if (this.dollhouse?.contains(i) && this.dollhouse.workPoseFor(i, seg, time, p)) {
            p.indoor = true;
            p.atWork = true;
            shown.push(i);
            continue;
          }
          this.visible[i] = 0;
          continue;
        }
        if (!this._placeState(i, k, minute, time, p)) { this.visible[i] = 0; continue; }
        atWork = seg.ne === "is";
        p.phase = time * 2;
      }
      p.atWork = atWork;
      shown.push(i);
    }

    // Park halindeki arabalar: sürülmeyen her araba, bugünkü son araba yolculuğunun hedefinde ya da ev önünde.
    this.parked = [];
    if (this.traffic) {
      for (let i = 0; i < this.n; i++) {
        if (!this.hasCar[i]) continue;
        const plan = this.plans[i];
        let k = 0;
        while (k < plan.length - 1 && minute >= plan[k].son) k++;
        let slot = this.carSlotBefore(i, k);
        const cp = this.carPlan?.[i]?.get(k);
        if (cp && plan[k].ne === "yol") {
          const trip = this.tripStore[i].get(k);
          const drive = trip?.legs.find((l) => l.kind === "drive");
          if (drive) {
            if (minute >= drive.t0 && (minute < drive.t1 || this.traffic.active.has(drive.key))) slot = null;
            else if (minute >= drive.t1) slot = cp.toSlot;
          }
        }
        if (slot != null) this.parked.push([slot, this.carColor[i], i]);
      }
    }

    // Yürüyenler birbirine çok yaklaşırsa yana çekilir (oturan ve duranların içinden geçilmez).
    const grid = new Map();
    for (const i of shown) {
      const p = this.poses[i];
      if (p.indoor || !p.radius) continue;
      const key = Math.floor(p.x) * 100003 + Math.floor(p.z);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    for (const i of shown) {
      const p = this.poses[i];
      if ((!p.moving && !p.waiting) || p.indoor || !p.radius) continue;
      const gx = Math.floor(p.x), gz = Math.floor(p.z);
      let px = 0, pz = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get((gx + dx) * 100003 + gz + dz) ?? []) {
            if (j === i) continue;
            const q = this.poses[j];
            const ox = p.x - q.x, oz = p.z - q.z;
            const dist = Math.hypot(ox, oz);
            const min = p.radius + q.radius;
            if (dist >= min || dist < 1e-4) continue;
            // Yürüme yönüne dik, uzaklaşan yana itilir.
            const sx = Math.cos(p.heading), sz = -Math.sin(p.heading);
            const sign = ox * sx + oz * sz >= 0 ? 1 : -1;
            const push = (min - dist) * (q.moving || q.waiting ? 0.5 : 1);
            px += sx * sign * push; pz += sz * sign * push;
          }
        }
      }
      if (px || pz) {
        const nx = p.x + px, nz = p.z + pz;
        if (w.isWalkable(nx, nz)) { p.x = nx; p.z = nz; }
      }
    }

    crowd.begin();
    for (const i of shown) {
      const p = this.poses[i];
      const c = this.colors[i];
      this.visible[i] = 1;
      this.positions[i * 3] = p.x; this.positions[i * 3 + 1] = p.y; this.positions[i * 3 + 2] = p.z;
      const u = p.atWork ? c.uniform : null;
      p.style = u?.hat ? HAT_HAIR[c.style] ?? c.style : c.style; p.skin = c.skin; p.hairColor = c.hairColor;
      p.beard = c.beard; p.glasses = c.glasses;
      p.top = u ? u.top : c.top;
      p.bottom = u?.bottom ?? c.bottom;
      p.hat = u?.hat ?? null; p.hatColor = u?.hatColor ?? null;
      if (u?.sleeves != null) p.sleeves = u.sleeves;
      if (u?.shorts) p.shorts = true;
      if (p.team != null) {
        p.top = TEAM_COLORS[p.team];
        p.bottom = p.team === 2 ? TEAM_COLORS[2] : WHITE;
        p.hat = null;
        p.team = null;
      }
      crowd.add(i, p);
      if (p.dog && this.dogs[i] && !p.indoor) {
        // Köpek sahibinin yanında; o yan taşıt yoluna düşüyorsa öbür yanda, ikisi de yolsa (geçitte) arkasında.
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading), sx = Math.cos(p.heading), sz = -Math.sin(p.heading);
        let x = p.x + sx * 0.75 + fx * 0.5, z = p.z + sz * 0.75 + fz * 0.5;
        if (w.inCarriage(x, z)) {
          x = p.x - sx * 0.75 + fx * 0.5; z = p.z - sz * 0.75 + fz * 0.5;
          if (w.inCarriage(x, z) || !w.isWalkable(x, z)) { x = p.x - fx * 0.9; z = p.z - fz * 0.9; }
        }
        if (w.isWalkable(x, z)) crowd.addDog(x, w.groundY(x, z), z, p.heading + (p.moving ? 0 : 0.6), (p.phase ?? 0) * 1.6, DOG_COLORS[this.residents[i].seed % DOG_COLORS.length], !!p.moving, time, this.residents[i].seed % 97, i);
      }
    }
    // Taksi, otobüs ve hizmet aracı şoförleri (sakin değil).
    const drv = (this._driverPose ??= {});
    const addDriver = (veh, lx, lz, seat, top) => {
      resetPose(drv);
      drv.height = 1.74; drv.t = time;
      this._seatIn(veh, lx, lz, seat, drv);
      Object.assign(drv, { style: 1, skin: P.SKIN[1], hairColor: P.HAIR[0], top, bottom: P.BOTTOMS[1], sleeves: true, beard: false, glasses: false });
      crowd.add(-1, drv);
    };
    for (const e of this.extras) addDriver(e.veh, e.lx, e.lz, 0.42, DRIVER_TOP);
    if (this.traffic) {
      const seats = { bus: [0.75, 5.0, 0.9], ambulans: [0.45, 2.55, 0.75], itfaiye: [0.55, 4.4, 0.95], cop: [0.55, 3.3, 0.95] };
      for (const v of this.traffic.active.values()) {
        const st = seats[v.kind];
        if (st && !(v.phase === "wait")) addDriver(v, st[0], st[1], st[2], v.kind === "bus" ? DRIVER_TOP : v.kind === "itfaiye" ? FIRE_TOP : v.kind === "ambulans" ? MEDIC_TOP : COP_TOP);
      }
    }
    this.dollhouse?.addExtras?.(crowd, minute, time, this.day); // iç mekân müşterileri ve öğrenciler
    // Öğrenciler (sakin değil): hafta içi 08:40-15:20 arası teneffüslerde (her saatin son 10 dakikası
    // ve öğle arası) okul bahçesinde koşar, top oynar, sohbet eder; ders saatinde içeridedirler.
    // Okul günü: hafta içi ve resmî tatil değil (tatilde parklar hafta sonu gibi açık).
    const wd = (this.day + 3) % 7, schoolDay = wd < 5 && !isHoliday(this.day);
    const recess = schoolDay && minute >= 520 && minute < 920 && (minute % 60 >= 50 || (minute >= 720 && minute < 760));
    if (recess) {
      const v = (this._kidPose ??= {});
      for (const [si, sch] of (this.world.schools ?? []).entries()) {
        const W = sch.x1 - sch.x0 - 3, D = sch.z1 - sch.z0 - 3, cx = (sch.x0 + sch.x1) / 2, cz = (sch.z0 + sch.z1) / 2;
        for (let k = 0; k < 28; k++) {
          const seed = si * 97 + k, ph = seed * 1.37;
          if (!keepExtra(this.lively, seed * 3 + 1)) continue;
          resetPose(v);
          v.height = 1.18 + (seed % 7) * 0.04; v.t = time;
          const kind = seed % 4;
          if (kind < 2) {
            // Kovalamaca: bahçede kapalı bir eğri boyunca koşar.
            const u = time * (0.18 + (seed % 5) * 0.02) + ph;
            const nx = cx + Math.sin(u) * (W / 2 - 1) * (0.5 + 0.5 * Math.sin(ph)), nz = cz + Math.sin(u * 2 + ph) * (D / 2 - 1) * 0.8;
            const dx = Math.cos(u) * (W / 2 - 1) * (0.5 + 0.5 * Math.sin(ph)), dz = 2 * Math.cos(u * 2 + ph) * (D / 2 - 1) * 0.8;
            v.x = nx; v.z = nz; v.heading = Math.atan2(dx, dz);
            v.y = this.world.groundY(nx, nz);
            walkPose(v, time * 9 + ph, 1);
          } else {
            // Halka olup sohbet.
            const g = Math.floor(k / 4), a = (k % 4) * (Math.PI / 2) + g;
            const gx = cx + ((g % 3) - 1) * W * 0.3, gz = cz + (g % 2 ? 1 : -1) * D * 0.28;
            v.x = gx + Math.cos(a) * 0.7; v.z = gz + Math.sin(a) * 0.7; v.y = this.world.groundY(v.x, v.z);
            v.heading = Math.atan2(gx - v.x, gz - v.z);
            idleGesture(v, time, ph, true);
          }
          Object.assign(v, { style: seed % 2, skin: P.SKIN[seed % P.SKIN.length], hairColor: P.HAIR[(seed * 3) % P.HAIR.length], top: SCHOOL_TOPS[seed % 3], bottom: P.BOTTOMS[1], sleeves: true, beard: false, glasses: seed % 9 === 0 });
          crowd.add(-1, v);
        }
      }
    }
    // Oyun parklarında çocuklar ve veliler (sakin değil): hafta içi okul çıkışından akşama, hafta sonu
    // gün boyu. Aletlere göre: salıncakta sallanır, tahterevallide iner kalkar, atlıkarıncada döner,
    // yaylıda sallanır, kum havuzunda oynar; diğerleri aletlerin çevresinde koşar.
    const parkOpen = minute < 1170 && (schoolDay ? minute >= 940 : minute >= 600);
    if (parkOpen) {
      const v = (this._parkKid ??= {});
      const dressKid = (seed, adult) => Object.assign(v, { style: seed % 2, skin: P.SKIN[seed % P.SKIN.length], hairColor: P.HAIR[(seed * 3) % P.HAIR.length], top: P.CLOTHES[(seed * 7) % P.CLOTHES.length], bottom: P.BOTTOMS[(seed * 5) % P.BOTTOMS.length], sleeves: seed % 3 !== 0, beard: adult && seed % 5 === 0, glasses: adult && seed % 6 === 0 });
      let pi = 0;
      for (const f of this.world.features) {
        if (f.type !== "oyun") continue;
        pi++;
        const y0 = this.world.groundY(f.x, f.z);
        const items = playgroundItems(f);
        let kid = 0;
        const put = (it, lx, lz, h) => {
          const c = Math.cos(it.rot), s2 = Math.sin(it.rot);
          v.x = it.x + lx * c + lz * s2; v.z = it.z - lx * s2 + lz * c; v.heading = it.rot + h;
        };
        for (const [ii, it] of items.entries()) {
          if (!keepExtra(this.lively, pi * 7919 + ii * 31)) continue;
          const seed = pi * 131 + kid * 17 + this.day;
          const ph = seed * 0.37;
          const start = () => { resetPose(v); v.height = 1.05 + (seed % 6) * 0.06; v.t = time; v.y = y0; dressKid(seed + kid, false); kid++; };
          const kk = 1.05 / 1.75;
          switch (it.kind) {
            case "salincak": {
              const n = 2 + (it.c % 2);
              for (let k = 0; k < n - 1; k++) {
                start();
                const sw = Math.sin(time * 2.1 + ph + k);
                put(it, -it.w / 2 + ((k + 1) * it.w) / (n + 1), sw * 0.55, 0);
                v.y = y0 + 0.5 + 0.18 * sw * sw - 0.92 * kk + 0.06;
                v.hipL = v.hipR = 1.5; v.kneeL = v.kneeR = 1.2 - 0.6 * sw; v.shL = v.shR = 2.6; v.elL = v.elR = 0.1; v.lean = -0.2 * sw;
                crowd.add(-1, v);
              }
              break;
            }
            case "tahterevalli": {
              const a = 0.14 * Math.sin(time * 1.4 + ph);
              for (const sx of [-1, 1]) {
                start();
                put(it, sx * 1.35, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
                sitPose(v, y0 + 0.58 + sx * 1.35 * a, kk);
                v.shL = v.shR = 0.9; v.elL = v.elR = 0.6;
                crowd.add(-1, v);
              }
              break;
            }
            case "atlikarinca": {
              for (let k = 0; k < 3; k++) {
                start();
                const a = time * 1.2 + (k / 3) * Math.PI * 2;
                put(it, Math.cos(a) * 1.05, Math.sin(a) * 1.05, Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI);
                sitPose(v, y0 + 0.43, kk);
                v.shR = 1.4; v.elR = 0.3;
                crowd.add(-1, v);
              }
              break;
            }
            case "yayli": {
              start();
              const r = Math.sin(time * 3 + ph);
              put(it, -0.8, 0, Math.PI / 2);
              sitPose(v, y0 + 0.88, kk);
              v.lean = 0.25 * r; v.shL = v.shR = 1.0; v.elL = v.elR = 0.5;
              crowd.add(-1, v);
              break;
            }
            case "kum": {
              for (let k = 0; k < 2; k++) {
                start();
                put(it, -0.6 + k * 1.1, 0.4 - k * 0.7, k ? Math.PI : 0);
                v.drop = 0.3 * kk; v.hipL = v.hipR = 1.3; v.kneeL = v.kneeR = 2.0; v.lean = 0.4;
                v.shR = 1.0 + 0.3 * Math.sin(time * 2.5 + ph + k); v.elR = 0.6;
                crowd.add(-1, v);
              }
              break;
            }
            default: {
              // Aletin çevresinde koşuşturma.
              start();
              const a = time * 0.9 + ph, r = Math.max(it.w, it.d) / 2 + 1.2;
              put(it, Math.cos(a) * r, Math.sin(a) * r, Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI);
              walkPose(v, time * 8 + ph, 1);
              crowd.add(-1, v);
            }
          }
        }
        // Kovalamaca: parkın ortasında koşan iki üç çocuk.
        for (let k = 0; k < 3; k++) {
          if (!keepExtra(this.lively, pi * 53 + k * 7)) continue;
          const seed = pi * 53 + k * 7 + this.day;
          resetPose(v); v.height = 1.05 + (seed % 6) * 0.06; v.t = time; dressKid(seed, false);
          const a = time * (0.5 + k * 0.07) + k * 2.1, rx = (f.w ?? 18) * 0.28, rz = (f.d ?? 14) * 0.22;
          v.x = f.x + Math.sin(a) * rx; v.z = f.z + Math.sin(a * 2 + k) * rz;
          v.heading = Math.atan2(Math.cos(a) * rx, 2 * Math.cos(a * 2 + k) * rz);
          v.y = this.world.groundY(v.x, v.z);
          walkPose(v, time * 9 + k, 1);
          crowd.add(-1, v);
        }
        // Veliler: parkın kenarında ayakta sohbet.
        for (let k = 0; k < 2; k++) {
          if (!keepExtra(this.lively, pi * 977 + k * 31)) continue;
          const seed = pi * 977 + k * 31 + this.day;
          resetPose(v); v.height = 1.6 + (seed % 7) * 0.04; v.t = time;
          v.x = f.x + (k ? 1 : -1) * 0.4 + (f.w ?? 18) * 0.45; v.z = f.z + (k ? 0.4 : -0.4);
          v.y = this.world.groundY(v.x, v.z); v.heading = k ? Math.PI : 0;
          idleGesture(v, time, seed, true);
          dressKid(seed, true);
          crowd.add(-1, v);
        }
      }
    }
    // Basketbol sahalarında gençler (sakin değil): okul sonrası ve hafta sonu 3'e 3 oynar; potaya
    // doğru koşar, sıçrayıp atış yapar, savunmada kollarını açar.
    const courtOpen = minute < 1230 && (schoolDay ? minute >= 970 : minute >= 660);
    if (courtOpen) {
      const v = (this._teen ??= {});
      let ci = 0;
      for (const c of this.world.plazas) {
        if (c.kind !== "basket") continue;
        ci++;
        if (!keepExtra(this.lively, ci * 6151)) continue;
        const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, L = c.z1 - c.z0, W = c.x1 - c.x0;
        // Hücum yönü 40 saniyede bir değişir; oyuncular o potanın yarısında hareket eder.
        const dir = Math.floor(time / 40 + ci) % 2 ? 1 : -1;
        const hoop = [cx, cz + dir * (L / 2 - 1.6)];
        for (let k = 0; k < 6; k++) {
          const seed = ci * 61 + k * 13, attack = k < 3;
          const a = time * (0.6 + k * 0.05) + k * 1.9;
          resetPose(v); v.height = 1.6 + (seed % 7) * 0.04; v.t = time;
          v.x = cx + Math.sin(a) * W * 0.3; v.z = cz + dir * (L * 0.18 + Math.cos(a * 0.7 + k) * L * 0.15) + (attack ? 0 : dir * 1.2);
          v.y = this.world.groundY(v.x, v.z);
          v.heading = Math.atan2(hoop[0] - v.x, hoop[1] - v.z);
          const shoot = attack && Math.sin(time * 0.8 + k * 2) > 0.92;
          if (shoot) { v.y += 0.35 * Math.sin((time * 0.8 + k * 2) * 6) ** 2; v.shL = v.shR = 2.8; v.elL = v.elR = 0.4; }
          else { walkPose(v, time * 7 + k, 1); if (!attack) { v.shL = v.shR = 1.2; v.abL = v.abR = 0.6; } }
          Object.assign(v, { style: seed % 3 === 0 ? 1 : 0, skin: P.SKIN[seed % P.SKIN.length], hairColor: P.HAIR[(seed * 3) % P.HAIR.length], top: attack ? TEAM_COLORS[0] : TEAM_COLORS[1], bottom: P.BOTTOMS[1], sleeves: false, beard: false, glasses: false, shorts: true });
          crowd.add(-1, v);
        }
      }
    }
    // Pazarcılar (sakin değil): pazar saatlerinde her tezgâhın arkasında; seslenir, malını düzeltir.
    if (minute >= 480 && minute < 1140) {
      const v = (this._vendorPose ??= {});
      let k = 0;
      for (const f of this.world.features) {
        if (f.type !== "tezgah") continue;
        if (!keepExtra(this.lively, k * 389 + 11)) { k++; continue; }
        resetPose(v);
        v.height = 1.62 + (k % 5) * 0.05; v.t = time;
        const dir = f.dir ?? 1;
        v.x = f.x + ((k % 3) - 1) * 0.6; v.z = f.z - 1.35 * dir; v.y = this.world.groundY(v.x, v.z); v.heading = dir > 0 ? 0 : Math.PI;
        const ph = k * 1.7;
        if (Math.sin(time * 0.2 + ph) > 0.5) { v.lean = 0.45; v.shL = v.shR = 1.0; v.elL = v.elR = 0.5; }
        else idleGesture(v, time, ph, k % 2 === 0);
        Object.assign(v, { style: k % 2, skin: P.SKIN[k % P.SKIN.length], hairColor: P.HAIR[(k * 3) % P.HAIR.length], top: P.CLOTHES[(k * 7) % P.CLOTHES.length], bottom: P.BOTTOMS[k % P.BOTTOMS.length], sleeves: k % 3 !== 0, beard: k % 4 === 1, glasses: k % 5 === 2 });
        crowd.add(-1, v);
        k++;
      }
    }
    this._addWaiting(crowd, time);
    crowd.end();
    this.visibleCount = shown.length;
    // Maç varsa top.
    const m = this.matches?.find((mm) => minute >= mm.start && minute <= mm.end && mm.players.length >= 10);
    this.ball = m ? this.footballState(m, minute).ball : null;
  }

  /**
   * İskelede bekleyenler: TikTok'ta takip etmiş ama aktarımla henüz taşınmamış kişiler (sayı API'den gelir,
   * kimlikleri bilinmez). Vapur iskelesinin kara tarafında, valizleriyle, karaya bakarak bekler; aralarında
   * küçük sohbet grupları olur. Taşınma gününde isim alıp evlerine yürürler.
   */
  _addWaiting(crowd, time) {
    const P0 = this.world.ferryPier;
    const n = Math.min(this.waiting, 120);
    if (!P0 || n <= 0) return;
    const v = (this._waitPose ??= {});
    const h = (a) => (Math.imul((a ^ 0x5bd1e995) | 0, 2654435761) >>> 0) / 4294967296;
    // 1-5 kişilik gruplar, iskelenin iki yanında sıra sıra; kalabalık arttıkça sıralar sıklaşır.
    const groups = [];
    for (let left = n, g = 0; left > 0; g++) {
      const size = Math.min(left, 1 + Math.floor(h(g * 7 + 1) * 4.6));
      groups.push(size);
      left -= size;
    }
    const rows = Math.ceil(groups.length / 2);
    const step = Math.max(1.9, Math.min(3.4, 30 / rows));
    let k = 0;
    groups.forEach((size, g) => {
      const side = g % 2 ? 1 : -1, row = Math.floor(g / 2);
      const cx = side * (1.9 + h(g * 3 + 2) * 1.1), cz = P0.z0 + 6 + row * step + (h(g * 5 + 3) - 0.5) * step * 0.5;
      const rot = h(g * 11 + 4) * Math.PI * 2;
      for (let m = 0; m < size; m++, k++) {
        const seed = 7001 + k * 37;
        resetPose(v);
        v.height = 1.56 + (seed % 9) * 0.03; v.t = time;
        if (size === 1) {
          // Tek başına: korkuluğa yakın, ya denize ya adaya bakar.
          v.x = side * 3.9; v.z = cz;
          v.heading = h(seed) < 0.5 ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI;
        } else {
          const a = rot + (m / size) * Math.PI * 2, r = 0.45 + size * 0.12;
          v.x = cx + Math.cos(a) * r; v.z = cz + Math.sin(a) * r;
          v.heading = Math.atan2(cx - v.x, cz - v.z);
        }
        v.x = Math.max(P0.x0 + 0.9, Math.min(P0.x1 - 0.9, v.x));
        v.y = P0.top;
        idleGesture(v, time, seed % 23, size > 1 && m % 2 === 0);
        v.props = ["valiz"];
        if (seed % 5 === 1) { phonePose(v); v.props = ["telefon", "valiz"]; }
        v.propColor = SUITCASES[seed % SUITCASES.length];
        Object.assign(v, { style: seed % 2, skin: P.SKIN[seed % P.SKIN.length], hairColor: P.HAIR[(seed * 3) % P.HAIR.length], top: P.CLOTHES[(seed * 7) % P.CLOTHES.length], bottom: P.BOTTOMS[(seed * 5) % P.BOTTOMS.length], sleeves: seed % 3 !== 0, beard: seed % 5 === 2, glasses: seed % 6 === 0 });
        crowd.add(-1, v);
      }
    });
  }

  /** Dokunulan figürün sakin indeksi. */
  /** Dokunulan sakin (köpeğe dokunulduysa sahibi); en yakın isabet geçer. */
  pick(raycaster) {
    let best = null, bd = Infinity;
    for (const mesh of this.crowd.pickTargets()) {
      const hit = raycaster.intersectObject(mesh)[0];
      if (hit?.instanceId != null && hit.distance < bd) {
        const i = this.crowd.drawToIndex[hit.instanceId];
        if (i >= 0) { best = i; bd = hit.distance; }
      }
    }
    for (const mesh of this.crowd.dogTargets()) {
      const hit = raycaster.intersectObject(mesh)[0];
      if (hit?.instanceId != null && hit.distance < bd) {
        const i = this.crowd.dogOwner[hit.instanceId];
        if (i >= 0) { best = i; bd = hit.distance; }
      }
    }
    return best;
  }
}
