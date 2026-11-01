// Liman yapıları: tahta iskeleler (döşeme, kazık, korkuluk, baba, fener direği), vapur ve tekneler.
// Tekneler ve vapur dalgayla hafifçe sallanır.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildPort } from "./port.js";
import { ferryOut } from "./ferry.js";

export function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

export const box = (w, h, d, x, y, z, color) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
export const cyl = (r0, r1, h, x, y, z, color, seg = 8) => colored(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), color);

export function merged(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const MATW = new THREE.MeshStandardMaterial({ color: "#8a5a3a", roughness: 0.85 });
const FLAT = 1.2; // bina tabanı (layout FLAT_Y)
export const METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 });

/** Tahta iskele: x merkez, z başlangıç (kıyı), +z yönünde len metre, w genişlik, döşeme üstü top.
 *  kopru: {side, z, half} vapur köprüsünün indiği yer (iskelenin başından z, o yanda korkuluk açık). */
function pier(f, top, kopru = null) {
  const parts = [];
  const plank = 0.28, gap = 0.04;
  const woods = ["#a77e57", "#9b7350", "#b08760", "#8f6a49"];
  for (let z = 0; z < f.len; z += plank + gap) {
    parts.push(box(f.w, 0.08, plank, f.x, top - 0.04, f.z + z + plank / 2, woods[Math.floor(z * 7.3) % 4]));
  }
  // Kenar kirişleri ve kazıklar.
  for (const side of [-1, 1]) {
    parts.push(box(0.22, 0.32, f.len, f.x + side * (f.w / 2 - 0.11), top - 0.24, f.z + f.len / 2, "#7a5a3e"));
    for (let z = 1; z < f.len; z += 4) parts.push(cyl(0.16, 0.18, top + 4, f.x + side * (f.w / 2 - 0.2), (top - 4) / 2, f.z + z, "#5e4532", 7));
  }
  // Kirişler (enine).
  for (let z = 1; z < f.len; z += 4) parts.push(box(f.w, 0.18, 0.2, f.x, top - 0.21, f.z + z, "#6e5038"));
  const wood = merged(parts);
  const metal = [];
  if (f.w > 5) {
    // Büyük iskele: korkuluk, babalar ve fener direkleri.
    for (const side of [-1, 1]) {
      const x = f.x + side * (f.w / 2 - 0.08);
      const open = (z, extra = 0) => kopru && kopru.side === side && Math.abs(z - kopru.z) < kopru.half + extra;
      for (let z = 2; z < f.len - 1; z += 2.5) if (!open(z)) metal.push(cyl(0.035, 0.035, 1.05, x, top + 0.52, f.z + z, "#2f3540", 6));
      // Korkuluk boruları; vapur köprüsünün indiği yerde açıklık.
      const runs = kopru && kopru.side === side ? [[2, kopru.z - kopru.half], [kopru.z + kopru.half, f.len - 1]] : [[2, f.len - 1]];
      for (const [a, b] of runs) {
        if (b - a < 0.3) continue;
        metal.push(box(0.06, 0.05, b - a, x, top + 1.05, f.z + (a + b) / 2, "#2f3540"));
        metal.push(box(0.04, 0.04, b - a, x, top + 0.6, f.z + (a + b) / 2, "#2f3540"));
      }
      for (let z = 6; z < f.len; z += 12) {
        if (open(z, 1.2)) continue;
        metal.push(cyl(0.16, 0.2, 0.45, f.x + side * (f.w / 2 - 0.6), top + 0.22, f.z + z, "#25282e", 10));
        metal.push(cyl(0.24, 0.24, 0.08, f.x + side * (f.w / 2 - 0.6), top + 0.48, f.z + z, "#25282e", 10));
      }
      for (let z = 10; z < f.len; z += 20) {
        if (open(z, 0.6)) continue;
        metal.push(cyl(0.06, 0.09, 3.4, f.x + side * (f.w / 2 - 0.6), top + 1.7, f.z + z, "#2f3540", 8));
        metal.push(colored(new THREE.CylinderGeometry(0.18, 0.13, 0.4, 6).translate(f.x + side * (f.w / 2 - 0.6), top + 3.6, f.z + z), "#fff3c4"));
      }
    }
  } else {
    // Balıkçı iskelesi: tek yanda basit tahta korkuluk.
    for (let z = 2; z < f.len; z += 3) parts.push(box(0.08, 0.9, 0.08, f.x - f.w / 2 + 0.05, top + 0.45, f.z + z, "#6e5038"));
  }
  const group = new THREE.Group();
  const w = new THREE.Mesh(wood, MAT);
  w.castShadow = w.receiveShadow = true;
  group.add(w);
  if (metal.length) {
    const m = new THREE.Mesh(merged(metal), METAL);
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

/** Şehir hatları vapuru (50 m): siyah gövde, beyaz iki katlı üst yapı, pencere sıraları, baca, can simitleri. */
function ferry() {
  const parts = [];
  // Gövde: pruva ve kıçta daralan.
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-5.5, -24); hullShape.lineTo(5.5, -24); hullShape.lineTo(5.6, 18); hullShape.quadraticCurveTo(5, 24, 0, 26);
  hullShape.quadraticCurveTo(-5, 24, -5.6, 18); hullShape.lineTo(-5.5, -24);
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 3.2, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -1.6, 0);
  parts.push(colored(hull, "#1f2226"));
  const deckShape = new THREE.Shape(hullShape.getPoints(24));
  parts.push(colored(new THREE.ExtrudeGeometry(deckShape, { depth: 1.6, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 1.6, 0), "#f4f4f1"));
  // Kırmızı şerit gövdenin birkaç santim dışında (aynı yüzeyde titreşmesin).
  parts.push(colored(new THREE.ExtrudeGeometry(deckShape, { depth: 0.35, bevelEnabled: false }).rotateX(-Math.PI / 2).scale(1.012, 1, 1.003).translate(0, 1.25, 0), "#b8312f"));
  // Üst yapı: iki kat.
  parts.push(box(9.4, 2.6, 34, 0, 4.5, -1, "#f6f6f3"));
  parts.push(box(8.2, 2.3, 18, 0, 7.0, 0, "#f6f6f3"));
  parts.push(box(9.6, 0.15, 35, 0, 5.85, -1, "#d9dde2"));
  parts.push(box(8.4, 0.15, 19, 0, 8.2, 0, "#d9dde2"));
  // Pencere sıraları (iki yan) ve kaptan köşkü camları.
  for (const side of [-1, 1]) {
    for (let z = -16; z <= 14; z += 2.2) parts.push(box(0.05, 1.0, 1.6, side * 4.71, 4.7, z, "#28323e"));
    for (let z = -7.5; z <= 7.5; z += 2.2) parts.push(box(0.05, 0.9, 1.6, side * 4.11, 7.2, z, "#28323e"));
  }
  parts.push(box(7.6, 0.9, 0.05, 0, 7.3, 9.02, "#28323e"));
  // Baca ve direk.
  parts.push(cyl(1.15, 1.3, 4.2, 0, 10.2, -3, "#f2f2ef", 14));
  parts.push(cyl(1.17, 1.17, 0.9, 0, 11.6, -3, "#1f2226", 14));
  parts.push(cyl(1.17, 1.17, 0.35, 0, 10.9, -3, "#e8b93a", 14));
  parts.push(cyl(0.08, 0.1, 6, 0, 11.2, 7, "#2f3540", 6));
  // Can simitleri.
  for (const side of [-1, 1]) for (const z of [-10, 0, 10]) parts.push(colored(new THREE.TorusGeometry(0.38, 0.1, 6, 12).rotateY(Math.PI / 2).translate(side * 4.75, 4.2, z + 1.1), "#f07a2a"));
  // Korkuluk: ana güvertenin kenarını (pruvada daralan çizgiyi) izler; dikmeler iki metrede bir.
  const edge = hullShape.getSpacedPoints(64).map((q) => new THREE.Vector3(q.x * 0.97, 0, -q.y * 0.985));
  let acc = 0;
  for (let k = 1; k < edge.length; k++) {
    const a = edge[k - 1], b = edge[k];
    parts.push(rod(a.clone().setY(4.2), b.clone().setY(4.2), 0.04, "#c9ced4"));
    parts.push(rod(a.clone().setY(3.7), b.clone().setY(3.7), 0.025, "#c9ced4"));
    acc += a.distanceTo(b);
    if (acc >= 2) { acc = 0; parts.push(rod(b.clone().setY(3.2), b.clone().setY(4.2), 0.03, "#c9ced4")); }
  }
  const g = new THREE.Mesh(merged(parts), MAT);
  g.castShadow = g.receiveShadow = true;
  return g;
}

/** a'dan b'ye ince çubuk (boru, halat). */
export function rod(a, b, r, color) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, 6).translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return colored(g.translate(a.x, a.y, a.z), color);
}

/**
 * Tekne gövdesi kesitlerden örülür: kıçta düz ayna, pruvaya doğru daralan ve yükselen borda, U kesitli
 * karina. Güverte, küpeşte ve iç borda aynı kesit işlevlerinden türetilir; hiçbir parça gövdeden taşmaz.
 * Su hattı y = 0'dadır (altı zehirli boya rengi). Dönen: geometri ve güverte yardımcıları.
 */
export function hull(len, beam, depth, colors) {
  const N = 18, J = 7;
  const halfW = (s) => (s < 0.55 ? 0.86 + 0.14 * Math.sin((s / 0.55) * Math.PI / 2) : Math.pow(Math.cos(((s - 0.55) / 0.45) * Math.PI / 2), 0.75)) * beam / 2 + 0.015;
  const sheer = (s) => depth * (0.62 + 0.3 * s * s);
  const keel = (s) => -depth * 0.42 * (s > 0.8 ? 1 - ((s - 0.8) / 0.2) * 0.7 : 1);
  const z = (s) => (s - 0.5) * len;
  // Kesit noktası: t = 0 küpeşte, t = 1 omurga (orta hat).
  const sec = (s, t) => {
    const w = halfW(s), g = sheer(s), k = keel(s);
    return [w * Math.pow(Math.cos((t * Math.PI) / 2), 0.45), g + (k - g) * Math.pow(t, 1.25)];
  };
  const deckY = (s) => sheer(s) - Math.min(0.32, depth * 0.3);
  const tDeck = (s) => { const g = sheer(s), k = keel(s); return Math.pow((g - deckY(s)) / (g - k), 1 / 1.25); };
  const deckW = (s) => Math.max(0, sec(s, tDeck(s))[0] - 0.06);
  const pos = [], col = [];
  const C = (c) => new THREE.Color(c);
  const [top, stripe, bottom, deckC, inner] = [C(colors.top), C(colors.stripe), C("#7a2a26"), C(colors.deck), C(colors.inner ?? colors.top)];
  const colorAt = (y, g) => (y < 0.02 ? bottom : y > g - 0.18 ? stripe : top);
  const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b); };
  const quad = (a, b, c, d, ca, cb = ca, cc = ca, cd = ca) => { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); };
  for (let i = 0; i < N; i++) {
    const s0 = i / N, s1 = (i + 1) / N;
    for (let j = 0; j < J; j++) {
      const t0 = j / J, t1 = (j + 1) / J;
      for (const side of [-1, 1]) {
        const P = (s, t) => { const [x, y] = sec(s, t); return [side * x, y, z(s)]; };
        const a = P(s0, t0), b = P(s1, t0), c = P(s1, t1), d = P(s0, t1);
        const ca = colorAt(a[1], sheer(s0)), cb = colorAt(b[1], sheer(s1)), cc = colorAt(c[1], sheer(s1)), cd = colorAt(d[1], sheer(s0));
        if (side > 0) quad(a, b, c, d, ca, cb, cc, cd); else quad(a, d, c, b, ca, cd, cc, cb);
      }
    }
    // Güverte, iç borda ve küpeşte üstü.
    const dy0 = deckY(s0), dy1 = deckY(s1), w0 = deckW(s0), w1 = deckW(s1);
    quad([-w0, dy0, z(s0)], [w0, dy0, z(s0)], [w1, dy1, z(s1)], [-w1, dy1, z(s1)], deckC);
    for (const side of [-1, 1]) {
      const g0 = sheer(s0), g1 = sheer(s1), o0 = halfW(s0), o1 = halfW(s1);
      const a = [side * w0, dy0, z(s0)], b = [side * w1, dy1, z(s1)], c = [side * w1, g1, z(s1)], d = [side * w0, g0, z(s0)];
      if (side > 0) quad(a, d, c, b, inner); else quad(a, b, c, d, inner);
      const e = [side * o0, g0, z(s0)], f = [side * o1, g1, z(s1)];
      if (side > 0) quad(d, e, f, c, stripe); else quad(d, c, f, e, stripe);
    }
  }
  // Kıç aynası: düz, iki yandan ortaya üçgenlerle kapanır.
  for (let j = 0; j < J; j++) {
    const t0 = j / J, t1 = (j + 1) / J;
    const [x0, y0] = sec(0, t0), [x1, y1] = sec(0, t1);
    const cz = z(0), cy = keel(0);
    tri([-x0, y0, cz], [x0, y0, cz], [x1, y1, cz], colorAt(y0, sheer(0)), colorAt(y0, sheer(0)), colorAt(y1, sheer(0)));
    tri([-x0, y0, cz], [x1, y1, cz], [-x1, y1, cz], colorAt(y0, sheer(0)), colorAt(y1, sheer(0)), colorAt(y1, sheer(0)));
    void cy;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return { geo: g, z, deckY, deckW, halfW, sheer };
}

/**
 * Tekne. len < 7: sandal (oturaklar, dıştan takma motor, kürekler). Daha büyükleri balıkçı teknesi:
 * kaptan köşkü (camlı), direk ve seren, seyir feneri, usturmaçalar, ağ makarası.
 */
function boat(len, seed = 0) {
  const PAL = [
    { top: "#f4f1ea", stripe: "#2f5d8a", deck: "#b08a62" },
    { top: "#2f5d8a", stripe: "#f4f1ea", deck: "#a77e57" },
    { top: "#e9e2cf", stripe: "#b8312f", deck: "#9b7350" },
    { top: "#3e8a86", stripe: "#f2d36b", deck: "#a77e57" },
  ];
  const pal = PAL[seed % PAL.length];
  const small = len < 7;
  const beam = len * (small ? 0.38 : 0.32), depth = small ? 0.75 : len * 0.12;
  const H = hull(len, beam, depth, pal);
  const parts = [H.geo]; // gövde kendi köşe renkleriyle
  const at = (s) => ({ z: H.z(s), y: H.deckY(s), w: H.deckW(s) });
  if (small) {
    for (const s of [0.28, 0.55, 0.78]) { const a = at(s); parts.push(box(a.w * 2, 0.05, 0.24, 0, a.y + 0.28, a.z, "#9b7350"), box(0.05, 0.28, 0.05, 0, a.y + 0.14, a.z, "#7a5a3e")); }
    // Dıştan takma motor (aynanın dışında).
    const k = at(0.0);
    parts.push(box(0.3, 0.42, 0.34, 0, H.sheer(0) + 0.12, k.z - 0.24, "#2a2d33"), box(0.12, 0.8, 0.12, 0, H.sheer(0) - 0.4, k.z - 0.3, "#3a3d43"), box(0.05, 0.2, 0.28, 0, -0.55, k.z - 0.3, "#2a2d33"));
    // Kürekler (oturakların üstünde, borda boyunca).
    for (const side of [-1, 1]) { const a = at(0.5); parts.push(box(0.05, 0.04, len * 0.55, side * a.w * 0.7, a.y + 0.34, a.z, "#c9a27a")); }
  } else {
    // Kaptan köşkü: güvertenin kıç-orta bölümünde, güverte genişliğine sığar.
    const s0 = 0.22, s1 = 0.46;
    const cw = Math.min(at(s0).w, at(s1).w) * 1.55, cz = (H.z(s0) + H.z(s1)) / 2, cl = H.z(s1) - H.z(s0), cy = Math.max(at(s0).y, at(s1).y);
    const ch = len * 0.13;
    parts.push(box(cw, ch, cl, 0, cy + ch / 2, cz, pal.stripe === "#f4f1ea" ? "#f4f1ea" : "#f6f4ee"));
    parts.push(box(cw + 0.2, 0.08, cl + 0.3, 0, cy + ch + 0.04, cz, pal.stripe));
    parts.push(box(cw + 0.02, ch * 0.32, cl * 0.8, 0, cy + ch * 0.68, cz, "#28323e"));
    parts.push(box(cw * 0.86, ch * 0.32, 0.03, 0, cy + ch * 0.68, cz + cl / 2 + 0.01, "#28323e"));
    // Direk, seren ve seyir feneri; köşkün önünde.
    const m = at(0.66);
    const mh = len * 0.55;
    parts.push(cyl(0.05, 0.07, mh, 0, m.y + mh / 2, m.z, "#d9d4c8", 6));
    parts.push(box(Math.min(m.w * 2.4, len * 0.22), 0.05, 0.05, 0, m.y + mh * 0.72, m.z, "#d9d4c8"));
    parts.push(colored(new THREE.SphereGeometry(0.09, 8, 6).translate(0, m.y + mh + 0.05, m.z), "#fff3c4"));
    // Ağ makarası ve kasalar (kıç güvertede).
    const a = at(0.1);
    parts.push(colored(new THREE.CylinderGeometry(0.28, 0.28, Math.min(1.1, a.w * 1.4), 10).rotateZ(Math.PI / 2).translate(0, a.y + 0.45, a.z), "#c94f3a"));
    for (const [dx, dz] of [[-0.35, 0.55], [0.35, 0.55]]) parts.push(box(0.5, 0.3, 0.4, dx * a.w, a.y + 0.15, a.z + dz, "#3e7fb0"));
    // Küpeşte üstünde paslanmaz tutamak (pruva bölümünde), dikmeleri gövdenin içinde.
    for (const side of [-1, 1]) {
      const tops = [];
      for (let s = 0.6; s <= 0.93; s += 0.11) {
        const q = at(s), x = side * (q.w + 0.03), y = H.sheer(s);
        parts.push(cyl(0.02, 0.02, 0.5, x, y + 0.25, q.z, "#c9ced4", 5));
        tops.push(new THREE.Vector3(x, y + 0.5, q.z));
      }
      // Dikmelerin üstünden geçen tutamak borusu, pruvada iki yan birleşir.
      tops.push(new THREE.Vector3(0, H.sheer(0.99) + 0.5, H.z(0.99)));
      for (let k = 1; k < tops.length; k++) parts.push(rod(tops[k - 1], tops[k], 0.022, "#c9ced4"));
    }
  }
  // Usturmaçalar: bordanın dışında, su hattının üstünde asılı.
  for (const side of [-1, 1]) for (const s of [0.3, 0.55]) {
    const w = H.halfW(s), y = H.sheer(s) * 0.5;
    parts.push(cyl(0.085, 0.085, 0.36, side * (w + 0.09), y, H.z(s), "#f4f4f1", 8));
    parts.push(rod(new THREE.Vector3(side * (w + 0.09), y + 0.18, H.z(s)), new THREE.Vector3(side * (w - 0.02), H.sheer(s), H.z(s)), 0.01, "#d9cfa8"));
  }
  const geo = mergeGeometries(parts.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { if (g.attributes.uv) g.deleteAttribute("uv"); if (g.attributes.normal) g.deleteAttribute("normal"); return g; }));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/**
 * Tersane kızağı: beton rampa (düz kısım + denize inen eğim, kenarlarında ray), beşik üstünde yapımdaki
 * tekne (gövde hull() ile; karina boyası henüz yarım), iki katlı tüp iskele, üstte portal vinç ve
 * kancası, kereste yığını, boya varilleri, kaynak makinesi.
 */
export function buildShipyard(world) {
  const S = world.tersane;
  const group = new THREE.Group();
  const top = S.top;
  const conc = [], steel = [], wood = [];
  const W = S.x1 - S.x0, cx = (S.x0 + S.x1) / 2;
  // Düz kısım (kalın beton döşeme, denize doğru kenarları duvar).
  conc.push(box(W, top + 3, S.zFlat - S.z0, cx, (top - 3) / 2, (S.z0 + S.zFlat) / 2, "#a9aaa5"));
  // Eğimli rampa: düz kısımdan denize tek parça eğimli beton (kalın levha), raylar onunla birlikte iner.
  const dz = S.z1 - S.zFlat, dy = top + 2.5, L = Math.hypot(dz, dy), ang = Math.atan2(dy, dz);
  const slope = (w, h, x, color, lift = 0) => {
    const g = new THREE.BoxGeometry(w, h, L).translate(0, -h / 2 + lift, L / 2).rotateX(ang).translate(x, top, S.zFlat);
    return colored(g, color);
  };
  conc.push(slope(W, 1.2, cx, "#9a9b96"));
  for (const rx of [-2.2, 2.2]) {
    steel.push(box(0.15, 0.12, S.zFlat - S.z0, S.x + rx, top + 0.06, (S.z0 + S.zFlat) / 2, "#4a4f57"));
    steel.push(slope(0.15, 0.12, S.x + rx, "#4a4f57", 0.12));
  }
  // Beşik: omurga takozları ve yan payandalar.
  const B = S.boat, len = B.len, beam = len * 0.32, depth = len * 0.12;
  const keelY = top + 0.8;
  for (let z = B.z - len / 2 + 1.5; z < B.z + len / 2 - 1; z += 2) wood.push(box(1.2, 0.8, 0.5, B.x, top + 0.4, z, "#7a5a3e"));
  const H = hull(len, beam, depth, { top: "#e9e2cf", stripe: "#2f5d8a", deck: "#b08a62", inner: "#e9e2cf" });
  const boatMesh = new THREE.Mesh(H.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  const oy = keelY + depth * 0.42;
  boatMesh.position.set(B.x, oy, B.z);
  boatMesh.castShadow = boatMesh.receiveShadow = true;
  group.add(boatMesh);
  // Yarım kalmış kaplama: kıç tarafında açıkta kalan postalar (kaburgalar).
  for (let s = 0.05; s < 0.3; s += 0.05) {
    const z = B.z + H.z(s), w = H.halfW(s), g = H.sheer(s);
    wood.push(box(0.12, g + depth * 0.42, 0.12, B.x - w + 0.06, oy - depth * 0.42 + (g + depth * 0.42) / 2, z, "#8a6a4a"));
    wood.push(box(0.12, g + depth * 0.42, 0.12, B.x + w - 0.06, oy - depth * 0.42 + (g + depth * 0.42) / 2, z, "#8a6a4a"));
  }
  for (const side of [-1, 1]) {
    for (const s of [0.25, 0.5, 0.75]) {
      const z = B.z + H.z(s), w = H.halfW(s);
      wood.push(rod(new THREE.Vector3(B.x + side * (w + 1.4), top, z), new THREE.Vector3(B.x + side * (w - 0.1), oy + H.sheer(s) * 0.35, z), 0.09, "#7a5a3e"));
    }
  }
  // İskele: iki kat, dikmeler, platform kalasları, korkuluk.
  for (const side of [-1, 1]) {
    const x = B.x + side * 3.6;
    for (let z = B.z - len / 2; z <= B.z + len / 2 + 0.1; z += 2) {
      for (const dx of [-0.6, 0.6]) steel.push(cyl(0.04, 0.04, 4.2, x + dx, top + 2.1, z, "#9aa1a8", 6));
    }
    for (const lv of [1.4, 2.8]) {
      wood.push(box(1.3, 0.06, len, x, top + lv, B.z, "#b08a5a"));
      steel.push(box(0.05, 0.05, len, x + side * 0.6, top + lv + 1.0, B.z, "#9aa1a8"));
      steel.push(box(0.05, 0.05, len, x + side * 0.6, top + lv + 0.5, B.z, "#9aa1a8"));
    }
    for (let z = B.z - len / 2; z < B.z + len / 2; z += 2) steel.push(rod(new THREE.Vector3(x + side * 0.6, top, z), new THREE.Vector3(x + side * 0.6, top + 2.8, z + 2), 0.03, "#9aa1a8"));
    // Merdiven (iskelenin baş ucunda).
    for (let y = 0.3; y < 2.8; y += 0.35) steel.push(box(0.5, 0.04, 0.04, x, top + y, B.z + len / 2 + 0.4, "#9aa1a8"));
  }
  // Portal vinç: kızağın iki yanında ayaklar, üstte kiriş ve kanca.
  const cy = top + 10;
  for (const z of [B.z - 6, B.z + 6]) {
    for (const x of [S.x0 - 0.6, S.x1 + 0.6]) steel.push(box(0.6, cy - top, 0.6, x, (cy + top) / 2, z, "#e8b62a"));
    steel.push(box(W + 1.8, 0.8, 0.7, cx, cy, z, "#e8b62a"));
  }
  for (const x of [S.x0 - 0.6, S.x1 + 0.6]) steel.push(box(0.5, 0.6, 12.6, x, cy + 0.2, B.z, "#e8b62a"));
  steel.push(box(2.0, 1.0, 13, cx, cy + 0.8, B.z, "#d29a22"));
  steel.push(box(1.4, 1.0, 1.6, cx, cy - 0.2, B.z - 1, "#3a3f47"));
  steel.push(box(0.03, cy - (top + 4.5), 0.03, cx, (cy + top + 4.5) / 2 - 0.4, B.z - 1, "#2a2d33"));
  steel.push(colored(new THREE.TorusGeometry(0.25, 0.06, 6, 10, Math.PI * 1.5).translate(cx, top + 4.4, B.z - 1), "#e8b62a"));
  // Kereste yığını, varil, kaynak makinesi.
  const [tx, tz] = S.timber;
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) wood.push(box(0.25, 0.2, 6, tx - 1.2 + k * 0.45, top + 0.12 + r * 0.22, tz, ["#b08a5a", "#a07a50", "#c49a68"][(r + k) % 3]));
  for (let k = 0; k < 3; k++) steel.push(cyl(0.3, 0.3, 0.9, S.x0 - 1.5, top + 0.45, B.z - 4 + k * 0.7, ["#c8312f", "#2f5d8a", "#c8312f"][k], 10));
  steel.push(box(0.6, 0.7, 0.9, S.x1 + 1.8, top + 0.35, B.z + 2, "#2f5d8a"));
  for (const [list, mat] of [[conc, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })], [steel, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 })], [wood, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })]]) {
    const g = mergeGeometries(list.map((q) => { const n2 = q.index ? q.toNonIndexed() : q; if (n2.attributes.uv) n2.deleteAttribute("uv"); return n2; }));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

/** Balıkçı koyu: ağ serenleri (ağlarıyla), ters sandal, balık kasaları, şamandıralar, çay masası ve tabureler. */
export function buildFishingCove(world) {
  const K = world.koy;
  const parts = [];
  const y = (x, z) => world.groundY(x, z);
  for (const [rx, rz] of K.racks) {
    const y0 = y(rx, rz);
    for (const dx of [-2.6, 0, 2.6]) parts.push(box(0.14, 2.2, 0.14, rx + dx, y0 + 1.1, rz, "#7a5a3e"));
    parts.push(box(5.6, 0.12, 0.12, rx, y0 + 2.15, rz, "#7a5a3e"));
  }
  const [ux, uz, ur] = K.upturned;
  const uh = new THREE.Mesh(hull(5.5, 2.0, 0.75, { top: "#3e8a86", stripe: "#f2d36b", deck: "#9b7350" }).geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  uh.rotation.set(Math.PI, ur, 0);
  uh.position.set(ux, y(ux, uz) + 0.55, uz);
  uh.castShadow = true;
  const [cxx, czz] = K.crates;
  for (let k = 0; k < 5; k++) parts.push(box(0.6, 0.3, 0.4, cxx - 1 + (k % 3) * 0.7, y(cxx, czz) + 0.15 + Math.floor(k / 3) * 0.3, czz, ["#3e7fb0", "#d8342b", "#3e7fb0"][k % 3]));
  for (const [bx, bz] of K.buoys) parts.push(colored(new THREE.SphereGeometry(0.35, 10, 8).translate(bx, 0.15, bz), "#f28c28"));
  const [tx, tz] = K.table;
  const ty = y(tx, tz);
  parts.push(box(1.0, 0.05, 0.7, tx, ty + 0.7, tz, "#9b7350"), box(0.08, 0.68, 0.08, tx, ty + 0.34, tz, "#3a3f47"));
  parts.push(cyl(0.05, 0.05, 0.08, tx - 0.2, ty + 0.76, tz, "#c94f3a", 8), cyl(0.05, 0.05, 0.08, tx + 0.2, ty + 0.76, tz + 0.1, "#c94f3a", 8));
  for (const q of K.posts) if (q.post === "ag" || q.post === "cay") {
    const sy = y(q.x, q.z);
    parts.push(cyl(0.18, 0.18, 0.05, q.x, sy + 0.42, q.z, "#9b7350", 10));
    for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) parts.push(box(0.03, 0.42, 0.03, q.x + dx, sy + 0.21, q.z + dz, "#3a3f47"));
  }
  // Kulübe verandaları (deniz tarafında, ahşap, alçak korkuluk, duvar dibinde bank) ve pencere kepenkleri.
  const SHUTTER = ["#3e7a86", "#2f5d8a", "#c9573a"];
  K.huts.forEach(([hx, hz], i) => {
    // Veranda kapı eşiğinde (bina tabanı); eğimli kumda direkleri zemine iner.
    const fz = hz + 3, py = Math.max(FLAT + 0.12, y(hx, fz + 0.7) + 0.12);
    for (const lx of [-4.1, -2, 0, 2, 4.1]) {
      const g = y(hx + lx, fz + 1.3), hgt = Math.max(0.1, py - g);
      parts.push(box(0.12, hgt, 0.12, hx + lx, g + hgt / 2, fz + 1.3, "#6b4a35"));
    }
    parts.push(box(8.4, 0.08, 1.4, hx, py, fz + 0.7, "#a87a50"));
    for (const [lx, w] of [[-2.6, 3.2], [2.6, 3.2]]) parts.push(box(w, 0.06, 0.06, hx + lx, py + 0.75, fz + 1.36, "#7a5a3e"));
    for (const lx of [-4.1, -1.0, 1.0, 4.1]) parts.push(box(0.07, 0.75, 0.07, hx + lx, py + 0.38, fz + 1.36, "#7a5a3e"));
    parts.push(box(2.2, 0.06, 0.4, hx - 2.6, py + 0.45, fz + 0.3, "#8a6a4a"), box(2.2, 0.4, 0.05, hx - 2.6, py + 0.68, fz + 0.1, "#8a6a4a"));
    for (const lx of [-2.6, 2.6]) {
      parts.push(box(1.0, 0.9, 0.04, hx + lx, 1.55 + FLAT, fz + 0.03, "#2d3e4f"));
      for (const sd of [-1, 1]) parts.push(box(0.5, 0.95, 0.05, hx + lx + sd * 0.78, 1.55 + FLAT, fz + 0.06, SHUTTER[i % 3]));
    }
  });
  // Tahta yol (kulübelerin önünden iskelenin başına): enine tahtalar, kenar kirişleri.
  {
    const [[x0, z0], [x1]] = K.boardwalk;
    for (let x = x0; x < x1; x += 0.32) parts.push(box(0.26, 0.05, 1.4, x + 0.13, y(x, z0) + 0.06, z0, Math.round((x - x0) / 0.32) % 2 ? "#b88a5e" : "#a87a50"));
    for (const dz of [-0.72, 0.72]) parts.push(box(x1 - x0, 0.08, 0.06, (x0 + x1) / 2, y((x0 + x1) / 2, z0) + 0.03, z0 + dz, "#7a5a3e"));
  }
  // Balık tezgâhı: buzlu tezgâh, üstünde balıklar, çizgili tente.
  {
    const [sx, sz] = K.stall, sy = y(sx, sz);
    parts.push(box(2.4, 0.9, 0.9, sx, sy + 0.45, sz, "#e9edf0"), box(2.3, 0.08, 0.8, sx, sy + 0.94, sz, "#cfe6ef"));
    for (let k = 0; k < 9; k++) parts.push(colored(new THREE.SphereGeometry(0.11, 6, 4).scale(2.2, 0.55, 0.8).rotateY(0.3 * (k % 3 - 1)).translate(sx - 0.9 + (k % 5) * 0.45, sy + 1.02, sz - 0.2 + Math.floor(k / 5) * 0.38), k % 3 ? "#b8c4cc" : "#d98a6a"));
    for (const dx of [-1.15, 1.15]) for (const dz of [-0.4, 0.4]) parts.push(box(0.06, 2.3, 0.06, sx + dx, sy + 1.15, sz + dz, "#7a5a3e"));
    for (let k = 0; k < 6; k++) parts.push(box(2.6 / 6, 0.05, 1.2, sx - 1.3 + (k + 0.5) * (2.6 / 6), sy + 2.3, sz, k % 2 ? "#f7f5f0" : "#d8433d"));
    parts.push(box(0.5, 0.35, 0.4, sx + 1.6, sy + 0.18, sz, "#3e7fb0"), box(0.5, 0.35, 0.4, sx + 1.6, sy + 0.53, sz, "#d8342b"));
  }
  // Balık sepetleri (yeşil kafes yığınları) ve iskelede halat kangalları, babalar.
  for (const [tx, tz] of K.traps) {
    const ty = y(tx, tz);
    for (let k = 0; k < 4; k++) parts.push(cyl(0.32, 0.36, 0.42, tx + (k % 2) * 0.72 - 0.36, ty + 0.21 + Math.floor(k / 2) * 0.42, tz, "#4f6b4a", 10));
  }
  for (const [rx, rz] of K.ropes) parts.push(colored(new THREE.TorusGeometry(0.22, 0.06, 5, 12).rotateX(Math.PI / 2).translate(rx, 1.58, rz), "#d9c38a"));
  for (let k = 0; k * 6 < K.jetty.z1 - K.jetty.z0; k++) for (const dx of [-1.15, 1.15]) parts.push(cyl(0.1, 0.12, 0.3, K.jetty.x + dx, 1.68, K.jetty.z0 + 3 + k * 6, "#2a2d33", 8));
  // Dalgakıran: suya yığılmış iri taşlar.
  {
    const [rx, rz] = K.rocks;
    for (let k = 0; k < 9; k++) {
      const a = k * 2.3, r = 1 + (k % 4) * 1.1, sc = 0.9 + (k % 3) * 0.4;
      parts.push(colored(new THREE.IcosahedronGeometry(sc, 0).scale(1.2, 0.7, 1).rotateY(a).translate(rx + Math.cos(a) * r, -0.2 + (k % 2) * 0.25, rz + Math.sin(a) * r * 1.6), k % 2 ? "#8f949a" : "#a7aaae"));
    }
  }
  const group = new THREE.Group();
  const m = new THREE.Mesh(merged(parts.map((g) => (g.index ? g.toNonIndexed() : g))), MAT);
  m.castShadow = m.receiveShadow = true;
  group.add(m, uh);
  // Kıyıya çekilmiş sandallar (kumda, hafif yatık).
  for (const [sx, sz, sr, col] of K.beached) {
    const bt = new THREE.Mesh(hull(4.6, 1.6, 0.6, { top: col, stripe: "#f7f5f0", deck: "#9b7350" }).geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
    bt.rotation.set(0, sr, 0.12);
    bt.position.set(sx, y(sx, sz) + 0.22, sz);
    bt.castShadow = true;
    group.add(bt);
  }
  // Giriş tabelası: iki direk, üstünde yazılı ahşap levha.
  {
    const [gx, gz] = K.sign, g0 = y(gx, gz);
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 128;
    const c = cv.getContext("2d");
    c.fillStyle = "#8a5a3a"; c.fillRect(0, 0, 512, 128);
    c.fillStyle = "#f4ead8"; c.font = "bold 60px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("BALIKÇI KOYU", 256, 68);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 0.08), [MATW, MATW, MATW, MATW, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), MATW]);
    board.position.set(gx, g0 + 2.1, gz);
    board.rotation.y = Math.PI;
    board.castShadow = true;
    const posts = new THREE.Mesh(merged([box(0.12, 2.5, 0.12, gx - 1.2, g0 + 1.25, gz, "#6b4a35"), box(0.12, 2.5, 0.12, gx + 1.2, g0 + 1.25, gz, "#6b4a35")]), MAT);
    group.add(board, posts);
  }
  // Ağlar: serenlere asılı, yarı saydam yeşil-mavi file.
  const net = new THREE.MeshStandardMaterial({ color: "#3f7f7a", transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false });
  for (const [rx, rz] of K.racks) {
    const g = new THREE.PlaneGeometry(5.2, 1.7, 8, 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.12 * Math.sin(pos.getX(i) * 1.7) * (1 - (pos.getY(i) + 0.85) / 1.7));
    g.computeVertexNormals();
    const n = new THREE.Mesh(g, net);
    n.position.set(rx, y(rx, rz) + 1.25, rz);
    group.add(n);
  }
  return group;
}

export function buildHarbor(world) {
  const group = new THREE.Group();
  let ferryObj = null, ferryPlank = null;
  const floating = [];
  // Vapur köprüsü (aşağıda, vapurun 7,2 m batısında ve 4 m kıyı tarafında) hangi iskeleye iniyorsa o yanda
  // korkuluk açılır.
  const vapur = world.features.find((f) => f.type === "vapur");
  for (const f of world.features) {
    let kopru = null;
    if (f.type === "iskele" && vapur && Math.abs(vapur.x - 7.2 - f.x) < f.w / 2 + 4.5 && vapur.z - 4 > f.z && vapur.z - 4 < f.z + f.len) {
      kopru = { side: Math.sign(vapur.x - f.x) || 1, z: vapur.z - 4 - f.z, half: 1.35 };
    }
    if (f.type === "iskele") group.add(pier(f, 1.53, kopru));
    else if (f.type === "vapur") {
      const m = ferry();
      m.position.set(f.x, 0.2, f.z);
      group.add(m);
      floating.push({ obj: m, base: 0.2, amp: 0.06, roll: 0.006, ph: 0.3 });
      ferryObj = { obj: m, x: f.x, z: f.z };
      // İskele köprüsü (vapurdan iskeleye).
      // Açık gri döşeme, iki yanda ince dikmeli çift borulu korkuluk (dolu levha değil).
      const gw = [box(2.2, 0.1, 4.2, 0, 0, 0, "#b9c0c7"), box(2.24, 0.05, 0.08, 0, 0.04, -2.06, "#8d949b"), box(2.24, 0.05, 0.08, 0, 0.04, 2.06, "#8d949b")];
      for (const sx of [-1.05, 1.05]) {
        for (let z = -2; z <= 2.01; z += 1) gw.push(cyl(0.025, 0.025, 1.0, sx, 0.5, z, "#e6e9ec", 6));
        gw.push(box(0.05, 0.05, 4.1, sx, 1.0, 0, "#e6e9ec"), box(0.035, 0.035, 4.1, sx, 0.55, 0, "#e6e9ec"));
      }
      const plank = new THREE.Mesh(merged(gw), METAL);
      plank.position.set(f.x - 7.2, 1.7, f.z - 4);
      plank.rotation.y = Math.PI / 2;
      group.add(plank);
      ferryPlank = plank;
    } else if (f.type === "tekne") {
      const len = f.len ?? 8;
      const m = boat(len, Math.round(Math.abs(f.x * 7 + f.z * 3)));
      m.position.set(f.x, 0.05, f.z);
      m.rotation.y = f.rot ?? 0;
      group.add(m);
      floating.push({ obj: m, base: 0.05, amp: 0.08 + 0.02 * (10 - Math.min(10, len)), roll: 0.04, ph: f.x * 0.13 + f.z * 0.07, rot: f.rot ?? 0 });
    }
  }
  const port = world.port ? buildPort(world) : null;
  if (port) group.add(port);
  group.userData.groundMaterials = [...(port?.userData.groundMaterials ?? [])];
  if (world.tersane) group.add(buildShipyard(world));
  if (world.koy) group.add(buildFishingCove(world));
  group.userData.setNight = (n) => port?.userData.setNight(n);
  // Vapur seferleri: kalkışta açığa doğru döner ve uzaklaşır, yenisi aynı yoldan yanaşır.
  group.userData.setMinute = (m) => {
    port?.userData.setMinute(m);
    if (!ferryObj) return;
    const u = ferryOut(m);
    const o = ferryObj.obj;
    o.visible = u < 0.98;
    if (ferryPlank) ferryPlank.visible = u < 0.02; // vapur yokken iskele köprüsü kaldırılmış
    o.position.x = ferryObj.x + 26 * u * u;
    o.position.z = ferryObj.z + 160 * u;
    o.rotation.y = -0.5 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (u < 1 ? 1 : 0);
  };
  group.userData.tick = (t) => {
    port?.userData.tick(globalThis.__portT ?? t); // __portT: denetimde belirli bir anı görmek için
    for (const b of floating) {
      b.obj.position.y = b.base + Math.sin(t * 0.9 + b.ph) * b.amp;
      b.obj.rotation.z = Math.sin(t * 0.7 + b.ph * 1.7) * b.roll;
      b.obj.rotation.x = Math.sin(t * 0.55 + b.ph) * b.roll * 0.5;
    }
  };
  return group;
}
