// Olay tekneleri ve köpük (17 Kasım akşamı; liman/tekne olayları: olay-vapur.js, olay-gemi.js, olay-balik.js, olay-yaris.js).
// Römorkör, ıstakoz teknesi, balıkçı teknesi, güverte yolcuları, tekne izi köpüğü ve duman. Hepsi yalnız olay günü (modülün
// kur(o)'sunda, tembel) kurulur; geometriler birleştirilmiş tek ağdır (tekne başına bir-iki çizim).
// İki adada aynı dosya.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { box, colored, cyl, hull, rod } from "./harbor.js";

export const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const clamp01 = (u) => Math.max(0, Math.min(1, u));
export const lerp = (a, b, u) => a + (b - a) * u;
/** Açı farkı (−π..π). */
export const aciFark = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Parçaları tek geometride birleştirir (uv/normal atılır, normaller yeniden hesaplanır). */
export function birlestir(parts) {
  const g = mergeGeometries(parts.filter(Boolean).map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
    if (p.attributes.uv) p.deleteAttribute("uv");
    if (p.attributes.normal) p.deleteAttribute("normal");
    return p;
  }));
  g.computeVertexNormals();
  return g;
}
export const TEKNE_MAT = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });

/** Römorkör (len m; pruva +z): kara gövde, kırmızı şerit, beyaz köşk, kaptan köşkü, baca, pruvada kalın lastik usturmaça,
 *  yanlarda lastik dizisi, kıçta çeki vinci. Dönen: { mesh, kic: [0, y, z] (halat noktası), pruva: z } */
export function romorkor(len = 20) {
  const beam = len * 0.38, depth = len * 0.16;
  const H = hull(len, beam, depth, { top: "#23272d", stripe: "#c8402e", deck: "#6f747b", inner: "#c8402e" });
  const at = (s) => ({ z: H.z(s), y: H.deckY(s), w: H.deckW(s) });
  const p = [H.geo];
  const k = at(0.56), kw = Math.min(at(0.42).w, at(0.7).w) * 1.6, kl = len * 0.3, kh = len * 0.11;
  p.push(box(kw, kh, kl, 0, k.y + kh / 2, k.z, "#f2f1ec"));
  p.push(box(kw + 0.1, 0.12, kl + 0.1, 0, k.y + kh + 0.06, k.z, "#c8402e"));
  // Kaptan köşkü: dört yanı camlı (kara bant), kırmızı çatı.
  const ww = kw * 0.82, wl = kl * 0.55, wh = len * 0.09, wy = k.y + kh + 0.12;
  p.push(box(ww, wh, wl, 0, wy + wh / 2, k.z + kl * 0.12, "#f2f1ec"));
  p.push(box(ww + 0.04, wh * 0.45, wl + 0.04, 0, wy + wh * 0.62, k.z + kl * 0.12, "#25303b"));
  p.push(box(ww + 0.5, 0.14, wl + 0.6, 0, wy + wh + 0.07, k.z + kl * 0.12, "#c8402e"));
  // Direk ve projektör.
  p.push(cyl(0.07, 0.09, len * 0.22, 0, wy + wh + len * 0.11, k.z + kl * 0.12, "#e6e6e2", 6));
  p.push(box(len * 0.12, 0.08, 0.08, 0, wy + wh + len * 0.17, k.z + kl * 0.12, "#e6e6e2"));
  // Baca (köşkün kıç tarafında).
  const b = at(0.36);
  p.push(cyl(len * 0.045, len * 0.05, len * 0.18, 0, b.y + len * 0.09 + kh * 0.6, b.z, "#c8402e", 12));
  p.push(cyl(len * 0.047, len * 0.047, len * 0.04, 0, b.y + len * 0.18 + kh * 0.6, b.z, "#1d2026", 12));
  // Çeki vinci ve kanca direği (kıç güvertesi).
  const v = at(0.18);
  p.push(colored(new THREE.CylinderGeometry(len * 0.03, len * 0.03, v.w * 1.1, 10).rotateZ(Math.PI / 2).translate(0, v.y + len * 0.035, v.z), "#3a3f47"));
  p.push(box(0.25, len * 0.07, 0.25, 0, v.y + len * 0.035, at(0.08).z, "#d9b12e"));
  // Pruva usturmaçası: pruvayı saran kalın lastik (birkaç kalın parça).
  for (let s = 0.86; s <= 1.001; s += 0.035) {
    const q = at(Math.min(0.995, s)), y = H.sheer(Math.min(0.995, s)) * 0.55;
    for (const side of [-1, 1]) p.push(box(0.55, H.sheer(s) * 0.7, 0.55, side * (H.halfW(Math.min(0.995, s)) + 0.1), y, q.z, "#141518"));
  }
  p.push(box(beam * 0.32, H.sheer(1) * 0.75, 0.7, 0, H.sheer(1) * 0.5, H.z(1) + 0.15, "#141518"));
  // Yan lastikler (borda boyunca asılı eski lastikler).
  for (const side of [-1, 1]) for (let s = 0.22; s <= 0.8; s += 0.11) {
    const w = H.halfW(s), y = H.sheer(s) * 0.45;
    p.push(colored(new THREE.TorusGeometry(0.42, 0.18, 6, 10).rotateY(Math.PI / 2).translate(side * (w + 0.18), y, H.z(s)), "#18191c"));
  }
  const mesh = new THREE.Mesh(birlestir(p), TEKNE_MAT());
  mesh.castShadow = true;
  return { mesh, kic: [0, H.sheer(0) + 0.6, H.z(0.04)], pruva: H.z(1), H };
}

/** Maine ıstakoz teknesi (len m; pruva +z): önde yüksek pruva ve kaptan köşkü, kıçta alçak, açık çalışma güvertesi,
 *  ıstakoz çekme makarası (sancakta), egzoz borusu. renk: gövde, serit: şerit. Dönen: { mesh, H, kosk: {...} } */
export function istakozTeknesi(len = 11, renk = "#f4f1ea", serit = "#2f5d8a", kosk = "#f6f4ee") {
  const beam = len * 0.34, depth = len * 0.15;
  const H = hull(len, beam, depth, { top: renk, stripe: serit, deck: "#b9b2a2", inner: renk });
  const at = (s) => ({ z: H.z(s), y: H.deckY(s), w: H.deckW(s) });
  const p = [H.geo];
  // Kaptan köşkü: pruvaya yakın (s 0.52–0.74), önde eğik ön cam, arkası açık (çatı uzun, arkaya taşar).
  const s0 = 0.5, s1 = 0.74, z0 = H.z(s0), z1 = H.z(s1), cw = Math.min(at(s0).w, at(s1).w) * 1.8, ch = len * 0.16, cy = Math.max(at(s0).y, at(s1).y);
  p.push(box(cw, ch, z1 - z0, 0, cy + ch / 2, (z0 + z1) / 2, kosk));
  p.push(box(cw + 0.03, ch * 0.34, (z1 - z0) * 0.7, 0, cy + ch * 0.7, (z0 + z1) / 2 + 0.15, "#25303b"));
  p.push(box(cw * 0.9, ch * 0.34, 0.04, 0, cy + ch * 0.7, z1 + 0.01, "#25303b"));
  const roofZ0 = z0 - len * 0.12;
  p.push(box(cw + 0.25, 0.1, z1 - roofZ0 + 0.2, 0, cy + ch + 0.05, (roofZ0 + z1) / 2, kosk));
  for (const sx of [-1, 1]) p.push(box(0.08, ch, 0.08, sx * cw / 2, cy + ch / 2, roofZ0 + 0.1, "#d9d4c8"));
  // Egzoz (köşkün arkasında, kara boru) ve anten.
  p.push(cyl(0.09, 0.09, ch * 1.5, cw * 0.32, cy + ch * 0.9, z0 - 0.3, "#2a2d33", 8));
  p.push(cyl(0.03, 0.03, len * 0.25, -cw * 0.3, cy + ch + len * 0.125, (z0 + z1) / 2, "#e6e6e2", 5));
  // Çekme makarası (davit) sancakta, köşkün kıçında; kıç güvertede kafesler.
  const d = at(0.44);
  p.push(cyl(0.05, 0.06, 1.3, d.w * 0.85, d.y + 0.65, d.z, "#c9ced4", 6), colored(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12).rotateZ(Math.PI / 2).translate(d.w * 0.85, d.y + 1.3, d.z), "#c9ced4"));
  for (const [dx, s] of [[-0.45, 0.16], [0.45, 0.16], [-0.45, 0.28]]) { const q = at(s); p.push(box(0.8, 0.45, 0.6, dx * q.w, q.y + 0.22, q.z, "#c8a24a")); }
  const mesh = new THREE.Mesh(birlestir(p), TEKNE_MAT());
  mesh.castShadow = true;
  return { mesh, H, kosk: { cy, ch, cw, z0, z1, roofZ0 } };
}

/** Balıkçı teknesi (len m; pruva +z): kıçta kaptan köşkü, ortada direk ve bumba (yük için), pruvada kasalar. Bumba ayrı
 *  döner (olay modülü çevirir): Dönen { mesh, H, direk: [0, y, z] (bumba mafsalı), bumbaBoy } */
export function balikciTeknesi(len = 13, pal = { top: "#e9e2cf", stripe: "#b8312f", deck: "#9b7350" }) {
  const beam = len * 0.33, depth = len * 0.13;
  const H = hull(len, beam, depth, pal);
  const at = (s) => ({ z: H.z(s), y: H.deckY(s), w: H.deckW(s) });
  const p = [H.geo];
  const s0 = 0.14, s1 = 0.36, z0 = H.z(s0), z1 = H.z(s1), cw = Math.min(at(s0).w, at(s1).w) * 1.6, ch = len * 0.15, cy = Math.max(at(s0).y, at(s1).y);
  p.push(box(cw, ch, z1 - z0, 0, cy + ch / 2, (z0 + z1) / 2, "#f6f4ee"));
  p.push(box(cw + 0.2, 0.09, z1 - z0 + 0.3, 0, cy + ch + 0.05, (z0 + z1) / 2, pal.stripe));
  p.push(box(cw + 0.02, ch * 0.32, (z1 - z0) * 0.8, 0, cy + ch * 0.68, (z0 + z1) / 2, "#28323e"));
  p.push(box(cw * 0.86, ch * 0.32, 0.03, 0, cy + ch * 0.68, z1 + 0.01, "#28323e"));
  // Direk (ortada) ve üstünde seyir feneri.
  const m = at(0.52), mh = len * 0.62;
  p.push(cyl(0.09, 0.12, mh, 0, m.y + mh / 2, m.z, "#d9d4c8", 8));
  p.push(colored(new THREE.SphereGeometry(0.12, 8, 6).translate(0, m.y + mh + 0.08, m.z), "#fff3c4"));
  // Bumbanın vinci (direk dibinde) ve kasalar.
  p.push(colored(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 10).rotateZ(Math.PI / 2).translate(0, m.y + 0.45, m.z - 0.7), "#c94f3a"));
  for (const [dx, s] of [[-0.4, 0.8], [0.4, 0.8], [0, 0.86]]) { const q = at(s); p.push(box(0.6, 0.35, 0.45, dx * q.w, q.y + 0.18, q.z, "#3e7fb0")); }
  for (const side of [-1, 1]) for (const s of [0.3, 0.55]) {
    const w = H.halfW(s), y = H.sheer(s) * 0.5;
    p.push(cyl(0.1, 0.1, 0.42, side * (w + 0.1), y, H.z(s), "#f4f4f1", 8));
  }
  const mesh = new THREE.Mesh(birlestir(p), TEKNE_MAT());
  mesh.castShadow = true;
  return { mesh, H, direk: [0, m.y + mh * 0.62, m.z], bumbaBoy: len * 0.62, guverteY: m.y };
}

/** Basit insan figürü (bacaklar, gövde, baş; ~1,75 m): güverte yolcuları ve tekne tayfası için örnekli ağ. Gövde rengi
 *  örnek renginden (instanceColor), baş ve bacaklar köşe renginde. */
export function figurGeo() {
  const g = birlestir([
    box(0.34, 0.8, 0.22, 0, 0.4, 0, "#2f3540"),
    colored(new THREE.CapsuleGeometry(0.21, 0.42, 3, 8).translate(0, 1.16, 0), "#ffffff"),
    colored(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.6, 0), "#e2b48c"),
  ]);
  return g;
}
const GIYSI = ["#c8402e", "#2f5d8a", "#e8b93a", "#3e8a86", "#f2f1ec", "#7a4a8a", "#d9822b", "#4b6b3a", "#1f2a44", "#b8432f"];
/** n kişilik örnekli figür ağı (renkleri tohumdan); yerleri modül setMatrixAt ile verir. */
export function figurler(n, tohum = 1) {
  const m = new THREE.InstancedMesh(figurGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) m.setColorAt(i, c.set(GIYSI[(i * 7 + tohum) % GIYSI.length]));
  m.castShadow = true;
  return m;
}

// --- köpük (tekne izi, pruva dalgası) ---
// Örnekli yatay lekeler: köşe rengi (kırmızı kanal) yumuşak kenar saydamlığı, örnek rengi örnek başına saydamlık (deniz.js ile
// aynı yöntem). Her kare baştan doldurulur (count = kullanılan): kare arası birikim yok.
function kopukMalzeme() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "diffuseColor.a *= vColor.r;"); };
  return m;
}
function lekeGeo(rr = [0, 0.45, 0.8, 1], aa = [1, 0.8, 0.35, 0], n = 18) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i < rr.length; i++) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2; pos.push(Math.cos(a) * rr[i], 0, Math.sin(a) * rr[i]); col.push(aa[i], aa[i], aa[i]);
  }
  for (let i = 0; i < rr.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * n + k, b = i * n + ((k + 1) % n); idx.push(a, a + n, b, b, a + n, b + n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}

/** Köpük havuzu (n leke). basla() → leke(...)* → bitir(isik). */
export function kopukHavuzu(group, n = 400) {
  const mat = kopukMalzeme();
  const mesh = new THREE.InstancedMesh(lekeGeo(), mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 3;
  const C = new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, C);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let i = 0;
  const api = {
    mesh,
    basla() { i = 0; },
    /** (x, z) merkezli, yaw yönünde rz uzun, rx geniş leke; alfa 0..1. */
    leke(x, z, rx, rz, alfa, yaw = 0, y = 0.05) {
      if (i >= n || alfa <= 0.01) return;
      _q.setFromAxisAngle(Y, yaw); _p.set(x, y, z); _s.set(rx, 1, rz);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s)); mesh.setColorAt(i, C.setRGB(alfa, alfa, alfa));
      i++;
    },
    bitir(isik = 1) {
      mesh.count = i; mat.color.setScalar(0.45 + 0.55 * clamp01(isik));
      if (i) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    },
  };
  return api;
}

/** Tekne izi: konum(sec, out) → out {x, z, h} (h: pruva yönü) yolundan geçmiş anlar örneklenir; hızla güçlenir.
 *  o: { boy (tekne boyu), en (genişlik), hiz0 (tam köpük hızı, m/s), n (örnek), dt (örnek aralığı sn), guc (çarpan) } */
const _a = { x: 0, z: 0, h: 0 }, _b = { x: 0, z: 0, h: 0 };
export function tekneIzi(kop, konum, sec, o) {
  const { boy, en, hiz0 = 6, n = 12, dt = 0.9, guc = 1 } = o;
  if (!konum(sec, _a)) return;
  konum(sec - 0.5, _b);
  const v0 = Math.hypot(_a.x - _b.x, _a.z - _b.z) / 0.5;
  const k0 = clamp01(v0 / hiz0) * guc;
  // Pruva dalgası (iki yanda beyaz bıyık) ve kıç çalkantısı.
  if (k0 > 0.05) {
    const sx = Math.sin(_a.h), cz = Math.cos(_a.h);
    for (const side of [-1, 1]) kop.leke(_a.x + sx * boy * 0.42 + cz * side * en * 0.55, _a.z + cz * boy * 0.42 - sx * side * en * 0.55, en * 0.35, boy * 0.16, 0.75 * k0, _a.h + side * 0.35);
    kop.leke(_a.x - sx * boy * 0.5, _a.z - cz * boy * 0.5, en * 0.6, boy * 0.2, 0.9 * k0, _a.h);
  }
  for (let k = 1; k <= n; k++) {
    if (!konum(sec - k * dt, _b)) break;
    konum(sec - k * dt - 0.5, _a);
    const v = Math.hypot(_b.x - _a.x, _b.z - _a.z) / 0.5, kk = clamp01(v / hiz0) * guc;
    if (kk < 0.05) continue;
    const yas = k / n, sx = Math.sin(_b.h), cz = Math.cos(_b.h);
    const kx = _b.x - sx * boy * 0.5, kz = _b.z - cz * boy * 0.5; // kıçın o anki yeri
    const al = kk * (1 - yas) ** 1.3;
    kop.leke(kx, kz, en * (0.5 + 0.9 * yas), Math.min(dt * v * 0.75, boy * 0.8) + boy * 0.1, 0.8 * al, _b.h);
    // V dalgası: iki kol, yaşla açılır.
    const yan = en * 0.5 + Math.min(v * k * dt * 0.16, boy * 1.1);
    for (const side of [-1, 1]) kop.leke(kx + cz * side * yan, kz - sx * side * yan, en * 0.2 + 0.3 * yas, Math.min(dt * v * 0.55, boy * 0.6), 0.38 * al, _b.h + side * 0.3);
  }
}

// --- duman (bacadan kara duman; yangın değil: ışıksız, normal saydam sprite) ---
let _dumanTex = null;
function dumanDoku() {
  if (_dumanTex) return _dumanTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _dumanTex = new THREE.CanvasTexture(c);
  return _dumanTex;
}
/** n sprite'lık duman; ciz(kaynak [x,y,z], yas sn, guc 0..1, renk) her kare. */
export function dumanKur(group, n = 14, renk = "#2a2a2c") {
  const ss = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dumanDoku(), color: renk, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; s.renderOrder = 6; group.add(s); ss.push(s); // su (saydam) üstüne çizilsin
  }
  return {
    gizle() { for (const s of ss) s.visible = false; },
    /** Kaynaktan yükselen puflar: sn (olaydaki saniye), guc (0: yok), ruzgar [dx, dz] m/sn. */
    ciz(kx, ky, kz, sn, guc, ruzgar = [1.8, 0.8], boy = 1) {
      const omur = 14;
      for (let i = 0; i < n; i++) {
        const yas = (sn + (i * omur) / n) % omur, u = yas / omur, s = ss[i];
        const g = guc(sn - yas); // bu pufun doğduğu andaki güç
        if (g <= 0.02) { s.visible = false; continue; }
        s.visible = true;
        const r = (2.2 + u * 12) * boy * (0.6 + 0.4 * g);
        s.position.set(kx + ruzgar[0] * yas, ky + 0.8 * boy + yas * 1.3, kz + ruzgar[1] * yas);
        s.scale.set(r, r, 1);
        s.material.opacity = g * 0.92 * (1 - u) ** 0.8 * Math.min(1, yas * 2);
      }
    },
  };
}
