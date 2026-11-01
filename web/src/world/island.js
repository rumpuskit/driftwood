// Driftwood Island'ın biçimi: kıyı, arazi yüksekliği, ana yollar ve mahalle bölgeleri. Nüfustan bağımsızdır: ada
// boş başladığında da tam hâliyle vardır; mahalleler buradaki bölgelere dolar (layout.js).
//
// Koordinatlar: x doğu, z güney, metre; (0,0) Town Green'in ortası. Ada bir hilal: ana gövde (elips) eksi güneye
// açık Harbor Bay (elips); doğu boynuzu Bluff Head (fundalık yamaç), batı boynuzu kum dili ve ucunda Gull Point Light.
// Kasaba koyun kuzey kıyısında (Water Street, Main Street, Town Green); dış (kuzey) kıyıda Ocean Beach ve kumullar.
import { fbm, hash2 } from "./noise.js";
import SAVED_ZONES from "./zones.json" with { type: "json" };

export const FLAT_Y = 1.2;

const BODY = { x: 0, z: -460, rx: 3300, rz: 1300 };
const BAY = { x: 60, z: 920, rx: 1450, rz: 760 };
export const HUB = [0, 0];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Elipse işaretli uzaklık (yaklaşık, metre; dışarıda +). */
function ellipseSd(x, z, e) {
  const px = (x - e.x) / e.rx, pz = (z - e.z) / e.rz;
  const k0 = Math.hypot(px, pz), k1 = Math.hypot(px / e.rx, pz / e.rz);
  return (k0 * (k0 - 1)) / (k1 || 1e-9);
}

/** Kapsüle işaretli uzaklık (dışarıda +). */
function capsuleSd(x, z, ax, az, bx, bz, r) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(x - ax - vx * t, z - az - vz * t) - r;
}

/** Yumuşak birleşim (içeride + değerler için büyük olan). */
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** Koyun iç kıyısı (gürültüsüz): x'teki kıyı çizgisinin z'si. Kasaba ve rıhtımlar buna göre dizilir. */
export function shoreZ(x) {
  const u = (x - BAY.x) / BAY.rx;
  return BAY.z - BAY.rz * Math.sqrt(Math.max(0, 1 - u * u));
}

/** Main Street'in eksen çizgisi: kıyıdan 106 m içeride (Green'in güney kenarından geçer). */
export const MAIN_X = [-430, 480];
export const mainZ = (x) => shoreZ(x) - 106;
/** Water Street: kıyıdan 30 m içeride. */
export const waterZ = (x) => shoreZ(x) - 30;

// Yapay dolgu: yük terminali ve tersanenin düz rıhtımları.
const PADS = [
  { x0: 590, x1: 735, z0: 150, z1: 268 }, // Freight terminal
  { x0: -1010, x1: -890, z0: 300, z1: 430 }, // Boatyard
];

function boxIn(x, z, b) {
  return Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
}

/** Kasaba kıyısında kıyı gürültüsü yok (rıhtımlar ve sokaklar kıyıya göre dizilir). */
function quiet(x, z) {
  const along = smooth((x + 1250) / 120) * smooth((1000 - x) / 120);
  const near = smooth((170 - Math.abs(z - shoreZ(x))) / 80);
  return along * near;
}

const landCache = new Map();
/** Kara içi uzaklık (metre, yaklaşık): + karada, kıyıda 0, − denizde. */
export function land(x, z) {
  // Anahtar 1/16 m çözünürlükte: tam metreye yuvarlanınca hücredeki ilk sorgunun değeri bütün hücreye dönüyordu
  // (kıyı çizgisi 1 m'lik basamaklar yapıyor, rıhtım duvarı 5 m'de bir ileri geri kırılıyordu; sonuç sorgu
  // sırasına bağlıydı).
  const key = Math.round(x * 16) * 1048576 + Math.round(z * 16);
  let d = landCache.get(key);
  if (d !== undefined) return d;
  d = -ellipseSd(x, z, BODY);
  d = Math.min(d, ellipseSd(x, z, BAY));
  d = smax(d, -capsuleSd(x, z, 1660, 120, 1440, 820, 190), 120); // Bluff Head
  d = smax(d, -capsuleSd(x, z, -1820, 300, -1240, 1010, 55), 60); // kum dili (fener)
  d += fbm(x / 170, z / 170, 5) * 70 * (1 - quiet(x, z));
  for (const p of PADS) d = Math.max(d, Math.min(boxIn(x, z, p), 60));
  if (landCache.size > 400000) landCache.clear();
  landCache.set(key, d);
  return d;
}

// --- ayrılmış alanlar (mahalle kurulmaz) ---

export const RESERVES = {
  town: { x0: -480, x1: 540, z0: -150, z1: 900 }, // Green, Main Street, Water Street, rıhtımlar (güneyi deniz)
  bog: { x0: -1320, x1: -760, z0: -560, z1: 300 }, // kızılcık bataklıkları, elma bahçesi, ahır
  field: { x0: -470, x1: -190, z0: -380, z1: -150 }, // lise ve Gulls Field (kasabanın kuzeybatısı)
  pond: { x: 640, z: -470, r: 120 }, // Kettle Pond parkı
  bluff: { x: 1640, z: 120, r: 480 }, // Bluff Head fundalığı
  spit: { x0: -1950, x1: -1150, z0: 180, z1: 1100 }, // kum dili ve fener
  marina: { x0: -1150, x1: -480, z0: 160, z1: 900 }, // marina, balıkçı iskelesi, tersane
  services: { x0: -730, x1: -480, z0: -120, z1: 160 }, // itfaiye ve belediye garajı (Lighthouse Road)
};

/** Dış kıyıya (kuzey) uzaklık: kumullar ve plaj şeridi. */
export function northShoreZ(x) {
  const u = (x - BODY.x) / BODY.rx;
  return BODY.z - BODY.rz * Math.sqrt(Math.max(0, 1 - u * u));
}

/** late: 25. mahalleden sonra kumulların iç kenarı ve fundalığın dış halkası da kullanılabilir (ada doluyor). */
export function inReserve(x, z, pad = 0, late = false) {
  const R = RESERVES;
  for (const k of ["town", "bog", "field", "spit", "marina", "services"]) {
    const b = R[k];
    if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return k;
  }
  if (Math.hypot(x - R.pond.x, z - R.pond.z) < R.pond.r + pad) return "pond";
  if (Math.hypot(x - R.bluff.x, z - R.bluff.z) < (late ? 320 : R.bluff.r) + pad) return "bluff";
  if (z < northShoreZ(x) + (late ? 105 : 160) + pad) return "dunes";
  return null;
}

// --- ana yollar (kasabadan dışa; mahalleler bunların iki yanına dizilir) ---

const MX0 = MAIN_X[0], MX1 = MAIN_X[1];
export const TRUNKS = [
  // Pond Road: Green'in kuzeydoğu köşesinden Kettle Pond'un batısından kumullara.
  { id: "pond", name: "Pond Road", pts: [[90, -58], [170, -190], [330, -330], [470, -470], [520, -700], [560, -950], [600, -1420]] },
  // Beach Road: Green'in kuzeybatı köşesinden okyanus plajına.
  { id: "beach", name: "Beach Road", pts: [[-90, -58], [-110, -230], [-115, -480], [-100, -800], [-90, -1100], [-80, -1520]] },
  // Bluff Road: Main Street'in doğu ucundan Bluff Head'e.
  { id: "bluff", name: "Bluff Road", pts: [[MX1, mainZ(MX1)], [640, 70], [830, -10], [1050, -60], [1250, -40], [1450, 40]] },
  // Lighthouse Road: Main Street'in batı ucundan iç kesimden kum diline.
  { id: "light", name: "Lighthouse Road", pts: [[MX0, mainZ(MX0)], [-560, 60], [-760, 20], [-1050, 0], [-1450, 60], [-1700, 260]] },
];

/** Polilin üstünde s uzunluğundaki nokta ve birim teğet. */
export function along(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (s <= L || i === pts.length - 1) {
      const t = clamp(s / L, 0, 1);
      return { p: [ax + (bx - ax) * t, az + (bz - az) * t], t: [(bx - ax) / L, (bz - az) / L] };
    }
    s -= L;
  }
  return { p: pts[0], t: [1, 0] };
}

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// --- mahalle bölgeleri ---
//
// Her bölge döndürülmüş bir dikdörtgen: yerel u ana yol boyunca, v yoldan içeri (derinlik). Giriş kenarı (v = 0)
// ana yola bakar; ortada giriş caddesi (u = 0) içeri gider, iki yanında 5 sıra sokak (10 sokak), en dışta mahalle
// yerleri şeridi ve kenar yolları. Genişlik konut tipine göre (ev cephesi × evler).

export const ZONE = { pitch: 60, row0: 30, avenue: 7, strip: 27, side: 7, depth: 310 };

/** Konut tipinin ölçüleri: sokakta bir yandaki ev sayısı, ev cephesi (parsel genişliği). */
export const HOUSE = {
  cottage: { perSide: 20, lot: 14 },
  twofamily: { perSide: 10, lot: 16 },
  fourplex: { perSide: 5, lot: 22 },
  apartments: { perSide: 3, lot: 34 },
};

export function streetLength(tip) {
  return HOUSE[tip].perSide * HOUSE[tip].lot;
}

export function zoneHalfWidth(tip) {
  return ZONE.avenue + streetLength(tip) + ZONE.strip + ZONE.side + 6;
}

/** Bölgenin yerel (u, v) noktasından dünyaya. */
export function zoneToWorld(z, u, v) {
  const [tx, tz] = z.t, nx = z.n[0], nz = z.n[1];
  return [z.ox + tx * u + nx * v, z.oz + tz * u + nz * v];
}

export function worldToZone(z, x, y) {
  const dx = x - z.ox, dz = y - z.oz;
  return [dx * z.t[0] + dz * z.t[1], dx * z.n[0] + dz * z.n[1]];
}

/** Bölgenin dört köşesi (dünya), pad kadar büyütülmüş. */
function corners(z, pad) {
  const D = ZONE.depth;
  return [[-z.hw - pad, -pad], [z.hw + pad, -pad], [z.hw + pad, D + pad], [-z.hw - pad, D + pad]].map(([u, v]) => zoneToWorld(z, u, v));
}

function rectsOverlap(a, b, pad) {
  const A = corners(a, pad), B = corners(b, pad);
  for (const ax of [a.t, a.n, b.t, b.n]) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const d = x * ax[0] + z * ax[1]; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, z] of B) { const d = x * ax[0] + z * ax[1]; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}

let trunkCache = null;
function trunkSamples() {
  if (!trunkCache) {
    trunkCache = [];
    for (const tr of TRUNKS) {
      const L = polyLength(tr.pts);
      for (let s = 0; s <= L; s += 8) trunkCache.push(along(tr.pts, s).p);
    }
  }
  return trunkCache;
}

function zoneFits(c, placed) {
  const hw = c.hw, D = ZONE.depth;
  // Kenar örnekleri: karada (kıyıdan 55 m içeride), ayrılmış alanların dışında.
  for (let u = -hw; u <= hw + 0.1; u += Math.min(40, hw)) {
    for (let v = 0; v <= D + 0.1; v += 50) {
      const [x, z] = zoneToWorld(c, u, v);
      if (land(x, z) < 45) return false;
      if (inReserve(x, z, 12, c.m >= 25)) return false;
    }
  }
  // Diğer bölgelerle çakışma: dikdörtgenler arasında en az 3 m (yollar bölgelerin içinde, kenara 7 m). Kesin test:
  // döndürülmüş iki dikdörtgende ayırma ekseni (SAT), her biri 1,5 m büyütülmüş.
  for (const o of placed) {
    if (Math.hypot(o.cx - c.cx, o.cz - c.cz) > o.r + c.r + 10) continue;
    if (rectsOverlap(c, o, 1.5)) return false;
  }
  // Hiçbir ana yol bölgenin içinden geçmez (kendi giriş yolu dışarıda kalır).
  for (const p of trunkSamples()) {
    if (Math.abs(p[0] - c.cx) > c.r + 10 || Math.abs(p[1] - c.cz) > c.r + 10) continue;
    const [u, v] = worldToZone(c, p[0], p[1]);
    if (Math.abs(u) < hw + 4 && v > 4 && v < D + 4) return false;
  }
  return true;
}

/** Bölgenin çevre yolları (yan ve arka; dünya koordinatında, dışa bakan yönüyle): komşu bölgeler bunlara bağlanır. */
export function zoneEdges(z) {
  const D = ZONE.depth, e = ZONE.side, hw = z.hw;
  const P = (u, v) => zoneToWorld(z, u, v);
  return [
    { pts: [P(-hw + e, -11), P(-hw + e, D - e)], out: [-z.t[0], -z.t[1]] }, // sol yan
    { pts: [P(hw - e, D - e), P(hw - e, -11)], out: z.t }, // sağ yan
    { pts: [P(hw - e, D - e), P(-hw + e, D - e)], out: z.n }, // arka
  ];
}

let zoneCache = null;

/**
 * 50 mahalle bölgesinin yeri (ada başına; sonraki adalar aynı planı kullanır). Sırayla, kasabaya en yakın sığan
 * yere: bir ana yolun ya da önceki bir mahallenin çevre yolunun yanına (giriş kenarı yolun 11 m yanında, yola teğet).
 * Kasaba böylece yollar boyunca bitişik büyür. typeOf(m) → konut tipi ("cottage", ...).
 */
export function zones(count, typeOf) {
  if (zoneCache && zoneCache.length >= count) return zoneCache;
  // Önceden hesaplanmış kopya (web/tests/zones.mjs ile üretilir ve CI'da doğrulanır).
  if (SAVED_ZONES.length >= count && SAVED_ZONES.every((z) => z.tip === typeOf(z.m))) return (zoneCache = SAVED_ZONES);
  return (zoneCache = computeZones(count, typeOf));
}

/** Bölgeleri sıfırdan hesaplar (zones.json'u üretmek ve doğrulamak için). */
export function computeZones(count, typeOf) {
  const placed = [];
  for (let m = 0; m < count; m++) {
    const tip = typeOf(m), hw = zoneHalfWidth(tip);
    const roads = TRUNKS.map((tr) => ({ pts: tr.pts, sides: [-1, 1], id: tr.id }));
    for (const o of placed) for (const [k, e] of zoneEdges(o).entries()) roads.push({ pts: e.pts, out: e.out, id: `m${o.m}:${k}` });
    // Adaylar maliyete göre (eşitlikte üretim sırasıyla) denenir; ilk sığan en ucuzdur.
    const cands = [];
    for (const rd of roads) {
      const L = polyLength(rd.pts);
      for (let s = Math.min(hw + 10, L / 2); s <= L - Math.min(hw + 10, L / 2) + 0.1; s += 12) {
        const { p } = along(rd.pts, s);
        const a = along(rd.pts, Math.max(0, s - hw * 0.8)).p, b = along(rd.pts, Math.min(L, s + hw * 0.8)).p;
        const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const tt = [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl];
        for (const side of [-1, 1]) {
          const n = [-tt[1] * side, tt[0] * side];
          if (rd.out && n[0] * rd.out[0] + n[1] * rd.out[1] < 0.5) continue; // bölge yolu: yalnız dış yana
          const ox = p[0] + n[0] * 11, oz = p[1] + n[1] * 11;
          // Yerel u ekseni: v (n) ile sağ el sistemi olsun diye yana göre çevrilir.
          const c = { m, tip, hw, ox, oz, t: side > 0 ? tt : [-tt[0], -tt[1]], n, road: rd.id, s, side };
          [c.cx, c.cz] = zoneToWorld(c, 0, ZONE.depth / 2);
          c.r = Math.hypot(hw, ZONE.depth / 2);
          // Kasabaya yakınlık; kuzey-güney biraz ağır (önce koy boyu, sonra içeri).
          c.cost = Math.hypot(c.cx, c.cz * 1.15) + hash2(m, Math.round(s), 91) * 4;
          c.i = cands.length;
          cands.push(c);
        }
      }
    }
    cands.sort((a, b) => a.cost - b.cost || a.i - b.i);
    let best = null;
    for (const c of cands) if (zoneFits(c, placed)) { best = c; break; }
    if (!best) break; // ada doldu (sonraki mahalleler: sonraki ada)
    placed.push(best);
  }
  return placed;
}

// --- arazi yüksekliği ---

/** Bluff Head'in fundalık tepesi ve batıdaki hafif tepeler; kasaba ve mahalleler düz (FLAT_Y). */
export function naturalHeight(x, z) {
  let h = Math.max(0, fbm(x / 110, z / 110, 3)) * 7;
  const bx = x - 1680, bz = z - 120;
  h += Math.exp(-(bx * bx + bz * bz) / (2 * 260 * 260)) * (26 + 6 * fbm(x / 60, z / 60, 11));
  // Kumullar: dış kıyıdan 25–190 m içeride, rüzgârla uzamış tepecikler.
  const dn = z - northShoreZ(x);
  if (dn > 15 && dn < 230) {
    const env = smooth((dn - 15) / 40) * smooth((230 - dn) / 70);
    h += env * (2.2 + (fbm(x / 38, z / 16, 17) + 0.5) * 5.5);
  }
  return h;
}

/** 0..1: arazi ne kadar düzlenmiş (kasaba, mahalle bölgeleri, tarlalar). Izgarada önceden hesaplanır. */
let flatGrid = null;
export function setFlatAreas(rects) {
  // rects: [{poly: [[x,z]...]}] (dışbükey dörtgenler); 10 m ızgara, 30 m yumuşak kenar.
  const S = 10, X0 = -2900, Z0 = -1600, NX = 580, NZ = 290;
  const g = new Float32Array(NX * NZ);
  const inside = (poly, x, z) => {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
      const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez);
      d = Math.min(d, ((x - ax) * -ez + (z - az) * ex) / L); // iç tarafta + (saat yönünün tersi)
    }
    return d;
  };
  // Her çokgen yalnız kendi sınır kutusundaki (+40 m) hücreleri günceller.
  for (const r of rects) {
    const xs = r.poly.map((q) => q[0]), zs = r.poly.map((q) => q[1]);
    const i0 = clamp(Math.floor((Math.min(...xs) - 40 - X0) / S), 0, NX - 1), i1 = clamp(Math.ceil((Math.max(...xs) + 40 - X0) / S), 0, NX - 1);
    const j0 = clamp(Math.floor((Math.min(...zs) - 40 - Z0) / S), 0, NZ - 1), j1 = clamp(Math.ceil((Math.max(...zs) + 40 - Z0) / S), 0, NZ - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * NX + i;
        if (g[k] >= 1) continue;
        const d = inside(r.poly, X0 + i * S, Z0 + j * S);
        if (d > -40) g[k] = Math.max(g[k], smooth((d + 40) / 40));
      }
    }
  }
  flatGrid = { g, S, X0, Z0, NX, NZ };
}

export function flatness(x, z) {
  if (!flatGrid) return 0;
  const { g, S, X0, Z0, NX, NZ } = flatGrid;
  const fx = (x - X0) / S, fz = (z - Z0) / S;
  const i = clamp(Math.floor(fx), 0, NX - 2), j = clamp(Math.floor(fz), 0, NZ - 2);
  const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
  const a = g[j * NX + i], b = g[j * NX + i + 1], c = g[(j + 1) * NX + i], d = g[(j + 1) * NX + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Kasaba kıyısı rıhtım mı (0..1)? Koy boyunca x −1000…800: kumsal yerine taş rıhtım duvarı. */
export function quay(x, z) {
  return quiet(x, z) * smooth((x + 1000) / 30) * smooth((800 - x) / 30);
}

/** Doğal arazi (tesviyesiz): kıyıda denize iner, Bluff Head kıyısı sarp (kaya), kasaba önünde rıhtım duvarı. */
export function terrainHeight(x, z) {
  const L = land(x, z);
  const f = flatness(x, z);
  const q = quay(x, z);
  // Rıhtımın arkası düz (duvar başlığı arazinin hemen üstünde kalsın): doğal tümsekler kıyıdan 20–45 m içeride söner.
  let h = FLAT_Y + naturalHeight(x, z) * (1 - f) * (1 - q * smooth((45 - L) / 25));
  const bluff = Math.exp(-((x - 1680) ** 2 + (z - 120) ** 2) / (2 * 330 * 330));
  // Bluff'ta kıyı şeridi dar; rıhtımda arazi kıyı çizgisinin 0,5 m içinde, duvarın (1 m kalınlık, kıyı çizgisinde)
  // altında iner: duvarın kara yüzü açıkta kalmaz.
  const band = (40 - 26 * bluff) * (1 - q) + 0.5 * q;
  if (q > 0.9) {
    // Rıhtım: kıyı çizgisinin 0,5 m içine (duvarın kara yüzü) kadar tam yükseklik, sonra 0,2 m'de duvarın dibine.
    const t = clamp((0.5 - L) / 0.2, 0, 1);
    return L >= 0.5 ? h : h * (1 - t) - 2.5 * t + Math.min(0, L) * 0.06;
  }
  if (L >= band) return h;
  if (L >= 0) {
    const t = 1 - L / band;
    return h * (1 - smooth(t)) - 0.3 * t - 2.2 * q * t;
  }
  return Math.max(-12, (-0.3 + L * 0.12) * (1 - q) + (-2.5 + L * 0.06) * q);
}
