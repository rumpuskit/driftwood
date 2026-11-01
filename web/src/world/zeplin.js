// Driftwood Blimp: her gün 09:00'da anakaradan gelir, adanın üstünde tur atar, 22:00'de döner (ABD Doğu saati).
// Gerçek ölçek (62 m boy, 16 m çap; Goodyear GZ-20 boyunda). Yeri yalnız saatten hesaplanır: aynı anda
// herkes zeplini aynı yerde görür (video kaydı dahil).
//
// Giydirme (reklam): gövdenin iki yanında 3:1 oranlı birer alan (yaklaşık 36 × 12 m). Görsel 3:1 PNG/JPG
// (önerilen 3000×1000), iki yana da aynı görsel okunur yönde basılır; gece alan içten aydınlatılmış gibi
// parlar. Görsel yoksa Driftwood'nın kendi tanıtımı. config.js ZEPLIN_REKLAM, deneme için ?zeplin_reklam=adres.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { minuteOf } from "../sim.js";

const L = 62, R = 8.1;
// Driftwood renkleri: lacivert gövde şeritleri, altın vurgular (CORAL adı kod uyumu için kaldı), inci beyazı.
const NAVY = "#1d3156", BELLY = "#28477a", CORAL = "#c8a24a", CORAL_D = "#a8842e", PEARL = "#f6f4ef", TEAL = "#2f7fb5";
const SCHEDULE = { start: 9 * 3600, end: 22 * 3600 }; // yerel saniye
const CRUISE = 9.5, TRANSIT = 17; // m/sn: tur ve geliş/gidiş hızı
const ALT = 96; // tur yüksekliği (m); en yüksek bina ve tepedeki fenerin epey üstünde

// --- gövde profili: burun küt, kuyruk sivri (s: 0 burun, 1 kuyruk) ---
const PA = 0.48, PB = 0.9;
const FMAX = Math.pow(PA / (PA + PB), PA) * Math.pow(PB / (PA + PB), PB);
export function radiusAt(s) {
  if (s <= 0 || s >= 1) return 0;
  return (R * Math.pow(s, PA) * Math.pow(1 - s, PB)) / FMAX;
}
const xAt = (s) => L * (0.5 - s); // burun +x yönünde
const sAt = (x) => 0.5 - x / L;

// Reklam alanı: boyda u (kuyruk 0 → burun 1), çevrede yanın ortasından ± açı (çevrenin oranı olarak).
const PANEL = { u0: 0.25, u1: 0.83, half: 0.118 };

/** Gövde: dönel yüzey; uv.x boy (kuyruk 0, burun 1), uv.y çevre (üst çizgi 1 → +z yanı → alt → -z yanı → 0). */
function hullGeometry(ns, na) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= ns; i++) {
    const s = (1 - Math.cos((Math.PI * i) / ns)) / 2; // uçlarda sık
    const r = radiusAt(s);
    const e = 1e-4;
    const drdx = (radiusAt(Math.min(1, s + e)) - radiusAt(Math.max(0, s - e))) / (-2 * e * L);
    for (let j = 0; j <= na; j++) {
      const a = (2 * Math.PI * j) / na;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(xAt(s), r * ca, r * sa);
      const n = i === 0 ? [1, 0, 0] : i === ns ? [-1, 0, 0] : [-drdx, ca, sa];
      const k = Math.hypot(...n);
      nor.push(n[0] / k, n[1] / k, n[2] / k);
      uv.push(1 - s, 1 - j / na);
    }
  }
  for (let i = 0; i < ns; i++) for (let j = 0; j < na; j++) {
    const a = i * (na + 1) + j, b = a + na + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Ada amblemi: lacivert daire, deniz feneri ve dalgalar. */
function drawEmblem(g, cx, cy, rr) {
  // Driftwood amblemi: lacivert daire, beyaz deniz feneri ve ışık huzmesi, altın kenar, altta dalgalar.
  g.fillStyle = NAVY; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.clip();
  g.fillStyle = "rgba(255,226,150,0.55)";
  g.beginPath(); g.moveTo(cx, cy - rr * 0.42); g.lineTo(cx + rr, cy - rr * 0.75); g.lineTo(cx + rr, cy - rr * 0.2); g.closePath(); g.fill();
  g.fillStyle = "#ffffff";
  g.beginPath(); g.moveTo(cx - rr * 0.16, cy + rr * 0.45); g.lineTo(cx - rr * 0.1, cy - rr * 0.32); g.lineTo(cx + rr * 0.1, cy - rr * 0.32); g.lineTo(cx + rr * 0.16, cy + rr * 0.45); g.closePath(); g.fill();
  g.fillStyle = "#ffe29a"; g.fillRect(cx - rr * 0.11, cy - rr * 0.48, rr * 0.22, rr * 0.16);
  g.fillStyle = "#1f2224"; g.beginPath(); g.moveTo(cx - rr * 0.15, cy - rr * 0.48); g.lineTo(cx, cy - rr * 0.62); g.lineTo(cx + rr * 0.15, cy - rr * 0.48); g.closePath(); g.fill();
  for (const [dy, c] of [[0.4, "rgba(47,127,181,0.95)"], [0.6, "rgba(255,255,255,0.9)"]]) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(cx - rr, cy + rr * dy);
    for (let k = 0; k <= 32; k++) g.lineTo(cx - rr + (2 * rr * k) / 32, cy + rr * dy + Math.sin(k * 0.8 + dy * 5) * rr * 0.06);
    g.lineTo(cx + rr, cy + rr); g.lineTo(cx - rr, cy + rr); g.closePath(); g.fill();
  }
  g.restore();
  g.strokeStyle = CORAL; g.lineWidth = rr * 0.08;
  g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke();
}

/** Varsayılan reklam: Driftwood tanıtımı (3:1 tuval). */
function defaultAd(W, H) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#14284a"); grad.addColorStop(0.55, NAVY); grad.addColorStop(1, "#1f5f73");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Dalga çizgileri (deniz) ve mercan şeridi.
  g.lineCap = "round";
  for (const [y, c, w, amp] of [[0.80, "rgba(47,156,154,0.55)", 0.018, 0.022], [0.87, "rgba(233,102,127,0.95)", 0.024, 0.026], [0.93, "rgba(255,255,255,0.18)", 0.012, 0.018]]) {
    g.strokeStyle = c; g.lineWidth = H * w;
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 20) {
      const yy = H * (y + amp * Math.sin((x / W) * Math.PI * 7));
      if (x === -20) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  drawEmblem(g, W * 0.115, H * 0.43, H * 0.25);
  // Yazı.
  const fit = (text, font, px, max) => {
    g.font = font.replace("PX", px);
    const w = g.measureText(text).width;
    if (w > max) { px = Math.floor(px * (max / w)); g.font = font.replace("PX", px); }
    return px;
  };
  const left = W * 0.225, max = W * 0.74;
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  const big = fit("DRIFTWOOD", "900 PXpx Nunito, sans-serif", Math.round(H * 0.42), max);
  g.fillStyle = "#ffffff";
  g.fillText("DRIFTWOOD", left, H * 0.55);
  fit("Follow, and you move in", "800 PXpx Nunito, sans-serif", Math.round(big * 0.34), max);
  g.fillStyle = "#f3dfa8";
  g.fillText("Follow, and you move in", left + big * 0.04, H * 0.73);
  const tw = g.measureText("Follow, and you move in").width;
  fit("TikTok @driftwoodlive", "700 PXpx Nunito, sans-serif", Math.round(big * 0.26), max - tw - W * 0.05);
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillText("TikTok @driftwoodlive", left + big * 0.04 + tw + W * 0.035, H * 0.73);
  return cv;
}

/** Gövde kaplaması ve gece ışığı. ad: 3:1 tuval ya da görsel. */
function paintHull(hullCv, glowCv, ad) {
  const W = hullCv.width, H = hullCv.height;
  const g = hullCv.getContext("2d");
  g.fillStyle = PEARL;
  g.fillRect(0, 0, W, H);
  // Alt karın: lacivert, yanlarda mercan ince şerit.
  const belly = (y0, y1, c) => { g.fillStyle = c; g.fillRect(0, y0 * H, W, (y1 - y0) * H); };
  belly(0.415, 0.585, BELLY);
  belly(0.402, 0.412, CORAL); belly(0.588, 0.598, CORAL);
  belly(0.393, 0.397, TEAL); belly(0.603, 0.607, TEAL);
  // Kumaş dilim dikişleri (boyuna).
  g.fillStyle = "rgba(40,50,70,0.05)";
  for (let k = 0; k < 24; k++) g.fillRect(0, (k / 24) * H - 1, W, 2);
  // Burun konisi (mercan) ve burun çıtaları; kuyruk ucu.
  g.fillStyle = CORAL; g.fillRect(W * 0.972, 0, W * 0.03, H);
  g.fillStyle = CORAL_D;
  for (let k = 0; k < 16; k++) g.fillRect(W * 0.925, ((k + 0.5) / 16) * H - H * 0.003, W * 0.05, H * 0.006);
  g.fillStyle = CORAL; g.fillRect(0, 0, W * 0.035, H);
  // Reklam alanları: +z yanı (uv.y 0.25) okunur yönde, -z yanı (0.75) 180° çevrik.
  const gg = glowCv.getContext("2d");
  gg.fillStyle = "#000"; gg.fillRect(0, 0, glowCv.width, glowCv.height);
  for (const [cvx, ctx] of [[hullCv, g], [glowCv, gg]]) {
    const w = cvx.width, h = cvx.height;
    const x0 = PANEL.u0 * w, pw = (PANEL.u1 - PANEL.u0) * w, ph = 2 * PANEL.half * h;
    for (const side of [0.25, 0.75]) {
      const y0 = side * h - ph / 2;
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, x0, y0, pw, ph, ph * 0.12);
      ctx.clip();
      if (side === 0.75) { ctx.translate(x0 + pw / 2, y0 + ph / 2); ctx.rotate(Math.PI); ctx.translate(-(x0 + pw / 2), -(y0 + ph / 2)); }
      ctx.drawImage(ad, x0, y0, pw, ph);
      ctx.restore();
      if (cvx === hullCv) {
        ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = h * 0.006;
        ctx.beginPath(); roundRect(ctx, x0, y0, pw, ph, ph * 0.12); ctx.stroke();
      }
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Kuyruk dümeni: sabit kısım + hareketli kısım (ayrı geometri), kökü gövdeye gömülü. */
function finGeometries() {
  const sLe = 0.775, sTe = 0.975, xLe = xAt(sLe), xTe = xAt(sTe);
  const tip = 10.4, sweep = 5.2, tipChord = 4.6, hinge = 0.33;
  const rootY = (x) => Math.max(0.2, radiusAt(sAt(x)) - 0.7);
  const xTipLe = xLe - sweep, xTipTe = xTipLe - tipChord;
  const hx = (y) => {
    // Menteşe çizgisi: kökte veter boyunun, uçta uç veterinin hinge oranında.
    const k = (y - rootY(xLe)) / (tip - rootY(xLe));
    return THREE.MathUtils.lerp(xTe + (xLe - xTe) * hinge, xTipTe + tipChord * hinge, k);
  };
  const gap = 0.14;
  const fixed = new THREE.Shape();
  fixed.moveTo(xLe, rootY(xLe));
  fixed.lineTo(xTipLe, tip - 0.35);
  fixed.quadraticCurveTo(xTipLe - 0.3, tip, xTipLe - 1.2, tip);
  fixed.lineTo(hx(tip) + gap, tip);
  const hr = hx(rootY(xLe));
  fixed.lineTo(hr + gap, rootY(hr));
  for (let x = hr + gap; x < xLe; x += 0.8) fixed.lineTo(x, rootY(x));
  fixed.closePath();
  const moving = new THREE.Shape();
  moving.moveTo(hr - gap, rootY(hr));
  moving.lineTo(hx(tip) - gap, tip);
  moving.lineTo(xTipTe + 0.5, tip);
  moving.quadraticCurveTo(xTipTe, tip, xTipTe, tip - 0.5);
  moving.lineTo(xTe + 0.4, rootY(xTe) + 0.8);
  for (let x = xTe + 0.4; x < hr - gap; x += 0.8) moving.lineTo(x, rootY(x));
  moving.closePath();
  const ext = (shape, depth) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07, bevelSegments: 3, curveSegments: 8 });
    g.translate(0, 0, -depth / 2);
    return g;
  };
  return { fixed: ext(fixed, 0.34), moving: ext(moving, 0.22), emblem: [(xLe + hr) / 2 - 1.6, (rootY(xLe) + tip) / 2 + 0.4] };
}

/** Extrude uv'lerini amblem dokusunun dışına atar (kenar rengi = inci); side: 1 ön kapak, -1 arka kapak kalır. */
function emblemOnly(g, side) {
  const uv = g.attributes.uv, pos = g.attributes.position, caps = g.groups[0];
  for (let i = 0; i < uv.count; i++) {
    const cap = i >= caps.start && i < caps.start + caps.count;
    if (!cap || side === 0 || Math.sign(pos.getZ(i)) !== side) uv.setXY(i, 1e4, 1e4);
  }
  return g;
}

/** Kabin: boyunca yuvarlatılmış dikdörtgen kesitler (burun elips, arka daralır); uv: x boy, y çevre. */
function gondolaGeometry(len, halfW, halfH, n = 3.4) {
  const NS = 44, NA = 56;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    let k = 1;
    // max(0, ...): t = 1'de kayan nokta hatası kökün içini eksiye düşürüp son halkayı NaN yapıyordu.
    if (t < 0.16) k = Math.sqrt(Math.max(0, 1 - ((0.16 - t) / 0.16) ** 2));
    else if (t > 0.82) k = Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)) * (1 - 0.25 * (t - 0.82) / 0.18);
    k = Math.max(k, 0.001);
    const w = halfW * k * (1 - 0.12 * t), h = halfH * (0.35 + 0.65 * k) * (1 - 0.18 * t);
    const x = len / 2 - t * len;
    for (let j = 0; j <= NA; j++) {
      const a = (2 * Math.PI * j) / NA;
      const ca = Math.cos(a), sa = Math.sin(a);
      const y = Math.sign(ca) * Math.abs(ca) ** (2 / n) * h, z = Math.sign(sa) * Math.abs(sa) ** (2 / n) * w;
      pos.push(x, y - h, z); // üst yüzey y=0 (gövdeye oturur)
      uv.push(t, 1 - j / NA);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b = a + NA + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function paintGondola(cv, glow) {
  const W = cv.width, H = cv.height, g = cv.getContext("2d"), gg = glow.getContext("2d");
  const GW = glow.width, GH = glow.height;
  g.fillStyle = PEARL; g.fillRect(0, 0, W, H);
  g.fillStyle = NAVY; g.fillRect(0, 0.36 * H, W, 0.28 * H); // alt
  g.fillStyle = CORAL; g.fillRect(0, 0.335 * H, W, 0.02 * H); g.fillRect(0, 0.645 * H, W, 0.02 * H);
  gg.fillStyle = "#000"; gg.fillRect(0, 0, GW, GH);
  // Pencere bandı iki yanda (çevre 0.25 ve 0.75 civarı), burna kadar; kayıtlı dikmeler. Gece pencereler yanar.
  for (const c of [0.25, 0.75]) {
    const y0 = c - 0.075, hh = 0.11;
    g.fillStyle = "#24364f"; g.fillRect(0, y0 * H, W * 0.74, hh * H);
    g.fillStyle = "rgba(170,205,235,0.35)"; g.fillRect(0, y0 * H, W * 0.74, hh * H * 0.35);
    gg.fillStyle = "#ffcf7a"; gg.fillRect(GW * 0.08, y0 * GH, GW * 0.64, hh * GH);
    g.fillStyle = PEARL;
    for (let x = W * 0.12; x < W * 0.74; x += W * 0.085) g.fillRect(x, y0 * H, W * 0.008, hh * H);
  }
  // Kapı (sağ yan, arkada).
  g.fillStyle = "#c9ccd2"; g.fillRect(W * 0.78, 0.17 * H, W * 0.06, 0.15 * H);
}

/** Kanallı pervane: halka (kesit profilli), göbek, 5 kanat. Eksen +x. */
function ductedFan() {
  const group = new THREE.Group();
  const prof = [];
  const rr = 1.05, ch = 1.3, th = 0.13;
  // Halka kesiti: önde kalın, arkada ince kanat profili (iç yarıçap rr, kalınlık th).
  for (let k = 0; k <= 24; k++) {
    const a = (Math.PI * 2 * k) / 24, c = Math.cos(a);
    const thick = th * (0.55 + 0.45 * c);
    prof.push(new THREE.Vector2(rr + thick * (0.5 + 0.5 * Math.sin(a)), (ch / 2) * c));
  }
  const duct = new THREE.Mesh(new THREE.LatheGeometry(prof, 40).rotateZ(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide }));
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 20).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshStandardMaterial({ color: CORAL, roughness: 0.4, metalness: 0.2 }));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.8, 20).rotateZ(Math.PI / 2).translate(-0.3, 0, 0), new THREE.MeshStandardMaterial({ color: "#d6d9de", roughness: 0.4, metalness: 0.6 }));
  // Beş kanat tek geometride (hatveli), göbek ekseninde döner.
  const bladeMat = new THREE.MeshStandardMaterial({ color: "#2a2f38", roughness: 0.5, metalness: 0.4 });
  const blades = new THREE.Mesh(mergeGeometries(Array.from({ length: 5 }, (_, k) =>
    new THREE.BoxGeometry(0.05, 0.85, 0.2).rotateY(0.45).translate(0, 0.58, 0).rotateX((k / 5) * Math.PI * 2))), bladeMat);
  // Arka koruma teli (çapraz).
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 32).rotateY(Math.PI / 2).translate(-0.62, 0, 0), bladeMat);
  group.add(duct, spinner, hub, blades, guard);
  group.userData.blades = blades;
  return group;
}

function glowTexture() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.25, "rgba(255,255,255,0.6)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** Tur yolu: yerleşik alanın üstünden geçen, hafif dalgalı kapalı eğri. Merkez ve büyüklük açılış kamerasıyla
 *  aynı hesaptan (main.js): zeplin ilk bakışta kadraja girsin, ada büyüdükçe tur da genişlesin. */
function loopPath(world) {
  const built = world.buildings.filter((b) => !["liman", "kulube", "ambar", "tersane"].includes(b.kind) && Math.hypot(b.x, b.z) < 700);
  const pts = [[0, 0], ...built.map((b) => [b.x, b.z])];
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const r = Math.max(35, ...built.map((b) => Math.hypot(b.x - cx, b.z - cz) + Math.max(b.w, b.d) / 2));
  const { x0, x1, z0, z1 } = world.bounds;
  const rx = THREE.MathUtils.clamp(r * 0.72, 170, (x1 - x0) / 2);
  const rz = THREE.MathUtils.clamp(r * 0.5, 120, (z1 - z0) / 2 + 60);
  const N = 720, loop = [];
  for (let i = 0; i < N; i++) {
    const f = (2 * Math.PI * i) / N, w = 1 + 0.09 * Math.sin(2 * f + 0.6);
    loop.push(new THREE.Vector3(cx + rx * Math.cos(f) * w, 0, cz - rz * Math.sin(f) * w));
  }
  const cum = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + loop[i % N].distanceTo(loop[i - 1]));
  const perimeter = cum[N];
  const at = (d, out = new THREE.Vector3()) => {
    d = ((d % perimeter) + perimeter) % perimeter;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const k = (d - cum[lo]) / (cum[lo + 1] - cum[lo]);
    out.lerpVectors(loop[lo], loop[(lo + 1) % N], k);
    out.y = ALT + 8 * Math.sin((d / perimeter) * Math.PI * 6);
    return out;
  };
  return { at, perimeter, center: new THREE.Vector3(cx, 0, cz) };
}

/** Geliş/gidiş: kübik Bezier, boyca örneklenmiş; hız v0'dan v1'e doğrusal değişir. */
function transit(p0, p1, p2, p3, v0, v1) {
  const N = 240, pts = [], cum = [0];
  const b = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
  for (let i = 0; i <= N; i++) pts.push(b.getPoint(i / N));
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const len = cum[N], dur = (2 * len) / (v0 + v1);
  const at = (tau, out = new THREE.Vector3()) => {
    tau = THREE.MathUtils.clamp(tau, 0, dur);
    const d = v0 * tau + ((v1 - v0) * tau * tau) / (2 * dur);
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const k = Math.min(1, (d - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]));
    return out.lerpVectors(pts[lo], pts[lo + 1], k);
  };
  return { at, dur, speed: (tau) => v0 + ((v1 - v0) * THREE.MathUtils.clamp(tau, 0, dur)) / dur };
}

export class Zeplin {
  constructor(world, { reklam = null, mobile = false } = {}) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = "zeplin";
    this.group.visible = false;
    this.pose = { visible: false, x: 0, y: 0, z: 0, heading: 0, speed: 0, phase: null };

    // Gövde ve kaplama.
    const W = mobile ? 2048 : 4096;
    const hullCv = document.createElement("canvas"); hullCv.width = W; hullCv.height = W / 2;
    const glowCv = document.createElement("canvas"); glowCv.width = 1024; glowCv.height = 512;
    this._paint = (ad) => { paintHull(hullCv, glowCv, ad); hullTex.needsUpdate = true; glowTex.needsUpdate = true; };
    const hullTex = new THREE.CanvasTexture(hullCv);
    hullTex.colorSpace = THREE.SRGBColorSpace;
    hullTex.anisotropy = 8;
    const glowTex = new THREE.CanvasTexture(glowCv);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    this.hullMat = new THREE.MeshStandardMaterial({ map: hullTex, roughness: 0.42, metalness: 0.04, emissive: "#ffffff", emissiveMap: glowTex, emissiveIntensity: 0 });
    const drawDefault = () => this._paint(defaultAd(3000, 1000));
    drawDefault();
    document.fonts?.ready.then(() => { if (!this._custom) drawDefault(); });
    if (reklam) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { this._custom = true; try { this._paint(img); } catch (e) { console.warn("blimp ad could not be paintedadı", e); this._custom = false; drawDefault(); } };
      img.onerror = () => console.warn("blimp ad could not be loaded:", reklam);
      img.src = reklam;
    }
    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);
    this.hull = new THREE.Mesh(hullGeometry(mobile ? 90 : 140, mobile ? 56 : 84), this.hullMat);
    this.hull.castShadow = true;
    body.add(this.hull);

    // Burun bağlama konisi.
    const metal = new THREE.MeshStandardMaterial({ color: "#3b4250", roughness: 0.35, metalness: 0.7 });
    body.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12).scale(0.6, 1, 1).translate(L / 2 - 0.05, 0, 0), metal));

    // Kuyruk dümenleri (X düzeni).
    const fins = finGeometries();
    // Sabit dümenlerde amblem: Extrude uv'si şekil koordinatı (metre); doku dümenin ortasındaki 5 m'lik kareye oturur.
    const emCv = document.createElement("canvas"); emCv.width = emCv.height = 256;
    { const g = emCv.getContext("2d"); g.fillStyle = PEARL; g.fillRect(0, 0, 256, 256); drawEmblem(g, 128, 128, 92); }
    const emTex = new THREE.CanvasTexture(emCv);
    emTex.colorSpace = THREE.SRGBColorSpace;
    emTex.repeat.set(1 / 5, 1 / 5);
    emTex.offset.set(-fins.emblem[0] / 5 + 0.5, -fins.emblem[1] / 5 + 0.5);
    const finMat = new THREE.MeshStandardMaterial({ color: "#ffffff", map: emTex, roughness: 0.45 });
    const ruddMat = new THREE.MeshStandardMaterial({ color: CORAL, roughness: 0.42 });
    const fixedAll = [], movingAll = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      // Amblem yalnız üstteki iki dümende, yandan bakana dönük yüzde (ötekiler ters/ayna görünürdü).
      fixedAll.push(emblemOnly(fins.fixed.clone(), k === 0 ? 1 : k === 3 ? -1 : 0).rotateX(a));
      movingAll.push(fins.moving.clone().rotateX(a));
    }
    const finMesh = new THREE.Mesh(mergeGeometries(fixedAll), finMat);
    const ruddMesh = new THREE.Mesh(mergeGeometries(movingAll), ruddMat);
    finMesh.castShadow = ruddMesh.castShadow = true;
    body.add(finMesh, ruddMesh);

    // Kabin.
    const sG = 0.42, gx = xAt(sG), glen = 12.5;
    const gy = -radiusAt(sG) + 0.55;
    const gCv = document.createElement("canvas"); gCv.width = 1024; gCv.height = 512;
    const gGlow = document.createElement("canvas"); gGlow.width = 512; gGlow.height = 256;
    paintGondola(gCv, gGlow);
    const gTex = new THREE.CanvasTexture(gCv); gTex.colorSpace = THREE.SRGBColorSpace; gTex.anisotropy = 4;
    const gGlowTex = new THREE.CanvasTexture(gGlow); gGlowTex.colorSpace = THREE.SRGBColorSpace;
    this.gondolaMat = new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.38, metalness: 0.1, emissive: "#ffffff", emissiveMap: gGlowTex, emissiveIntensity: 0 });
    const gondola = new THREE.Mesh(gondolaGeometry(glen, 1.45, 1.45), this.gondolaMat);
    gondola.position.set(gx, gy, 0);
    gondola.castShadow = true;
    body.add(gondola);
    // Motorlar: kabinin arka yanlarında, kısa kollar üzerinde.
    this.fans = [];
    const armMat = new THREE.MeshStandardMaterial({ color: "#c8ccd3", roughness: 0.35, metalness: 0.6 });
    for (const side of [-1, 1]) {
      const fan = ductedFan();
      fan.position.set(gx - glen * 0.32, gy - 1.35, side * 3.25);
      body.add(fan);
      this.fans.push(fan.userData.blades);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 2.1), armMat);
      arm.position.set(gx - glen * 0.32, gy - 1.35, side * 1.95);
      arm.castShadow = true;
      body.add(arm);
    }
    // İniş tekerleği.
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.14, 10, 20), new THREE.MeshStandardMaterial({ color: "#22252b", roughness: 0.8 }));
    wheel.position.set(gx - glen * 0.18, gy - 3.35, 0);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), armMat);
    strut.position.set(gx - glen * 0.18, gy - 2.95, 0);
    body.add(wheel, strut);

    // Işıklar: sancak yeşil (+z), iskele kırmızı (-z), kuyruk beyaz; üstte ve altta kırmızı çakar.
    const tex = glowTexture();
    const light = (color, x, y, z, size) => {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      bulb.position.set(x, y, z);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      sprite.scale.setScalar(size);
      sprite.position.copy(bulb.position);
      body.add(bulb, sprite);
      return sprite;
    };
    const rs = radiusAt(0.42);
    this.nav = [
      light("#ff3b3b", gx + glen * 0.3, gy - 2.15, -1.38, 4),
      light("#3bff7a", gx + glen * 0.3, gy - 2.15, 1.38, 4),
      light("#ffffff", xAt(0.995) - 0.2, 0, 0, 4),
    ];
    this.beacons = [light("#ff2a2a", xAt(0.45), rs + 0.15, 0, 9), light("#ff2a2a", gx - 2, gy - 3.0, 0, 7)];
    this.strobe = light("#ffffff", xAt(0.99), 0.4, 0, 11);

    this.path = loopPath(world);
    this._build();
  }

  /** Geliş ve gidiş eğrileri (tur yolu belli olunca). Anakara güneyde (+z, vapurun gittiği yön). */
  _build() {
    const P = this.path;
    const far = P.center.clone().add(new THREE.Vector3(-900, 300, 3200));
    const start = P.at(0), t0 = P.at(1).sub(start).normalize();
    this.inbound = transit(far, far.clone().lerp(start, 0.35), start.clone().addScaledVector(t0, -500), start, TRANSIT, CRUISE);
    const loopStart = SCHEDULE.start + this.inbound.dur;
    this.loopStart = loopStart;
    const dEnd = CRUISE * (SCHEDULE.end - loopStart);
    const end = P.at(dEnd), t1 = P.at(dEnd + 1).sub(end).normalize();
    const away = P.center.clone().add(new THREE.Vector3(900, 300, 3200));
    this.outbound = transit(end, end.clone().addScaledVector(t1, 500), away.clone().lerp(end, 0.35), away, CRUISE, TRANSIT);
  }

  /** Yerel saniyede konum (dışarıdaysa null). */
  positionAt(sec, out = new THREE.Vector3()) {
    const { start, end } = SCHEDULE;
    if (sec < start || sec > end + this.outbound.dur) return null;
    if (sec < this.loopStart) { this.pose.phase = "gelis"; this.pose.speed = this.inbound.speed(sec - start); return this.inbound.at(sec - start, out); }
    if (sec <= end) { this.pose.phase = "tur"; this.pose.speed = CRUISE; return this.path.at(CRUISE * (sec - this.loopStart), out); }
    this.pose.phase = "donus"; this.pose.speed = this.outbound.speed(sec - end);
    return this.outbound.at(sec - end, out);
  }

  /** Her kare: unix (sanal saat), real (gerçek saniye, pervane ve ışıklar), night 0..1. */
  update(unix, real, night) {
    const sec = minuteOf(unix) * 60;
    const q = this.positionAt(sec + 2, (this._q ??= new THREE.Vector3()));
    const r0 = this.positionAt(sec - 2, (this._r ??= new THREE.Vector3()));
    const p = this.positionAt(sec, (this._p ??= new THREE.Vector3())); // en son: pose.phase/speed bu anın
    const vis = !!p;
    this.group.visible = this.pose.visible = vis;
    if (!vis) return;
    const r = r0 ?? p;
    const ahead = q ?? p;
    const dx = ahead.x - r.x, dz = ahead.z - r.z, dy = ahead.y - r.y;
    const heading = Math.atan2(-dz, dx);
    // Dönüşte hafif yatış (eğrilik), tırmanışta burun hafif yukarı; rüzgârda yavaş salınım.
    let turn = 0;
    if (q && r !== p) {
      const h1 = Math.atan2(-(p.z - r.z), p.x - r.x), h2 = Math.atan2(-(ahead.z - p.z), ahead.x - p.x);
      turn = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
    }
    const sway = Math.sin(real * 0.37) * 0.012 + Math.sin(real * 0.23 + 1.3) * 0.008;
    this.group.position.set(p.x, p.y + Math.sin(real * 0.31) * 0.6, p.z);
    this.group.rotation.set(THREE.MathUtils.clamp(-turn * 2.2, -0.07, 0.07) + sway, heading, Math.atan2(dy, Math.hypot(dx, dz)) * 0.8 + Math.sin(real * 0.29 + 0.6) * 0.01, "YZX");
    Object.assign(this.pose, { x: p.x, y: p.y, z: p.z, heading: Math.atan2(dx, dz) });
    for (const b of this.fans) b.rotation.x = real * 38;
    // Gece: reklam alanı içten ışıklı, kabin pencereleri yanar, seyir ışıkları parlar.
    const n = THREE.MathUtils.smoothstep(night, 0.15, 0.6);
    this.hullMat.emissiveIntensity = n * 0.95;
    this.gondolaMat.emissiveIntensity = n * 0.8;
    const navGlow = 0.08 + 0.92 * n;
    for (const s of this.nav) s.material.opacity = navGlow;
    const blink = (real % 1.4) < 0.12 ? 1 : 0.12;
    for (const s of this.beacons) s.material.opacity = blink * (0.4 + 0.6 * n);
    const st = real % 1.6;
    this.strobe.material.opacity = (st < 0.05 || (st > 0.18 && st < 0.23)) ? 0.3 + 0.7 * n : 0;
  }

  pick(raycaster) {
    if (!this.group.visible) return false;
    return raycaster.intersectObject(this.body, true).length > 0;
  }
}
