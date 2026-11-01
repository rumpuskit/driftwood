// İşletmelerin kendi konseptleri: aynı türden şubeler birbirinin kopyası değildir. Kafeler (Yakamoz modern
// kahve barı, Lodos geleneksel Türk kahvesi, İskele çay bahçesi, Martı denizci kafesi, Kumsal sahil kahvecisi,
// Dalga tatlıcı kafe), fırınlar (Driftwood klasik fırın, Simitçi Martı, Taş Fırın), marketler (Ada süpermarket,
// Liman bakkalı, Yokuş manavı, Driftwood şarküteri), atölyeler (seramik, marangoz, resim, yelken) ve çarşının
// zanaat dükkânları. Şube binanın sube alanından (layout.js) gelir.
//
// Küçük eşyalar tek bir köşe renkli geometride birleşir (iç mekân açılınca yüzlerce ayrı çizim olmasın);
// koltuk, sandalye gibi oturma yerleri müşteri noktası verir (interior.js addExtras), çalışan noktaları her
// konseptin kendi işine göredir (tezgâh arkası, garson turu, raf dizme, tezgâhta iş).
import * as THREE from "three";
import { colored, merged } from "./harbor.js";

const PMAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
const GLASS = new THREE.MeshStandardMaterial({ color: "#cfe6ef", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

/** Birleşik eşya kümesi: y her zaman tabandır (top/halka için merkez). Konumlar iç mekânın yerel ekseninde. */
function props() {
  const parts = [];
  const put = (g, x, y, z, rot = 0) => { parts.push(g.rotateY(rot).translate(x, y, z)); };
  return {
    parts,
    box: (w, h, d, x, y, z, c, rot = 0) => put(colored(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c), x, y, z, rot),
    cyl: (r0, r1, h, x, y, z, c, seg = 12, rot = 0) => put(colored(new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, h / 2, 0), c), x, y, z, rot),
    ball: (r, x, y, z, c, seg = 8, sy = 1) => put(colored(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.6))).scale(1, sy, 1), c), x, y, z),
    /** Halka: varsayılan yatay (tepsi üstünde simit); dik=true duvarda can simidi gibi (yüzü +z). */
    ring: (R, r, x, y, z, c, dik = false, rot = 0) => put(colored(new THREE.TorusGeometry(R, r, 6, 16).rotateX(dik ? 0 : Math.PI / 2), c), x, y, z, rot),
    geo: (g, c, x, y, z, rot = 0) => put(colored(g, c), x, y, z, rot),
  };
}

// Şube konseptlerinin renk ve tarz tabloları.
const CAFE = {
  0: { counter: "#f4f1ea", top: "#2a2f38", table: "#f4f1ea", leg: "#2a2f38", chair: "#2a2f38", shape: "square", floor: "#c9b8a2" }, // Yakamoz
  1: { counter: "#6b3a26", top: "#3a2418", table: "#8a5a3a", leg: "#3a2418", chair: "#6b3a26", shape: "round", floor: "#9c6b4a" }, // Lodos
  2: { counter: "#5a7a4a", top: "#d9cbb0", table: "#e9e2d0", leg: "#3e5a32", chair: "#3e8a5a", shape: "square", floor: "#cbbf9f", chairs: 4 }, // İskele
  3: { counter: "#f4f7fa", top: "#2f5d8a", table: "#a87a50", leg: "#5a3d28", chair: "#2f7fb5", shape: "barrel", floor: "#b88a5e" }, // Martı
  4: { counter: "#c9a77a", top: "#e9dcc0", table: "#d9c49a", leg: "#a8865a", chair: "#c9a26a", shape: "round", floor: "#e2cfa6" }, // Kumsal
  5: { counter: "#f7e1e6", top: "#f4f1ea", table: "#f4f1ea", leg: "#c9ced4", chair: "#9fd6c8", shape: "round", floor: "#efe4e2", alt: "#f2b8c6" }, // Dalga
};

/**
 * T: { add, spot, S, chair, guests, hw, hd, f, katlar, xr, coreZ, b }
 *   xr: çekirdek önündeki açık şeridin sağ sınırı (çekirdeksiz binada hw), coreZ: çekirdeğin ön duvarı.
 * Döner: konsept kurulduysa true (yoksa workinterior genel düzeni kurar).
 */
export function buildBusiness(T) {
  const kind = T.b.kind, k = T.b.sube;
  if (kind === "carsi") return T.f === 0 && T.b.dukkan ? (carsiShop(T), true) : false;
  if (k == null) return false;
  if (kind === "kafe" && CAFE[k]) return cafe(T, k), true;
  if (kind === "firin" && k <= 2) return bakery(T, k), true;
  if (kind === "market" && k <= 3) return market(T, k), true;
  if (kind === "atolye" && k <= 3) return atelier(T, k), true;
  return false;
}

/** Eşya kümesini sahneye ekler. */
function flush(T, P) {
  if (P.parts.length) T.add(0, 0, 0, 0, 0, 0, null, 0, { geo: merged(P.parts), material: PMAT });
}

/** Saksı bitkisi (yaprak kümesi): boy 0.6–1.6 m. */
function plant(P, x, z, h = 1.1, leaf = "#5f8f4a", pot = "#b5653f") {
  P.cyl(0.24, 0.18, 0.42, x, 0.06, z, pot, 10);
  P.ball(0.32 + h * 0.12, x, 0.42 + h * 0.45, z, leaf, 6, 1.3);
  P.ball(0.22 + h * 0.08, x + 0.12, 0.42 + h * 0.75, z - 0.08, leaf, 6);
}

/** Masa: yuvarlak/kare/fıçı/alçak sehpa, sandalyeler (müşteri noktası) masanın çevresinde. */
function dineTable(T, P, x, z, st, chairs = 2, a0 = 0) {
  const { shape, table, leg } = st;
  if (shape === "barrel") {
    P.cyl(0.36, 0.36, 0.72, x, 0.06, z, table, 12);
    for (const y of [0.18, 0.62]) P.cyl(0.375, 0.375, 0.05, x, 0.06 + y, z, "#4a4f57", 12);
    P.cyl(0.42, 0.42, 0.05, x, 0.78, z, "#c9a27a", 14);
  } else if (shape === "low") {
    P.cyl(0.05, 0.05, 0.36, x, 0.06, z, leg, 6);
    P.cyl(0.42, 0.42, 0.04, x, 0.42, z, table, 14);
  } else {
    if (shape === "round") P.cyl(0.42, 0.42, 0.05, x, 0.74, z, table, 16);
    else P.box(0.78, 0.05, 0.78, x, 0.74, z, table);
    P.cyl(0.035, 0.035, 0.7, x, 0.05, z, leg, 6);
    P.cyl(0.22, 0.24, 0.03, x, 0.03, z, leg, 10);
  }
  for (let c = 0; c < chairs; c++) {
    const a = a0 + (c / chairs) * Math.PI * 2;
    const cx = x + Math.cos(a) * 0.7, cz = z + Math.sin(a) * 0.7;
    T.chair(cx, cz, Math.atan2(x - cx, z - cz), st.chair);
  }
}

/** Sedir: duvar boyunca alçak minder; her 0,8 m'de bir müşteri yeri (yüzü face yönünde). */
function sedir(T, P, x, z, len, face, cushion = "#a8323a", back = "#7a2a2a") {
  const along = Math.abs(Math.sin(face)) > 0.5; // yüzü x yönünde ise sedir z boyunca uzanır
  const [w, d] = along ? [0.7, len] : [len, 0.7];
  P.box(w, 0.32, d, x, 0.06, z, "#6b4a35");
  P.box(w - 0.04, 0.08, d - 0.04, x, 0.38, z, cushion);
  const bx = x - Math.sin(face) * 0.28, bz = z - Math.cos(face) * 0.28;
  const n = Math.max(1, Math.floor(len / 0.8));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (i + 0.5) * (len / n);
    const px = along ? bx : x + t, pz = along ? z + t : bz;
    P.box(along ? 0.16 : 0.62, 0.42, along ? 0.62 : 0.16, px, 0.46, pz, back);
    const sx = (along ? x : x + t) + Math.sin(face) * 0.05, sz = (along ? z + t : z) + Math.cos(face) * 0.05;
    T.guests.push(T.spot(sx, sz, face, "guest"));
  }
}

/** Yer kilimi: zemin, kenar şeridi ve ortada göbek. */
function kilim(P, x, z, w, d, base, edge, mid) {
  P.box(w, 0.012, d, x, 0.062, z, edge);
  P.box(w - 0.24, 0.014, d - 0.24, x, 0.062, z, base);
  P.box(Math.min(w, d) * 0.35, 0.016, Math.min(w, d) * 0.35, x, 0.062, z, mid, Math.PI / 4);
}

/** Tezgâh arkası, garson turu ve ikinci tezgâh noktası (bu sırayla dolar). */
function cafeStaff(T, tables, zc, xs) {
  T.S(xs[0], zc - 0.8, 0, "counter");
  const ordered = [...tables].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const rows = [];
  for (const t of ordered) {
    const row = rows.find((r) => Math.abs(r[0][1] - t[1]) < 0.6);
    row ? row.push(t) : rows.push([t]);
  }
  const tour = [[xs[1], zc + 0.75, 5, "counter", xs[1], zc]];
  rows.forEach((r, i) => (i % 2 ? [...r].reverse() : r).forEach(([tx, tz]) => tour.push([tx + 0.72, tz - 0.72, 3.5, "serve", tx, tz])));
  T.S(tour[0][0], tour[0][1], 0, "waiter", tour);
  T.S(xs[1], zc - 0.8, 0, "counter");
}

// --- kafeler ---

function cafe(T, k) {
  const { hw, hd, f, xr, coreZ, add } = T;
  const st = CAFE[k], P = props(), ground = f === 0;
  const zc = -hd + 1.5;
  P.box(xr + hw - 0.3, 0.012, 2 * hd - 0.3, (xr - hw) / 2, 0.06, 0, st.floor); // konsept zemini
  // Tezgâh: zemin katta boydan boya (sağ ucu çalışan geçişi), üst katlarda küçük servis tezgâhı.
  const cx0 = -hw + 0.3, cx1 = ground ? hw - 1.2 : -hw + 2.8, cw = cx1 - cx0, cxm = (cx0 + cx1) / 2;
  P.box(cw, 1.0, 0.7, cxm, 0.06, zc, st.counter);
  P.box(cw + 0.05, 0.05, 0.76, cxm, 1.06, zc, st.top);
  // Tezgâh arkası raf (bardaklar, kavanozlar).
  P.box(cw, 0.04, 0.3, cxm, 1.55, -hd + 0.3, "#6b4a35");
  for (let i = 0; i < Math.floor(cw / 0.3); i++) P.cyl(0.05, 0.045, 0.12, cx0 + 0.2 + i * 0.3, 1.59, -hd + 0.3, ["#f4f1ea", "#d9c49a", "#2f7fb5"][i % 3], 8);

  // Masalar: iki sütun arka bölümde, çekirdek önünde üçüncü sütun.
  const A = -hw + 1.25, B = -hw + 3.45, C = Math.min(xr - 1.1, hw + 0.45);
  const rowsAB = ground ? [-2.1, 0.4, 2.9] : [-2.6, -0.1, 2.4, 4.6];
  const rowsC = (ground ? [0.4, 2.9] : [-0.1, 2.4, 4.6]).filter((z) => z - 0.95 > coreZ);
  const n = st.chairs ?? 2;
  const tables = [];
  const at = (cols, rows) => { for (const z of rows) for (const x of cols) tables.push([x, z]); };

  if (k === 0) {
    // Yakamoz Kafe: espresso barı (krom makine, öğütücü, cam fanusta kurabiyeler), siyah menü panosu, sarkıt
    // lambalar, ön camın önünde tabureli pencere barı; kare beyaz masalar, siyah sandalyeler.
    if (ground) {
      P.box(0.75, 0.48, 0.48, cx0 + 1.0, 1.11, zc, "#c9ced4"); P.box(0.6, 0.1, 0.2, cx0 + 1.0, 1.25, zc + 0.3, "#3a3f47");
      P.cyl(0.11, 0.09, 0.42, cx0 + 1.8, 1.11, zc, "#2a2f38", 10); P.cyl(0.12, 0.05, 0.16, cx0 + 1.8, 1.53, zc, "#c9ced4", 10);
      P.cyl(0.22, 0.22, 0.03, cxm + 1.2, 1.11, zc, "#f4f1ea", 14);
      for (let i = 0; i < 6; i++) P.ball(0.05, cxm + 1.1 + (i % 3) * 0.1, 1.17, zc - 0.05 + Math.floor(i / 3) * 0.1, "#b5803f", 6, 0.4);
      add(0.4, 0.3, 0.4, cxm + 1.2, 1.14, zc, null, 0, { material: GLASS, shadow: false, geo: new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.03, 0) });
      P.box(2.6, 1.0, 0.04, cxm, 1.8, -hd + 0.15, "#1d1f24");
      for (let r = 0; r < 4; r++) P.box(r ? 1.6 : 1.0, 0.035, 0.01, cxm - (r ? 0.3 : 0.6), 2.55 - r * 0.2, -hd + 0.175, "#f4f1ea");
      for (let i = 0; i < 3; i++) { const x = cx0 + 0.9 + i * (cw - 1.8) / 2; P.cyl(0.006, 0.006, 0.6, x, 2.3, zc, "#1d1f24", 4); P.cyl(0.07, 0.2, 0.18, x, 2.12, zc, "#1d1f24", 12); }
      // Pencere barı: kapı (sağda) ile sol duvar arası, ön cama dayalı yüksek tezgâh ve tabureler.
      const wx0 = -hw + 0.3, wx1 = 0.4;
      P.box(wx1 - wx0, 0.05, 0.42, (wx0 + wx1) / 2, 1.05, hd - 0.4, "#a87a50");
      for (const x of [wx0 + 0.1, wx1 - 0.1]) P.box(0.05, 1.0, 0.05, x, 0.06, hd - 0.4, "#2a2f38");
      for (let i = 0; i < 4; i++) { const x = wx0 + 0.45 + i * ((wx1 - wx0 - 0.9) / 3); P.cyl(0.02, 0.02, 0.7, x, 0.06, hd - 0.95, "#2a2f38", 6); P.cyl(0.18, 0.18, 0.06, x, 0.76, hd - 0.95, "#a87a50", 12); }
      at([A, B], rowsAB.slice(0, 2)); at([C], rowsC);
    } else at([A, B], rowsAB.slice(0, 3)), at([C], rowsC);
    plant(P, -hw + 0.45, hd - (ground ? 1.6 : 0.6), 1.4); plant(P, xr - 0.5, hd - 0.6, 1.0);
  } else if (k === 1) {
    // Lodos Kahvesi: kum ocağında bakır cezveler, duvarda bakır tabaklar, sol duvar boyunca kilimli sedir ve
    // pirinç tepsili alçak sehpalar, tavandan sarkan fenerler. Ahşap yuvarlak masalar.
    P.box(0.9, 0.12, 0.5, cx0 + 1.1, 1.11, zc, "#8a5a3a"); P.box(0.82, 0.05, 0.42, cx0 + 1.1, 1.23, zc, "#d9c08a");
    for (let i = 0; i < 4; i++) { const x = cx0 + 0.8 + i * 0.2; P.cyl(0.05, 0.04, 0.1, x, 1.26, zc, "#b8733a", 8); P.box(0.015, 0.015, 0.16, x, 1.32, zc + 0.12, "#3a2418"); }
    P.cyl(0.18, 0.18, 0.02, cx0 + 2.0, 1.11, zc, "#c9a24a", 14);
    for (let i = 0; i < 3; i++) P.cyl(0.035, 0.03, 0.06, cx0 + 1.92 + i * 0.08, 1.13, zc, "#f4f1ea", 8);
    for (let i = 0; i < 5; i++) { const r = 0.2 - (i % 2) * 0.05; P.geo(new THREE.CylinderGeometry(r, r, 0.02, 16).rotateX(Math.PI / 2), "#b8733a", cx0 + 0.6 + i * (cw - 1.2) / 4, 2.1 + (i % 2) * 0.25, -hd + 0.15); P.geo(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.022, 16).rotateX(Math.PI / 2), "#d9a05a", cx0 + 0.6 + i * (cw - 1.2) / 4, 2.1 + (i % 2) * 0.25, -hd + 0.152); }
    // Sedir: sol duvar boyunca, önünde kilim ve sehpalar.
    const sz0 = ground ? -2.6 : -3.6, sz1 = hd - 0.6, slen = sz1 - sz0;
    kilim(P, -hw + 1.25, (sz0 + sz1) / 2, 1.6, slen, "#a8323a", "#2f3a6d", "#e8b93a");
    sedir(T, P, -hw + 0.5, (sz0 + sz1) / 2, slen, Math.PI / 2, "#a8323a", "#2f3a6d");
    const low = { ...st, shape: "low", table: "#c9a24a", leg: "#6b4a35" };
    for (let z = sz0 + 0.9; z < sz1 - 0.5; z += 1.6) dineTable(T, P, -hw + 1.45, z, low, 0);
    for (let i = 0; i < 3; i++) { const z = sz0 + 1 + i * (slen - 2) / 2; P.cyl(0.006, 0.006, 0.5, -hw + 1.4, 2.4, z, "#3a2418", 4); P.cyl(0.1, 0.12, 0.26, -hw + 1.4, 2.14, z, "#b8733a", 6); }
    at([B], rowsAB); at([C], rowsC);
  } else if (k === 2) {
    // İskele Çay Bahçesi: tezgâhta iki katlı semaver ve tepsi tepsi ince belli bardaklar, kareli örtülü dört
    // kişilik masalar, yeşil katlanır sandalyeler, duvarlarda asma saksılar ve köşelerde zeytin fidanları.
    const sx = cx0 + 1.0;
    P.cyl(0.24, 0.2, 0.55, sx, 1.11, zc, "#b8733a", 12); P.cyl(0.14, 0.24, 0.12, sx, 1.66, zc, "#b8733a", 12);
    P.cyl(0.12, 0.1, 0.22, sx, 1.78, zc, "#c9ced4", 10); P.box(0.05, 0.05, 0.16, sx, 1.3, zc + 0.26, "#3a2418");
    for (let t = 0; t < 2; t++) {
      P.cyl(0.2, 0.2, 0.02, sx + 0.8 + t * 0.6, 1.11, zc, "#c9ced4", 14);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; P.cyl(0.028, 0.022, 0.08, sx + 0.8 + t * 0.6 + Math.cos(a) * 0.11, 1.13, zc + Math.sin(a) * 0.11, "#b5532f", 8); }
    }
    for (let i = 0; i < 3; i++) { const z = -hd + 2.6 + i * (hd * 2 - 4) / 2; P.box(0.08, 0.04, 0.3, -hw + 0.18, 2.0, z, "#6b4a35"); P.cyl(0.14, 0.1, 0.18, -hw + 0.3, 1.78, z, "#b5653f", 8); P.ball(0.18, -hw + 0.32, 1.72, z, "#4f7d3e", 6, 1.5); }
    plant(P, -hw + 0.5, hd - 0.6, 1.6, "#7a8f5a", "#cfc8bc"); plant(P, xr - 0.5, hd - 0.6, 1.6, "#7a8f5a", "#cfc8bc");
    at([A, B], ground ? rowsAB : rowsAB.slice(0, 3).map((z) => z + 0.3)); at([C], rowsC);
    for (const [x, z] of tables) {
      P.box(0.8, 0.012, 0.8, x, 0.79, z, "#e05a4a");
      for (let i = 0; i < 4; i++) P.box(0.2, 0.014, 0.8, x - 0.3 + i * 0.2, 0.792, z, i % 2 ? "#f4f1ea" : "#e05a4a");
      for (const [dx, dz] of [[0.18, 0.12], [-0.16, -0.14]]) { P.cyl(0.04, 0.04, 0.012, x + dx, 0.806, z + dz, "#f4f1ea", 10); P.cyl(0.026, 0.02, 0.08, x + dx, 0.818, z + dz, "#b5532f", 8); }
    }
  } else if (k === 3) {
    // Martı Kafe: denizci kafesi. Güverte tahtası zemin, fıçı masalar, duvarda dümen, can simidi, çapraz
    // kürekler, lomboz pencereler ve ağ; tezgâhın önünde halat korkuluk.
    for (let i = 0; i < Math.floor((2 * hd - 0.3) / 0.3); i++) P.box(xr + hw - 0.3, 0.004, 0.02, (xr - hw) / 2, 0.072, -hd + 0.3 + i * 0.3, "#8a6040");
    T.add(0, 0, 0, cxm, 0.55, zc + 0.42, null, 0, { geo: new THREE.CylinderGeometry(0.03, 0.03, cw, 8).rotateZ(Math.PI / 2), material: new THREE.MeshStandardMaterial({ color: "#c9a26a", roughness: 0.9 }) });
    P.ring(0.42, 0.04, cxm - 0.6, 2.05, -hd + 0.2, "#7a5638", true);
    for (let i = 0; i < 4; i++) P.geo(new THREE.BoxGeometry(0.03, 1.0, 0.03).rotateZ((i * Math.PI) / 4), "#7a5638", cxm - 0.6, 2.05, -hd + 0.2);
    P.ball(0.08, cxm - 0.6, 2.05, -hd + 0.22, "#7a5638", 8);
    P.ring(0.32, 0.09, -hw + 0.2, 1.7, -0.8, "#f28c28", true, Math.PI / 2);
    for (const z of [1.6, 3.6]) { P.ring(0.3, 0.06, -hw + 0.16, 1.7, z, "#c9a24a", true, Math.PI / 2); P.geo(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 14).rotateZ(Math.PI / 2), "#9fc4dc", -hw + 0.15, 1.7, z); }
    for (const s of [-1, 1]) T.add(0.06, 1.8, 0.14, -hw + 0.2, 1.3, -2.8, "#a87a50", 0, { geo: new THREE.BoxGeometry(0.04, 1.8, 0.12).rotateX(s * 0.5) });
    for (let i = 0; i < 6; i++) P.box(0.01, 1.0, 0.01, cxm + 0.6 + i * 0.25, 1.75, -hd + 0.17, "#c9b88a");
    for (let i = 0; i < 5; i++) P.box(1.3, 0.01, 0.01, cxm + 1.2, 1.8 + i * 0.22, -hd + 0.17, "#c9b88a");
    at([A, B], ground ? rowsAB : rowsAB.slice(0, 3)); at([C], rowsC);
  } else if (k === 4) {
    // Kumsal Kahvecisi: dalga odunu tezgâh, hasır sandalyeler, sol duvarda yaslı sörf tahtaları, palmiye
    // saksıları, kum renginde zemin ve ön köşede minderli puf oturma köşesi.
    for (let i = 0; i < 3; i++) T.add(0.5, 2.0, 0.08, -hw + 0.36, 0.06, -0.8 + i * 0.75, ["#2f9fb5", "#f2c14e", "#e0607a"][i], 0, { geo: new THREE.SphereGeometry(0.5, 12, 8).scale(0.08, 2.0, 0.5).translate(0, 1.0, 0).rotateZ(0.1) });
    plant(P, -hw + 0.5, hd - 0.6, 1.8, "#4f8a3e", "#c9a77a"); plant(P, xr - 0.5, hd - 0.6, 1.6, "#4f8a3e", "#c9a77a");
    P.box(cw, 0.06, 0.72, cxm, 0.06, zc + 0.02, "#a8865a");
    P.cyl(0.14, 0.12, 0.3, cx0 + 0.6, 1.11, zc, "#e8b93a", 10); P.cyl(0.14, 0.12, 0.3, cx0 + 1.0, 1.11, zc, "#f28c28", 10);
    P.box(0.6, 0.45, 0.4, cx0 + 1.8, 1.11, zc, "#c9ced4");
    if (ground) {
      // Puf köşesi: ön sol, alçak sehpa çevresinde dört puf (oturanlar müşteri noktası).
      const px = A + 0.2, pz = rowsAB[2] + 0.2;
      P.cyl(0.35, 0.35, 0.04, px, 0.36, pz, "#f4f1ea", 14); P.cyl(0.06, 0.06, 0.3, px, 0.06, pz, "#a8865a", 6);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4, x = px + Math.cos(a) * 0.85, z = pz + Math.sin(a) * 0.85;
        P.ball(0.34, x, 0.3, z, ["#2f9fb5", "#f2c14e", "#e0607a", "#f4f1ea"][i], 8, 0.55);
        T.guests.push(T.spot(x, z, Math.atan2(px - x, pz - z), "guest"));
      }
      at([A, B], rowsAB.slice(0, 2)); at([B], rowsAB.slice(2)); at([C], rowsC);
    } else at([A, B], rowsAB.slice(0, 3)), at([C], rowsC);
  } else {
    // Dalga Kafe: tatlıcı. Camlı pasta dolabı (katlı pastalar, kurabiyeler), pembe-mint sandalyeler, arka
    // duvarda dalga deseni, mermer yuvarlak masalar ve masalarda pasta ayakları.
    // Pasta dolabı tezgâhın üstünde: cam fanus, içinde iki katlı pastalar.
    const vx = cxm - 0.4, vw = Math.min(2.6, cw - 1.6);
    T.add(vw, 0.46, 0.62, vx, 1.11, zc, null, 0, { material: GLASS, shadow: false });
    P.box(vw, 0.03, 0.62, vx, 1.555, zc, "#f4f1ea");
    for (let i = 0; i < Math.floor(vw / 0.42); i++) {
      const x = vx - vw / 2 + 0.25 + i * 0.42, c = ["#f2b8c6", "#7a4a2a", "#f4f1ea", "#e8b93a", "#9fd6c8"][i % 5];
      P.cyl(0.15, 0.15, 0.12, x, 1.11, zc, c, 12); P.cyl(0.1, 0.1, 0.09, x, 1.23, zc, c, 12); P.ball(0.025, x, 1.34, zc, "#d8433d", 6);
    }
    for (let i = 0; i < 9; i++) { const x = cx0 + 0.3 + i * (cw - 0.6) / 8; P.box(cw / 8 + 0.02, 0.18, 0.012, x, 2.0 + 0.12 * Math.sin(i * 1.2), -hd + 0.15, i % 2 ? "#9fd6c8" : "#4fb0b5"); }
    at([A, B], ground ? rowsAB : rowsAB.slice(0, 3)); at([C], rowsC);
  }
  tables.forEach(([x, z], i) => {
    const s = k === 5 ? { ...st, chair: i % 2 ? st.alt : st.chair } : st;
    dineTable(T, P, x, z, s, n, Math.abs(x - C) < 0.01 ? Math.PI / 2 : 0);
    if (k === 5) { P.cyl(0.06, 0.1, 0.12, x, 0.79, z, "#f4f1ea", 10); P.cyl(0.12, 0.12, 0.08, x, 0.91, z, "#f2b8c6", 12); }
  });
  cafeStaff(T, tables, zc, ground ? [cxm - 1.0, cxm + 0.8] : [cxm - 0.4, cxm + 0.4]);
  flush(T, P);
}

// --- fırınlar ---

function bakery(T, k) {
  const { hw, hd, f, xr, coreZ, add } = T;
  const P = props();
  const zc = -hd + 1.6;
  // Tezgâh solda fırına (ya da simit rafına) yer bırakır; fırıncı onun önünde çalışır.
  const cx0 = -hw + [2.6, 1.9, 3.0][k], cx1 = hw - 1.2, cw = cx1 - cx0, cxm = (cx0 + cx1) / 2;
  if (f > 0) {
    // Üst kat imalathane: paslanmaz yoğurma tezgâhları, hamur makinesi, un çuvalları, tepsi arabaları.
    P.box(xr + hw - 0.3, 0.012, 2 * hd - 0.3, (xr - hw) / 2, 0.06, 0, "#d9d4ca");
    for (const z of [-hd + 2.0, 0.6]) {
      P.box(3.2, 0.05, 0.9, -hw + 2.0, 0.9, z, "#c9ced4");
      for (const [dx, dz] of [[-1.5, -0.4], [1.5, -0.4], [-1.5, 0.4], [1.5, 0.4]]) P.box(0.05, 0.86, 0.05, -hw + 2.0 + dx, 0.06, z + dz, "#9aa3ad");
      for (let i = 0; i < 4; i++) P.ball(0.13, -hw + 0.9 + i * 0.7, 0.98, z, "#f3e6c8", 8, 0.45);
      T.S(-hw + 1.6, z + 0.75, Math.PI, "bench"); T.S(-hw + 2.8, z + 0.75, Math.PI, "bench");
    }
    P.cyl(0.4, 0.35, 0.6, hw - 0.9, 0.5, -hd + 1.2, "#c9ced4", 14); P.box(0.7, 0.45, 0.7, hw - 0.9, 0.06, -hd + 1.2, "#3e8a86");
    for (let i = 0; i < 6; i++) P.box(0.55, 0.32, 0.35, -hw + 0.5 + (i % 3) * 0.6, 0.06 + Math.floor(i / 3) * 0.32, hd - 0.5, "#f4f1ea");
    for (let r = 0; r < 2; r++) {
      const x = hw - 0.9 + r * 1.2, z = 2.8;
      if (z - 0.5 <= coreZ && x > hw) continue;
      for (const dx of [-0.3, 0.3]) P.box(0.04, 1.6, 0.8, x + dx, 0.1, z, "#9aa3ad");
      for (let s = 0; s < 6; s++) { P.box(0.6, 0.02, 0.8, x, 0.25 + s * 0.24, z, "#c9ced4"); for (let i = 0; i < 3; i++) P.ball(0.08, x - 0.18 + i * 0.18, 0.31 + s * 0.24, z, "#d9a24a", 6, 0.5); }
    }
    T.S(hw - 0.9, 1.9, 0, "shelf");
    // Mayalama dolabı (camlı, ılık ışıklı), hamur bölme makinesi ve duvar boyu tepsi rafı.
    P.box(1.0, 1.9, 0.7, -hw + 0.6, 0.06, -hd + 4.2, "#c9ced4", Math.PI / 2);
    add(0.02, 1.5, 0.8, -hw + 0.96, 0.25, -hd + 4.2, null, 0, { material: glow("#ffe2b0"), shadow: false });
    P.box(0.7, 1.1, 0.7, 0.4, 0.06, -hd + 0.6, "#9aa3ad"); P.cyl(0.2, 0.25, 0.3, 0.4, 1.16, -hd + 0.6, "#c9ced4", 12);
    for (let s2 = 0; s2 < 4; s2++) { P.box(2.6, 0.03, 0.45, -hw + 1.6, 0.4 + s2 * 0.45, -hd + 0.35, "#9aa3ad"); for (let i = 0; i < 6; i++) P.ball(0.09, -hw + 0.6 + i * 0.4, 0.47 + s2 * 0.45, -hd + 0.35, "#f3e6c8", 6, 0.5); }
    for (let i = 0; i < 4; i++) P.box(0.55, 0.32, 0.35, -hw + 2.3 + (i % 2) * 0.6, 0.06 + Math.floor(i / 2) * 0.32, hd - 0.5, "#f4f1ea");
    T.S(-hw + 1.6, -hd + 1.0, Math.PI, "shelf", [[-hw + 1.6, -hd + 1.0, 6, "shelf", -hw + 1.6, -hd + 0.35], [0.4, -hd + 1.3, 6, "check", 0.4, -hd + 0.6], [-hw + 1.4, -hd + 4.2, 6, "check", -hw + 0.6, -hd + 4.2]]);
    return flush(T, P);
  }
  P.box(xr + hw - 0.3, 0.012, 2 * hd - 0.3, (xr - hw) / 2, 0.06, 0, ["#d8c6a8", "#e9dcc4", "#b8a68a"][k]);
  // Satış tezgâhı: camlı vitrin (önde), tahta tezgâh üstü.
  P.box(cw, 0.9, 0.7, cxm, 0.06, zc, k === 2 ? "#8a7a68" : "#c9a27a");
  add(cw, 0.42, 0.66, cxm, 0.96, zc, null, 0, { material: GLASS, shadow: false });
  P.box(cw + 0.05, 0.04, 0.72, cxm, 1.38, zc, k === 2 ? "#e2ddd4" : "#8a6a52");
  const pastry = (x, c) => { P.box(0.36, 0.02, 0.26, x, 0.97, zc, "#c9ced4"); for (let i = 0; i < 4; i++) P.ball(0.05, x - 0.11 + (i % 2) * 0.22, 1.01, zc - 0.06 + Math.floor(i / 2) * 0.12, c, 6, 0.6); };
  for (let i = 0; i < Math.floor(cw / 0.45); i++) pastry(cx0 + 0.3 + i * 0.45, ["#d9a24a", "#b5803f", "#e8c27a", "#7a4a2a"][i % 4]);
  const tables = [];
  if (k === 0) {
    // Driftwood Fırını: paslanmaz katlı taş tabanlı fırın (üç kapaklı), arka duvarda tel ekmek rafları dolu
    // somunlarla, tezgâhta hasır ekmek sepetleri, önde iki küçük masa.
    const ox = -hw + 1.3;
    P.box(1.9, 1.75, 1.0, ox, 0.06, -hd + 0.65, "#c9ced4");
    for (let r = 0; r < 3; r++) { add(1.5, 0.3, 0.02, ox, 0.3 + r * 0.5, -hd + 1.16, null, 0, { material: glow(r === 1 ? "#ffb15a" : "#3a2a24"), shadow: false }); P.box(1.4, 0.03, 0.04, ox, 0.66 + r * 0.5, -hd + 1.18, "#5a5f66"); }
    // Tel ekmek rafları: fırının yanından tezgâhın sağ ucuna, arka duvar boyunca.
    const rx0 = -hw + 2.45, rw = cx1 - rx0, rxm = (rx0 + cx1) / 2;
    for (const x of [rx0 + 0.03, cx1 - 0.03]) P.box(0.03, 1.9, 0.34, x, 0.06, -hd + 0.3, "#7a8088");
    for (let s = 0; s < 4; s++) {
      P.box(rw, 0.03, 0.34, rxm, 0.5 + s * 0.42, -hd + 0.3, "#9aa3ad");
      for (let i = 0; i < Math.floor((rw - 0.2) / 0.32); i++) P.ball(0.1, rx0 + 0.2 + i * 0.32, 0.6 + s * 0.42, -hd + 0.3, ["#c9873f", "#d9a24a", "#a86a2f"][(i + s) % 3], 6, 0.55);
    }
    for (let i = 0; i < 3; i++) { const x = cxm - 0.6 + i * 0.7; P.cyl(0.22, 0.18, 0.14, x, 1.42, zc, "#c9a26a", 10); P.ball(0.08, x, 1.56, zc, "#c9873f", 6, 0.6); P.ball(0.08, x + 0.08, 1.58, zc + 0.05, "#d9a24a", 6, 0.6); }
    // Ekmek adası: kuyruğun yanında yuvarlak sergi masası, hasır sepetlerde somun, simit ve poğaça.
    const ix = -hw + 1.6, iz = -1.4;
    P.cyl(0.7, 0.7, 0.05, ix, 0.8, iz, "#a87a50", 18); P.cyl(0.12, 0.2, 0.74, ix, 0.06, iz, "#6b4a35", 10);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = ix + Math.cos(a) * 0.42, z = iz + Math.sin(a) * 0.42;
      P.cyl(0.18, 0.14, 0.12, x, 0.85, z, "#c9a26a", 10);
      for (let j = 0; j < 3; j++) P.ball(0.07, x - 0.06 + j * 0.06, 0.98, z + (j % 2) * 0.05, ["#c9873f", "#d9a24a", "#e8c27a", "#a86a2f", "#b5803f"][i], 6, 0.6);
    }
    P.cyl(0.12, 0.12, 0.3, ix, 0.85, iz, "#c9a26a", 10); for (let j = 0; j < 6; j++) P.geo(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5).rotateZ(0.2 * (j - 2.5)), "#d9a24a", ix, 1.25, iz);
    tables.push([-hw + 1.3, 1.4], [-hw + 3.4, 1.4], [-hw + 1.3, hd - 1.4], [-hw + 3.4, hd - 1.4], ...[0.6, 3.1].filter((z) => z - 0.95 > coreZ).map((z) => [Math.min(xr - 1.1, hw + 0.45), z, Math.PI / 2]));
    // İçecek dolabı (ayran, süt, meyve suyu), çekirdek önünde.
    P.box(0.8, 1.9, 0.6, xr - 0.6, 0.06, coreZ + 0.6, "#e9edf0");
    add(0.66, 1.5, 0.02, xr - 0.6, 0.3, coreZ + 0.91, null, 0, { material: glow("#e4f2fa"), shadow: false });
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) P.cyl(0.05, 0.05, 0.2, xr - 0.84 + i * 0.16, 0.36 + r * 0.38, coreZ + 0.82, ["#f4f1ea", "#f28c28", "#f4f1ea", "#d8433d"][(i + r) % 4], 8);
  } else if (k === 1) {
    // Simitçi Martı: simit tepsileri (üst üste susamlı halkalar), kapı yanında ayaklı simit tablası, büyük
    // çaydanlık ve bardaklar, sol duvar boyunca tezgâh masa ve tabureler.
    const tray = (x, y, z, n = 7) => { P.cyl(0.45, 0.45, 0.025, x, y, z, "#c9ced4", 18); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; P.ring(0.11, 0.035, x + Math.cos(a) * 0.28, y + 0.06, z + Math.sin(a) * 0.28, "#b5672f"); } P.ring(0.11, 0.035, x, y + 0.06, z, "#c9743a"); };
    const rx = -hw + 1.0;
    for (let s = 0; s < 4; s++) { P.box(1.1, 0.03, 1.0, rx, 0.4 + s * 0.42, -hd + 0.65, "#9aa3ad"); tray(rx, 0.43 + s * 0.42, -hd + 0.65); }
    for (const dx of [-0.55, 0.55]) P.box(0.04, 1.8, 1.0, rx + dx, 0.06, -hd + 0.65, "#7a8088");
    tray(cxm + 0.6, 1.42, zc, 6);
    // Simit tablası: çapraz ayaklı sehpa üstünde geniş tepsi (kapının solunda).
    const tx = 0.0, tz = hd - 1.0;
    for (const s of [-1, 1]) T.add(0.04, 0.9, 0.04, tx, 0.06, tz, "#6b4a35", 0, { geo: new THREE.BoxGeometry(0.04, 1.0, 0.04).rotateX(s * 0.5).translate(0, 0.45, 0) });
    P.cyl(0.55, 0.55, 0.03, tx, 0.88, tz, "#8a6a52", 18); tray(tx, 0.91, tz, 8);
    P.cyl(0.13, 0.15, 0.3, cxm - 1.2, 1.42, zc, "#c9ced4", 12); P.cyl(0.09, 0.12, 0.16, cxm - 1.2, 1.72, zc, "#c9ced4", 12);
    // Duvar boyu tezgâh masa ve tabureler (müşteri).
    P.box(0.42, 0.05, 2 * hd - 5.4, -hw + 0.36, 1.0, 1.6, "#a87a50");
    for (let z = -0.6; z < hd - 1.1; z += 0.9) { P.cyl(0.17, 0.15, 0.44, -hw + 0.95, 0.06, z, "#c9573a", 10); T.guests.push(T.spot(-hw + 0.95, z, -Math.PI / 2, "guest")); }
    // Ayaklı masalar: simidini çayıyla ayakta yiyenler için; masada çay bardağı ve simit tabağı.
    for (const [x, z] of [[-0.6, -1.6], [1.2, -0.2], [-0.6, 1.4], [1.2, 3.0]]) {
      P.cyl(0.22, 0.26, 0.03, x, 0.06, z, "#3c4148", 10); P.cyl(0.035, 0.035, 1.0, x, 0.09, z, "#3c4148", 6);
      P.cyl(0.36, 0.36, 0.04, x, 1.08, z, "#d9d4ca", 14);
      P.cyl(0.026, 0.02, 0.08, x + 0.12, 1.12, z, "#b5532f", 8); P.cyl(0.12, 0.12, 0.012, x - 0.1, 1.12, z + 0.05, "#f4f1ea", 12); P.ring(0.08, 0.026, x - 0.1, 1.15, z + 0.05, "#b5672f");
    }
    tables.push(...[0.4, 2.9].filter((z) => z - 0.95 > coreZ).map((z) => [Math.min(xr - 1.1, hw + 0.45), z, Math.PI / 2]));
  } else {
    // Taş Fırın: kubbeli taş fırın (ağzında köz ışığı), yanında istif odun ve uzun saplı kürek, mermer
    // tezgâhta pideler; önde uzun ortak masa ve iki bank.
    const ox = -hw + 1.5, oz = -hd + 1.0;
    P.box(2.2, 0.85, 1.6, ox, 0.06, oz, "#8a7a68");
    P.geo(new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.85, 0.75), "#b5563f", ox, 0.9, oz);
    for (let i = 0; i < 9; i++) P.box(0.3, 0.12, 0.05, ox - 0.6 + (i % 3) * 0.6 + (Math.floor(i / 3) % 2) * 0.3, 1.0 + Math.floor(i / 3) * 0.22, oz + 0.74 - Math.floor(i / 3) * 0.08, "#9a4a35");
    add(0.6, 0.38, 0.04, ox, 0.92, oz + 0.78, null, 0, { material: glow("#ff8a3a"), shadow: false, geo: new THREE.CircleGeometry(0.32, 14, 0, Math.PI) });
    P.box(0.8, 0.06, 0.12, ox, 0.88, oz + 0.86, "#5a4a3a");
    // Odun istifi sol duvar dibinde (kütükler duvar boyunca), yanında duvara yaslı uzun saplı kürek.
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4 - (r % 2); i++) P.geo(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 7).rotateX(Math.PI / 2), "#7a5638", -hw + 0.25 + i * 0.17 + (r % 2) * 0.08, 0.14 + r * 0.15, -hd + 2.5);
    T.add(0.08, 2.4, 0.08, -hw + 0.3, 0.06, -hd + 3.4, "#a87a50", 0, { geo: new THREE.BoxGeometry(0.05, 2.4, 0.05).rotateZ(0.12).translate(0, 1.2, 0) });
    P.box(0.3, 0.02, 0.4, -hw + 0.18, 2.35, -hd + 3.4, "#a87a50");
    for (let i = 0; i < 3; i++) { P.box(0.7, 0.05, 0.24, cxm - 0.75 + i * 0.75, 1.42, zc, "#d9a24a"); P.box(0.5, 0.02, 0.12, cxm - 0.75 + i * 0.75, 1.47, zc, i % 2 ? "#7a2a1a" : "#f2d27a"); }
    // Uzun ortak masa ve bankları: ön bölümde boydan boya.
    const lx0 = -hw + 0.8, lx1 = 0.4, lz = hd - 2.2;
    P.box(lx1 - lx0, 0.06, 0.8, (lx0 + lx1) / 2, 0.74, lz, "#8a5a3a");
    for (const x of [lx0 + 0.2, lx1 - 0.2]) P.box(0.08, 0.7, 0.6, x, 0.04, lz, "#5a3d28");
    for (const s of [-1, 1]) {
      P.box(lx1 - lx0, 0.06, 0.3, (lx0 + lx1) / 2, 0.42, lz + s * 0.65, "#7a5638");
      for (let x = lx0 + 0.4; x < lx1 - 0.2; x += 0.75) T.guests.push(T.spot(x, lz + s * 0.65, s > 0 ? Math.PI : 0, "guest"));
    }
    tables.push([-hw + 1.6, -1.2, 0, 4], [-hw + 4.0, -1.2, 0, 4], ...[0.4, 2.9].filter((z) => z - 0.95 > coreZ).map((z) => [Math.min(xr - 1.1, hw + 0.45), z, Math.PI / 2]));
  }
  const tst = [{ shape: "round", table: "#f4f1ea", leg: "#3c4148", chair: "#8a6a52" }, { shape: "round", table: "#e9dcc4", leg: "#3c4148", chair: "#c9573a" }, { shape: "square", table: "#8a5a3a", leg: "#3a2418", chair: "#5a3d28" }][k];
  for (const [x, z, a0 = 0, n = 2] of tables) dineTable(T, P, x, z, tst, n, a0);
  // Çalışanlar: tezgâh arkasında satış, fırın başında usta (fırına bakar), üçüncüsü tezgâhta.
  T.S(cxm + 0.6, zc - 0.8, 0, "counter");
  const oven = k === 1 ? [-hw + 1.0, -hd + 1.6, Math.PI] : [-hw + (k === 2 ? 1.5 : 1.3), -hd + (k === 2 ? 2.25 : 1.7), Math.PI];
  T.S(oven[0], oven[1], oven[2], "shelf", [[oven[0], oven[1], 9, "check", oven[0], -hd], [cxm, zc - 0.8, 4, "counter", cxm, zc]]);
  T.S(cxm - 0.6, zc - 0.8, 0, "counter");
  flush(T, P);
}

// --- marketler (tek kat, 24 × 18) ---

function market(T, k) {
  const { hw, hd, add, S } = T;
  const P = props();
  const kasa = (x, z) => {
    // Kasa: bantlı tezgâh, yazar kasa ekranı, poşetlik; kasiyer arkasında oturur gibi ayakta.
    P.box(2.0, 0.85, 0.7, x, 0.06, z, "#f4f1ea"); P.box(1.4, 0.04, 0.5, x - 0.2, 0.91, z, "#2a2f38");
    P.box(0.3, 0.25, 0.04, x + 0.7, 1.05, z - 0.2, "#2a2f38");
    add(0.26, 0.18, 0.01, x + 0.7, 1.08, z - 0.175, null, 0, { material: glow("#7fb0e0"), shadow: false });
  };
  const goods = (x, y, z, w, n, seed, rot = 0, d = 0.3) => {
    for (let i = 0; i < n; i++) {
      const c = ["#d8433d", "#e8b93a", "#3e8a86", "#2f6fb5", "#8a62d1", "#f28c28", "#7fae45", "#f4f1ea"][(i * 3 + seed * 5) % 8];
      const ox = -w / 2 + (i + 0.5) * (w / n), h = 0.18 + ((i * 7 + seed) % 3) * 0.06;
      const ca = Math.cos(rot), sa = Math.sin(rot);
      P.box(w / n - 0.04, h, d, x + ox * ca, y, z - ox * sa, c, rot);
    }
  };
  const gondola = (x, z, w, seed, top = "#e6e2da") => {
    // Çift yüzlü reyon: ortada ince sırt, iki yanda dört kat raf; alt tabla ve uç kapakları.
    P.box(w, 1.6, 0.1, x, 0.06, z, top);
    P.box(w, 0.14, 0.9, x, 0.06, z, "#c9ced4");
    for (const e of [-1, 1]) P.box(0.05, 1.6, 0.9, x + e * (w / 2 - 0.025), 0.06, z, top);
    for (let r = 0; r < 4; r++) for (const s of [-1, 1]) {
      if (r) P.box(w - 0.1, 0.025, 0.4, x, 0.18 + r * 0.38, z + s * 0.25, "#c9ced4");
      goods(x, 0.205 + r * 0.38, z + s * 0.26, w - 0.2, Math.floor(w / 0.32), seed + r * 3 + (s > 0 ? 1 : 0), 0, 0.26);
    }
  };
  /** Camlı soğutucu: içi ışıklı arka pano, raflarda şişe ve paketler, önde cam kapak. */
  const fridge = (x, z, w, seed) => {
    P.box(w, 0.25, 0.75, x, 0.06, z, "#c9ced4"); P.box(w, 0.2, 0.75, x, 1.86, z, "#dfe4e8");
    for (const e of [-1, 1]) P.box(0.06, 2.0, 0.75, x + e * (w / 2 - 0.03), 0.06, z, "#dfe4e8");
    add(w - 0.12, 1.55, 0.02, x, 0.31, z - 0.33, null, 0, { material: glow("#e4f2fa"), shadow: false });
    for (let r = 0; r < 4; r++) {
      P.box(w - 0.12, 0.02, 0.6, x, 0.31 + r * 0.39, z, "#c9ced4");
      for (let i = 0; i < Math.floor((w - 0.2) / 0.14); i++) P.cyl(0.045, 0.045, 0.24, x - w / 2 + 0.16 + i * 0.14, 0.33 + r * 0.39, z + 0.05, ["#f4f1ea", "#d8433d", "#2f6fb5", "#7fae45", "#e8b93a", "#f28c28"][(i + r * 2 + seed) % 6], 8);
    }
    add(w - 0.12, 1.55, 0.02, x, 0.31, z + 0.36, null, 0, { material: GLASS, shadow: false });
  };
  if (k === 0) {
    // Ada Market: süpermarket. Arka duvar boyunca ışıklı soğutucu dolaplar, ortada çift yüzlü reyonlar ve
    // reyon tabelaları, önde iki kasa, kapı yanında alışveriş arabaları, sağda meyve sebze adası.
    P.box(2 * hw - 0.3, 0.012, 2 * hd - 0.3, 0, 0.06, 0, "#e6e2da");
    const nf = Math.floor((2 * hw - 1.2) / 2.1);
    for (let i = 0; i < nf; i++) fridge(-(nf - 1) * 1.05 + i * 2.1, -hd + 0.55, 2.05, i);
    for (let r = 0; r < 4; r++) {
      const z = -hd + 3.0 + r * 2.8;
      gondola(-2.6, z, 11, r * 7);
      P.box(1.4, 0.4, 0.04, -2.6, 2.4, z, ["#d8433d", "#3e8a86", "#2f6fb5", "#e8b93a"][r]); P.box(0.02, 0.5, 0.02, -2.6, 2.8, z, "#9aa3ad");
    }
    // Kampanya paletleri: koli koli su ve deterjan, üstünde fiyat panosu.
    for (const [x, z, c] of [[-7.5, hd - 3.6, "#2f7fb5"], [-4.5, hd - 3.6, "#e8b93a"], [1.0, hd - 3.6, "#3e8a86"]]) {
      P.box(1.2, 0.14, 1.0, x, 0.06, z, "#b88a5e");
      for (let i = 0; i < 12; i++) P.box(0.38, 0.3, 0.46, x - 0.4 + (i % 3) * 0.4, 0.2 + Math.floor(i / 6) * 0.31, z - 0.24 + (Math.floor(i / 3) % 2) * 0.48, i % 2 ? c : "#f4f1ea");
      P.box(0.02, 1.1, 0.02, x, 0.82, z, "#9aa3ad"); P.box(0.5, 0.35, 0.03, x, 1.9, z, "#d8433d");
    }
    // Meyve sebze adası: eğimli kasalar.
    for (let i = 0; i < 4; i++) {
      const x = hw - 4.2 + (i % 2) * 1.5, z = -hd + 3.4 + Math.floor(i / 2) * 1.6;
      P.box(1.3, 0.75, 1.3, x, 0.06, z, "#a87a50");
      for (let j = 0; j < 9; j++) P.ball(0.1, x - 0.4 + (j % 3) * 0.4, 0.9, z - 0.4 + Math.floor(j / 3) * 0.4, ["#f28c28", "#d8433d", "#e8d23a", "#7fae45"][i], 6);
    }
    for (let i = 0; i < 4; i++) { const x = -hw + 1.2 + i * 0.25; P.box(0.55, 0.5, 0.9, x, 0.3, hd - 1.2, "#9aa3ad"); }
    kasa(hw - 6.5, hd - 2.4); kasa(hw - 3.5, hd - 2.4);
    S(hw - 6.5, hd - 3.15, 0, "counter"); S(hw - 3.5, hd - 3.15, 0, "counter");
    const tour = [];
    for (let r = 0; r < 4; r++) { const az = -hd + 4.4 + r * 2.8; for (const x of r % 2 ? [1.5, -6.5] : [-6.5, 1.5]) tour.push([x, az, 6, "shelf", x, az - 1.4]); }
    S(-6.5, -hd + 1.6, Math.PI, "shelf", tour);
  } else if (k === 1) {
    // Liman Bakkalı: tavana kadar ahşap duvar rafları, önlerinde açık çuvallarda bakliyat, kantarlı tezgâh,
    // gazete standı, dondurma dolabı, ekmek sepeti. Mahalle bakkalının sıcak dağınıklığı.
    P.box(2 * hw - 0.3, 0.012, 2 * hd - 0.3, 0, 0.06, 0, "#c9a77a");
    for (const [x, z, w, rot] of [[0, -hd + 0.4, 2 * hw - 0.8, 0], [-hw + 0.4, 0, 2 * hd - 2.6, Math.PI / 2], [hw - 0.4, -1.5, 2 * hd - 6, -Math.PI / 2]]) {
      P.box(w, 2.6, 0.06, x - Math.sin(rot) * 0.17, 0.06, z - Math.cos(rot) * 0.17, "#8a5a3a", rot);
      P.box(w, 0.12, 0.4, x, 0.06, z, "#6b4a35", rot);
      for (let r = 0; r < 6; r++) {
        const nx = Math.sin(rot) * 0.05, nz = Math.cos(rot) * 0.05;
        P.box(w, 0.03, 0.42, x, 0.2 + r * 0.42, z, "#6b4a35", rot);
        goods(x + nx, 0.23 + r * 0.42, z + nz, w - 0.2, Math.floor(w / 0.3), r * 11 + Math.round(x), rot, 0.24);
      }
    }
    // Çuval sırası: duvar raflarının önünde, ağzı kıvrık açık çuvallar (pirinç, mercimek, nohut, fasulye...).
    const SACK = ["#f4f1ea", "#d9822b", "#e8c27a", "#b5532f", "#7fae45", "#f2d27a", "#6b4a35"];
    for (let i = 0; i < 12; i++) {
      const x = -hw + 2.2 + i * 1.2, z = -hd + 1.2;
      P.cyl(0.32, 0.36, 0.6, x, 0.06, z, "#d9c49a", 10); P.cyl(0.36, 0.32, 0.1, x, 0.62, z, "#c9b48a", 10);
      P.cyl(0.29, 0.29, 0.04, x, 0.6, z, SACK[i % SACK.length], 10);
    }
    // Tezgâh (önde sağ), kantar, şekerlik kavanozları; gazete standı ve dondurma dolabı kapı yanında.
    const cx = hw - 3.5, cz = hd - 3.2;
    P.box(3.2, 1.0, 0.8, cx, 0.06, cz, "#8a5a3a"); P.box(3.25, 0.05, 0.85, cx, 1.06, cz, "#d9d4ca");
    P.box(0.4, 0.06, 0.35, cx - 0.9, 1.11, cz, "#c9ced4"); P.box(0.3, 0.25, 0.08, cx - 0.9, 1.17, cz - 0.15, "#d8433d");
    for (let i = 0; i < 5; i++) { P.cyl(0.1, 0.1, 0.24, cx + 0.1 + i * 0.25, 1.11, cz - 0.2, "#e8f2f6", 10); P.ball(0.07, cx + 0.1 + i * 0.25, 1.2, cz - 0.2, ["#d8433d", "#e8b93a", "#7fae45", "#f28c28", "#8a62d1"][i], 6, 0.8); }
    P.box(1.0, 1.3, 0.5, -3, 0.06, hd - 1.0, "#2f5d8a");
    for (let r = 0; r < 3; r++) P.box(0.9, 0.02, 0.36, -3, 0.5 + r * 0.32, hd - 0.95, ["#f4f1ea", "#e8e2d6", "#f4f1ea"][r], 0);
    P.box(1.6, 0.85, 0.75, -5.4, 0.06, hd - 1.0, "#f4f1ea"); add(1.5, 0.02, 0.65, -5.4, 0.91, hd - 1.0, null, 0, { material: GLASS, shadow: false });
    P.cyl(0.3, 0.25, 0.3, cx + 1.3, 1.11, cz + 0.1, "#c9a26a", 10);
    for (let i = 0; i < 4; i++) P.ball(0.1, cx + 1.25 + (i % 2) * 0.1, 1.42, cz + 0.05 + (i > 1 ? 0.1 : 0), "#c9873f", 6, 0.6);
    // Ortada iki sıra alçak ahşap raf (konserve, deterjan).
    for (let r = 0; r < 3; r++) gondola(-1.0, -4.4 + r * 3.2, 9, r * 5 + 2, "#8a5a3a");
    // Kapı önünde iki hasır tabure: bakkalın mahalleliyle çay içtiği köşe.
    for (const x of [2.2, 3.2]) { P.cyl(0.18, 0.16, 0.44, x, 0.06, hd - 1.3, "#c9a26a", 10); T.guests.push(T.spot(x, hd - 1.3, Math.PI, "guest")); }
    S(cx, cz - 0.75, 0, "counter");
    S(-hw + 1.4, -2, -Math.PI / 2, "shelf", [[-hw + 1.4, -2, 6, "shelf", -hw, -2], [-hw + 2.6, -hd + 2.0, 5, "shelf", -hw + 2.6, -hd], [4.0, -hd + 2.0, 5, "check", 4.0, -hd + 1.2]]);
  } else if (k === 2) {
    // Yokuş Manavı: basamaklı eğimli tezgâhlarda kasa kasa meyve sebze (portakal, elma, limon, domates,
    // patlıcan, biber, salatalık), yerde karpuz yığını, tavandan sarkan kantar, hasır sepetler ve kasa.
    P.box(2 * hw - 0.3, 0.012, 2 * hd - 0.3, 0, 0.06, 0, "#cbbf9f");
    const FRUIT = [["#f28c28", 0.1], ["#d8433d", 0.1], ["#e8d23a", 0.08], ["#c9302c", 0.11], ["#5a2a6a", 0.12, 1.6], ["#4f8a2e", 0.07, 1.8], ["#7fae45", 0.09], ["#3e6b2a", 0.07, 2.4], ["#f2b84a", 0.09], ["#a8323a", 0.06]];
    const stand = (x, z, w, rot, seed) => {
      // Üç basamaklı eğimli sergi: her basamakta yan yana kasalar.
      const ca = Math.cos(rot), sa = Math.sin(rot);
      for (let t = 0; t < 3; t++) {
        const lz = -0.5 + t * 0.5, y = 0.75 - t * 0.25;
        const px = x + lz * sa, pz = z + lz * ca;
        P.box(w, y, 0.5, px, 0.06, pz, "#8a6040", rot);
        const nb = Math.floor(w / 0.6);
        for (let c = 0; c < nb; c++) {
          const ox = -w / 2 + 0.3 + c * 0.6, cx = px + ox * ca, cz = pz - ox * sa;
          P.box(0.56, 0.12, 0.46, cx, 0.06 + y, cz, "#c9a26a", rot);
          const [col, r, sy = 1] = FRUIT[(seed + c * 3 + t * 7) % FRUIT.length];
          for (let j = 0; j < 6; j++) P.ball(r, cx + (-0.16 + (j % 3) * 0.16) * ca, 0.2 + y + (j > 2 ? 0.03 : 0), cz - (-0.16 + (j % 3) * 0.16) * sa + (j > 2 ? 0.08 : -0.08) * ca, col, 6, sy);
        }
      }
    };
    stand(0, -hd + 1.2, 2 * hw - 1.5, 0, 0);
    // İki ada: ortası yüksek, iki yana basamaklanan sırt sırta sergiler.
    for (const [zi, sd] of [[-3.6, 5], [0.6, 11]]) { stand(-3.5, zi - 0.75, 9, Math.PI, sd); stand(-3.5, zi + 0.75, 9, 0, sd + 4); }
    for (let i = 0; i < 9; i++) P.ball(0.3, hw - 2.0 + (i % 3) * 0.5 - (i > 5 ? -0.25 : 0), 0.32 + Math.floor(i / 3) * 0.42, -1.0 + ((i * 5) % 3) * 0.3, i % 2 ? "#3e6b2a" : "#4f7d3e", 8, 0.85);
    for (let i = 0; i < 4; i++) { const x = hw - 2.4 + (i % 2) * 0.9, z = 2.4 + Math.floor(i / 2) * 0.9; P.cyl(0.32, 0.26, 0.4, x, 0.06, z, "#c9a26a", 10); for (let j = 0; j < 4; j++) P.ball(0.09, x - 0.1 + (j % 2) * 0.2, 0.5, z - 0.1 + Math.floor(j / 2) * 0.2, ["#a8323a", "#e8d23a", "#7fae45", "#f28c28"][i], 6); }
    // Sağ duvar dibinde file çuvallarda patates, soğan, sarımsak; kapı yanında demet demet yeşillik.
    for (let i = 0; i < 7; i++) {
      const z = -hd + 3.0 + i * 1.0, c = ["#c9a26a", "#b5653f", "#f4f1ea", "#c9a26a", "#a8323a", "#e8c27a", "#b5653f"][i];
      P.cyl(0.32, 0.36, 0.55, hw - 0.6, 0.06, z, "#d9c49a", 10); P.cyl(0.3, 0.3, 0.04, hw - 0.6, 0.58, z, c, 10);
      for (let j = 0; j < 3; j++) P.ball(0.08, hw - 0.7 + j * 0.1, 0.66, z - 0.05 + (j % 2) * 0.1, c, 6);
    }
    P.box(2.0, 0.8, 0.8, -3.0, 0.06, hd - 1.3, "#8a6040");
    for (let i = 0; i < 8; i++) { const x = -3.8 + i * 0.23; P.box(0.12, 0.06, 0.5, x, 0.86, hd - 1.3, "#e9e2d0"); P.ball(0.1, x, 0.98, hd - 1.5, ["#4f8a2e", "#5f9a3a", "#3e7a2a"][i % 3], 5, 1.4); }
    const cx = hw - 3.5, cz = hd - 2.6;
    P.box(2.4, 0.95, 0.75, cx, 0.06, cz, "#8a6040"); P.box(2.45, 0.05, 0.8, cx, 1.01, cz, "#d9d4ca");
    P.box(0.012, 0.9, 0.012, cx - 0.6, 1.9, cz, "#3a3f47"); P.cyl(0.18, 0.18, 0.1, cx - 0.6, 1.8, cz, "#c9ced4", 12); P.cyl(0.2, 0.2, 0.03, cx - 0.6, 1.55, cz, "#c9ced4", 14);
    S(cx, cz - 0.75, 0, "counter");
    S(-6, -1.5, Math.PI, "shelf", [[-6, -1.5, 6, "shelf", -6, -2.4], [-1, -1.5, 6, "shelf", -1, -0.6], [-1, 2.8, 6, "shelf", -1, 1.9], [-6, 2.8, 6, "shelf", -6, 1.9]]);
    S(-4, -hd + 2.6, Math.PI, "shelf", [[-4, -hd + 2.6, 5, "shelf", -4, -hd + 1.4], [4, -hd + 2.6, 5, "shelf", 4, -hd + 1.4]]);
  } else {
    // Driftwood Şarküteri: L biçimli camlı soğutmalı tezgâh (tekerlek peynirler, zeytin kâseleri, pastırma,
    // sucuk), arkada askıda sucuklar, dilimleme makinesi, kavanozlu raflar (bal, reçel, turşu), zeytin fıçıları.
    P.box(2 * hw - 0.3, 0.012, 2 * hd - 0.3, 0, 0.06, 0, "#e9e2d6");
    for (let i = 0; i < Math.floor((2 * hd - 0.3) / 0.6); i++) for (let j = 0; j < Math.floor((2 * hw - 0.3) / 0.6); j++) if ((i + j) % 2) P.box(0.6, 0.004, 0.6, -hw + 0.45 + j * 0.6, 0.072, -hd + 0.45 + i * 0.6, "#b9ae9c");
    const dz = -hd + 2.4, dx0 = -hw + 2, dx1 = hw - 5;
    const deli = (x, z, w, rot) => {
      P.box(w, 0.85, 0.85, x, 0.06, z, "#8a2f3a", rot);
      add(w, 0.45, 0.8, x, 0.91, z, null, rot, { material: GLASS, shadow: false });
      add(w - 0.1, 0.03, 0.02, x, 1.34, z, null, rot, { material: glow("#fff6e0"), shadow: false });
      const n = Math.floor(w / 0.5), ca = Math.cos(rot), sa = Math.sin(rot);
      for (let i = 0; i < n; i++) {
        const ox = -w / 2 + 0.25 + i * 0.5, px = x + ox * ca, pz = z - ox * sa, t = i % 5;
        if (t === 0) P.cyl(0.18, 0.18, 0.14, px, 0.92, pz, "#f2d27a", 14);
        else if (t === 1) { P.cyl(0.16, 0.12, 0.08, px, 0.92, pz, "#f4f1ea", 12); for (let j = 0; j < 6; j++) P.ball(0.03, px - 0.08 + (j % 3) * 0.08, 1.0, pz - 0.04 + Math.floor(j / 3) * 0.08, j % 2 ? "#2a2a1e" : "#5a6a2a", 5); }
        else if (t === 2) P.box(0.4, 0.06, 0.25, px, 0.92, pz, "#8a2a1e", rot);
        else if (t === 3) P.geo(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 7).rotateZ(Math.PI / 2), "#6a1e1a", px, 0.96, pz, rot);
        else P.cyl(0.16, 0.16, 0.12, px, 0.92, pz, "#f4f1ea", 12);
      }
    };
    deli((dx0 + dx1) / 2, dz, dx1 - dx0, 0);
    deli(dx1 + 0.42, dz + 1.62, 2.4, Math.PI / 2);
    // Arka: sucuk askısı ve dilimleme makinesi, arka duvarda kavanoz rafları.
    P.box(dx1 - dx0, 0.04, 0.04, (dx0 + dx1) / 2, 2.2, -hd + 0.9, "#9aa3ad");
    for (let i = 0; i < Math.floor((dx1 - dx0) / 0.22); i++) P.geo(new THREE.CylinderGeometry(0.035, 0.03, 0.55, 6).translate(0, -0.27, 0), i % 3 ? "#7a1e1a" : "#a8452a", dx0 + 0.1 + i * 0.22, 2.2, -hd + 0.9);
    P.box(1.6, 0.9, 0.6, dx0 + 1.5, 0.06, -hd + 0.6, "#e9edf0"); P.cyl(0.18, 0.18, 0.04, dx0 + 1.3, 0.98, -hd + 0.6, "#c9ced4", 16, 0);
    for (let s = 0; s < 4; s++) {
      P.box(2 * hw - 1.0, 0.03, 0.3, 0, 1.1 + s * 0.38, -hd + 0.25, "#6b4a35");
      for (let i = 0; i < Math.floor((2 * hw - 1.2) / 0.22); i++) P.cyl(0.07, 0.07, 0.18, -hw + 0.6 + i * 0.22, 1.13 + s * 0.38, -hd + 0.25, ["#d9a24a", "#a8323a", "#7fae45", "#e8b93a", "#6b3a26"][(i + s * 2) % 5], 8);
    }
    for (let i = 0; i < 4; i++) { const x = -hw + 1.2 + i * 1.0, z = hd - 1.4; P.cyl(0.38, 0.38, 0.85, x, 0.06, z, "#7a5638", 12); for (const y of [0.25, 0.7]) P.cyl(0.395, 0.395, 0.05, x, 0.06 + y, z, "#4a4f57", 12); P.cyl(0.34, 0.34, 0.02, x, 0.9, z, i % 2 ? "#2a2a1e" : "#5a6a2a", 12); }
    for (let r = 0; r < 2; r++) gondola(-1.5, 1.4 + r * 3.0, 10, r * 9 + 4, "#6b4a35");
    // Sol duvar: zeytinyağı ve şarap şişeleri rafı (ince uzun şişeler, koyu cam).
    P.box(0.06, 2.2, 7, -hw + 0.18, 0.06, 1.5, "#6b4a35");
    for (let r = 0; r < 5; r++) {
      P.box(0.36, 0.03, 7, -hw + 0.38, 0.3 + r * 0.42, 1.5, "#8a5a3a");
      for (let i = 0; i < 40; i++) { const z = -1.9 + i * 0.17; P.cyl(0.045, 0.05, 0.26, -hw + 0.38, 0.33 + r * 0.42, z, (i + r) % 3 ? "#4a5a2a" : "#3a1e2a", 8); P.cyl(0.018, 0.018, 0.08, -hw + 0.38, 0.59 + r * 0.42, z, "#c9a24a", 6); }
    }
    // Peynir kulesi: ortada yuvarlak tezgâhta üst üste tekerlek peynirler, yanında bal petekleri.
    const px = 4.5, pz = 2.6;
    P.cyl(0.8, 0.8, 0.05, px, 0.8, pz, "#8a5a3a", 18); P.cyl(0.6, 0.7, 0.75, px, 0.06, pz, "#6b4a35", 14);
    for (let i = 0; i < 4; i++) P.cyl(0.42 - i * 0.07, 0.42 - i * 0.07, 0.16, px - 0.15, 0.85 + i * 0.16, pz, i % 2 ? "#e8c27a" : "#f2d27a", 16);
    for (let i = 0; i < 3; i++) { P.cyl(0.08, 0.08, 0.16, px + 0.45, 0.85, pz - 0.3 + i * 0.25, "#e8b93a", 6); P.cyl(0.085, 0.085, 0.02, px + 0.45, 1.01, pz - 0.3 + i * 0.25, "#d8433d", 6); }
    for (let i = 0; i < 3; i++) { const x = (dx0 + dx1) / 2 - 5 + i * 5; P.cyl(0.006, 0.006, 0.7, x, 2.2, dz + 0.1, "#1d1f24", 4); P.cyl(0.08, 0.26, 0.2, x, 2.0, dz + 0.1, "#8a2f3a", 12); }
    kasa(hw - 3, hd - 2.4);
    S(-hw + 4, dz - 0.9, 0, "counter"); S(dx1 - 2, dz - 0.9, 0, "counter", [[dx1 - 2, dz - 0.9, 8, "counter", dx1 - 2, dz], [dx0 + 1.5, -hd + 1.2, 6, "counter", dx0 + 1.5, -hd + 0.6]]);
    S(hw - 3, hd - 3.15, 0, "counter");
  }
  flush(T, P);
}

// --- atölyeler (2 kat, 16 × 14) ---

function atelier(T, k) {
  const { hw, hd, f, xr, coreZ, add, S } = T;
  const P = props();
  const W = xr + hw - 0.3, X = (xr - hw) / 2, zf = coreZ + 1.5;
  if (f > 0) {
    // Üst kat: sergi ve depo. Kaidelerde atölyenin işleri, arkada koli rafları, bir yazı masası.
    P.box(W, 0.012, 2 * hd - 0.3, X, 0.06, 0, "#e9e5dd");
    const work = [["#b5653f", "#3e8a86", "#d9a27a"], ["#b88a5e", "#8a5a3a", "#c9a26a"], ["#2f6fb5", "#e8b93a", "#d8433d"], ["#f4f1ea", "#2f5d8a", "#d8433d"]][k];
    for (let i = 0; i < 4; i++) {
      const x = -hw + 1.4 + i * 2.2, z = hd - 1.6;
      P.box(0.7, 0.9, 0.7, x, 0.06, z, "#f4f1ea");
      if (k === 0) { P.cyl(0.16, 0.1, 0.4, x, 0.96, z, work[i % 3], 12); P.ball(0.1, x, 1.4, z, work[(i + 1) % 3], 8); }
      else if (k === 1) { P.box(0.5, 0.3, 0.4, x, 0.96, z, work[i % 3]); P.box(0.46, 0.02, 0.36, x, 1.26, z, "#d9b88a"); }
      else if (k === 2) { P.box(0.04, 0.9, 0.04, x, 0.96, z - 0.1, "#8a6a52"); P.box(0.6, 0.45, 0.03, x, 1.35, z, work[i % 3]); }
      else { P.box(0.04, 0.8, 0.04, x, 0.96, z, "#9aa3ad"); P.geo(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 0.7)])), work[i % 3], x, 1.0, z + 0.01); }
    }
    for (let s2 = 0; s2 < 3; s2++) {
      P.box(2 * hw - 1.0, 0.03, 0.5, -0.3, 0.4 + s2 * 0.6, -hd + 0.4, "#9aa3ad");
      for (let i = 0; i < Math.floor((2 * hw - 1.4) / 0.55); i++) P.box(0.45, 0.35, 0.4, -hw + 0.7 + i * 0.55, 0.43 + s2 * 0.6, -hd + 0.4, (i + s2) % 3 ? "#c9a26a" : "#b88a5e");
    }
    // Üst kattaki çalışma yerleri, her atölyenin kendi işi: seramikte sırlama ve boyama masaları, marangozda
    // montaj tezgâhları ve vernik kabini, resimde model kürsüsüne bakan şövale sırası, yelkende dikiş masaları.
    const cols = Math.max(2, Math.min(4, Math.floor((2 * hw - 1) / 2.6)));
    for (let i = 0; i < cols; i++) {
      const x = -hw + 1.6 + i * 2.6, z = -1.6;
      if (k === 2) {
        // Şövale: iki ayak ve arka destek, tuval; ressam arkasında, yüzü arka duvardaki model kürsüsüne dönük.
        for (const dx of [-0.25, 0.25]) P.box(0.04, 1.7, 0.04, x + dx, 0.06, z, "#8a6a52");
        P.box(0.04, 1.6, 0.04, x, 0.06, z + 0.3, "#8a6a52");
        P.box(0.62, 0.48, 0.03, x, 1.0, z, "#f4f1ea"); P.box(0.44, 0.3, 0.01, x, 1.08, z + 0.02, ["#3e8a86", "#e8b93a", "#d8433d", "#2f6fb5"][i]);
        S(x, z + 0.65, Math.PI, "board");
        if (i < cols - 1) { for (const dx of [-0.25, 0.25]) P.box(0.04, 1.7, 0.04, x + 1.3 + dx, 0.06, z + 1.8, "#8a6a52"); P.box(0.62, 0.48, 0.03, x + 1.3, 1.0, z + 1.8, "#f4f1ea"); P.box(0.44, 0.3, 0.01, x + 1.3, 1.08, z + 1.82, ["#7fae45", "#8a62d1", "#f28c28"][i % 3]); S(x + 1.3, z + 2.45, Math.PI, "board"); }
      } else if (k === 1) {
        P.box(2.2, 0.08, 0.9, x, 0.86, z, "#b88a5e"); P.box(2.0, 0.8, 0.8, x, 0.06, z, "#7a5638");
        P.box(0.5, 0.45, 0.4, x - 0.5, 0.94, z, "#c9a26a"); P.box(0.46, 0.02, 0.36, x - 0.5, 1.39, z, "#d9b88a"); P.box(0.3, 0.06, 0.06, x + 0.5, 0.94, z, "#3a3f47");
        S(x, z + 0.75, Math.PI, "bench");
      } else {
        P.box(1.4, 0.05, 0.8, x, 0.74, z, "#e6e1d6"); for (const dx of [-0.62, 0.62]) P.box(0.05, 0.72, 0.7, x + dx, 0.02, z, "#3c4148");
        if (k === 0) for (let j = 0; j < 3; j++) { P.cyl(0.1, 0.08, 0.2, x - 0.4 + j * 0.4, 0.79, z - 0.1, ["#cbbfa8", "#3e8a86", "#2f6fb5"][j], 10); P.cyl(0.05, 0.05, 0.08, x - 0.4 + j * 0.4, 0.79, z + 0.25, ["#3e8a86", "#e8b93a", "#f4f1ea"][j], 8); }
        else { P.box(0.45, 0.22, 0.2, x - 0.1, 0.79, z - 0.15, "#2a2f38"); P.box(0.12, 0.3, 0.2, x - 0.3, 0.79, z - 0.15, "#2a2f38"); P.box(0.7, 0.02, 0.6, x + 0.3, 0.79, z, "#f4f1ea"); }
        P.box(0.42, 0.05, 0.42, x, 0.47, z + 0.6, "#2f3540");
        S(x, z + 0.6, Math.PI, "desk");
      }
    }
    if (k === 2) { P.box(1.6, 0.3, 1.2, -0.3, 0.06, -hd + 1.5, "#8a6a52"); P.box(0.45, 0.05, 0.45, -0.3, 0.8, -hd + 1.5, "#d9b88a"); for (const [a, b2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.04, 0.45, 0.04, -0.3 + a * 0.19, 0.36, -hd + 1.5 + b2 * 0.19, "#c9a26a"); P.box(0.8, 0.02, 0.6, -0.3, 0.83, -hd + 1.5, "#d8433d", 0.3); }
    if (k === 1) { P.box(1.8, 2.2, 0.05, xr - 1.3, 0.06, zf + 0.0, "#c9ced4"); P.box(0.05, 2.2, 1.6, xr - 2.2, 0.06, zf + 0.8, "#c9ced4"); P.box(0.8, 0.9, 0.6, xr - 1.2, 0.06, zf + 0.8, "#c9a26a"); P.cyl(0.15, 0.15, 0.25, xr - 1.7, 0.06, zf + 1.3, "#5a3d28", 10); }
    S(0, -hd + 1.4, Math.PI, "shelf", [[-3, -hd + 1.4, 6, "shelf", -3, -hd + 0.4], [2, -hd + 1.4, 6, "shelf", 2, -hd + 0.4], [-0.5, hd - 2.6, 5, "check", -0.5, hd - 1.6]]);
    return flush(T, P);
  }
  if (k === 0) {
    // Seramik Atölyesi: bir sıra dönen çömlek tezgâhı (taburede çalışanlar), iki elektrikli fırın (ışıklı
    // göstergeli), arka duvarda pişmiş ve sırlı çanak çömlek rafları, sol duvarda kurutma rafı, kil yoğurma
    // ve sırlama masaları; zemin kil lekeli.
    P.box(W, 0.012, 2 * hd - 0.3, X, 0.06, 0, "#c9b8a2");
    for (let i = 0; i < 9; i++) P.ball(0.28, -hw + 1.2 + ((i * 37) % 11) * 1.0, 0.06, -2 + ((i * 53) % 7) * 0.8, "#a88a6a", 6, 0.06);
    const nw = Math.max(2, Math.min(5, Math.floor((2 * hw - 1.5) / 2.0)));
    for (let i = 0; i < nw; i++) {
      const x = -hw + 1.4 + i * 2.0, z = -1.2;
      P.cyl(0.4, 0.45, 0.55, x, 0.06, z, "#5a5f66", 14); P.cyl(0.3, 0.3, 0.05, x, 0.61, z, "#9aa3ad", 16);
      P.cyl(0.13, 0.16, 0.22 + (i % 3) * 0.05, x, 0.66, z, "#b5653f", 12);
      P.cyl(0.25, 0.25, 0.18, x + 0.55, 0.06, z - 0.2, "#9aa3ad", 10); P.cyl(0.23, 0.23, 0.02, x + 0.55, 0.22, z - 0.2, "#8a6a52", 10); // su kovası
      P.cyl(0.18, 0.18, 0.4, x, 0.06, z + 0.75, "#3c4148", 10);
      S(x, z + 0.72, Math.PI, "desk");
    }
    const kz = Math.max(coreZ + 1.0, -hd + 1.0);
    for (const dz of [0, 1.6]) {
      P.box(1.3, 1.3, 1.1, xr - 1.1, 0.06, kz + dz, "#9aa3ad"); P.box(1.1, 0.04, 0.04, xr - 1.1, 0.9, kz + dz + 0.56, "#5a5f66");
      add(0.06, 0.06, 0.02, xr - 0.6, 1.1, kz + dz + 0.56, null, 0, { material: glow(dz ? "#5fe08a" : "#ff5a3a"), shadow: false });
    }
    for (let s = 0; s < 4; s++) {
      P.box(2 * hw - 1.0, 0.03, 0.4, -0.3, 0.4 + s * 0.48, -hd + 0.35, "#a87a50");
      for (let i = 0; i < Math.floor((2 * hw - 1.4) / 0.38); i++) {
        const x = -hw + 0.6 + i * 0.38, c = s < 2 ? ["#b5653f", "#d9a27a", "#c9875a"][(i + s) % 3] : ["#3e8a86", "#2f6fb5", "#f4f1ea", "#e8b93a"][(i + s) % 4];
        if (i % 3 === 0) P.ball(0.13, x, 0.55 + s * 0.48, -hd + 0.35, c, 8, 0.9);
        else P.cyl(0.1 + (i % 2) * 0.04, 0.08, 0.2 + (i % 4) * 0.04, x, 0.43 + s * 0.48, -hd + 0.35, c, 10);
      }
    }
    // Kurutma rafı (sol duvar): ham, gri-bej kil işler.
    for (let s = 0; s < 4; s++) {
      P.box(0.45, 0.03, 3.0, -hw + 0.35, 0.35 + s * 0.45, 2.4, "#b88a5e");
      for (let i = 0; i < 7; i++) P.cyl(0.09, 0.07, 0.16 + (i % 2) * 0.06, -hw + 0.35, 0.38 + s * 0.45, 1.05 + i * 0.42, "#cbbfa8", 8);
    }
    // Kil yoğurma masası ve sırlama masası (sır kovaları).
    P.box(2.4, 0.06, 1.2, -hw + 3.2, 0.86, 2.6, "#c9b48a"); P.box(2.2, 0.82, 1.0, -hw + 3.2, 0.06, 2.6, "#8a6a52");
    for (let i = 0; i < 4; i++) P.ball(0.14, -hw + 2.4 + i * 0.5, 0.98, 2.6, "#a8603a", 6, 0.6);
    S(-hw + 3.2, 3.45, Math.PI, "bench");
    P.box(2.0, 0.06, 0.9, 1.6, 0.86, 2.6, "#e6e1d6"); P.box(1.9, 0.82, 0.8, 1.6, 0.06, 2.6, "#6b4a35");
    for (let i = 0; i < 4; i++) { P.cyl(0.14, 0.12, 0.22, 0.95 + i * 0.42, 0.92, 2.45, "#d9dde2", 10); P.cyl(0.12, 0.12, 0.02, 0.95 + i * 0.42, 1.12, 2.45, ["#3e8a86", "#2f6fb5", "#e8b93a", "#f4f1ea"][i], 10); }
    S(1.6, 3.4, Math.PI, "bench");
    S(xr - 1.1, kz + 0.9, 0, "shelf", [[xr - 1.1, kz + 0.75, 8, "check", xr - 1.1, kz], [xr - 1.1, kz + 2.35, 8, "check", xr - 1.1, kz + 1.6], [-hw + 1.2, 2.0, 6, "shelf", -hw + 0.35, 2.0]]);
  } else if (k === 1) {
    // Marangozhane: mengeneli ağır tezgâhlar, duvarda alet panosu (testere, çekiç, keski silüetleri),
    // istif keresteler, şerit testere ve planya, yerde talaş; yarım kalmış bir sandalye ve dolap.
    P.box(W, 0.012, 2 * hd - 0.3, X, 0.06, 0, "#c9a77a");
    for (let i = 0; i < 12; i++) P.ball(0.25, -hw + 1 + ((i * 37) % 11) * 1.1, 0.06, -1.6 + ((i * 53) % 7) * 0.8, "#e2c79a", 6, 0.08);
    const nb = Math.max(2, Math.min(3, Math.floor((2 * hw - 1) / 4.0)));
    for (let i = 0; i < nb; i++) {
      const x = -hw + 2.2 + i * 4.0, z = -1.4;
      P.box(2.6, 0.08, 0.9, x, 0.86, z, "#b88a5e"); P.box(2.4, 0.8, 0.8, x, 0.06, z, "#7a5638");
      P.box(0.3, 0.2, 0.18, x + 1.2, 0.94, z - 0.4, "#3a3f47"); P.box(1.2, 0.06, 0.18, x - 0.2, 0.94, z, "#e2c79a");
      P.box(0.4, 0.04, 0.06, x + 0.6, 0.94, z + 0.25, "#c9a26a"); P.box(0.16, 0.08, 0.08, x - 0.9, 0.94, z + 0.2, "#3a3f47");
      S(x, z + 0.75, Math.PI, "bench");
    }
    P.box(2 * hw - 2.0, 1.4, 0.04, -0.6, 1.0, -hd + 0.15, "#d9c49a");
    for (let i = 0; i < 14; i++) {
      const x = -hw + 1.4 + i * ((2 * hw - 3) / 13);
      if (i % 3 === 0) P.box(0.12, 0.6, 0.03, x, 1.4, -hd + 0.19, "#9aa3ad");
      else if (i % 3 === 1) { P.box(0.03, 0.4, 0.03, x, 1.3, -hd + 0.19, "#8a5a3a"); P.box(0.14, 0.07, 0.05, x, 1.7, -hd + 0.19, "#3a3f47"); }
      else P.box(0.04, 0.3, 0.03, x, 1.5, -hd + 0.19, "#c9a26a");
    }
    for (let r = 0; r < 6; r++) P.box(3.6, 0.08, 0.22, -hw + 2.4, 0.06 + r * 0.09, 2.6 + (r % 2) * 0.05, ["#c9a26a", "#b88a5e", "#d9b88a"][r % 3]);
    for (let r = 0; r < 5; r++) P.box(0.06, 2.4, 0.25, -hw + 0.25, 0.06, 0.6 + r * 0.32, "#b88a5e");
    // Şerit testere ve planya makinesi, başlarında birer usta.
    P.box(0.7, 1.0, 0.6, 1.2, 0.06, 2.6, "#3e6b8a"); P.box(0.02, 1.0, 0.02, 1.2, 1.06, 2.6, "#9aa3ad"); P.geo(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 14).rotateX(Math.PI / 2), "#c9ced4", 1.2, 1.95, 2.6);
    S(1.2, 3.3, Math.PI, "bench");
    P.box(2.2, 0.85, 0.7, 4.2, 0.06, 2.6, "#4a6a3e"); P.box(2.3, 0.04, 0.75, 4.2, 0.91, 2.6, "#9aa3ad"); P.box(1.6, 0.05, 0.16, 4.0, 0.95, 2.6, "#e2c79a");
    S(4.2, 3.3, Math.PI, "bench");
    const cx = -hw + 5.8, cz = 4.6;
    P.box(0.45, 0.04, 0.45, cx, 0.45, cz, "#d9b88a"); for (const [a, b2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.04, 0.39, 0.04, cx + a * 0.19, 0.06, cz + b2 * 0.19, "#c9a26a");
    P.box(1.0, 1.8, 0.5, cx + 1.6, 0.06, cz, "#c9a26a"); P.box(0.9, 1.7, 0.02, cx + 1.6, 0.1, cz + 0.26, "#d9b88a");
    S(cx + 0.8, cz + 0.7, Math.PI, "bench");
  } else if (k === 2) {
    // Resim Atölyesi: ortadaki natürmort masasının (vazo, meyve) çevresinde yay biçiminde şövaleler ve
    // başlarında ressamlar, duvarlarda asılı tablolar, boya masası ve kavanozda fırçalar, lavabo; geniş ışıklı zemin.
    P.box(W, 0.012, 2 * hd - 0.3, X, 0.06, 0, "#e9e5dd");
    for (let i = 0; i < 10; i++) P.ball(0.08, -hw + 1.5 + ((i * 29) % 9) * 1.1, 0.065, -2 + ((i * 41) % 5) * 1.0, ["#d8433d", "#2f6fb5", "#e8b93a", "#3e8a86"][i % 4], 6, 0.06);
    const sx = -0.8, sz = 0.4;
    P.box(1.0, 0.75, 1.0, sx, 0.06, sz, "#f4f1ea"); P.box(1.1, 0.02, 1.1, sx, 0.81, sz, "#9fc4dc");
    P.cyl(0.08, 0.12, 0.35, sx - 0.15, 0.83, sz, "#3e8a86", 10); P.ball(0.1, sx - 0.15, 1.28, sz, "#e05a6a", 6);
    for (let i = 0; i < 3; i++) P.ball(0.07, sx + 0.15 + i * 0.1, 0.9, sz + 0.15, ["#d8433d", "#e8b93a", "#7fae45"][i], 6);
    // Şövaleler: natürmortun arkasında ve iki yanında (önü, izleyene bakan yüz, açık kalır).
    [Math.PI, Math.PI - 0.75, Math.PI + 0.75, Math.PI / 2 + 0.1, -Math.PI / 2 - 0.1, Math.PI / 2 - 0.65, -Math.PI / 2 + 0.65].forEach((phi, i) => {
      const x = sx + Math.sin(phi) * 2.1, z = sz + Math.cos(phi) * 2.1;
      const a = Math.atan2(sx - x, sz - z), fx = Math.sin(a), fz = Math.cos(a);
      P.box(0.04, 1.7, 0.04, x - 0.25 * fz, 0.06, z + 0.25 * fx, "#8a6a52", a); P.box(0.04, 1.7, 0.04, x + 0.25 * fz, 0.06, z - 0.25 * fx, "#8a6a52", a);
      P.box(0.04, 1.6, 0.04, x - fx * 0.3, 0.06, z - fz * 0.3, "#8a6a52", a);
      P.box(0.62, 0.48, 0.03, x, 1.0, z, "#f4f1ea", a);
      P.box(0.44, 0.3, 0.01, x - fx * 0.02, 1.08, z - fz * 0.02, ["#3e8a86", "#e8b93a", "#d8433d", "#2f6fb5", "#7fae45", "#8a62d1", "#f28c28"][i], a);
      P.box(0.58, 0.04, 0.08, x - fx * 0.04, 0.96, z - fz * 0.04, "#8a6a52", a);
      S(x - fx * 0.65, z - fz * 0.65, a, "board");
    });
    for (let i = 0; i < 7; i++) {
      const x = -hw + 0.9 + i * ((2 * hw - 2) / 6), c = ["#2f6fb5", "#e8b93a", "#3e8a86", "#d8433d", "#8a62d1", "#7fae45", "#f28c28"][i];
      P.box(0.9, 0.7, 0.04, x, 1.5 + (i % 2) * 0.2, -hd + 0.15, "#6b4a35"); P.box(0.78, 0.58, 0.01, x, 1.56 + (i % 2) * 0.2, -hd + 0.18, c);
      P.box(0.4, 0.2, 0.01, x - 0.1, 1.7 + (i % 2) * 0.2, -hd + 0.19, "#f4f1ea");
    }
    for (let i = 0; i < 3; i++) { const z = 1.0 + i * 1.6; P.box(0.04, 0.8, 1.1, -hw + 0.15, 1.5, z, "#6b4a35"); P.box(0.01, 0.68, 0.98, -hw + 0.18, 1.56, z, ["#7a6a9a", "#3e8a86", "#e8b93a"][i]); }
    const pz = Math.max(coreZ + 0.9, 2.4);
    P.box(1.6, 0.85, 0.7, xr - 1.2, 0.06, pz, "#d9d4ca");
    for (let i = 0; i < 6; i++) P.cyl(0.05, 0.05, 0.1, xr - 1.8 + i * 0.22, 0.91, pz, ["#d8433d", "#2f6fb5", "#e8b93a", "#3e8a86", "#f4f1ea", "#1d1d22"][i], 8);
    for (let i = 0; i < 2; i++) { P.cyl(0.07, 0.06, 0.16, xr - 1.4 + i * 0.4, 0.91, pz - 0.2, "#cfe6ef", 8); for (let j = 0; j < 4; j++) P.box(0.01, 0.3, 0.01, xr - 1.42 + i * 0.4 + j * 0.015, 1.0, pz - 0.2, "#8a6a52"); }
    P.box(1.0, 0.85, 0.55, xr - 1.0, 0.06, pz + 2.0, "#f4f1ea"); P.box(0.6, 0.06, 0.35, xr - 1.0, 0.86, pz + 2.0, "#9aa3ad"); P.cyl(0.015, 0.015, 0.3, xr - 1.0, 0.9, pz + 1.8, "#c9ced4", 6);
    S(xr - 1.2, pz + 0.75, Math.PI, "counter");
  } else {
    // Yelken Atölyesi: yere serili büyük üçgen yelken bezi (dikiş çizgileri) ve başında diz çökmüş ustalar,
    // dikiş makinesi masaları, sehpalar üstünde yontulan direk (marangoz işi), rulo kumaşlar, askıda yarım
    // yelken, halat makaraları ve duvarda yelken çizimleri.
    P.box(W, 0.012, 2 * hd - 0.3, X, 0.06, 0, "#d9d4ca");
    const tri = new THREE.Shape([new THREE.Vector2(-3.2, -1.8), new THREE.Vector2(3.0, -1.6), new THREE.Vector2(-2.6, 2.2)]);
    P.geo(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), "#f4f1ea", -0.8, 0.075, 0.6);
    for (let i = 0; i < 5; i++) P.box(5.4 - i * 1.0, 0.004, 0.02, -0.9 - i * 0.12, 0.08, 0.4 + i * 0.32, "#c9c2b6", -0.05);
    P.box(0.3, 0.004, 0.3, 1.9, 0.08, 1.9, "#c9c2b6", 0.6); P.box(0.3, 0.004, 0.3, -3.6, 0.08, 2.4, "#c9c2b6", 0.6);
    S(1.6, 2.5, Math.PI, "bench"); S(-3.0, -1.6, 0.4, "bench"); S(-1.0, 3.1, Math.PI, "bench");
    const nm = Math.max(2, Math.min(4, Math.floor((2 * hw - 1.2) / 2.4)));
    for (let i = 0; i < nm; i++) {
      const x = -hw + 1.4 + i * 2.4, z = -hd + 1.6;
      P.box(1.4, 0.05, 0.7, x, 0.74, z, "#e6e1d6"); for (const dx of [-0.6, 0.6]) P.box(0.05, 0.72, 0.6, x + dx, 0.02, z, "#3c4148");
      P.box(0.45, 0.22, 0.2, x - 0.1, 0.79, z - 0.1, "#2a2f38"); P.box(0.12, 0.3, 0.2, x - 0.3, 0.79, z - 0.1, "#2a2f38");
      P.box(0.6, 0.02, 0.5, x + 0.3, 0.79, z, "#f4f1ea");
      P.box(0.42, 0.05, 0.42, x, 0.47, z + 0.55, "#2f5d8a");
      S(x, z + 0.55, Math.PI, "desk");
    }
    // Direk tezgâhı: iki sehpa üstünde uzun ahşap direk, yanında rendeler; marangozlar burada çalışır.
    const mz = hd - 2.0, mx0 = -hw + 1.2, mx1 = 0.2;
    for (const x of [mx0 + 0.6, mx1 - 0.6]) { P.box(0.08, 0.7, 0.6, x, 0.06, mz, "#7a5638"); P.box(0.5, 0.08, 0.6, x, 0.76, mz, "#8a6040"); }
    P.geo(new THREE.CylinderGeometry(0.11, 0.14, mx1 - mx0, 10).rotateZ(Math.PI / 2), "#c9a26a", (mx0 + mx1) / 2, 0.95, mz);
    for (let i = 0; i < 5; i++) P.ball(0.12, mx0 + 0.8 + i * 0.6, 0.065, mz + 0.5, "#e2c79a", 6, 0.08);
    S(mx0 + 1.4, mz + 0.65, Math.PI, "bench"); S(mx1 - 1.2, mz - 0.65, 0, "bench");
    for (let i = 0; i < 5; i++) P.geo(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 12).rotateZ(Math.PI / 2), ["#f4f1ea", "#e8e2d6", "#2f5d8a", "#d8433d", "#f4f1ea"][i], 3.6 + (i % 2) * 0.3, 0.22 + Math.floor(i / 2) * 0.3, hd - 0.6 - (i % 2) * 0.35);
    const hz = Math.max(coreZ + 1.6, 0.5);
    // Askıdaki yarım yelken: tavandaki rayın altında, cepheye dönük (dikiş payları çizgili).
    P.box(3.0, 0.05, 0.05, xr - 1.8, 2.6, hz, "#9aa3ad");
    for (let i = 0; i < 3; i++) P.box(2.2 - i * 0.7, 0.012, 0.012, xr - 3.25 + (2.2 - i * 0.7) / 2, 2.2 - i * 0.5, hz + 0.012, "#c9c2b6");
    add(0, 0, 0, xr - 3.3, 2.58, hz, null, 0, { geo: new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.7, 0), new THREE.Vector2(0, -2.0)])), material: new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.9, side: THREE.DoubleSide }) });
    for (let i = 0; i < 3; i++) { P.cyl(0.25, 0.25, 0.28, 4.6 + i * 0.7, 0.06, 1.6, "#c9a26a", 12); P.cyl(0.06, 0.06, 0.32, 4.6 + i * 0.7, 0.06, 1.6, "#6b4a35", 8); P.ring(0.2, 0.05, 4.6 + i * 0.7, 0.36, 1.6, "#d9c49a"); }
    for (let i = 0; i < 3; i++) { P.box(1.1, 0.8, 0.02, -hw + 2.4 + i * 1.4, 1.6, -hd + 0.15, "#f4f1ea"); P.box(0.02, 0.6, 0.01, -hw + 2.2 + i * 1.4, 1.7, -hd + 0.17, "#2f5d8a"); P.box(0.5, 0.02, 0.01, -hw + 2.45 + i * 1.4, 1.72, -hd + 0.17, "#2f5d8a"); }
  }
  flush(T, P);
}

// --- çarşı dükkânları (zemin kat) ---

function carsiShop(T) {
  const { hw, hd, add, xr, coreZ } = T;
  const P = props();
  const t = T.b.dukkan;
  // Çekirdek önündeki açık şerit: çekirdeğin önündeki saksıyı (coreZ + 0.9) geçtikten sonra boş.
  const zf = coreZ + 1.5, sx = Math.min(xr - 0.8, hw + 1.35);
  /** Duvar rafı: arka duvar boyunca (axis "x") ya da sol duvar boyunca (axis "z"); dolgu fill(px, y, pz, i, r). */
  const shelfWall = (axis, a0, a1, rows, fill, wood = "#8a6a52", deep = 0.36) => {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    const at = (u, v) => (axis === "x" ? [u, -hd + 0.15 + v] : [-hw + 0.15 + v, u]);
    const [bx, bz] = at(mid, 0.03), [sx, sz] = at(mid, deep / 2 + 0.05);
    const bw = axis === "x" ? [len, 0.05] : [0.05, len], sw = axis === "x" ? [len, deep] : [deep, len];
    P.box(bw[0], 0.35 + rows * 0.42, bw[1], bx, 0.06, bz, wood);
    P.box(sw[0], 0.14, sw[1], sx, 0.06, sz, wood);
    for (let r = 0; r < rows; r++) {
      P.box(sw[0], 0.03, sw[1], sx, 0.35 + r * 0.42, sz, wood);
      const n = Math.floor(len / 0.24);
      for (let i = 0; i < n; i++) { const [px, pz] = at(a0 + 0.12 + i * (len / n), deep / 2 + 0.05); fill(px, 0.38 + r * 0.42, pz, i, r); }
    }
  };
  const floor = (c) => P.box(2 * hw - 0.3, 0.012, 2 * hd - 0.3, 0, 0.06, 0, c);
  /** Satış tezgâhı: kapının sağında, ana alanın sağ kenarında (uzun kenarı derinlik boyunca). */
  const till = (c = "#8a6a52", top = "#d9d4ca") => {
    const x = hw - 0.75, z = hd - 2.4;
    P.box(0.7, 0.95, 1.8, x, 0.06, z, c); P.box(0.75, 0.04, 1.85, x, 1.01, z, top);
    P.box(0.3, 0.22, 0.25, x, 1.05, z - 0.5, "#2a2f38");
    add(0.02, 0.15, 0.2, x - 0.16, 1.1, z - 0.5, null, 0, { material: glow("#7fb0e0"), shadow: false });
  };
  const RAINBOW = ["#d8433d", "#2f6fb5", "#e8b93a", "#3e8a86", "#f4f1ea", "#8a62d1", "#f28c28", "#7fae45"];
  if (t === "berber") {
    // Arka duvar boyunca aynalı berber koltukları (hidrolik ayak, kırmızı deri), aynaların altında alet rafı,
    // sol duvarda lavabo ve havlu dolabı, önde bekleme koltukları ve sehpada dergiler, kapı yanında askılık.
    floor("#e9e5dd");
    for (let i = 0; i < Math.floor((2 * hd - 0.3) / 0.6); i++) for (let j = 0; j < Math.floor((2 * hw - 0.3) / 0.6); j++) if ((i + j) % 2) P.box(0.6, 0.004, 0.6, -hw + 0.45 + j * 0.6, 0.072, -hd + 0.45 + i * 0.6, "#3a3f47");
    const n = Math.max(2, Math.floor((2 * hw - 1.2) / 1.7));
    for (let i = 0; i < n; i++) {
      const x = -hw + 1.2 + i * 1.7, z = -hd + 1.5;
      P.box(1.0, 1.2, 0.04, x, 0.95, -hd + 0.16, "#cfe6ef"); P.box(1.1, 1.3, 0.03, x, 0.9, -hd + 0.14, "#2a2f38");
      P.box(1.2, 0.05, 0.32, x, 0.85, -hd + 0.32, "#f4f1ea");
      for (let j = 0; j < 4; j++) P.cyl(0.035, 0.035, 0.14, x - 0.4 + j * 0.25, 0.9, -hd + 0.32, RAINBOW[(i + j) % 8], 8);
      P.cyl(0.28, 0.32, 0.06, x, 0.06, z, "#c9ced4", 14); P.cyl(0.07, 0.07, 0.3, x, 0.12, z, "#c9ced4", 8);
      P.box(0.62, 0.14, 0.6, x, 0.42, z, "#8a2f3a"); P.box(0.62, 0.75, 0.12, x, 0.5, z + 0.3, "#8a2f3a");
      for (const dx of [-0.32, 0.32]) P.box(0.08, 0.08, 0.5, x + dx, 0.62, z, "#c9ced4");
      P.box(0.3, 0.08, 0.2, x, 0.16, z - 0.42, "#3a3f47");
    }
    // Lavabo ve havlu dolabı (sol duvar).
    P.box(0.6, 0.9, 1.4, -hw + 0.45, 0.06, 0.2, "#f4f1ea"); P.cyl(0.22, 0.18, 0.12, -hw + 0.45, 0.88, 0.2, "#d9dde2", 12);
    P.box(0.4, 1.6, 0.9, -hw + 0.35, 0.06, -1.3, "#6b4a35");
    for (let i = 0; i < 6; i++) P.box(0.3, 0.12, 0.25, -hw + 0.4, 0.4 + Math.floor(i / 2) * 0.4, -1.55 + (i % 2) * 0.45, "#f4f1ea");
    // Bekleme köşesi: iki ikili koltuk, ortada sehpa ve dergiler.
    for (const z of [2.2, 3.6]) { P.box(0.7, 0.42, 1.3, -hw + 0.55, 0.06, z, "#2a2f38"); P.box(0.18, 0.4, 1.3, -hw + 0.28, 0.48, z, "#2a2f38"); for (const dz of [-0.33, 0.33]) T.guests.push(T.spot(-hw + 0.65, z + dz, Math.PI / 2, "guest")); }
    P.box(0.6, 0.4, 0.9, -hw + 1.6, 0.06, 2.9, "#a87a50");
    for (let i = 0; i < 3; i++) P.box(0.3, 0.02, 0.22, -hw + 1.55 + (i % 2) * 0.05, 0.47 + i * 0.02, 2.7 + i * 0.18, RAINBOW[i * 2], 0.2 * i);
    P.cyl(0.02, 0.02, 1.8, 0.0, 0.06, hd - 0.6, "#3a3f47", 6); for (let i = 0; i < 3; i++) P.ball(0.12, 0.08 * Math.cos(i * 2), 1.7, hd - 0.6 + 0.08 * Math.sin(i * 2), ["#2a2f38", "#8a5a3a", "#3e5a32"][i], 6, 1.4);
    // Berber direği: kapı yanında duvarda kırmızı-beyaz-mavi şeritli silindir.
    for (let i = 0; i < 6; i++) P.cyl(0.08, 0.08, 0.15, hw - 0.3, 1.2 + i * 0.15, -hd + 0.25, ["#d8433d", "#f4f1ea", "#2f6fb5"][i % 3], 10);
    till("#2a2f38", "#f4f1ea");
  } else if (t === "terzi") {
    // Arka duvarda top top kumaş rafları, ortada iki kesim masası (makas, mezura), sol duvarda dikiş makineleri,
    // önde mankenler ve askılı elbise rayı, çekirdek önünde perdeli prova kabini.
    floor("#c9b8a2");
    shelfWall("x", -hw + 0.3, hw - 0.3, 4, (x, y, z, i, r) => P.geo(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8).rotateX(Math.PI / 2), RAINBOW[(i * 3 + r) % 8], x, y + 0.09, z), "#7a5638", 0.34);
    for (const x of [-hw + 2.0, -hw + 2.0 + Math.min(3.2, 2 * hw - 4.2)]) {
      P.box(2.0, 0.85, 1.0, x, 0.06, -1.6, "#a87a50"); P.box(2.05, 0.04, 1.05, x, 0.91, -1.6, "#c9a26a");
      P.box(1.3, 0.01, 0.7, x - 0.1, 0.955, -1.6, RAINBOW[Math.round(x * 3) & 7], 0.1);
      P.box(0.22, 0.015, 0.06, x + 0.6, 0.97, -1.4, "#9aa3ad", 0.6); P.cyl(0.06, 0.06, 0.03, x + 0.7, 0.955, -1.85, "#e8b93a", 10);
    }
    for (let i = 0; i < 2; i++) {
      const z = 0.8 + i * 1.6;
      P.box(0.7, 0.05, 1.2, -hw + 0.55, 0.74, z, "#e6e1d6"); for (const dz of [-0.5, 0.5]) P.box(0.6, 0.72, 0.05, -hw + 0.55, 0.02, z + dz, "#3c4148");
      P.box(0.2, 0.22, 0.45, -hw + 0.45, 0.79, z - 0.1, "#2a2f38"); P.box(0.2, 0.3, 0.12, -hw + 0.45, 0.79, z - 0.3, "#2a2f38");
      P.box(0.42, 0.05, 0.42, -hw + 1.15, 0.47, z, "#2f5d8a");
    }
    for (let i = 0; i < 3; i++) {
      const x = -1.2 + i * 1.1, z = hd - 1.2;
      P.cyl(0.18, 0.2, 0.04, x, 0.06, z, "#3a3f47", 10); P.cyl(0.02, 0.02, 0.9, x, 0.1, z, "#3a3f47", 6);
      P.geo(new THREE.CylinderGeometry(0.17, 0.14, 0.62, 10), ["#f4f1ea", "#2f4a6d", "#8a2f3a"][i], x, 1.3, z); P.ball(0.06, x, 1.65, z, "#3a3f47", 6);
    }
    P.box(0.03, 0.03, 2.4, -hw + 0.3, 1.75, hd - 1.6, "#9aa3ad");
    for (let i = 0; i < 7; i++) P.box(0.06, 0.95, 0.42, -hw + 0.3, 0.8, hd - 2.7 + i * 0.32, ["#2f4a6d", "#8a2f3a", "#3e5a32", "#f4f1ea", "#5a4a3a", "#7a6a9a", "#1d1d22"][i]);
    const fx = sx, fz = zf + 0.7;
    P.box(1.2, 0.05, 1.2, fx, 2.1, fz, "#6b4a35"); P.box(0.04, 2.0, 1.2, fx + 0.6, 0.06, fz, "#6b4a35");
    P.box(1.2, 1.9, 0.03, fx, 0.15, fz + 0.6, "#8a2f3a"); P.box(0.04, 1.9, 1.2, fx - 0.6, 0.15, fz, "#8a2f3a");
    till();
  } else if (t === "cicekci") {
    // Arka duvarda kademeli kova sehpaları, ortada üç katlı yuvarlak saksı kulesi, sol duvarda camlı çiçek
    // soğutucusu, ön camın önünde yerde kova kova kesme çiçek, tavandan asma saksılar; sarma tezgâhı.
    floor("#d9d4ca");
    const BLOOM = ["#e05a6a", "#f2c230", "#f4f1ea", "#9a6ad8", "#f28c5a", "#d8433d"];
    const bucket = (x, y, z, k2) => {
      P.cyl(0.14, 0.11, 0.25, x, y, z, "#9aa3ad", 8); P.box(0.02, 0.35, 0.02, x, y + 0.1, z, "#4f7d3e");
      for (let j = 0; j < 5; j++) P.ball(0.07, x - 0.07 + (j % 3) * 0.07, y + 0.42 + (j > 2 ? 0.07 : 0), z - 0.04 + (j > 2 ? 0.08 : 0), BLOOM[(k2 + j) % 6], 5);
    };
    for (let r = 0; r < 3; r++) {
      const z = -hd + 0.5 + r * 0.45, y = 0.06 + (2 - r) * 0.35;
      P.box(2 * hw - 1.0, y - 0.06, 0.42, 0, 0.06, z, "#8a6a52");
      for (let i = 0; i < Math.floor((2 * hw - 1.4) / 0.5); i++) bucket(-hw + 0.8 + i * 0.5, y, z, i + r);
    }
    const tx = -0.6, tz = 0.2;
    for (let l = 0; l < 3; l++) {
      const R = 1.1 - l * 0.35;
      P.cyl(R, R, 0.05, tx, 0.4 + l * 0.42, tz, "#8a6a52", 18);
      const n = Math.max(3, Math.round(R * 6));
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = tx + Math.cos(a) * (R - 0.18), z = tz + Math.sin(a) * (R - 0.18); P.cyl(0.11, 0.08, 0.16, x, 0.45 + l * 0.42, z, "#b5653f", 8); P.ball(0.13, x, 0.68 + l * 0.42, z, i % 2 ? "#5f8f4a" : BLOOM[(i + l) % 6], 6, 0.9); }
    }
    P.cyl(0.08, 0.08, 1.3, tx, 0.06, tz, "#6b4a35", 8);
    P.box(0.75, 2.0, 2.2, -hw + 0.5, 0.06, 1.0, "#dfe4e8");
    add(0.02, 1.6, 2.0, -hw + 0.9, 0.25, 1.0, null, 0, { material: GLASS, shadow: false });
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) bucket(-hw + 0.5, 0.3 + r * 0.55, 0.15 + i * 0.34, i + r * 2);
    for (let i = 0; i < 6; i++) bucket(-hw + 0.8 + i * 0.5, 0.06, hd - 0.6, i * 2);
    for (let i = 0; i < 3; i++) { const x = -hw + 1.5 + i * 1.6, z = 2.6; P.cyl(0.006, 0.006, 0.7, x, 2.2, z, "#3a3f47", 4); P.cyl(0.18, 0.12, 0.2, x, 2.0, z, "#c9a26a", 8); P.ball(0.22, x, 1.95, z, "#4f7d3e", 6, 1.3); }
    plant(P, 0.8, hd - 0.8, 1.3); plant(P, hw - 0.6, hd - 0.8, 1.6);
    till("#a87a50", "#f2e8d0");
  } else if (t === "kuyumcu") {
    // Açık mermer zemin ve koyu halı, U biçiminde camlı vitrinler (kadife üstünde altın ve gümüş), arka duvarda
    // altın çerçeveli aynalar, köşede çelik kasa, ortada müşteri masası, tavanda avize.
    floor("#e9e2d6"); P.box(2 * hw - 4, 0.014, 3.6, -0.2, 0.062, 1.6, "#5a1e2a"); P.box(2 * hw - 4.4, 0.016, 3.2, -0.2, 0.062, 1.6, "#7a2a3a");
    const vitrin = (x, z, w, rot) => {
      P.box(w, 0.9, 0.6, x, 0.06, z, "#2a2f38", rot); P.box(w - 0.06, 0.02, 0.54, x, 0.96, z, "#5a1e2a", rot);
      add(w, 0.22, 0.58, x, 0.96, z, null, rot, { material: GLASS, shadow: false });
      const n = Math.floor(w / 0.24), ca = Math.cos(rot), sa = Math.sin(rot);
      for (let i = 0; i < n; i++) { const o = -w / 2 + 0.12 + i * (w / n), px = x + o * ca, pz = z - o * sa; if (i % 3 === 2) P.cyl(0.04, 0.04, 0.12, px, 0.98, pz, i % 2 ? "#e8c23a" : "#d9dde2", 8); else P.ring(0.06, 0.012, px, 0.99, pz, i % 4 ? "#e8c23a" : "#d9dde2"); }
    };
    vitrin(-0.3, -hd + 1.4, 2 * hw - 2.4, 0);
    vitrin(-hw + 0.7, 0.2, Math.min(4.0, 2 * hd - 5), Math.PI / 2);
    vitrin(-0.2, -1.2, Math.min(2.4, 2 * hw - 4), 0); // ortada serbest duran ada vitrin
    for (let i = 0; i < Math.max(2, Math.floor((2 * hw - 2) / 1.6)); i++) { const x = -hw + 1.4 + i * 1.6; P.box(1.0, 1.1, 0.04, x, 1.2, -hd + 0.15, "#c9a24a"); P.box(0.86, 0.96, 0.02, x, 1.27, -hd + 0.18, "#cfe6ef"); }
    P.box(0.8, 1.1, 0.7, hw - 0.6, 0.06, -hd + 0.5, "#3a3f47"); P.cyl(0.12, 0.12, 0.04, hw - 0.6, 0.6, -hd + 0.86, "#9aa3ad", 12);
    P.cyl(0.4, 0.4, 0.04, -0.2, 0.74, 1.8, "#f4f1ea", 16); P.cyl(0.04, 0.04, 0.7, -0.2, 0.06, 1.8, "#c9a24a", 8);
    for (const dx of [-0.65, 0.65]) { P.cyl(0.2, 0.2, 0.05, -0.2 + dx, 0.45, 1.8, "#5a1e2a", 12); P.cyl(0.02, 0.02, 0.4, -0.2 + dx, 0.06, 1.8, "#c9a24a", 6); T.guests.push(T.spot(-0.2 + dx, 1.8, dx > 0 ? -Math.PI / 2 : Math.PI / 2, "guest")); }
    P.cyl(0.006, 0.006, 0.4, -0.2, 2.5, 1.6, "#c9a24a", 4); P.ring(0.35, 0.03, -0.2, 2.3, 1.6, "#c9a24a"); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.ball(0.05, -0.2 + Math.cos(a) * 0.35, 2.22, 1.6 + Math.sin(a) * 0.35, "#f4f1ea", 6, 1.5); }
    plant(P, sx, zf + 0.6, 1.4, "#3e6b2a", "#2a2f38");
    till("#2a2f38", "#c9a24a");
  } else {
    // Kırtasiye, aktar, nalbur, kitabevi: arka ve sol duvar boydan boya raf (dolgusu türüne göre), ortada iki
    // sergi adası, köşede türüne özgü eşya, kapı yanında tezgâh.
    const D = {
      kirtasiye: { floor: "#e9e5dd", wood: "#e6e1d6", c: RAINBOW },
      aktar: { floor: "#c9a77a", wood: "#6b4a35", c: ["#b5532f", "#d9822b", "#e8c27a", "#7fae45", "#6b4a35", "#a8323a"] },
      nalbur: { floor: "#a7aaae", wood: "#5a5f66", c: ["#9aa3ad", "#5a5f66", "#d8433d", "#e8b93a", "#2f6fb5", "#3a3f47"] },
      kitapci: { floor: "#c9b8a2", wood: "#6b4a35", c: ["#2f4a6d", "#8a2f3a", "#3e5a32", "#e8b93a", "#f4f1ea", "#6b4a35", "#7a6a9a"] },
    }[t] ?? { floor: "#d8c6a8", wood: "#8a6a52", c: RAINBOW };
    floor(D.floor);
    const fill = t === "kitapci"
      ? (x, y, z, i, r, ax) => { for (let j = 0; j < 4; j++) { const h = 0.26 + ((i + j + r) % 3) * 0.04, o = -0.09 + j * 0.06; ax ? P.box(0.24, h, 0.05, x, y, z + o, D.c[(i * 4 + j + r) % D.c.length]) : P.box(0.05, h, 0.24, x + o, y, z, D.c[(i * 4 + j + r) % D.c.length]); } }
      : t === "aktar"
        ? (x, y, z, i, r) => { P.cyl(0.07, 0.07, 0.2, x, y, z, "#e8f2f6", 8); P.cyl(0.06, 0.06, 0.16, x, y + 0.01, z, D.c[(i + r) % D.c.length], 8); P.cyl(0.075, 0.075, 0.03, x, y + 0.2, z, "#6b4a35", 8); }
        : t === "nalbur"
          ? (x, y, z, i, r) => P.box(0.2, 0.14 + ((i + r) % 2) * 0.08, 0.26, x, y, z, ["#c9a26a", "#d9c49a", "#3a3f47", "#d8433d"][(i + r) % 4])
          : (x, y, z, i, r) => P.box(0.18, 0.22 + ((i + r) % 3) * 0.04, 0.24, x, y, z, D.c[(i * 3 + r) % D.c.length]);
    shelfWall("x", -hw + 0.3, hw - 0.3, t === "kitapci" ? 5 : 4, (x, y, z, i, r) => fill(x, y, z, i, r, false), D.wood);
    shelfWall("z", -hd + 0.8, hd - 1.0, t === "kitapci" ? 5 : 4, (x, y, z, i, r) => fill(x, y, z, i, r, true), D.wood);
    for (const z of [-1.6, 1.4]) {
      P.box(Math.min(3.4, 2 * hw - 3), 0.8, 1.0, -0.4, 0.06, z, D.wood);
      for (let i = 0; i < 10; i++) {
        const x = -0.4 - 1.4 + (i % 5) * 0.7, zz = z - 0.25 + Math.floor(i / 5) * 0.5;
        if (t === "aktar") { P.cyl(0.26, 0.28, 0.08, x, 0.86, zz, "#d9c49a", 10); P.cyl(0.24, 0.24, 0.05, x, 0.92, zz, D.c[i % D.c.length], 10); }
        else if (t === "nalbur") { P.cyl(0.13, 0.13, 0.22, x, 0.86, zz, ["#f4f1ea", "#2f6fb5", "#d8433d", "#e8b93a"][i % 4], 10); P.cyl(0.13, 0.13, 0.2, x, 1.08, zz, ["#e8b93a", "#f4f1ea", "#2f6fb5", "#d8433d"][i % 4], 10); }
        else for (let j = 0; j < 1 + (i % 3); j++) P.box(0.26, 0.05, 0.36, x, 0.86 + j * 0.05, zz, D.c[(i + j) % D.c.length], 0.1 * ((i + j) % 3));
      }
    }
    if (t === "aktar") for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) P.ball(0.04, -hw + 1.5 + i * 1.0, 2.35 - j * 0.11, 0.0, j % 2 ? "#a8231a" : "#c9301a", 5, 1.6);
    if (t === "nalbur") {
      for (let i = 0; i < 3; i++) P.ring(0.3, 0.05, 0.9 + i * 0.75, 0.12, hd - 1.0, ["#3e8a5a", "#e8b93a", "#3a3f47"][i]);
      for (const s of [-1, 1]) T.add(0.05, 2.2, 0.05, hw - 0.5 + s * 0.22, 0.06, -hd + 1.5, "#c9ced4", 0, { geo: new THREE.BoxGeometry(0.05, 2.2, 0.05).rotateX(-0.25).translate(0, 1.08, 0) });
      for (let k2 = 0; k2 < 6; k2++) P.box(0.44, 0.03, 0.04, hw - 0.5, 0.3 + k2 * 0.33, -hd + 1.5 + 0.08 + k2 * 0.085, "#c9ced4");
    }
    if (t === "kitapci") {
      const ax = sx, az = zf + 0.5;
      P.box(0.8, 0.42, 0.8, ax, 0.06, az, "#8a2f3a"); P.box(0.8, 0.5, 0.18, ax, 0.48, az - 0.32, "#8a2f3a"); for (const dx of [-0.36, 0.36]) P.box(0.12, 0.25, 0.8, ax + dx, 0.48, az, "#8a2f3a");
      T.guests.push(T.spot(ax, az + 0.05, 0, "guest"));
      kilim(P, ax, az + 0.4, 1.6, 1.8, "#7a6a9a", "#3a2f4a", "#e8b93a");
    }
    if (t === "kirtasiye") {
      const px = sx, pz = zf + 0.5;
      P.box(0.9, 0.95, 0.7, px, 0.06, pz, "#d9dde2"); P.box(0.9, 0.1, 0.7, px, 1.01, pz, "#9aa3ad");
      add(0.3, 0.02, 0.2, px, 1.12, pz + 0.15, null, 0, { material: glow("#7fe0a0"), shadow: false });
      for (let i = 0; i < 4; i++) P.box(0.32, 0.4, 0.14, -hw + 1.0 + i * 0.5, 1.9, hd - 0.4, RAINBOW[i * 2]);
    }
    till(D.wood);
  }
  flush(T, P);
}
