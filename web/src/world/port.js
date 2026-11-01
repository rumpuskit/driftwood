// Yük limanı: rıhtım, konteyner gemisi, rıhtım vinci, istif sahası, istifleyici (reach stacker), forklift,
// tır, ambar önü, çit, kapı ve bekçi kulübesi, aydınlatma direkleri.
//
// Hareketler tek bir zaman işlevinden (portMotion) gelir: aynı anda bakan herkes aynı şeyi görür ve
// liman işçilerinin duruşları (vinç kabinindeki operatör, araçlardaki sürücüler, gemideki bağlamacılar)
// bu işlevle birebir hizalanır. Döngü 240 sn: vinç gemiden bir konteyneri rıhtıma indirir, istifleyici
// onu istif sahasına taşır; sonra geri getirir ve vinç gemiye yükler (konteyner hiçbir an kaybolmaz).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { box, colored, cyl, hull, MAT, METAL, rod } from "./harbor.js";

const CL = 6.06, CH = 2.59, CW = 2.44; // 20 ftlik konteyner
const CYCLE = 240;
const SPREADER_HIGH = 19;
const SHIP_ROW0 = -4.0; // gemideki ilk konteyner sırasının gemi ekseninden uzaklığı (m)
const BAY = CL + 0.35; // gemide bölmeler arası

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const lerp = (a, b, u) => a + (b - a) * u;
/** [t0, t1] aralığında 0→1 yumuşak geçiş. */
const span = (t, t0, t1) => smooth(clamp01((t - t0) / (t1 - t0)));

// --- yol parçaları (istifleyici) ---

function bezier(p0, p1, p2, p3, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push([v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]]);
  }
  return out;
}

/** Parçalar: {pts, rev}. Çıktı: tek çizgi, birikimli uzunluk ve her noktada geri vites bilgisi. */
function chain(parts) {
  const pts = [], rev = [];
  for (const p of parts) {
    for (let i = pts.length ? 1 : 0; i < p.pts.length; i++) { pts.push(p.pts[i]); rev.push(p.rev); }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, rev, cum, len: cum[cum.length - 1] };
}

function along(c, u) {
  const d = clamp01(u) * c.len;
  let i = 1;
  while (i < c.pts.length - 1 && c.cum[i] < d) i++;
  const a = c.pts[i - 1], b = c.pts[i];
  const L = c.cum[i] - c.cum[i - 1] || 1;
  const f = (d - c.cum[i - 1]) / L;
  const tx = b[0] - a[0], tz = b[1] - a[1];
  let heading = Math.atan2(tx, tz);
  if (c.rev[i]) heading += Math.PI;
  return { x: a[0] + tx * f, z: a[1] + tz * f, heading };
}

/** Limanın yerleşimine göre sabit yollar ve noktalar (bir kez hesaplanır). */
function plan(P) {
  if (P._plan) return P._plan;
  const [tx, tz] = P.transfer;
  const slot = [115, 205.2]; // istifte ikinci kat
  const reach = 4.6; // ön dingilden kıskaca
  const A = [tx, tz - reach], home = [slot[0], 190], B = [slot[0], slot[1] - reach];
  const pivot = [tx, 214];
  const toStack = chain([
    { pts: [A, pivot], rev: true },
    { pts: bezier(pivot, [tx, 202], [slot[0], 202], home), rev: true },
    { pts: [home, B], rev: false },
  ]);
  const toTransfer = chain([
    { pts: [B, home], rev: true },
    { pts: bezier(home, [slot[0], 202], [tx, 202], pivot), rev: false },
    { pts: [pivot, A], rev: false },
  ]);
  const homeToA = chain([{ pts: bezier(home, [slot[0], 202], [tx, 202], pivot), rev: false }, { pts: [pivot, A], rev: false }]);
  const aToHome = chain([{ pts: [A, pivot], rev: true }, { pts: bezier(pivot, [tx, 202], [slot[0], 202], home), rev: true }]);
  const homeToB = chain([{ pts: [home, B], rev: false }]);
  const bToHome = chain([{ pts: [B, home], rev: true }]);
  const shipZ = P.ship.z + SHIP_ROW0 + 2 * (CW + 0.25); // vincin çalıştığı sıra (gemide 3. sıra)
  const deck = shipDeckY(P);
  P._plan = { slot, reach, A, B, home, toStack, toTransfer, homeToA, aToHome, homeToB, bToHome, shipZ, hatch: deck + 1.05 };
  return P._plan;
}

/** Gemi güvertesinin (orta bölüm) su hattından yüksekliği; hull() ile aynı formül. */
export function shipDeckY(P) {
  const d = P.ship.depth;
  return d * (0.62 + 0.3 * 0.25) - Math.min(0.32, d * 0.3);
}

/** Geminin hafif sallantısı. */
export function shipBob(t) {
  return { y: 0.06 * Math.sin(t * 0.45), roll: 0.006 * Math.sin(t * 0.32 + 1.1) };
}

/**
 * Limanın t anındaki hali. t: saniye (gerçek zaman). Dönen her şey dünya koordinatında.
 *  crane: {z: araba (trolley) konumu, y: kıskacın alt yüksekliği, carry}
 *  stacker: {x, z, heading, y: kıskaç alt yüksekliği, carry}
 *  forklift: {x, z, heading, forkY, carry}
 *  box: taşınan konteynerin alt-orta noktası [x, y, z]
 */
export function portMotion(P, t, tf = t) {
  const L = plan(P);
  const tt = ((t % CYCLE) + CYCLE) % CYCLE;
  const top = P.top;
  const bob = shipBob(t);
  const shipBox = L.hatch + CH + bob.y; // gemide ikinci katın altı
  const quayBox = top;
  const high = top + SPREADER_HIGH;
  const tz = P.transfer[1];

  // Vinç: 0-60 gemiden boşaltma, 192-240 gemiye yükleme.
  let cz = tz, cy = high, ccarry = false;
  if (tt < 60) {
    cz = tt < 28 ? lerp(tz, L.shipZ, span(tt, 0, 8)) : lerp(L.shipZ, tz, span(tt, 28, 40));
    const down = tt < 28 ? span(tt, 8, 16) - span(tt, 20, 28) : span(tt, 40, 48) - span(tt, 52, 60);
    const target = tt < 28 ? shipBox + CH : quayBox + CH;
    cy = lerp(high, target, down);
    ccarry = tt >= 18 && tt < 50;
  } else if (tt >= 192) {
    const u = tt - 192;
    cz = u < 20 ? tz : lerp(tz, L.shipZ, span(u, 20, 32));
    const down = u < 20 ? span(u, 0, 8) - span(u, 12, 20) : span(u, 32, 40) - span(u, 44, 48);
    const target = u < 20 ? quayBox + CH : shipBox + CH;
    cy = lerp(high, target, down);
    ccarry = u >= 10 && u < 42;
    if (u >= 44) cz = lerp(L.shipZ, tz, span(u, 44, 48));
  }

  // İstifleyici.
  const carryY = top + 1.2 + CH; // taşırken kıskaç altı
  let s = { ...along(L.homeToB, 0), y: carryY, carry: false };
  const groundPick = top + CH, stackPick = top + 2 * CH;
  if (tt >= 52 && tt < 64) s = { ...along(L.homeToA, span(tt, 52, 64)), y: carryY + 1, carry: false };
  else if (tt >= 64 && tt < 72) s = { ...along(L.homeToA, 1), y: lerp(carryY + 1, groundPick, span(tt, 64, 68)) + (carryY - groundPick) * span(tt, 70, 72), carry: tt >= 70 };
  else if (tt >= 72 && tt < 88) s = { ...along(L.toStack, span(tt, 72, 88)), y: lerp(carryY, stackPick + 0.3, span(tt, 84, 88)), carry: true };
  else if (tt >= 88 && tt < 96) s = { ...along(L.toStack, 1), y: lerp(stackPick + 0.3, stackPick, span(tt, 88, 92)) + 1.2 * span(tt, 94, 96), carry: tt < 94 };
  else if (tt >= 96 && tt < 104) s = { ...along(L.bToHome, span(tt, 96, 104)), y: stackPick + 1.2, carry: false };
  else if (tt >= 150 && tt < 158) s = { ...along(L.homeToB, span(tt, 150, 158)), y: lerp(stackPick + 1.2, stackPick, span(tt, 156, 158)), carry: false };
  else if (tt >= 158 && tt < 166) s = { ...along(L.homeToB, 1), y: stackPick + 0.3 * span(tt, 162, 166), carry: tt >= 162 };
  else if (tt >= 166 && tt < 182) s = { ...along(L.toTransfer, span(tt, 166, 182)), y: lerp(stackPick + 0.3, carryY, span(tt, 166, 170)), carry: true };
  else if (tt >= 182 && tt < 188) s = { ...along(L.toTransfer, 1), y: lerp(carryY, groundPick, span(tt, 182, 186)) + 1.4 * span(tt, 186, 188), carry: tt < 186 };
  else if (tt >= 188 && tt < 200) s = { ...along(L.aToHome, span(tt, 188, 200)), y: groundPick + 1.4, carry: false };
  else if (tt >= 104 && tt < 150) s = { ...along(L.bToHome, 1), y: stackPick + 1.2, carry: false };

  // Konteyner nerede?
  const shipSlot = [P.crane.x, shipBox, L.shipZ];
  const quaySlot = [P.crane.x, quayBox, tz];
  const stackSlot = [L.slot[0], top + CH, L.slot[1]];
  const sx = s.x + Math.sin(s.heading) * L.reach, sz = s.z + Math.cos(s.heading) * L.reach;
  let bx;
  if (ccarry) bx = [P.crane.x, cy - CH, cz];
  else if (s.carry) bx = [sx, s.y - CH, sz];
  else if (tt < 18 || tt >= 234) bx = shipSlot;
  else if (tt < 94 && tt >= 50) bx = quaySlot;
  else if (tt >= 94 && tt < 162) bx = stackSlot;
  else bx = quaySlot;
  // Konteynerin boyu istifleyiciye dik: istifleyici +z'ye bakarken konteyner x boyunca durur.
  const boxHeading = s.carry ? s.heading : 0;

  // Forklift: ambar kapısından tırın arkasına palet taşır (60 sn döngü).
  const f = forkliftMotion(P, tf);

  return { crane: { z: cz, y: cy, carry: ccarry }, stacker: s, forklift: f, box: bx, boxHeading, bob };
}

// --- araçlardaki koltuklar (sürücülerin duruşu için) ---

const BOOM_DY = 30; // bomun rıhtımdan yüksekliği
const rotate = (h, lx, lz) => [lx * Math.cos(h) + lz * Math.sin(h), -lx * Math.sin(h) + lz * Math.cos(h)];

/** Vinç operatörü: arabanın altındaki camlı kabinde, denize bakar. {x, y(oturak üstü), z, heading} */
export function craneSeat(P, M) {
  return { x: P.crane.x - 2.2, y: P.top + BOOM_DY - 1.6 - 2.7 + 0.5, z: M.crane.z + 0.9, heading: 0 };
}

export function stackerSeat(P, M) {
  const s = M.stacker;
  const [dx, dz] = rotate(s.heading, -0.9, -3.5);
  return { x: s.x + dx, y: P.top + 2.85, z: s.z + dz, heading: s.heading };
}

export function forkliftSeat(P, M) {
  const f = M.forklift;
  return { x: f.x, y: P.top + 1.25, z: f.z - 1.25, heading: f.heading, rev: f.rev };
}

/** Gemi güvertesinde (yan geçitte) bir noktanın yüksekliği. */
export function shipWalkY(P, M) {
  return shipDeckY(P) + M.bob.y + 0.05;
}

function forkliftMotion(P, t) {
  const u = ((t % 60) + 60) % 60;
  // Ambarın önünden (cephenin 1,2 m dışı) dorsenin arkasına; çatallar dorse tabanına kalkar.
  const x = P.truck.x, z0 = P.warehouse.z + P.warehouse.d / 2 + 1.2, z1 = P.truck.z - 6.5 - 1.6;
  const top = P.top;
  let z = z0, forkY = top + 0.15, carry = true, rev = false;
  if (u < 12) { z = lerp(z0, z1, span(u, 2, 12)); forkY = top + 0.25; }
  else if (u < 24) { z = z1 + 0.9 * span(u, 16, 20); forkY = lerp(top + 0.25, top + 1.35, span(u, 12, 16)); carry = u < 21; }
  else if (u < 36) { z = lerp(z1 + 0.9, z0, span(u, 24, 36)); forkY = lerp(top + 1.35, top + 0.15, span(u, 24, 28)); carry = false; rev = true; }
  else { z = z0; forkY = top + 0.15; carry = u > 48; }
  return { x, z, heading: 0, forkY, carry, rev };
}

// --- çizim ---

function concreteTop(P) {
  const W = P.x1 - P.x0, D = P.z1 - P.z0, ppm = 8;
  const c = document.createElement("canvas");
  c.width = Math.round(W * ppm); c.height = Math.round(D * ppm);
  const g = c.getContext("2d");
  const X = (x) => (x - P.x0) * ppm, Z = (z) => (z - P.z0) * ppm;
  g.fillStyle = "#a7a9a6"; g.fillRect(0, 0, c.width, c.height);
  // Beton dökme panelleri ve derzler.
  for (let x = P.x0; x < P.x1; x += 6) for (let z = P.z0; z < P.z1; z += 6) {
    const v = 160 + ((x * 7 + z * 13) % 17);
    g.fillStyle = `rgb(${v},${v + 2},${v - 1})`; g.fillRect(X(x) + 1, Z(z) + 1, 6 * ppm - 2, 6 * ppm - 2);
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"; g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); }
  // Rıhtım kenarı: sarı-siyah tehlike şeridi.
  for (let x = P.x0; x < P.x1; x += 1) { g.fillStyle = Math.floor(x) % 2 ? "#e8b62a" : "#2a2a2a"; g.fillRect(X(x), Z(P.z1 - 1.2), ppm, 0.9 * ppm); }
  // Vinç rayları.
  g.fillStyle = "#5b5f66";
  for (const rz of [P.crane.landZ, P.crane.seaZ]) g.fillRect(0, Z(rz) - 2, c.width, 4);
  // Sarı yürüme ve araç şeritleri, istif yerleri.
  g.strokeStyle = "#e8c22e"; g.lineWidth = 3;
  g.strokeRect(X(P.stack.x0 - 1.5), Z(P.stack.z0 - 1.5), (P.stack.x1 - P.stack.x0 + 3) * ppm, (P.stack.z1 - P.stack.z0 + 3) * ppm);
  g.strokeStyle = "rgba(245,245,240,0.85)"; g.lineWidth = 2;
  for (let x = P.stack.x0; x + CL <= P.stack.x1 + 0.1; x += CL + 0.5) for (let z = P.stack.z0; z + CW <= P.stack.z1 + 0.1; z += CW + 0.4) g.strokeRect(X(x), Z(z), CL * ppm, CW * ppm);
  g.fillStyle = "#e8c22e";
  for (let x = P.x0 + 2; x < P.x1 - 2; x += 4) g.fillRect(X(x), Z(P.crane.landZ - 4), 2.2 * ppm, 0.25 * ppm);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function ribTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 8) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, 0, 3, 64); g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(x + 3, 0, 1, 64); }
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 0, 128, 3); g.fillRect(0, 61, 128, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CONTAINER_COLORS = ["#2f5f9a", "#b8312f", "#2f7a4f", "#d9822b", "#7a7f87", "#e3e1da", "#8a3b6f", "#1f8a8a"];

export function buildPort(world) {
  const P = world.port;
  const L = plan(P);
  const group = new THREE.Group();
  const top = P.top;
  const W = P.x1 - P.x0, D = P.z1 - P.z0, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;

  // Rıhtım platformu: üstü beton döşeme (işaretli), yanları beton duvar.
  const wall = new THREE.MeshStandardMaterial({ color: "#9a9c98", roughness: 0.95 });
  const deckTop = new THREE.MeshStandardMaterial({ map: concreteTop(P), roughness: 0.92 });
  group.userData.groundMaterials = [deckTop]; // gece direk ışıkları bu zemine düşer
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, top + 9, D), [wall, wall, deckTop, wall, wall, wall]);
  deck.position.set(cx, (top - 9) / 2, cz);
  deck.receiveShadow = true;
  group.add(deck);

  const parts = [], metal = [];
  // Rıhtım ağzı: başlık kirişi, lastik usturmaçalar, babalar, merdivenler.
  parts.push(box(W, 0.35, 0.8, cx, top + 0.17, P.z1 - 0.4, "#c9c6bd"));
  for (let x = P.x0 + 4; x < P.x1 - 2; x += 8) {
    parts.push(box(0.9, 2.6, 0.5, x, top - 1.7, P.z1 + 0.25, "#1f1f22"));
    parts.push(box(1.4, 0.35, 0.6, x, top - 2.9, P.z1 + 0.3, "#1f1f22"));
  }
  for (let x = P.x0 + 6; x < P.x1; x += 14) {
    metal.push(cyl(0.28, 0.34, 0.6, x, top + 0.3, P.z1 - 1.0, "#26292e", 12));
    metal.push(cyl(0.42, 0.42, 0.12, x, top + 0.66, P.z1 - 1.0, "#26292e", 12));
  }
  for (let x = P.x0 + 11; x < P.x1; x += 28) {
    for (let y = -2.5; y < top; y += 0.4) metal.push(box(0.6, 0.04, 0.04, x, y, P.z1 + 0.12, "#3a3f47"));
    for (const dx of [-0.3, 0.3]) metal.push(box(0.05, top + 3.2, 0.05, x + dx, (top - 3) / 2 + 0.6, P.z1 + 0.12, "#3a3f47"));
  }

  // Çit (kara tarafı ve iki yan, kapıda açıklık), kapı bariyeri ve bekçi kulübesi.
  const fenceMat = new THREE.MeshStandardMaterial({ color: "#7c8590", transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4, depthWrite: false });
  const fenceRuns = [
    [[P.x0, P.z0], [P.gateX - 5, P.z0]], [[P.gateX + 5, P.z0], [P.x1, P.z0]],
    [[P.x0, P.z0], [P.x0, P.z1 - 22]], [[P.x1, P.z0], [P.x1, P.z1 - 22]],
  ];
  for (const [a, b] of fenceRuns) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2), fenceMat);
    panel.position.set((a[0] + b[0]) / 2, top + 1.1, (a[1] + b[1]) / 2);
    panel.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;
    group.add(panel);
    const n = Math.ceil(len / 3);
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      metal.push(box(0.07, 2.4, 0.07, a[0] + (b[0] - a[0]) * u, top + 1.2, a[1] + (b[1] - a[1]) * u, "#4a525c"));
    }
    metal.push(rod(new THREE.Vector3(a[0], top + 2.25, a[1]), new THREE.Vector3(b[0], top + 2.25, b[1]), 0.035, "#4a525c"));
  }
  // Bariyer kolu (kırmızı-beyaz) ve kulübe.
  metal.push(box(0.3, 1.0, 0.3, P.gateX + 4.6, top + 0.5, P.z0 + 0.4, "#d9d6cc"));
  for (let k = 0; k < 8; k++) parts.push(box(1.1, 0.12, 0.12, P.gateX + 4 - k * 1.1, top + 1.0, P.z0 + 0.4, k % 2 ? "#f4f4f1" : "#d8342b"));
  const [bx, bz] = P.booth;
  parts.push(box(2.6, 2.5, 2.2, bx, top + 1.25, bz, "#e9e5dc"), box(3.0, 0.15, 2.6, bx, top + 2.58, bz, "#5b6470"));
  parts.push(box(2.0, 0.9, 0.05, bx, top + 1.6, bz - 1.11, "#9fc3d8"), box(0.05, 0.9, 1.4, bx - 1.31, top + 1.6, bz, "#9fc3d8"));
  parts.push(box(0.8, 0.05, 0.5, bx - 0.5, top + 0.9, bz - 0.7, "#8a6a4a"));
  // Molada oturulan banklar ve çay ocağı (ambar önünde).
  for (const [x, z] of P.benches) {
    parts.push(box(2.0, 0.08, 0.45, x, top + 0.45, z, "#8a6a4a"), box(2.0, 0.45, 0.06, x, top + 0.7, z + 0.22, "#8a6a4a"));
    for (const dx of [-0.85, 0.85]) metal.push(box(0.06, 0.45, 0.4, x + dx, top + 0.22, z, "#3a3f47"));
  }
  // Paletler ve kasalar (ambar önü), can simidi dolapları, yangın dolabı.
  for (let k = 0; k < 4; k++) {
    const x = 68 + (k % 2) * 1.4, z = P.warehouse.z + P.warehouse.d / 2 + 2 + Math.floor(k / 2) * 1.4;
    parts.push(box(1.2, 0.14, 1.0, x, top + 0.07, z, "#b08a5a"), box(1.1, 0.9, 0.9, x, top + 0.6, z, ["#c9a27a", "#6f8fb5", "#d9b46a", "#9a9f86"][k]));
  }
  for (const x of [P.x0 + 20, P.x0 + 62, P.x0 + 98]) {
    parts.push(box(0.6, 1.2, 0.3, x, top + 0.6, P.z1 - 3.2, "#d8342b"));
    parts.push(colored(new THREE.TorusGeometry(0.28, 0.07, 6, 12).translate(x, top + 0.8, P.z1 - 3.0), "#f28c28"));
  }

  // Tır: çekici + kapalı dorse, arka kapıları açık (forklift yüklüyor).
  {
    const { x, z } = P.truck;
    const rear = z - 6.5;
    parts.push(box(2.5, 2.7, 13, x, top + 1.35 + 1.15, z, "#e6e3dc"));
    parts.push(box(2.52, 0.3, 13, x, top + 1.0, z, "#3a3f47"));
    parts.push(box(2.0, 0.9, 1.0, x, top + 2.0, rear + 0.6, "#2a2d33"));
    for (const dz of [z + 3.5, z + 4.8]) for (const sx of [-1, 1]) parts.push(colored(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 14).rotateZ(Math.PI / 2).translate(x + sx * 1.05, top + 0.5, dz), "#1c1c1e"));
    parts.push(box(2.5, 2.9, 2.6, x, top + 2.0, z + 8.2, "#d8342b"), box(2.3, 1.0, 0.05, x, top + 2.6, z + 9.52, "#28323e"));
    for (const dz of [z + 7.8, z + 9.0]) for (const sx of [-1, 1]) parts.push(colored(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 14).rotateZ(Math.PI / 2).translate(x + sx * 1.1, top + 0.5, dz), "#1c1c1e"));
    for (const sx of [-1, 1]) parts.push(box(0.05, 2.6, 1.2, x + sx * 1.9, top + 2.5, rear - 0.55, "#e6e3dc"));
  }

  // Aydınlatma direkleri.
  const lampHeads = [];
  for (const [x, z] of P.masts) {
    metal.push(cyl(0.22, 0.38, 24, x, top + 12, z, "#8a929c", 10));
    metal.push(box(3.2, 0.2, 1.2, x, top + 24, z, "#5b636e"));
    for (const dx of [-1.1, 0, 1.1]) lampHeads.push([x + dx, top + 23.75, z]);
  }

  const staticMesh = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), MAT);
  staticMesh.geometry.computeVertexNormals();
  staticMesh.castShadow = staticMesh.receiveShadow = true;
  const metalMesh = new THREE.Mesh(mergeGeometries(metal.map((g) => (g.index ? g.toNonIndexed() : g))), METAL);
  metalMesh.geometry.computeVertexNormals();
  metalMesh.castShadow = true;
  group.add(staticMesh, metalMesh);
  const lampMat = new THREE.MeshStandardMaterial({ color: "#dfe4ea", emissive: new THREE.Color("#f4f7ff"), emissiveIntensity: 0, roughness: 0.3 });
  for (const [x, y, z] of lampHeads) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.6), lampMat); m.position.set(x, y, z); m.rotation.x = 0.3; group.add(m); }

  // Konteynerler (istif, gemi, taşınan): tek InstancedMesh, nervürlü doku, örnek rengi.
  const contGeo = new THREE.BoxGeometry(CL, CH, CW).translate(0, CH / 2, 0);
  const contMat = new THREE.MeshStandardMaterial({ map: ribTexture(), roughness: 0.7, metalness: 0.2 });
  const slots = [];
  for (let x = P.stack.x0; x + CL <= P.stack.x1 + 0.1; x += CL + 0.5) {
    for (let z = P.stack.z0; z + CW <= P.stack.z1 + 0.1; z += CW + 0.4) {
      const cxx = x + CL / 2, czz = z + CW / 2;
      const seed = Math.abs(Math.round(cxx * 13 + czz * 7));
      // Hareketli konteynerin istif yeri: altında tek kat dolu, üstü boş kalır.
      const isSlot = Math.abs(cxx - L.slot[0]) < 0.5 && Math.abs(czz - L.slot[1]) < 1.3;
      const tiers = isSlot ? 1 : 1 + (seed % 3);
      for (let k = 0; k < tiers; k++) slots.push([cxx, top + k * CH, czz, 0, CONTAINER_COLORS[(seed + k * 3) % CONTAINER_COLORS.length]]);
    }
  }
  // Gemideki bölmeler vincin x'ine göre hizalı (köprüüstü ile baş kasarası arasında, -4..4. bölme).
  const shipSlots = [];
  const shipBase = L.hatch;
  for (let j = -4; j <= 4; j++) {
    const x = P.crane.x + j * BAY, k = j + 4;
    for (let r = 0; r < 4; r++) {
      const z = P.ship.z + SHIP_ROW0 + r * (CW + 0.25);
      const seed = k * 11 + r * 5;
      const isCrane = j === 0 && r === 2;
      const tiers = isCrane ? 1 : 1 + (seed % 3 === 0 ? 0 : 1);
      for (let tr = 0; tr < tiers; tr++) shipSlots.push([x, shipBase + tr * CH, z, 0, CONTAINER_COLORS[(seed + tr) % CONTAINER_COLORS.length]]);
    }
  }
  const total = slots.length + shipSlots.length + 1;
  const containers = new THREE.InstancedMesh(contGeo, contMat, total);
  containers.castShadow = containers.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  slots.forEach(([x, y, z, h, c], i) => { q.setFromAxisAngle(up, h); containers.setMatrixAt(i, m4.compose(v3.set(x, y, z), q, one)); containers.setColorAt(i, col.set(c)); });
  const shipStart = slots.length, moving = total - 1;
  shipSlots.forEach(([, , , , c], i) => containers.setColorAt(shipStart + i, col.set(c)));
  containers.setColorAt(moving, col.set("#d9822b"));
  group.add(containers);

  // Gemi: kesitlerden gövde, kıçta köprüüstü, ambar kapakları, baş kasarası, direk.
  const ship = new THREE.Group();
  const H = hull(P.ship.len, P.ship.beam, P.ship.depth, { top: "#22344d", stripe: "#f4f4f1", deck: "#5f7f5e", inner: "#d9d6cc" });
  const sp = [];
  const sAt = (s) => (s - 0.5) * P.ship.len;
  // Ambar kapakları: konteyner bölmelerinin tamamını örter (gemi yerelinde boy z ekseninde, merkez vinç x'i).
  const hz = P.crane.x - P.ship.x, hl = 9 * BAY + 0.6;
  sp.push(box(P.ship.beam - 2.4, 1.05, hl, 0, L.hatch - 0.52, hz, "#5b6b7d"));
  for (let k = 0; k <= 9; k++) sp.push(box(P.ship.beam - 2.3, 0.08, 0.15, 0, L.hatch + 0.04, hz - hl / 2 + 0.3 + k * BAY, "#3a4656"));
  const bz0 = sAt(0.02), bz1 = sAt(0.16);
  const bridgeY = H.deckY(0.08);
  sp.push(box(P.ship.beam - 1.6, 8.5, bz1 - bz0, 0, bridgeY + 4.25, (bz0 + bz1) / 2, "#f2f1ec"));
  sp.push(box(P.ship.beam + 1.2, 0.3, 4.2, 0, bridgeY + 8.6, bz1 - 2.1, "#e3e1da"));
  sp.push(box(P.ship.beam + 1.0, 1.1, 0.06, 0, bridgeY + 7.6, bz1 + 0.01, "#28323e"));
  for (let y = 2.2; y < 7; y += 2.4) sp.push(box(P.ship.beam - 1.5, 0.7, 0.06, 0, bridgeY + y, bz1 + 0.01, "#28323e"));
  sp.push(box(2.0, 4.0, 2.4, 0, bridgeY + 10.6, (bz0 + bz1) / 2 - 1, "#e3e1da"), box(2.04, 1.0, 2.44, 0, bridgeY + 12.2, (bz0 + bz1) / 2 - 1, "#d8342b"));
  sp.push(cyl(0.12, 0.15, 7, 0, bridgeY + 12, bz1 - 1.5, "#d9d6cc", 6));
  const fz0 = sAt(0.88), fz1 = sAt(0.97);
  sp.push(box(H.deckW(0.9) * 1.9, 1.6, fz1 - fz0, 0, H.deckY(0.92) + 0.8, (fz0 + fz1) / 2, "#d9d6cc"));
  sp.push(cyl(0.1, 0.12, 9, 0, H.deckY(0.85) + 4.5, sAt(0.85), "#d9d6cc", 6));
  // Gemi adı ve can filikası.
  sp.push(colored(new THREE.CapsuleGeometry(0.9, 3.2, 4, 8).rotateX(Math.PI / 2).translate(P.ship.beam / 2 - 0.4, bridgeY + 6, (bz0 + bz1) / 2), "#f28c28"));
  const shipGeo = mergeGeometries([H.geo, ...sp.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.normal) n.deleteAttribute("normal"); return n; })].map((g) => { if (g.attributes.normal) g.deleteAttribute("normal"); return g; }));
  shipGeo.computeVertexNormals();
  const shipMesh = new THREE.Mesh(shipGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
  shipMesh.castShadow = shipMesh.receiveShadow = true;
  ship.add(shipMesh);
  // Gemi enine yatar: boyu x ekseninde; pruva doğuda (+x).
  ship.rotation.y = Math.PI / 2;
  ship.position.set(P.ship.x, 0, P.ship.z);
  group.add(ship);
  // Palamar halatları: gemi baş ve kıçından rıhtım babalarına.
  const lines = [];
  for (const [sx, qx] of [[-38, P.x0 + 6], [-34, P.x0 + 20], [36, P.x1 - 8], [32, P.x1 - 22]]) {
    lines.push(rod(new THREE.Vector3(P.ship.x + sx, H.deckY(0.5) + 0.4, P.ship.z - P.ship.beam / 2 + 0.6), new THREE.Vector3(qx, top + 0.6, P.z1 - 1.0), 0.04, "#d9cfa8"));
  }
  const lineMesh = new THREE.Mesh(mergeGeometries(lines), MAT);
  group.add(lineMesh);

  // Rıhtım vinci (STS): dört bacak, portal kirişleri, iki ana kiriş (bom), A-kule ve gergiler, makine dairesi.
  const cr = [];
  const red = "#c8402e", white = "#f2f1ec";
  const { x: CX, legX, landZ, seaZ } = P.crane;
  const portalY = top + 22, boomY = top + BOOM_DY, zBack = landZ - 14, zTip = P.ship.z + 13;
  for (const lx of legX) for (const lz of [landZ, seaZ]) cr.push(box(1.3, portalY - top, 1.3, lx, (portalY + top) / 2, lz, red));
  for (const lx of legX) {
    // Her bacağın altında raya oturan teker bojisi (iki tekerlek takımı).
    for (const lz of [landZ, seaZ]) {
      cr.push(box(1.0, 0.9, 3.4, lx, top + 0.95, lz, "#3a3f47"));
      for (const dz of [-1.1, 1.1]) cr.push(colored(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 12).rotateZ(Math.PI / 2).translate(lx, top + 0.42, lz + dz), "#26292e"));
    }
    cr.push(box(1.2, 1.4, seaZ - landZ, lx, portalY, (landZ + seaZ) / 2, red));
    cr.push(rod(new THREE.Vector3(lx, top + 3, landZ), new THREE.Vector3(lx, portalY - 1, seaZ), 0.25, red));
  }
  for (const lz of [landZ, seaZ]) cr.push(box(legX[1] - legX[0] + 1.3, 1.4, 1.2, CX, portalY, lz, red));
  for (const dx of [-3.2, 3.2]) cr.push(box(1.0, 1.8, zTip - zBack, CX + dx, boomY, (zBack + zTip) / 2, white));
  for (let z = zBack + 2; z < zTip; z += 6) cr.push(box(7.4, 0.3, 0.3, CX, boomY - 0.75, z, white));
  for (const lx of legX) cr.push(box(1.0, boomY - portalY, 1.0, lx, (boomY + portalY) / 2, landZ + 2, red));
  // A-kule ve gergiler.
  const apex = new THREE.Vector3(CX, boomY + 14, landZ + 4);
  for (const lx of legX) { cr.push(rod(new THREE.Vector3(lx, boomY, landZ), apex, 0.4, red)); cr.push(rod(new THREE.Vector3(lx, boomY, seaZ), apex, 0.4, red)); }
  for (const dx of [-3.2, 3.2]) {
    cr.push(rod(apex, new THREE.Vector3(CX + dx, boomY + 0.9, zTip - 2), 0.12, "#3a3f47"));
    cr.push(rod(apex, new THREE.Vector3(CX + dx, boomY + 0.9, P.ship.z - 4), 0.12, "#3a3f47"));
    cr.push(rod(apex, new THREE.Vector3(CX + dx, boomY + 0.9, zBack + 1), 0.12, "#3a3f47"));
  }
  cr.push(box(9, 4.2, 9, CX, boomY + 3, zBack + 5, white), box(9.4, 0.3, 9.4, CX, boomY + 5.2, zBack + 5, "#5b636e"));
  cr.push(box(8.5, 0.8, 0.6, CX, boomY + 3.4, zBack + 9.55, red));
  // Yürüme platformları ve merdiven.
  cr.push(box(1.2, 0.1, zTip - zBack, CX + 4.4, boomY - 0.5, (zBack + zTip) / 2, "#5b636e"));
  for (let y = top + 1; y < portalY; y += 0.4) cr.push(box(0.6, 0.04, 0.04, legX[1] + 0.9, y, landZ, "#3a3f47"));
  // Boyalı çelik: metalik değil, parlak boya (kırmızı koyulaşmasın).
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
  const craneMesh = new THREE.Mesh(mergeGeometries(cr.map((g) => (g.index ? g.toNonIndexed() : g))), paint);
  craneMesh.geometry.computeVertexNormals();
  craneMesh.castShadow = true;
  group.add(craneMesh);
  // Araba (trolley) ve operatör kabini, kıskaç (spreader), halatlar.
  const trolley = new THREE.Group();
  const tGeo = mergeGeometries([
    box(7.2, 1.4, 4.4, 0, 0.9, 0, "#5b636e"),
    box(2.4, 2.2, 2.6, -2.2, -1.6, 0.6, "#f2f1ec"),
    box(2.3, 1.2, 0.05, -2.2, -1.3, 1.92, "#28323e"),
    box(0.05, 1.2, 2.0, -3.41, -1.3, 0.6, "#28323e"),
    box(2.0, 0.05, 1.8, -2.2, -2.72, 0.8, "#28323e"),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  tGeo.computeVertexNormals();
  trolley.add(new THREE.Mesh(tGeo, METAL));
  group.add(trolley);
  const spreader = new THREE.Mesh(mergeGeometries([box(6.2, 0.5, 2.5, 0, 0.25, 0, "#e8b62a"), box(1.2, 0.6, 1.2, 0, 0.8, 0, "#3a3f47")].map((g) => (g.index ? g.toNonIndexed() : g))), METAL);
  spreader.geometry.computeVertexNormals();
  spreader.castShadow = true;
  group.add(spreader);
  const cableGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 4).translate(0, -0.5, 0);
  const cableMat = new THREE.MeshStandardMaterial({ color: "#2a2d33", roughness: 0.5 });
  const cables = [-2.2, 2.2].flatMap((dx) => [-0.9, 0.9].map((dz) => { const m = new THREE.Mesh(cableGeo, cableMat); m.userData.off = [dx, dz]; group.add(m); return m; }));

  // İstifleyici (reach stacker): gövde, kabin, karşı ağırlık, iri tekerler, teleskopik bom, kıskaç.
  const stacker = new THREE.Group();
  const stGeo = mergeGeometries([
    box(3.4, 1.6, 9.0, 0, 1.5, -4.0, "#e8b02e"),
    box(3.6, 1.8, 2.0, 0, 1.7, -8.6, "#d29a22"),
    box(1.6, 2.0, 1.8, -0.9, 3.3, -3.4, "#f2f1ec"),
    box(1.5, 1.2, 0.05, -0.9, 3.5, -2.49, "#28323e"),
    box(0.05, 1.2, 1.6, -1.71, 3.5, -3.4, "#28323e"),
    ...[0, -6.4].flatMap((z) => [-1, 1].map((sx) => colored(new THREE.CylinderGeometry(0.85, 0.85, 0.75, 16).rotateZ(Math.PI / 2).translate(sx * 1.5, 0.85, z), "#1c1c1e"))),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  stGeo.computeVertexNormals();
  stacker.add(new THREE.Mesh(stGeo, paint));
  stacker.children[0].castShadow = true;
  group.add(stacker);
  const boomGeo = new THREE.BoxGeometry(0.9, 0.9, 1).translate(0, 0, 0.5);
  const boom = new THREE.Mesh(boomGeo, new THREE.MeshStandardMaterial({ color: "#e8b02e", roughness: 0.5, metalness: 0.3 }));
  boom.castShadow = true;
  group.add(boom);
  const stSpreader = new THREE.Mesh(mergeGeometries([box(6.2, 0.45, 0.9, 0, 0.22, 0, "#d29a22"), box(0.8, 0.5, 0.8, 0, 0.7, 0, "#3a3f47")].map((g) => (g.index ? g.toNonIndexed() : g))), METAL);
  stSpreader.geometry.computeVertexNormals();
  group.add(stSpreader);

  // Forklift ve paleti.
  const fork = new THREE.Group();
  const fGeo = mergeGeometries([
    box(1.2, 1.0, 2.2, 0, 0.75, -0.9, "#e8b02e"),
    box(1.2, 0.6, 0.6, 0, 1.2, -1.9, "#3a3f47"),
    ...[-0.55, 0.55].map((dx) => box(0.08, 2.0, 0.08, dx, 1.2, -1.2 + 0.0, "#2a2d33")),
    box(1.1, 0.06, 0.06, 0, 2.2, -0.9, "#2a2d33"),
    ...[-0.55, 0.55].flatMap((dx) => [0.08, 2.2].map((y) => box(0.06, 0.06, 1.6, dx, y, -1.0, "#2a2d33"))),
    ...[-0.5, 0.5].map((dx) => box(0.08, 2.3, 0.08, dx, 1.15, 0.25, "#3a3f47")),
    ...[[-0.6, 0], [0.6, 0], [-0.6, -1.7], [0.6, -1.7]].map(([dx, dz]) => colored(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 12).rotateZ(Math.PI / 2).translate(dx, 0.32, dz), "#1c1c1e")),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  fGeo.computeVertexNormals();
  fork.add(new THREE.Mesh(fGeo, paint));
  group.add(fork);
  const forks = new THREE.Mesh(mergeGeometries([
    ...[-0.3, 0.3].map((dx) => box(0.12, 0.05, 1.1, dx, 0, 0.85, "#3a3f47")),
    box(1.0, 0.9, 0.06, 0, 0.45, 0.3, "#3a3f47"),
  ].map((g) => (g.index ? g.toNonIndexed() : g))), METAL);
  forks.geometry.computeVertexNormals();
  group.add(forks);
  const pallet = new THREE.Mesh(mergeGeometries([box(1.2, 0.14, 1.0, 0, 0.07, 0, "#b08a5a"), box(1.1, 0.9, 0.9, 0, 0.6, 0, "#c9a27a")].map((g) => (g.index ? g.toNonIndexed() : g))), MAT);
  pallet.geometry.computeVertexNormals();
  pallet.castShadow = true;
  group.add(pallet);

  // Her kare.
  const tmpM = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3();
  const shipStatic = shipSlots.map(([x, y, z]) => [x, y, z]);
  // Vardiya dışında (gece ve vardiya arası) makineler park konumunda durur.
  let working = true;
  group.userData.setMinute = (m) => { working = (m >= 335 && m < 805) || (m >= 845 && m < 1315); };
  group.userData.tick = (t) => {
    const M = working ? portMotion(P, t) : portMotion(P, 120, 40);
    // Gemi sallantısı (gövde ve güvertedeki konteynerler birlikte).
    ship.position.y = M.bob.y;
    ship.rotation.z = M.bob.roll;
    shipStatic.forEach(([x, y, z], i) => { tq.setFromAxisAngle(up, 0); containers.setMatrixAt(shipStart + i, tmpM.compose(tv.set(x, y + M.bob.y, z), tq, one)); });
    // Taşınan konteyner.
    tq.setFromAxisAngle(up, M.boxHeading);
    containers.setMatrixAt(moving, tmpM.compose(tv.set(M.box[0], M.box[1], M.box[2]), tq, one));
    containers.instanceMatrix.needsUpdate = true;
    // Vinç arabası, kıskaç ve halatlar.
    trolley.position.set(CX, boomY - 1.6, M.crane.z);
    spreader.position.set(CX, M.crane.y, M.crane.z);
    for (const c of cables) {
      const [dx, dz] = c.userData.off;
      const y0 = boomY - 1.6, len = Math.max(0.5, y0 - (M.crane.y + 0.5));
      c.position.set(CX + dx, y0, M.crane.z + dz);
      c.scale.set(1, len, 1);
    }
    // İstifleyici.
    const s = M.stacker;
    stacker.position.set(s.x, top, s.z);
    stacker.rotation.y = s.heading;
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const tipX = s.x + fx * L.reach, tipZ = s.z + fz * L.reach;
    const pivot = new THREE.Vector3(s.x - fx * 6.2, top + 3.4, s.z - fz * 6.2);
    const tip = new THREE.Vector3(tipX, s.y + 1.0, tipZ);
    boom.position.copy(pivot);
    boom.scale.set(1, 1, pivot.distanceTo(tip));
    boom.lookAt(tip);
    stSpreader.position.set(tipX, s.y, tipZ);
    stSpreader.rotation.y = s.heading;
    // Forklift.
    const f = M.forklift;
    fork.position.set(f.x, top, f.z);
    fork.rotation.y = f.heading;
    forks.position.set(f.x, f.forkY, f.z);
    forks.rotation.y = f.heading;
    pallet.visible = f.carry;
    pallet.position.set(f.x, f.forkY + 0.05, f.z + 0.85);
  };
  group.userData.setNight = (n) => { lampMat.emissiveIntensity = 3 * n; };
  return group;
}
