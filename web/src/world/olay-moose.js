// Moose in town (17 Nov evening, user: "olay çeşitliliği ve dikkat çekicilik çok önemli"; interface olay-moduller.js;
// Driftwood only). A bull moose steps out of the woods, follows the paths into town, walks down Main Street (stopping now
// and then to look around), browses at a tree (or grazes) for a while, turns round and walks back into the woods.
// Neighbors keep their distance and take photos; people standing in its way step aside (tahliye); if there is traffic,
// cars stop at the junctions it is near (kapali). Everything is a pure function of (minute, seed, world): the video
// redraws any second identically.
import * as THREE from "three";
import { kesir } from "./olay-plan.js";
import { adaylar, gorevler, yerlerSec, izleDurus, agaclar, agacIzgara, pusula } from "./olay-izleyici.js";

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => Math.max(0, Math.min(1, u));

/** Polyline helpers: cumulative lengths, point and heading at distance s. */
function cizgi(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function noktaAt(c, s, out) {
  s = Math.max(0, Math.min(c.len, s));
  let k = 1;
  while (k < c.cum.length - 1 && c.cum[k] < s) k++;
  const a = c.pts[k - 1], b = c.pts[k], f = (s - c.cum[k - 1]) / Math.max(1e-6, c.cum[k] - c.cum[k - 1]);
  out.x = a[0] + (b[0] - a[0]) * f; out.z = a[1] + (b[1] - a[1]) * f; out.h = Math.atan2(b[0] - a[0], b[1] - a[1]);
  return out;
}

/** Low-poly bull moose (≈3 m long, 1.9 m at the shoulder): humped dark body, long pale legs, drooping muzzle, dewlap,
 *  wide palmate antlers. Legs and head are pivots (gait, head bob, browsing). */
function mooseModel() {
  const koyu = new THREE.MeshStandardMaterial({ color: "#3a281c", roughness: 0.95 });
  const orta = new THREE.MeshStandardMaterial({ color: "#5a4030", roughness: 0.95 });
  const bacak = new THREE.MeshStandardMaterial({ color: "#9a8468", roughness: 0.95 });
  const boynuzM = new THREE.MeshStandardMaterial({ color: "#d8c49a", roughness: 0.8 });
  const tirnak = new THREE.MeshStandardMaterial({ color: "#1d1a17", roughness: 0.8 });
  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; return o; };
  const g = new THREE.Group();
  const govde = new THREE.Group();
  // Deep chest and shoulder hump in front, narrower rump behind (moose silhouette), belly ~1.2 m above the ground.
  govde.add(box(0.85, 0.85, 2.0, koyu, 0, 1.68, -0.05), box(0.92, 0.95, 0.95, koyu, 0, 1.78, 0.55), box(0.7, 0.45, 0.85, koyu, 0, 2.3, 0.5, 0.2),
    box(0.78, 0.75, 0.6, orta, 0, 1.68, -0.95, -0.12), box(0.14, 0.18, 0.12, orta, 0, 1.85, -1.3));
  g.add(govde);
  // Neck + head pivot at the front of the shoulders.
  const bas = new THREE.Group();
  bas.position.set(0, 2.05, 1.0);
  bas.add(box(0.5, 0.55, 0.75, koyu, 0, 0.05, 0.3, -0.5)); // neck (forward and up)
  const kafa = new THREE.Group();
  kafa.position.set(0, 0.32, 0.62);
  kafa.add(box(0.42, 0.42, 0.6, orta, 0, 0, 0.18), box(0.38, 0.36, 0.42, orta, 0, -0.12, 0.62, 0.35), box(0.36, 0.14, 0.18, koyu, 0, -0.26, 0.82, 0.35)); // head, muzzle, nose
  kafa.add(box(0.08, 0.45, 0.16, koyu, 0, -0.45, 0.15)); // dewlap ("bell")
  kafa.add(box(0.1, 0.24, 0.06, orta, 0.24, 0.24, -0.05, 0, 0, -0.6), box(0.1, 0.24, 0.06, orta, -0.24, 0.24, -0.05, 0, 0, 0.6)); // ears
  // Palmate antlers: a broad flat palm on each side with tines along the outer edge.
  for (const s of [1, -1]) {
    const b = new THREE.Group();
    b.position.set(0.18 * s, 0.24, 0.02);
    b.add(box(0.5, 0.06, 0.12, boynuzM, 0.25 * s, 0.02, 0, 0, 0, 0.25 * s)); // beam
    const palm = box(0.75, 0.06, 0.55, boynuzM, 0.75 * s, 0.22, -0.02, 0.1, 0, 0.45 * s);
    b.add(palm);
    for (let k = 0; k < 5; k++) b.add(box(0.06, 0.06, 0.28, boynuzM, (0.82 + k * 0.1) * s, 0.42 + k * 0.05, 0.28 - k * 0.14, 0, 0, 0.45 * s));
    b.add(box(0.06, 0.06, 0.32, boynuzM, 0.4 * s, 0.1, 0.3, -0.2, 0, 0.3 * s)); // brow tine
    kafa.add(b);
  }
  bas.add(kafa);
  g.add(bas);
  const bacaklar = [];
  for (const [x, z] of [[0.33, 0.78], [-0.33, 0.78], [0.33, -0.85], [-0.33, -0.85]]) {
    const p = new THREE.Group();
    p.position.set(x, 1.45, z);
    p.add(box(0.2, 0.8, 0.24, x > 0 === z > 0 ? orta : orta, 0, -0.3, 0), box(0.13, 0.72, 0.15, bacak, 0, -1.04, 0.02), box(0.15, 0.08, 0.2, tirnak, 0, -1.41, 0.04));
    g.add(p);
    bacaklar.push(p);
  }
  return { g, govde, bas, kafa, bacaklar };
}

export function buildMooseOlay({ world, scene, group, traffic }) {
  let K = null, G = null;
  const P = { x: 0, z: 0, h: 0 };

  /** Route: woods → (straight) nearest path node → shortest path over the road network → a Main Street node 90–220 m from
   *  the Town Green. Main Street is the longest road passing its label. Returns null if no woods/route. */
  function rota(o) {
    const net = world.network;
    if (!net?.nodes?.length) return null;
    const lab = (world.labels ?? []).find((l) => l.text === "Main Street");
    if (!lab) return null;
    const yakinMi = (r) => r.points.some((p) => Math.hypot(p[0] - lab.x, p[1] - lab.z) < 40);
    const ana = world.roads.filter(yakinMi).sort((a, b) => b.points.length - a.points.length)[0];
    if (!ana) return null;
    const C = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
    const nodes = net.nodes, byId = new Map(nodes.map((n) => [n.id, n]));
    const adj = new Map(nodes.map((n) => [n.id, []]));
    for (const e of net.edges) {
      const a = byId.get(e.a?.id ?? e.a), b = byId.get(e.b?.id ?? e.b);
      if (!a || !b) continue;
      let pts = e.pts.map((p) => [p[0], p[1]]);
      if (Math.hypot(pts[0][0] - a.p[0], pts[0][1] - a.p[1]) > Math.hypot(pts[pts.length - 1][0] - a.p[0], pts[pts.length - 1][1] - a.p[1])) pts = pts.reverse();
      const L = cizgi(pts).len, ana2 = e.road === ana;
      adj.get(a.id).push({ to: b.id, pts, L, ana: ana2 });
      adj.get(b.id).push({ to: a.id, pts: [...pts].reverse(), L, ana: ana2 });
    }
    const anaNodes = nodes.filter((n) => adj.get(n.id).some((q) => q.ana));
    const hedefler = anaNodes.map((n) => ({ n, dx: Math.abs(Math.hypot(n.p[0] - C[0], n.p[1] - C[1])) })).filter((q) => q.dx > 90 && q.dx < 240);
    if (!hedefler.length) return null;
    // Woods: 30 m cells with ≥ 6 trees, 180–800 m from the Green.
    const T = agaclar(world, scene), cells = new Map();
    for (const t of T) { const k = `${Math.floor(t.x / 30)},${Math.floor(t.z / 30)}`; cells.set(k, (cells.get(k) ?? 0) + 1); }
    const orman = [...cells].map(([k, n]) => { const [i, j] = k.split(",").map(Number); return { x: i * 30 + 15, z: j * 30 + 15, n }; })
      .filter((c) => c.n >= 6 && Math.hypot(c.x - C[0], c.z - C[1]) > 180 && Math.hypot(c.x - C[0], c.z - C[1]) < 800);
    const binaKesir = (a, b) => world.buildings.some((B) => {
      for (let t = 0; t <= 1; t += 0.05) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; if (Math.abs(x - B.x) < B.w / 2 + 2 && Math.abs(z - B.z) < B.d / 2 + 2) return true; }
      return false;
    });
    const dijkstra = (src) => {
      const d = new Map([[src, 0]]), prev = new Map(), open = new Set([src]);
      while (open.size) {
        let u = null; for (const k of open) if (u === null || d.get(k) < d.get(u)) u = k;
        open.delete(u);
        for (const q of adj.get(u)) { const nd = d.get(u) + q.L; if (nd < (d.get(q.to) ?? Infinity)) { d.set(q.to, nd); prev.set(q.to, { u, q }); open.add(q.to); } }
      }
      return { d, prev };
    };
    const adaylar2 = [];
    for (const f of orman) {
      // Entry node: nearest node within 160 m, straight walk without crossing a building.
      const giris = nodes.map((n) => ({ n, d: Math.hypot(n.p[0] - f.x, n.p[1] - f.z) })).filter((q) => q.d < 160).sort((a, b) => a.d - b.d).find((q) => !binaKesir([f.x, f.z], q.n.p));
      if (!giris) continue;
      const { d, prev } = dijkstra(giris.n.id);
      for (const h of hedefler) {
        const L = d.get(h.n.id);
        if (L == null) continue;
        // The last part of the walk must be along Main Street (≥ 50 m): "walked down Main Street".
        let anaL = 0, k = h.n.id;
        while (prev.has(k)) { const { u, q } = prev.get(k); if (!q.ana) break; anaL += q.L; k = u; }
        if (anaL < 50) continue;
        const top = L + giris.d;
        if (top < 220 || top > 760) continue;
        adaylar2.push({ f, giris, hedef: h.n, prev, top, puan: kesir("mooseYol", o.tohum, Math.round(f.x), Math.round(f.z), h.n.id) });
      }
    }
    if (!adaylar2.length) return null;
    adaylar2.sort((a, b) => b.puan - a.puan);
    const s = adaylar2[0];
    // Polyline: deep in the woods → woods edge → entry node → … → target node.
    const yol = [];
    let k = s.hedef.id;
    const parca = [];
    while (s.prev.has(k)) { const { u, q } = s.prev.get(k); parca.unshift(q.pts); k = u; }
    const f = s.f, gn = s.giris.n.p, dx = f.x - gn[0], dz = f.z - gn[1], dd = Math.hypot(dx, dz) || 1;
    yol.push([f.x + (dx / dd) * 30, f.z + (dz / dd) * 30], [f.x, f.z], [gn[0], gn[1]]);
    for (const p of parca) for (const q of p.slice(1)) yol.push(q);
    return { yol, f, giris: gn, hedef: s.hedef.p, ana };
  }

  function kur(o) {
    const R = rota(o);
    if (!R) return null;
    const t0 = o.bas * 60, t1 = o.son * 60, D = t1 - t0;
    const yol = cizgi(R.yol);
    const kenarS = yol.cum[1], v = 1.25, vD = 1.4;
    // Schedule (seconds): emerge, stand at the edge, walk in with two stops, browse, walk back, into the woods.
    const S = [];
    const tA = t0 + 0.15 * D, tGeri = t0 + 0.85 * D;
    S.push({ t0, t1: t0 + kenarS / 0.8, s0: 0, s1: kenarS });
    S.push({ t0: S[0].t1, t1: tA, s0: kenarS, s1: kenarS, dur: "bak" });
    const disL = yol.len - kenarS, durak = 80;
    let t = tA;
    const duraklar = [0.45, 0.8].map((u) => kenarS + disL * u);
    let s = kenarS;
    for (const sd of duraklar) { S.push({ t0: t, t1: t + (sd - s) / v, s0: s, s1: sd }); t += (sd - s) / v; S.push({ t0: t, t1: t + durak, s0: sd, s1: sd, dur: "bak" }); t += durak; s = sd; }
    S.push({ t0: t, t1: t + (yol.len - s) / v, s0: s, s1: yol.len }); t += (yol.len - s) / v;
    const tVar = t, tDon = tGeri - disL / vD;
    if (tDon - tVar < 90) return null; // route too long for the event
    S.push({ t0: tVar, t1: tDon, s0: yol.len, s1: yol.len, dur: "ye" });
    S.push({ t0: tDon, t1: tGeri, s0: yol.len, s1: kenarS });
    S.push({ t0: tGeri, t1: t1 + 1, s0: kenarS, s1: Math.max(0, kenarS - (t1 - tGeri) * 0.55) - 0 });
    // Browse: nearest tree within 14 m of the target, else graze on the grass.
    const iz = agacIzgara(agaclar(world, scene));
    const ag = iz.yakin(R.hedef[0], R.hedef[1], 14).sort((a, b) => Math.hypot(a.x - R.hedef[0], a.z - R.hedef[1]) - Math.hypot(b.x - R.hedef[0], b.z - R.hedef[1]))[0] ?? null;
    let yeYer = null;
    if (ag) { const a = Math.atan2(R.hedef[0] - ag.x, R.hedef[1] - ag.z); yeYer = { x: ag.x + Math.sin(a) * 2.6, z: ag.z + Math.cos(a) * 2.6, h: a + Math.PI, agac: ag }; }
    // Gait distance at the start of each segment (leg phase = distance / stride).
    let yd = 0; for (const q of S) { q.yd = yd; yd += Math.abs(q.s1 - q.s0); }
    const C = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
    // Landmark for the text: named building nearest the browse spot (≤ 40 m).
    const bina = world.buildings.map((b) => ({ b, d: Math.hypot(b.x - R.hedef[0], b.z - R.hedef[1]) })).filter((q) => q.d < 40 && (q.b.isim || q.b.address)).sort((a, b) => a.d - b.d)[0]?.b;
    K = { o, yol, S, t0, t1, D, tA, tVar, tDon, tGeri, R, yeYer, C, izleyen: 0, yon: pusula(Math.atan2(R.f.x - C[0], R.f.z - C[1]), "en"),
      yer: bina ? (bina.isim ?? bina.address.split(",")[0]) : null, gy: (x, z) => world.groundY?.(x, z) ?? 0 };
    if (!G) { G = mooseModel(); group.add(G.g); }
    G.g.visible = false;
    const H = R.hedef;
    // Camera: from the town side across the street toward the browse spot.
    const yonK = Math.atan2(C[0] - H[0], C[1] - H[1]) + 0.6;
    // Watchers stand on the town side of the browse spot, 18–28 m away (crowd shot from behind them, moose beyond).
    let cx = C[0] - H[0], cz = C[1] - H[1]; const cd = Math.hypot(cx, cz) || 1; cx /= cd; cz /= cd;
    K.kal = [H[0] + cx * 22, H[1] + cz * 22];
    return { odak: [H[0], H[1]], odakY: 1.6, kalabalik: K.kal, kiyi: null, yon: yonK, yerAdi: "Main Street", zaman: null,
      gitD: 55, gitEgim: 0.5, gitCanli: true, cekimOlcek: 0.75, cekimOlcekH: 0.7, kalabalikArkadan: true };
  }

  /** Moose pose at second sec: { x, z, h, yd (gait distance), dur ("" walking | bak | ye), gor }. */
  const MP = { x: 0, z: 0, h: 0, yd: 0, dur: "", gor: false, ilerle: 1 };
  function poz(sec, out) {
    out.gor = sec >= K.t0 && sec <= K.t1;
    const q = K.S.find((x) => sec < x.t1) ?? K.S[K.S.length - 1];
    const u = clamp01((sec - q.t0) / Math.max(1e-6, q.t1 - q.t0));
    const s = q.s0 + (q.s1 - q.s0) * u;
    noktaAt(K.yol, s, P);
    out.x = P.x; out.z = P.z; out.h = q.s1 < q.s0 ? P.h + Math.PI : P.h; out.yd = q.yd + Math.abs(s - q.s0); out.dur = q.dur ?? ""; out.ilerle = q.s1 < q.s0 ? -1 : 1;
    if (q.dur === "bak" || q.dur === "ye") {
      // Standing: keep the heading of the walk that led here; at the browse spot step to the tree.
      const onceki = K.S[K.S.indexOf(q) - 1];
      if (onceki) { noktaAt(K.yol, Math.max(0, q.s0 - 1), P); out.h = Math.atan2(out.x - P.x, out.z - P.z) || out.h; }
      if (q.dur === "ye" && K.yeYer) {
        const w = Math.min(ease((sec - q.t0) / 25), ease((q.t1 - sec) / 25));
        out.x += (K.yeYer.x - out.x) * w; out.z += (K.yeYer.z - out.z) * w;
        let dh = K.yeYer.h - out.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); out.h += dh * w;
        out.yd = q.yd + w * 3;
      }
      if (q.dur === "ye" && sec > q.t1 - 25) { let dh = Math.PI; out.h += dh * ease((sec - (q.t1 - 25)) / 25); } // turns round
    }
    return out;
  }

  function update(o, evre, minute, real) {
    if (!o || !K || K.o !== o) { if (G) G.g.visible = false; if (K && !o) K = null; return; }
    const sec = minute * 60;
    poz(sec, MP);
    G.g.visible = MP.gor;
    if (!MP.gor) return;
    G.g.position.set(MP.x, K.gy(MP.x, MP.z), MP.z);
    G.g.rotation.y = MP.h;
    // Gait: diagonal pairs (walk), stride 2.4 m; standing legs still.
    const yuruyor = MP.dur === "" || (MP.dur === "ye" && (sec - K.tVar < 25 || K.tDon - sec < 25));
    const ph = (MP.yd / 2.4) * Math.PI * 2;
    const sal = yuruyor ? 0.38 : 0;
    [0, Math.PI, Math.PI, 0].forEach((o2, i) => { G.bacaklar[i].rotation.x = Math.sin(ph + o2 + (i >= 2 ? 0.6 : 0)) * sal; });
    G.govde.position.y = yuruyor ? Math.abs(Math.sin(ph)) * 0.05 : 0;
    // Head: walking → bob; standing → looks round (yaw); browsing → up into the tree or down to the grass.
    let pitch = 0, yaw = 0;
    if (yuruyor) pitch = Math.sin(ph * 2) * 0.05;
    else if (MP.dur === "bak") { yaw = Math.sin(sec * 0.35) * 0.7; pitch = -0.1; }
    else if (MP.dur === "ye") {
      const c = Math.sin(sec * 0.9);
      if (K.yeYer) { pitch = -0.55 + 0.12 * c; yaw = 0.15 * Math.sin(sec * 0.4); } else { pitch = 0.9 + 0.1 * c; yaw = 0.2 * Math.sin(sec * 0.3); }
    }
    G.bas.rotation.set(pitch, yaw, 0);
  }

  function canli(minute) {
    if (!K) return null;
    const sec = minute * 60;
    if (sec < K.t0 || sec > K.t1) return null;
    poz(sec, MP);
    return [MP.x, K.gy(MP.x, MP.z) + 1.6, MP.z];
  }

  /** Watchers: on the town side of the browse spot, at a respectful distance (18–28 m), filming. */
  function gorev(people, day, S, plans) {
    if (!K) return [];
    const { o } = K, H = K.R.hedef;
    const T0 = K.tVar / 60 - 4, T1 = K.tDon / 60 + 3;
    const a = adaylar(people, day, plans, world, { T: T0, odak: H, isR: 260, uzak: 3, disari: true });
    const y = yerlerSec(world, traffic, K.kal, H, Math.min(16, a.length), 18, 28, o.tohum, { yay: 2.0, araliK: 1.4 })
      .filter((q) => !world.buildings.some((b) => Math.abs(q.x - b.x) < b.w / 2 + 1 && Math.abs(q.z - b.z) < b.d / 2 + 1));
    const kal = Math.max(6, Math.round(T1 - T0));
    const g = gorevler(people, day, a, y, { T0, dagilim: 3, kal: [kal - 2, kal], Tson: T1 + 2, modul: "moose", tavirlar: ["cek", "cek", "goster", "bak", "cek", "konus"], tuz: "m" });
    K.izleyen = g.length;
    return g;
  }

  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    if (!K) return false;
    const h = canli(minute);
    return izleDurus(it, t, p, ph, stand, idleGesture, h ? [h[0], h[1] - 0.6, h[2]] : null, K.gy(it.x, it.z));
  }

  /** People standing in its way step aside (radius 10 m), facing it; back after it has passed. */
  const R0 = 10;
  function tahliye(x, z, minute) {
    if (!K) return null;
    const sec = minute * 60;
    if (sec < K.t0 || sec > K.t1) return null;
    poz(sec, MP);
    const dx = x - MP.x, dz = z - MP.z, d = Math.hypot(dx, dz);
    if (d >= R0) return null;
    const a = Math.atan2(dx, dz) || 0, nx = MP.x + Math.sin(a) * R0, nz = MP.z + Math.cos(a) * R0;
    if (!world.isWalkable?.(nx, nz)) return null;
    return { x: nx, z: nz, heading: a + Math.PI, yuru: (R0 - d) * 1.2 };
  }

  /** Traffic stops at junctions within 35 m of the moose; cars that would overlap it are hidden. */
  const kume = new Set();
  function kapali(minute) {
    kume.clear(); // traffic.kapali may still hold this set: empty it when the moose is gone
    if (!K || !traffic?.lanes?.length) return null;
    const sec = minute * 60;
    if (sec < K.t0 || sec > K.t1) return null;
    poz(sec, MP);
    for (const n of world.network?.nodes ?? []) if (Math.hypot(n.p[0] - MP.x, n.p[1] - MP.z) < 35) kume.add(n.id);
    return kume;
  }
  function gizle(x, z, minute) {
    if (!K) return false;
    const sec = minute * 60;
    if (sec < K.t0 || sec > K.t1) return false;
    poz(sec, MP);
    return Math.hypot(x - MP.x, z - MP.z) < 5;
  }

  function ses(minute) {
    if (!K) return null;
    const sec = minute * 60;
    return sec > K.tVar - 120 && sec < K.tDon + 60 && K.izleyen ? { kalabalik: 0.3 } : null;
  }

  function yazi(o, S, minute, { saatYaz }) {
    if (!K) return null;
    const sec = minute * 60, n = K.izleyen, yer = K.yer ? ` as far as ${K.yer}` : "";
    const ye = K.yeYer ? "nibbled at the leaves of a tree" : "grazed on the grass";
    const dk = Math.round((K.tDon - K.tVar) / 60);
    const izle = n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} watched from a safe distance and took photos.` : "";
    let u = `At ${saatYaz(o.bas)} a moose stepped out of the woods ${K.yon} of town.`;
    if (sec >= K.tA && sec < K.tVar) u += ` It is walking into town along the paths toward Main Street.`;
    if (sec >= K.tVar && sec < K.tDon) u += ` It walked into town and down Main Street${yer}, and now it ${K.yeYer ? "is nibbling at the leaves of a tree" : "is grazing on the grass"}.${izle}`;
    if (sec >= K.tDon) u += ` It walked into town and down Main Street${yer}, where it ${ye} for ${dk} minutes.${izle}`;
    if (sec >= K.tDon && sec < K.tGeri) u += ` Now it is heading back the way it came.`;
    if (sec >= K.tGeri) u += ` It walked back into the woods at ${saatYaz(K.tGeri / 60)}.`;
    const kisa = sec < K.tA ? "A moose at the edge of the woods!" : sec < K.tGeri ? "A moose on Main Street!" : minute < o.son ? "The moose heads back to the woods" : `Moose in town ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`;
    return { kisa, uzun: u };
  }

  return { kur, update, canli, yazi, gorev, durus, tahliye, kapali, gizle, ses, seyirci: { r0: 16, r1: 28, isR: 0, uzak: 1, en: 0 } };
}
