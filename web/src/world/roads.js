// Yol ağı: yollar kesiştikleri yerde düğümlere bölünür. Her düğümde taşıt yolları yuvarlak bordür
// köşeleriyle birleşir, kaldırımlar köşeyi döner, yaya geçitleri ve dur çizgileri çizilir. Hiçbir yüzey
// bir başkasının üstüne binmez: her katmanın kendi yüksekliği vardır, kaldırımlar bordürlü bloklardır.
// Yollar eğimli arazide world.roadHeight ile tesviye edilmiş zemini izler.
import * as THREE from "three";
import * as T from "./textures.js";

export const H = { carriage: 0.06, marking: 0.075, walk: 0.18, ped: 0.13, trail: 0.035 };
const CURB_R = { cadde: 6, sokak: 4, koy: 5 };
const PIECE = 3;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const left = (d) => [-d[1], d[0]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

/** İki doğrunun kesişimi (p + t·d); paralelse null. */
function intersect(p, d, q, e) {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-3) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

/** İkinci dereceden Bezier eğrisi örnekleri (uçlar dahil). */
function curve(a, c, b, n = 6) {
  if (!c) return [a, b];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

function dedupe(pts) {
  const out = [pts[0]];
  for (const p of pts.slice(1)) if (len(sub(p, out[out.length - 1])) > 0.05) out.push(p);
  return out;
}

// --- ağ kurulumu ---

/** Yolları kesişim noktalarından bölerek düğüm ve kenarlardan oluşan bir ağ kurar. */
export function buildNetwork(roads) {
  const segs = [];
  roads.forEach((road, ri) => {
    for (let i = 1; i < road.points.length; i++) segs.push({ ri, i, a: road.points[i - 1], b: road.points[i], cuts: [] });
  });
  const grid = new Map();
  segs.forEach((s, k) => {
    for (let gx = Math.floor(Math.min(s.a[0], s.b[0]) / 50); gx <= Math.floor(Math.max(s.a[0], s.b[0]) / 50); gx++) {
      for (let gz = Math.floor(Math.min(s.a[1], s.b[1]) / 50); gz <= Math.floor(Math.max(s.a[1], s.b[1]) / 50); gz++) {
        const key = gx * 100003 + gz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(k);
      }
    }
  });
  const seen = new Set();
  for (const list of grid.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const k1 = Math.min(list[x], list[y]), k2 = Math.max(list[x], list[y]);
        const key = k1 * 1e6 + k2;
        if (seen.has(key)) continue;
        seen.add(key);
        const s1 = segs[k1], s2 = segs[k2];
        if (s1.ri === s2.ri && Math.abs(s1.i - s2.i) <= 1) continue;
        const d1 = sub(s1.b, s1.a), d2 = sub(s2.b, s2.a);
        const den = cross(d1, d2);
        if (Math.abs(den) < 1e-6) continue;
        const t = cross(sub(s2.a, s1.a), d2) / den;
        const u = cross(sub(s2.a, s1.a), d1) / den;
        const e1 = 0.6 / (len(d1) || 1), e2 = 0.6 / (len(d2) || 1);
        if (t < -e1 || t > 1 + e1 || u < -e2 || u > 1 + e2) continue;
        s1.cuts.push(Math.max(0, Math.min(1, t)));
        s2.cuts.push(Math.max(0, Math.min(1, u)));
      }
    }
  }

  const nodes = new Map();
  const nodeAt = (p) => {
    const key = `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
    if (!nodes.has(key)) nodes.set(key, { p: [p[0], p[1]], ends: [] });
    return nodes.get(key);
  };
  const edges = [];
  roads.forEach((road, ri) => {
    let current = [road.points[0]];
    let start = nodeAt(road.points[0]);
    const close = (p) => {
      current.push(p);
      const pts = dedupe(current);
      const end = nodeAt(p);
      if (pts.length >= 2 && end !== start) edges.push({ road, pts, a: start, b: end });
      start = end;
      current = [p];
    };
    for (const s of segs.filter((q) => q.ri === ri)) {
      const cuts = [...new Set(s.cuts.map((c) => Math.round(c * 1000) / 1000))].sort((a, b) => a - b);
      for (const c of cuts) {
        const p = add(s.a, mul(sub(s.b, s.a), c));
        if (len(sub(p, current[0])) < 0.3) continue;
        close(p);
      }
      current.push(s.b);
    }
    if (current.length >= 2) {
      const pts = dedupe(current);
      const end = nodeAt(pts[pts.length - 1]);
      if (pts.length >= 2 && end !== start) edges.push({ road, pts, a: start, b: end });
    }
  });
  for (const e of edges) {
    const n = e.pts.length;
    e.a.ends.push({ edge: e, at: "a", dir: norm(sub(e.pts[1], e.pts[0])) });
    e.b.ends.push({ edge: e, at: "b", dir: norm(sub(e.pts[n - 2], e.pts[n - 1])) });
    e.trimA = 0;
    e.trimB = 0;
  }
  const net = { nodes: [...nodes.values()], edges };
  computeTrims(net);
  // Düğüm kimlikleri ve trafik ışıkları: en az üç cadde/sokak kolu olan gerçek kavşaklar ışıklıdır.
  // Kollar iki gruba ayrılır (doğu-batı ve kuzey-güney); gruplar sırayla yeşil yanar.
  net.nodes.forEach((n, i) => {
    n.id = i;
    n.ends.forEach((e, j) => {
      e.index = j;
      e.group = Math.abs(e.dir[0]) >= Math.abs(e.dir[1]) ? 0 : 1;
    });
    const major = n.ends.filter((e) => e.edge.road.type === "cadde" || e.edge.road.type === "sokak");
    n.signal = major.length >= 3 && major.some((e) => e.trim > 0);
    n.offset = (i * 37) % 60;
  });
  // Yaya geçitleri: kavşak kollarında. İki kavşağı bağlayan kısa bir yolun iki ucuna birden geçit
  // konmaz (yan yana zebra olmasın); geçit önemli kavşakta (ışıklı, daha çok caddeli) kalır.
  const score = (n) => (n.signal ? 10 : 0) + n.ends.filter((e) => e.edge.road.type === "cadde").length;
  for (const n of net.nodes) {
    const cars = n.ends.filter((e) => isCar(e.edge.road));
    for (const e of n.ends) e.cross = isCar(e.edge.road) && e.trim > 0 && cars.length >= 2;
  }
  for (const e of net.edges) {
    const ea = e.a.ends.find((x) => x.edge === e && x.at === "a"), eb = e.b.ends.find((x) => x.edge === e && x.at === "b");
    if (!ea?.cross || !eb?.cross || e.road.type === "giris") continue;
    let L = 0;
    for (let i = 1; i < e.pts.length; i++) L += len(sub(e.pts[i], e.pts[i - 1]));
    if (L - e.trimA - e.trimB > 70) continue;
    if (score(e.a) >= score(e.b)) eb.cross = false; else ea.cross = false;
  }
  return net;
}

const isCar = (road) => road.carriage > 0;

/** Düğümde her kenarın ne kadar geriden kesileceği. */
function computeTrims(net) {
  for (const node of net.nodes) {
    const cars = node.ends.filter((e) => isCar(e.edge.road));
    for (const end of node.ends) {
      const road = end.edge.road;
      let t = 0;
      if (road.type === "giris") {
        // Otopark ve garaj girişleri ana yolun kaldırım dış kenarında biter (kaldırım kesilmez).
        for (const o of cars) if (o !== end && o.edge.road.type !== "giris") t = Math.max(t, o.edge.road.width / 2);
      } else if (isCar(road)) {
        const others = cars.filter((o) => o !== end && o.edge.road.type !== "giris");
        const straight = others.length === 1 && others[0].dir[0] * end.dir[0] + others[0].dir[1] * end.dir[1] < -0.98 && others[0].edge.road.width === road.width;
        if (others.length && !straight) {
          for (const o of others) {
            // Aynı doğrultuda devam eden yol kesmez; yalnızca kesişen (açılı) yollar hesaba girer.
            const s = Math.abs(cross(end.dir, o.dir));
            if (s < 0.3) continue;
            t = Math.max(t, o.edge.road.width / 2 / Math.max(0.5, s) + (CURB_R[road.type] ?? 3));
          }
        }
      } else {
        // Yaya yolları taşıt yolunun dış kenarında biter; daha geniş bir yaya yoluna da onun kenarında katılır.
        for (const o of node.ends) {
          if (o === end) continue;
          const r = o.edge.road;
          if (isCar(r)) t = Math.max(t, r.width / 2);
          else if (r.width > road.width) t = Math.max(t, r.width / 2);
        }
      }
      end.trim = t;
      if (end.at === "a") end.edge.trimA = t; else end.edge.trimB = t;
    }
  }
}

// --- geometri ---

class Mesh {
  constructor() {
    this.pos = [];
    this.uv = [];
  }

  tri(a, b, c, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny < 0) [b, c, ub, uc] = [c, b, uc, ub];
    for (const [p, t] of [[a, ua], [b, ub], [c, uc]]) {
      this.pos.push(p[0], p[1], p[2]);
      this.uv.push(t[0], t[1]);
    }
  }

  quad(a, b, c, d, ua, ub, uc, ud) {
    this.tri(a, b, c, ua, ub, uc);
    this.tri(a, c, d, ua, uc, ud);
  }

  /** Dikey yüz (bordür): iki taraflı malzemeyle çizilir. */
  wall(p0, p1, y0a, y1a, y0b = y0a, y1b = y1a) {
    const a = [p0[0], y0a, p0[1]], b = [p1[0], y0b, p1[1]], c = [p1[0], y1b, p1[1]], d = [p0[0], y1a, p0[1]];
    for (const p of [a, b, c, a, c, d]) this.pos.push(p[0], p[1], p[2]);
    const l = len(sub(p1, p0));
    for (const t of [[0, 0], [l, 0], [l, 1], [0, 0], [l, 1], [0, 1]]) this.uv.push(t[0], t[1]);
  }

  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    return m;
  }
}

/** Kenar boyunca d0'dan (sondan d1 kalana kadar) örneklenmiş noktalar: konum, sol normal, uzaklık. */
export function stations(pts, d0, d1, piece = PIECE) {
  const out = [];
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = lens[lens.length - 1];
  const end = total - d1;
  if (end - d0 < 0.05) return out;
  const marks = [d0, end];
  for (const l of lens) if (l > d0 + 0.05 && l < end - 0.05) marks.push(l);
  const n = Math.ceil((end - d0) / piece);
  for (let k = 1; k < n; k++) marks.push(d0 + ((end - d0) * k) / n);
  marks.sort((a, b) => a - b);
  for (const d of marks) {
    let j = 1;
    while (j < lens.length - 1 && lens[j] < d - 1e-6) j++;
    const u = (d - lens[j - 1]) / ((lens[j] - lens[j - 1]) || 1);
    const p = add(pts[j - 1], mul(sub(pts[j], pts[j - 1]), u));
    const dirA = norm(sub(pts[j], pts[j - 1]));
    let dir = dirA, miter = 1;
    if (Math.abs(d - lens[j]) < 0.06 && j < pts.length - 1) {
      const dirB = norm(sub(pts[j + 1], pts[j]));
      dir = norm(add(dirA, dirB));
      miter = Math.max(0.6, dir[0] * dirA[0] + dir[1] * dirA[1]);
    }
    out.push({ p, dir, n: mul(left(dir), 1 / miter), d });
  }
  return out;
}

export function buildRoads(world) {
  const net = world.network;
  const ground = (x, z) => world.surfaceY(x, z);
  const M = { asfalt: new Mesh(), parke: new Mesh(), toprak: new Mesh(), tas: new Mesh(), walk: new Mesh(), curb: new Mesh(), mark: new Mesh() };
  const TILE = { asfalt: 8, parke: 4, toprak: 6, tas: 5 };
  const lampSpots = [];
  const doors = world.buildings.map((b) => [b.x + Math.sin(b.rot) * (b.d / 2), b.z + Math.cos(b.rot) * (b.d / 2)]);
  const nearDoor = (x, z) => doors.some(([dx, dz]) => Math.abs(dx - x) < 3 && Math.abs(dz - z) < 3);

  for (const e of net.edges) {
    const road = e.road;
    const st = stations(e.pts, e.trimA, e.trimB);
    if (st.length < 2) continue;
    const hc = road.carriage / 2, hw = road.width / 2;
    const hTop = isCar(road) ? H.carriage : road.type === "patika" ? H.trail : H.ped;
    const mesh = M[road.surface];
    const tile = TILE[road.surface];
    const half = isCar(road) ? hc : hw;
    for (let k = 1; k < st.length; k++) {
      const a = st[k - 1], b = st[k];
      const ga = ground(...a.p), gb = ground(...b.p);
      const P = (s, o, y) => [s.p[0] + s.n[0] * o, y, s.p[1] + s.n[1] * o];
      mesh.quad(P(a, -half, ga + hTop), P(b, -half, gb + hTop), P(b, half, gb + hTop), P(a, half, ga + hTop),
        [0, a.d / tile], [0, b.d / tile], [(2 * half) / tile, b.d / tile], [(2 * half) / tile, a.d / tile]);
      if (!isCar(road)) continue;
      if (hw - hc > 0.3) {
        for (const side of [-1, 1]) {
          const o0 = side * hc, o1 = side * hw;
          M.walk.quad(P(a, o0, ga + H.walk), P(b, o0, gb + H.walk), P(b, o1, gb + H.walk), P(a, o1, ga + H.walk),
            [o0 / 2.4, a.d / 2.4], [o0 / 2.4, b.d / 2.4], [o1 / 2.4, b.d / 2.4], [o1 / 2.4, a.d / 2.4]);
          const ca = [a.p[0] + a.n[0] * o0, a.p[1] + a.n[1] * o0], cb = [b.p[0] + b.n[0] * o0, b.p[1] + b.n[1] * o0];
          M.curb.wall(ca, cb, ga + H.carriage, ga + H.walk, gb + H.carriage, gb + H.walk);
          const oa = [a.p[0] + a.n[0] * o1, a.p[1] + a.n[1] * o1], ob = [b.p[0] + b.n[0] * o1, b.p[1] + b.n[1] * o1];
          M.curb.wall(oa, ob, ga - 0.08, ga + H.walk, gb - 0.08, gb + H.walk);
        }
      }
      if ((road.type === "cadde" || road.type === "sokak") && Math.floor((a.d + b.d) / 2 / 3) % 2 === 0) {
        M.mark.quad(P(a, -0.07, ga + H.marking), P(b, -0.07, gb + H.marking), P(b, 0.07, gb + H.marking), P(a, 0.07, ga + H.marking), [0, 0], [0, 1], [1, 1], [1, 0]);
      }
    }
    // Sokak lambaları: iki yanda şaşırtmalı; kavşak ve kapı önlerinde, kısa giriş yollarında yok.
    if ((isCar(road) && road.type !== "giris") || road.type === "yaya" || road.type === "sahil") {
      const total = st[st.length - 1].d;
      const step = road.type === "yaya" ? 22 : road.type === "sahil" ? 24 : 30;
      const sides = road.type === "sahil" ? [1] : [-1, 1];
      for (const side of sides) {
        for (let d = st[0].d + (side > 0 ? 7 : 7 + step / 2); d < total - 7; d += step) {
          let j = 1;
          while (j < st.length - 1 && st[j].d < d) j++;
          const s = st[j];
          const off = side * (hw - 0.5);
          const x = s.p[0] + s.n[0] * off, z = s.p[1] + s.n[1] * off;
          if (nearDoor(x, z) || !world.isLand(x, z)) continue;
          const y = ground(x, z) + (isCar(road) ? H.walk : hTop);
          lampSpots.push({ x, z, y, dir: Math.atan2(-s.n[0] * side, -s.n[1] * side), deco: !isCar(road) });
        }
      }
    }
  }

  // Düğümler: taşıt yolu yaması, kaldırım köşeleri, yaya geçitleri.
  for (const node of net.nodes) {
    const cars = node.ends.filter((e) => isCar(e.edge.road) && e.trim > 0);
    const y0 = ground(...node.p);
    if (cars.length >= 2) {
      cars.sort((a, b) => Math.atan2(a.dir[1], a.dir[0]) - Math.atan2(b.dir[1], b.dir[0]));
      const ring = [];
      const corners = [];
      cars.forEach((e, i) => {
        const r = e.edge.road;
        const base = add(node.p, mul(e.dir, e.trim));
        const R = add(base, mul(left(e.dir), -r.carriage / 2));
        const L = add(base, mul(left(e.dir), r.carriage / 2));
        const next = cars[(i + 1) % cars.length];
        const nr = next.edge.road;
        const nBase = add(node.p, mul(next.dir, next.trim));
        const nR = add(nBase, mul(left(next.dir), -nr.carriage / 2));
        const ctrl = intersect(L, e.dir, nR, next.dir);
        const inner = curve(L, ctrl && len(sub(ctrl, node.p)) < 60 ? ctrl : null, nR);
        ring.push(R, ...inner);
        if (r.width > r.carriage + 0.3 && nr.width > nr.carriage + 0.3) {
          const OL = add(base, mul(left(e.dir), r.width / 2));
          const ONR = add(nBase, mul(left(next.dir), -nr.width / 2));
          const octrl = intersect(OL, e.dir, ONR, next.dir);
          const outer = curve(OL, octrl && len(sub(octrl, node.p)) < 80 ? octrl : null, ONR, inner.length - 1);
          corners.push({ inner, outer, turn: cross(e.dir, next.dir) });
        }
        // Yaya geçidi (araç girişlerinde kaldırım kesintisiz sürer, zebra yok) ve dur çizgisi.
        const y = y0 + H.marking;
        if (e.cross && r.type !== "giris") for (let o = -r.carriage / 2 + 0.35; o < r.carriage / 2 - 0.3; o += 1.0) {
          const p0 = add(add(node.p, mul(e.dir, e.trim + 0.8)), mul(left(e.dir), o));
          const p1 = add(p0, mul(e.dir, 3)), p2 = add(p1, mul(left(e.dir), 0.5)), p3 = add(p0, mul(left(e.dir), 0.5));
          M.mark.quad([p0[0], y, p0[1]], [p1[0], y, p1[1]], [p2[0], y, p2[1]], [p3[0], y, p3[1]]);
        }
        const s0 = add(add(node.p, mul(e.dir, e.trim + 4.4)), mul(left(e.dir), -r.carriage / 2));
        const s1 = add(s0, mul(left(e.dir), r.carriage / 2)), s2 = add(s1, mul(e.dir, 0.35)), s3 = add(s0, mul(e.dir, 0.35));
        M.mark.quad([s0[0], y, s0[1]], [s1[0], y, s1[1]], [s2[0], y, s2[1]], [s3[0], y, s3[1]]);
      });
      const surf = cars[0].edge.road.surface;
      const tile = TILE[surf];
      const c = [node.p[0], y0 + H.carriage, node.p[1]];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        M[surf].tri(c, [a[0], y0 + H.carriage, a[1]], [b[0], y0 + H.carriage, b[1]],
          [node.p[0] / tile, node.p[1] / tile], [a[0] / tile, a[1] / tile], [b[0] / tile, b[1] / tile]);
      }
      for (const { inner, outer, turn } of corners) {
        for (let i = 1; i < inner.length; i++) {
          const a0 = inner[i - 1], a1 = inner[i], b0 = outer[i - 1], b1 = outer[i];
          const w = y0 + H.walk;
          M.walk.quad([a0[0], w, a0[1]], [a1[0], w, a1[1]], [b1[0], w, b1[1]], [b0[0], w, b0[1]],
            [a0[0] / 2.4, a0[1] / 2.4], [a1[0] / 2.4, a1[1] / 2.4], [b1[0] / 2.4, b1[1] / 2.4], [b0[0] / 2.4, b0[1] / 2.4]);
          M.curb.wall(a0, a1, y0 + H.carriage, y0 + H.walk);
          M.curb.wall(b0, b1, y0 - 0.08, y0 + H.walk);
        }
        // Gerçek köşelerde (dönüş varsa) köşe lambası.
        if (turn > 0.3) {
          const mid = outer[Math.floor(outer.length / 2)];
          const toNode = norm(sub(node.p, mid));
          const lp = add(mid, mul(toNode, 0.6));
          if (world.isLand(lp[0], lp[1])) lampSpots.push({ x: lp[0], z: lp[1], y: y0 + H.walk, dir: Math.atan2(toNode[0], toNode[1]) });
        }
      }
    } else {
      // Yaya yolu taşıt yolunu kesiyorsa: yaya geçidi.
      const walk = node.ends.find((e) => !isCar(e.edge.road) && e.edge.road.type !== "patika");
      const car = node.ends.find((e) => isCar(e.edge.road));
      if (walk && car) {
        const r = car.edge.road;
        const across = left(car.dir);
        const y = y0 + H.marking;
        for (let o = -r.carriage / 2 + 0.35; o < r.carriage / 2 - 0.3; o += 1.0) {
          const p0 = add(add(node.p, mul(car.dir, -1.5)), mul(across, o));
          const p1 = add(p0, mul(car.dir, 3)), p2 = add(p1, mul(across, 0.5)), p3 = add(p0, mul(across, 0.5));
          M.mark.quad([p0[0], y, p0[1]], [p1[0], y, p1[1]], [p2[0], y, p2[1]], [p3[0], y, p3[1]]);
        }
      }
    }
  }

  // Projektörler kendi direkleriyle çizilir; yalnızca ışık haritasına girer.
  for (const l of world.lamps) lampSpots.push({ ...l, y: world.groundY(l.x, l.z), deco: true, hidden: !!l.flood });
  // Çöp kutuları: her üçüncü lambanın yanında.
  lampSpots.forEach((l, i) => {
    if (!l.hidden) world.addObstacleCircle(l.x, l.z, 0.2);
    if (i % 3 !== 1 || l.hidden) return;
    const ax = Math.cos(l.dir) * 1.3, az = -Math.sin(l.dir) * 1.3;
    const x = l.x + ax, z = l.z + az;
    if (!world.isLand(x, z)) return;
    world.features.push({ type: "cop_kutusu", x, z, rot: l.dir });
    world.addObstacleCircle(x, z, 0.3);
  });
  world.lampSpots = lampSpots;

  const mat = (map, opts = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, ...opts });
  const group = new THREE.Group();
  const meshes = {
    asfalt: M.asfalt.build(mat(T.asphalt(), { roughness: 0.88 })),
    parke: M.parke.build(mat(T.cobble())),
    toprak: M.toprak.build(mat(T.dirt())),
    tas: M.tas.build(mat(T.slabs())),
    walk: M.walk.build(mat(T.paving())),
    curb: M.curb.build(mat(T.curb(), { side: THREE.DoubleSide })),
    mark: M.mark.build(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 })),
  };
  for (const m of Object.values(meshes)) group.add(m);
  group.userData.groundMaterials = [meshes.asfalt, meshes.parke, meshes.toprak, meshes.tas, meshes.walk, meshes.mark].map((m) => m.material);
  const lamps = buildLamps(lampSpots);
  group.add(lamps);
  group.userData.lampHeads = lamps.userData.heads;
  return group;
}

/** Sokak lambası: direk, kol ve armatür; yaya alanlarında fenerli klasik direk. */
function buildLamps(spots) {
  const group = new THREE.Group();
  const n = Math.max(1, spots.length);
  const metal = new THREE.MeshStandardMaterial({ color: "#3c4148", roughness: 0.5, metalness: 0.4 });
  const headMat = new THREE.MeshBasicMaterial({ color: "#d8dde3", toneMapped: false });
  const make = (geo, material, shadow) => {
    const mesh = new THREE.InstancedMesh(geo, material, n);
    mesh.castShadow = shadow;
    mesh.count = 0;
    group.add(mesh);
    return mesh;
  };
  const pole = make(new THREE.CylinderGeometry(0.07, 0.12, 5.8, 8).translate(0, 2.9, 0), metal, true);
  const arm = make(new THREE.CylinderGeometry(0.045, 0.045, 1.4, 6).rotateX(Math.PI / 2 - 0.12).translate(0, 5.72, 0.66), metal, true);
  const head = make(new THREE.BoxGeometry(0.32, 0.12, 0.6).translate(0, 5.8, 1.32), headMat, false);
  const decoPole = make(new THREE.CylinderGeometry(0.06, 0.1, 3.6, 8).translate(0, 1.8, 0), metal, true);
  const decoBase = make(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8).translate(0, 0.25, 0), metal, false);
  const decoHead = make(new THREE.CylinderGeometry(0.2, 0.14, 0.45, 6).translate(0, 3.85, 0), headMat, false);
  const decoCap = make(new THREE.ConeGeometry(0.27, 0.22, 6).translate(0, 4.18, 0), metal, false);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (const s of spots) {
    if (s.hidden) continue;
    q.setFromAxisAngle(up, s.dir);
    m.compose(p.set(s.x, s.y, s.z), q, one);
    for (const mesh of s.deco ? [decoPole, decoBase, decoHead, decoCap] : [pole, arm, head]) mesh.setMatrixAt(mesh.count++, m);
  }
  group.userData.heads = [headMat];
  return group;
}

/** Meydan, tarlalar, saha ve pazar yeri zeminleri: her biri kendi yüksekliğinde, kenarlı blok. */
export function buildGrounds(world) {
  const group = new THREE.Group();
  const FLAT = world.flatY;
  const materials = [];
  const slab = (w, d, x, z, tex, repeat, top, color = 0xffffff) => {
    const g = new THREE.BoxGeometry(w, top + 0.1, d).translate(0, (top - 0.1) / 2, 0);
    const uv = g.attributes.uv;
    if (repeat) for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / repeat, (uv.getY(i) * d) / repeat);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.95 }));
    mesh.position.set(x, FLAT, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    materials.push(mesh.material);
    return mesh;
  };
  const CROPS = ["#c9b45a", "#8fb04f", "#d6a35a"];
  for (const p of world.plazas) {
    if (p.r) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r + 0.1, 0.3, 72).translate(0, 0.05, 0), new THREE.MeshStandardMaterial({ color: "#cfc6b8", roughness: 0.9 }));
      rim.position.set(p.x, FLAT, p.z);
      const top = new THREE.CircleGeometry(p.r - 0.02, 72).rotateX(-Math.PI / 2);
      const tuv = top.attributes.uv;
      for (let i = 0; i < tuv.count; i++) tuv.setXY(i, (tuv.getX(i) * p.r * 2) / 2.5, (tuv.getY(i) * p.r * 2) / 2.5);
      const face = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ map: T.plazaStone(), roughness: 0.9 }));
      face.position.set(p.x, FLAT + 0.2 + 0.002, p.z);
      rim.receiveShadow = face.receiveShadow = true;
      group.add(rim, face);
      materials.push(face.material);
      continue;
    }
    const w = p.x1 - p.x0, d = p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    if (p.kind === "tarla") slab(w, d, cx, cz, T.crops(CROPS[p.crop]), 2.4, 0.08);
    else if (p.kind === "saha") {
      slab(w + 8, d + 8, cx, cz, T.paving(), 2.4, 0.06);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: T.pitch(), roughness: 0.95 }));
      f.position.set(cx, FLAT + 0.12, cz);
      f.receiveShadow = true;
      group.add(f);
      materials.push(f.material);
    } else if (p.kind === "pazar") slab(w, d, cx, cz, T.slabs(), 5, 0.1);
    else if (p.kind === "avlu") slab(w, d, cx, cz, T.slabs(), 5, 0.12);
    else if (p.kind === "oyun") {
      // Kauçuk güvenlik zemini (granüllü), çevresinde taş bordür.
      slab(w + 1, d + 1, cx, cz, T.paving(), 2.4, 0.05);
      slab(w, d, cx, cz, T.rubber(), 2, 0.07, new THREE.Color(p.color ?? "#4f8a57"));
    }
    else if (p.kind === "basket") {
      slab(w + 2, d + 2, cx, cz, T.paving(), 2.4, 0.06);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: T.court(), roughness: 0.8 }));
      f.position.set(cx, FLAT + 0.105, cz);
      f.receiveShadow = true;
      group.add(f);
      materials.push(f.material);
    }
    else if (p.kind === "otopark") {
      const m = slab(w, d, cx, cz, T.parkingLot(), 0, 0.07);
      const uv = m.geometry.attributes.uv;
      // Sıralar trafik.js ile aynı: 16 m, alana ortalanmış (kenar payı her iki uçta eşit).
      const margin = (d - Math.floor(d / 16) * 16) / 2;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 2.7, (uv.getY(i) * d - margin) / 16);
      m.material.map.wrapS = m.material.map.wrapT = THREE.RepeatWrapping;
    }
  }
  group.userData.groundMaterials = materials;
  return group;
}
