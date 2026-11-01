// Trafik: şerit ağı (sağdan akış), rota bulma, araç takibi (önündeki araca ve ışıklara göre hızlanır,
// yavaşlar, durur), trafik ışıkları, park yerleri (sokak kenarı, otoparklar), otobüs hatları ve çizelgeleri,
// hizmet araçları (ambulans, itfaiye, çöp kamyonu) ve hepsinin çizimi.
//
// Araç yolculukları sakinlerin günlük planından gelir (people.js). Araçlar o plana göre yola çıkar;
// yolda trafik ışıkları ve öndeki araçlar yüzünden gecikebilir, planda buna pay bırakılmıştır.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { stations } from "./roads.js";
import { CELL_D, CELL_W } from "./layout.js";
import { MinHeap } from "./heap.js";
import { mahalleName } from "../sim.js";
import { pedState, signalState } from "./signals.js";

const LANE = { cadde: 2.0, sokak: 1.0, koy: 1.6, giris: 1.5 };
const VMAX = { cadde: 12.5, sokak: 8, koy: 13, giris: 4 };
const TURN_V = 6.5;
const STOP_INSET = 4.6; // dur çizgisi: şerit sonundan geri
const PARK_OFF = 3.0;
export const BUS_DWELL = 20; // sn
const BUS_NOMINAL = 6.0; // m/s: çizelgede kullanılan ortalama hız (ışıklar ve kalkış-duruş dahil)

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const right = (d) => [-d[1], d[0]]; // yönün sağı (x doğu, z güney)

function cumulative(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  return cum;
}

function clean(pts) {
  const out = [pts[0]];
  for (const p of pts.slice(1)) if (p && len(sub(p, out[out.length - 1])) > 0.05) out.push(p);
  return out;
}

/** Çizgi üzerinde d metredeki nokta ve yön. */
export function pointAt(pts, cum, d, out = {}) {
  d = Math.max(0, Math.min(cum[cum.length - 1], d));
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m + 1; else hi = m; }
  const j = Math.max(1, lo);
  const u = (d - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
  out.x = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u;
  out.z = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u;
  out.heading = Math.atan2(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
  return out;
}

function bezier3(a, c1, c2, b, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
    ]);
  }
  return out;
}

/** Köşeleri yumuşat: her iç köşe en çok r yarıçaplı ikinci derece eğriyle (dönüşte araç savrulmasın). */
function fillet(pts, r = 4.5, n = 6) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d1 = norm(sub(b, a)), d2 = norm(sub(c, b));
    if (d1[0] * d2[0] + d1[1] * d2[1] > 0.995) { out.push(b); continue; }
    const rr = Math.min(r, len(sub(b, a)) / 2, len(sub(c, b)) / 2);
    const p1 = sub(b, mul(d1, rr)), p2 = add(b, mul(d2, rr));
    for (let k = 0; k <= n; k++) {
      const u = k / n, v = 1 - u;
      out.push([v * v * p1[0] + 2 * v * u * b[0] + u * u * p2[0], v * v * p1[1] + 2 * v * u * b[1] + u * u * p2[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return clean(out);
}

/** İki şerit arasında kavşaktan geçiş eğrisi: giriş ve çıkış yönlerine teğet. */
function connector(pA, dA, pB, dB) {
  const l = len(sub(pB, pA));
  if (l < 0.1) return [pA, pB];
  const den = dA[0] * dB[1] - dA[1] * dB[0];
  if (Math.abs(den) > 0.05) {
    const t = ((pB[0] - pA[0]) * dB[1] - (pB[1] - pA[1]) * dB[0]) / den;
    if (t > 0 && t < 60) {
      const c = add(pA, mul(dA, t));
      return bezier3(pA, add(pA, mul(sub(c, pA), 0.66)), add(pB, mul(sub(c, pB), 0.66)), pB);
    }
  }
  return bezier3(pA, add(pA, mul(dA, l * 0.4)), sub(pB, mul(dB, l * 0.4)), pB);
}

/** Rota: parçalar (giriş, şerit, kavşak geçişi, çıkış) ve toplam uzunluk. */
class Route {
  constructor(pieces) {
    let s = 0;
    for (const p of pieces) {
      p.cum = cumulative(p.pts);
      p.s0 = s;
      s += p.cum[p.cum.length - 1];
      p.s1 = s;
    }
    this.pieces = pieces;
    this.len = s;
  }

  pieceAt(s) {
    const P = this.pieces;
    let lo = 0, hi = P.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (P[m].s1 < s) lo = m + 1; else hi = m; }
    return lo;
  }

  position(s, out = {}) {
    const p = this.pieces[this.pieceAt(s)];
    pointAt(p.pts, p.cum, s - p.s0, out);
    if (p.rev) out.heading += Math.PI; // geri viteste araç gidişin tersine bakar
    return out;
  }

  /** Araç hangi şeritte, şeridin neresinde? Kavşak ve girişlerde bir sonraki şeride eksi uzaklıkla sayılır. */
  occupancy(s, out) {
    const k = this.pieceAt(s);
    const p = this.pieces[k];
    out.k = k;
    if (p.kind === "lane" || p.kind === "out") { out.lane = p.lane; out.coord = p.c0 + (s - p.s0); }
    else { out.lane = p.next; out.coord = -(p.s1 - s); }
    return out;
  }
}

export const LOT_ROW = 16; // otoparkta bir sıra: park yeri + koridor + park yeri (m)
const S0 = 2.2; // izleme modelinde duran araçlar arası boşluk (m)

export class Traffic {
  constructor(world) {
    this.world = world;
    const net = world.network;
    this.nodes = net.nodes;
    this.edges = [];
    this.lanes = [];
    this.out = new Map();
    for (const e of net.edges) {
      const r = e.road;
      if (!(r.carriage > 0)) continue;
      const st = stations(e.pts, e.trimA, e.trimB, 5);
      if (st.length < 2) continue;
      const off = LANE[r.type] ?? 1.6;
      const center = st.map((q) => q.p);
      const cumC = cumulative(center);
      const k = this.edges.length;
      const endA = e.a.ends.find((x) => x.edge === e && x.at === "a");
      const endB = e.b.ends.find((x) => x.edge === e && x.at === "b");
      const mk = (pts, from, to, toEnd, fwd) => {
        const cum = cumulative(pts);
        const lane = { id: this.lanes.length, edge: k, fwd, pts, cum, len: cum[cum.length - 1], from, to, toEnd, vmax: VMAX[r.type] ?? 9, road: r };
        lane.dirEnd = norm(sub(pts[pts.length - 1], pts[pts.length - 2]));
        lane.dirStart = norm(sub(pts[1], pts[0]));
        this.lanes.push(lane);
        if (!this.out.has(from.id)) this.out.set(from.id, []);
        this.out.get(from.id).push(lane.id);
        return lane.id;
      };
      const fwd = mk(st.map((q) => add(q.p, mul(q.n, off))), e.a, e.b, endB, true);
      const back = mk([...st].reverse().map((q) => sub(q.p, mul(q.n, off))), e.b, e.a, endA, false);
      this.lanes[fwd].reverse = back;
      this.lanes[back].reverse = fwd;
      this.edges.push({ net: e, road: r, center, cumC, len: cumC[cumC.length - 1], fwd, back });
    }
    this.connCache = new Map();
    this._grid();
    this._parking();
    this._busLines();
    this.active = new Map();
    this.finished = new Set();
    this.services = [];
    this.serviceDay = null;
    this.busRequests = new Map(); // "bus:hat:sefer" -> binilecek/inilecek durak sıraları
    this.stopRiders = new Map(); // "bus:hat:sefer:durak" -> o duraktan binen sayısı
    this.simT = null;
  }

  _grid() {
    this.grid = new Map();
    this.edges.forEach((e, k) => {
      for (let i = 1; i < e.center.length; i++) {
        const [ax, az] = e.center[i - 1], [bx, bz] = e.center[i];
        for (let gx = Math.floor((Math.min(ax, bx) - 10) / 30); gx <= Math.floor((Math.max(ax, bx) + 10) / 30); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - 10) / 30); gz <= Math.floor((Math.max(az, bz) + 10) / 30); gz++) {
            const key = gx * 100003 + gz;
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key).push([k, i]);
          }
        }
      }
    });
  }

  /** Noktaya en yakın yol (orta çizgi) ve uzaklık. */
  locate(p, maxD = 16, types = null) {
    let best = null;
    const gx0 = Math.floor(p[0] / 30), gz0 = Math.floor(p[1] / 30);
    for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
      for (let gz = gz0 - 1; gz <= gz0 + 1; gz++) {
        for (const [k, i] of this.grid.get(gx * 100003 + gz) ?? []) {
          const e = this.edges[k];
          if (types && !types.includes(e.road.type)) continue;
          const a = e.center[i - 1], b = e.center[i];
          const d = sub(b, a), l2 = d[0] * d[0] + d[1] * d[1] || 1;
          const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2));
          const dist = len(sub(p, add(a, mul(d, t))));
          if (dist < maxD && (!best || dist < best.d)) best = { edge: k, along: e.cumC[i - 1] + Math.sqrt(l2) * t, d: dist };
        }
      }
    }
    return best;
  }

  _conn(a, b) {
    const key = a * 100000 + b;
    let c = this.connCache.get(key);
    if (!c) {
      const A = this.lanes[a], B = this.lanes[b];
      c = connector(A.pts[A.pts.length - 1], A.dirEnd, B.pts[0], B.dirStart);
      this.connCache.set(key, c);
    }
    return c;
  }

  _laneAt(lane, c) {
    const L = this.lanes[lane];
    const p = pointAt(L.pts, L.cum, c);
    return [p.x, p.z];
  }

  /** Şerit ağında en kısa süre: başlangıç şeritlerinden (koordinat c'den) hedef şeritlere (koordinat). */
  _search(starts, goals) {
    const g = new Map(), prev = new Map(), heap = new MinHeap();
    const startC = new Map();
    for (const s of starts) {
      const L = this.lanes[s.lane];
      const cost = (L.len - s.c) / L.vmax;
      startC.set(s.lane, s.c);
      if (cost < (g.get(s.lane) ?? Infinity)) { g.set(s.lane, cost); prev.set(s.lane, -1); heap.push(cost, s.lane); }
    }
    let best = Infinity, bestLane = -1, bestDirect = false;
    // Başlangıç şeridinde hedef ilerideyse doğrudan.
    for (const s of starts) {
      const gc = goals.get(s.lane);
      if (gc != null && gc > s.c + 2) {
        const t = (gc - s.c) / this.lanes[s.lane].vmax;
        if (t < best) { best = t; bestLane = s.lane; bestDirect = true; }
      }
    }
    while (heap.size) {
      const u = heap.pop();
      const gu = heap.lastKey;
      if (gu > (g.get(u) ?? Infinity) + 1e-9) continue;
      if (gu - this.lanes[u].len / this.lanes[u].vmax >= best) break;
      const L = this.lanes[u];
      const goal = goals.get(u);
      if (goal != null && prev.get(u) !== -1) {
        const total = gu - L.len / L.vmax + goal / L.vmax;
        if (total < best) { best = total; bestLane = u; bestDirect = false; }
      }
      const outs = this.out.get(L.to.id) ?? [];
      const N = L.to;
      for (const v of outs) {
        const M = this.lanes[v];
        const uturn = v === L.reverse;
        if (uturn && outs.length > 1) continue;
        // Otopark, hastane ve garaj girişleri yalnızca oraya giden araç içindir: kimse dönmek ya da
        // kestirme için girip çıkmaz.
        if (M.road.type === "giris" && !goals.has(v)) continue;
        const cost = gu + M.len / M.vmax + (N.signal ? 9 : 2) + (uturn ? 25 : 0);
        if (cost < (g.get(v) ?? Infinity)) { g.set(v, cost); prev.set(v, u); heap.push(cost, v); }
      }
    }
    if (bestLane < 0) return null;
    if (bestDirect) return { seq: [bestLane] };
    const seq = [];
    for (let v = bestLane; v !== -1 && v !== undefined; v = prev.get(v)) seq.push(v);
    seq.reverse();
    return { seq };
  }

  /** Bir noktanın yakınındaki şerit seçenekleri (iki yön). */
  _laneOptions(p, types) {
    const l = this.locate(p, 18, types);
    if (!l) return null;
    const e = this.edges[l.edge];
    const F = this.lanes[e.fwd], B = this.lanes[e.back];
    return { l, opts: [{ lane: e.fwd, c: (l.along / e.len) * F.len }, { lane: e.back, c: ((e.len - l.along) / e.len) * B.len }] };
  }

  /**
   * A'dan B'ye araç rotası. A ve B yol kenarında (park yeri) ya da yola yakın bir noktadır; giriş ve
   * çıkışta kısa bir manevrayla şeride katılır/ayrılır. pre/post: otopark içi yol noktaları.
   */
  route(A, B, { pre = null, post = null, prePieces = null } = {}) {
    const oa = this._laneOptions(A), ob = this._laneOptions(B);
    if (!oa || !ob) return null;
    const starts = oa.opts.map((o) => ({ lane: o.lane, c: Math.min(o.c + 7, this.lanes[o.lane].len - 0.5) }));
    const goals = new Map(ob.opts.map((o) => [o.lane, Math.max(o.c - 7, 0.5)]));
    const found = this._search(starts, goals);
    if (!found) return null;
    const { seq } = found;
    const first = seq[0], last = seq[seq.length - 1];
    const cStart = starts.find((s) => s.lane === first).c;
    const cEnd = goals.get(last);
    const pieces = [];
    for (const pp of prePieces ?? []) pieces.push({ kind: "in", pts: clean(pp.pts), next: first, rev: pp.rev });
    const inPts = clean([...(pre ?? []), A]);
    pieces.push({ kind: "in", pts: this._join(inPts, first, cStart, true), next: first });
    this._lanesToPieces(pieces, seq, cStart, cEnd);
    const outPts = clean([B, ...(post ?? [])]);
    pieces.push({ kind: "out", pts: this._join(outPts, last, cEnd, false), lane: last, c0: cEnd });
    return new Route(pieces);
  }

  /** Yol kenarındaki noktadan şeride (ya da şeritten noktaya) yumuşak S eğrisi. */
  _join(pts, lane, c, entering) {
    const L = this.lanes[lane];
    const q = pointAt(L.pts, L.cum, c);
    const lp = [q.x, q.z];
    const dir = [Math.sin(q.heading), Math.cos(q.heading)];
    const edge = entering ? pts[pts.length - 1] : pts[0];
    const l = Math.max(1, len(sub(lp, edge)));
    const curve = entering
      ? bezier3(edge, add(edge, mul(dir, l * 0.45)), sub(lp, mul(dir, l * 0.45)), lp, 6)
      : bezier3(lp, add(lp, mul(dir, l * 0.45)), sub(edge, mul(dir, l * 0.45)), edge, 6);
    return entering ? clean([...pts.slice(0, -1), ...curve]) : clean([...curve, ...pts.slice(1)]);
  }

  _lanesToPieces(pieces, seq, cStart, cEnd) {
    seq.forEach((lane, i) => {
      const L = this.lanes[lane];
      const c0 = i === 0 ? cStart : 0;
      const c1 = i === seq.length - 1 ? cEnd : L.len;
      if (i > 0) {
        const P = this.lanes[seq[i - 1]];
        pieces.push({ kind: "conn", pts: this._conn(seq[i - 1], lane), next: lane, node: P.to, end: P.toEnd });
      }
      pieces.push({ kind: "lane", pts: this._slice(lane, c0, c1), lane, c0 });
    });
  }

  _slice(lane, a, b) {
    const L = this.lanes[lane];
    const out = [this._laneAt(lane, a)];
    for (let j = 0; j < L.cum.length; j++) if (L.cum[j] > a + 0.05 && L.cum[j] < b - 0.05) out.push(L.pts[j]);
    out.push(this._laneAt(lane, b));
    return clean(out);
  }

  // --- park yerleri ve çöp konteynerleri ---

  _parking() {
    const w = this.world;
    this.slots = [];
    this.containers = [];
    this.slotIndex = new Map();
    if (w.vehicles === false) return; // araçlar çevre yoluyla gelir: öncesinde park yeri ve konteyner yok
    const doors = w.buildings.map((b) => [b.x + Math.sin(b.rot) * (b.d / 2 + 4), b.z + Math.cos(b.rot) * (b.d / 2 + 4)]);
    let n = 0;
    for (const e of this.edges) {
      if (e.road.type !== "sokak") continue;
      for (const side of [1, -1]) {
        for (let d = 9; d < e.len - 9; d += 6.2) {
          const s = pointAt(e.center, e.cumC, d);
          const dir = [Math.sin(s.heading), Math.cos(s.heading)];
          const r = right(dir);
          const x = s.x + r[0] * side * PARK_OFF, z = s.z + r[1] * side * PARK_OFF;
          if (doors.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 5)) continue;
          const heading = s.heading + (side < 0 ? Math.PI : 0);
          if (n++ % 11 === 5) {
            // Her on birinci yer: çöp konteyneri.
            this.containers.push({ x, z, heading });
            w.features.push({ type: "konteyner", x, z, rot: heading });
            continue;
          }
          this.slots.push({ x, z, heading, kind: "sokak", busy: [] });
        }
      }
    }
    for (const lot of w.parkingLots ?? []) {
      // Gerçek ölçü: 5 m park yeri + 6 m koridor + 5 m park yeri = 16 m'lik sıra; kapı tarafında 6 m'lik
      // dikey koridor. Sıralar alana ortalanır (lot.margin, zemin çizgileri de buna göre).
      const rows = Math.floor((lot.z1 - lot.z0) / LOT_ROW);
      lot.margin = (lot.z1 - lot.z0 - rows * LOT_ROW) / 2;
      const x0 = lot.gateSide < 0 ? lot.x0 + 7 : lot.x0 + 1, x1 = lot.gateSide < 0 ? lot.x1 - 1 : lot.x1 - 7;
      const cols = Math.floor((x1 - x0) / 2.7);
      for (let r = 0; r < rows; r++) {
        const aisle = lot.z0 + lot.margin + LOT_ROW / 2 + r * LOT_ROW;
        for (let c = 0; c < cols; c++) {
          for (const half of [-1, 1]) {
            const x = x0 + 1.35 + c * 2.7, z = aisle + half * 5.5;
            this.slots.push({ x, z, heading: half < 0 ? Math.PI : 0, lot, aisle, kind: "otopark", busy: [] });
          }
        }
      }
    }
    this.slotIndex = new Map();
    this.slots.forEach((s, i) => {
      const key = Math.floor(s.x / 40) * 100003 + Math.floor(s.z / 40);
      if (!this.slotIndex.has(key)) this.slotIndex.set(key, []);
      this.slotIndex.get(key).push(i);
    });
  }

  takeSlot(x, z, a, b, maxR = 160) {
    let best = null;
    for (let r = 0; r <= maxR / 40 && !best; r++) {
      for (let gx = Math.floor(x / 40) - r; gx <= Math.floor(x / 40) + r; gx++) {
        for (let gz = Math.floor(z / 40) - r; gz <= Math.floor(z / 40) + r; gz++) {
          for (const i of this.slotIndex.get(gx * 100003 + gz) ?? []) {
            const s = this.slots[i];
            if (!s.busy.every(([p, q]) => q <= a || p >= b)) continue;
            const d = Math.hypot(s.x - x, s.z - z);
            if (!best || d < best.d) best = { i, d };
          }
        }
      }
    }
    if (!best) return null;
    this.slots[best.i].busy.push([a, b]);
    return best.i;
  }

  resetBookings() {
    for (const s of this.slots) s.busy = [];
  }

  /** Park yerinden park yerine araç rotası (otopark içi manevralar dahil). */
  /**
   * Park yerinden park yerine. Otoparkta araçlar burnu içeride durur: çıkışta geri geri kıvrılarak
   * koridora çıkar (burnu kapıya döner), koridor boyunca yumuşak dönüşlerle kapıya gider; girişte
   * koridordan kavis çizerek yerine burnuyla girer.
   */
  routeSlots(from, to) {
    const a = this.slots[from], b = this.slots[to];
    const opts = {};
    let A = [a.x, a.z], B = [b.x, b.z];
    if (a.kind === "otopark") {
      // Önce yerinden düz geri (2,5 m), sonra koridora doğru kıvrılarak geri; burnu kapıya döner.
      const toA = Math.sign(a.aisle - a.z) || 1, ex = a.lot.gateX, dirX = Math.sign(ex - a.x) || 1;
      const P1 = [a.x, a.z + toA * 2.5], Q = [a.x - dirX * 5, a.aisle];
      opts.prePieces = [{ pts: [[a.x, a.z], ...bezier3(P1, [a.x, a.aisle - toA * 0.5], [a.x - dirX * 1.5, a.aisle], Q, 10)], rev: true }];
      opts.pre = fillet([Q, [ex, a.aisle], [ex, a.lot.gate[1]]]).slice(0, -1);
      A = a.lot.gate;
    }
    if (b.kind === "otopark") {
      // Koridordan kavisle yerine burnuyla girer, son 2,5 m düz.
      const toA = Math.sign(b.aisle - b.z) || 1, ex = b.lot.gateX, dirX = Math.sign(b.x - ex) || 1;
      const Q = [b.x - dirX * 5, b.aisle], P1 = [b.x, b.z + toA * 2.5];
      const tail = [...bezier3(Q, [b.x - dirX * 1.5, b.aisle], [b.x, b.aisle - toA * 0.5], P1, 10), [b.x, b.z]];
      opts.post = [...fillet([b.lot.gate, [ex, b.aisle], Q]).slice(1), ...tail.slice(1)];
      B = b.lot.gate;
    }
    return this.route(A, B, opts);
  }

  // --- otobüs hatları ---

  _loopSeq(waypoints) {
    const cur = this._laneOptions(waypoints[0], ["cadde"]);
    if (!cur) return null;
    const seq = [cur.opts[0].lane];
    for (const wp of [...waypoints.slice(1), waypoints[0]]) {
      const ob = this._laneOptions(wp, ["cadde"]);
      if (!ob) return null;
      const last = seq[seq.length - 1];
      const goals = new Map(ob.opts.map((o) => [o.lane, Math.max(o.c, 1)]));
      // Son şeridin sonundan devam: başlangıç şeridinin kendisi hedef sayılmaz.
      const found = this._search([{ lane: last, c: this.lanes[last].len - 0.01 }], goals);
      if (!found) return null;
      seq.push(...found.seq.slice(1));
    }
    while (seq.length > 1 && seq[seq.length - 1] === seq[0]) seq.pop();
    return seq;
  }

  _busLines() {
    const w = this.world;
    this.lines = [];
    if (w.vehicles === false) return;
    const halfW = CELL_W / 2, halfD = CELL_D / 2;
    const make = (name, color, waypoints, headway) => {
      const seq = this._loopSeq(waypoints);
      if (!seq) return;
      const pieces = [];
      this._lanesToPieces(pieces, seq, 0, this.lanes[seq[seq.length - 1]].len);
      const route = new Route(pieces);
      // Duraklar: ~230 m'de bir, kavşaklardan uzakta, sağ şeritte; sundurma kaldırımın arkasında.
      const stops = [];
      let nextAt = 40;
      for (const p of pieces) {
        if (p.kind !== "lane") continue;
        const L = this.lanes[p.lane];
        if (L.road.type !== "cadde" && L.road.type !== "sokak") continue; // sokakta da durak (mahalle içi)
        const plen = p.s1 - p.s0;
        for (let c = 32; c < plen - 32; c += 10) {
          const s = p.s0 + c;
          if (s < nextAt) continue;
          const pos = route.position(s);
          const dir = [Math.sin(pos.heading), Math.cos(pos.heading)];
          const r = right(dir);
          const off = LANE[L.road.type];
          const cx = pos.x - r[0] * off, cz = pos.z - r[1] * off;
          const hw = L.road.width / 2, hc = L.road.carriage / 2;
          const shelter = [cx + r[0] * (hw + 1.3), cz + r[1] * (hw + 1.3)];
          if (!w.isLand(...shelter) || w.obstacles?.has(w._obKey(...shelter))) continue;
          stops.push({ s, x: pos.x, z: pos.z, heading: pos.heading, shelter, wait: [cx + r[0] * (hc + 1.0), cz + r[1] * (hc + 1.0)], curb: [cx + r[0] * (hc + 0.7), cz + r[1] * (hc + 0.7)] });
          nextAt = s + 230;
        }
      }
      stops.forEach((st, k) => { st.offset = (st.s / BUS_NOMINAL + k * BUS_DWELL) / 60; });
      const cycle = route.len / BUS_NOMINAL / 60 + (stops.length * BUS_DWELL) / 60;
      this.lines.push({ name, color, route, stops, headway, cycle, first: 360, last: 1440 - Math.ceil(cycle) - 5 });
    };
    const avZ0 = w.avenueZ(0);
    make("Çevre Hattı", "#d8433d", [[halfW, -halfD + 20], [halfW - 30, avZ0], [-halfW + 30, avZ0], [-halfW, -halfD + 20]], 8);
    const cells = w.cells.filter((c) => c.type === "mahalle");
    if (cells.length) {
      const pts = [[halfW, -halfD + 20]];
      for (const c of cells) pts.push([c.cx * CELL_W, c.cz * CELL_D]);
      pts.push([-halfW, -halfD + 20]);
      make("Mahalle Hattı", "#2f6fb5", pts, 10);
      // Her mahallenin kendi hattı: dış caddeleri ve orta caddesi boyunca halka.
      const colors = ["#3e8a86", "#8a62d1", "#d9822b", "#2f7a4f", "#b8312f"];
      cells.forEach((c, k) => {
        const ox = c.cx * CELL_W, oz = c.cz * CELL_D;
        make(`${mahalleName(c.mahalle).replace(" Mahallesi", "")} Hattı`, colors[k % colors.length], [
          [ox, oz - halfD + 40], [ox + halfW - 30, oz - halfD], [ox + halfW, oz + halfD - 40],
          [ox, oz + halfD], [ox - halfW, oz + halfD - 40], [ox - halfW + 30, oz - halfD],
        ], 12);
      });
    }
  }

  /** Durak k'ye, dakika m'den sonra gelen ilk otobüs: {t (varış), dep (sefer no)}. */
  nextBus(line, k, m) {
    const off = line.stops[k].offset;
    const n = Math.max(0, Math.ceil((m - line.first - off) / line.headway));
    const depMin = line.first + n * line.headway;
    return depMin <= line.last ? { t: depMin + off, dep: n } : null;
  }

  rideMinutes(line, a, b) {
    return line.stops[b].offset - line.stops[a].offset;
  }

  stopNearOnLine(li, x, z) {
    let best = null;
    this.lines[li].stops.forEach((s, k) => {
      const d = Math.hypot(s.wait[0] - x, s.wait[1] - z);
      if (!best || d < best.d) best = { line: li, stop: k, d };
    });
    return best;
  }

  busVehicle(li, dep) {
    return this.active.get(`bus:${li}:${dep}`);
  }

  // --- araç benzetimi ---

  /** Sakin yolculuğu için araç: yoksa oluşturur. spec: {route, t0, t1, owner, color, taxi}. */
  ensure(key, spec, minute) {
    let v = this.active.get(key);
    if (v) { v.seen = true; return v; }
    if (this.finished.has(key)) return null;
    const u = Math.max(0, Math.min(1, (minute - spec.t0) / Math.max(0.1, spec.t1 - spec.t0)));
    v = { key, kind: spec.taxi ? "taxi" : "car", route: spec.route, s: u * spec.route.len * 0.85, v: u > 0.02 ? 6 : 0, L: 4.4, owner: spec.owner, color: spec.color, seen: true, occ: {} };
    this.active.set(key, v);
    return v;
  }

  _spawnBuses(minute) {
    if (!this.world.population) return; // boş adada sefer yok (yolcusu olmayan otobüs dolaşmaz)
    this.lines.forEach((line, li) => {
      const n0 = Math.max(0, Math.floor((minute - line.cycle - line.first) / line.headway) - 1);
      for (let n = n0; ; n++) {
        const dep = line.first + n * line.headway;
        if (dep > minute || dep > line.last) break;
        if (minute > dep + line.cycle + 3) continue;
        const key = `bus:${li}:${n}`;
        if (this.active.has(key) || this.finished.has(key)) continue;
        const tau = (minute - dep) * 60;
        let s = 0, served = 0;
        for (const st of line.stops) {
          if (tau >= st.offset * 60 + BUS_DWELL) { s = st.s; served++; } else break;
        }
        if (served >= line.stops.length && tau > line.cycle * 60) continue;
        this.active.set(key, { key, kind: "bus", route: line.route, s, v: 0, L: 12, line: li, dep: n, depMin: dep, served, seen: true, occ: {} });
      }
    });
  }

  /** Hizmet araçları: ambulans çağrıları, itfaiye tatbikatı, sabah çöp toplama. */
  _planServices(day) {
    this.serviceDay = day;
    this.services = [];
    const w = this.world;
    if (w.vehicles === false) return;
    const h = (a, b) => ((Math.imul((day * 2654435761 + a * 40503 + b * 97) | 0, 2246822519) >>> 0) % 10000) / 10000;
    const homes = w.buildings.filter((b) => b.daireler);
    const doorOf = (b) => [b.x + Math.sin(b.rot) * (b.d / 2 + 6), b.z + Math.cos(b.rot) * (b.d / 2 + 6)];
    // Çağrı sayısı nüfusla orantılı: 3.200 sakinde günde 4 ambulans, 1 yangın tatbikatı; boş adada hiç.
    const lively = Math.min(1, (w.population ?? 0) / 3200);
    if (w.hospital && homes.length) {
      for (let c = 0; c < Math.round(4 * lively); c++) {
        this.services.push({ kind: "ambulans", t: 480 + h(1, c) * 840, from: w.hospital.bay, to: doorOf(homes[Math.floor(h(2, c) * homes.length)]), dwell: 8 });
      }
    }
    if (w.fireStation && homes.length && h(5, 0) < lively) {
      this.services.push({ kind: "itfaiye", t: 600 + h(3, 0) * 600, from: w.fireStation.bay, to: doorOf(homes[Math.floor(h(4, 0) * homes.length)]), dwell: 15 });
    }
    if (w.depot && this.containers.length) this.services.push({ kind: "cop", t: 360, from: w.depot.bay });
  }

  _spawnServices(minute) {
    this.services.forEach((sv, idx) => {
      if (sv.done || minute < sv.t) return;
      const key = `svc:${this.serviceDay}:${idx}`;
      if (this.active.has(key) || this.finished.has(key)) return;
      if (sv.kind === "cop") {
        if (minute > sv.t + 150) { sv.done = true; return; }
        if (!sv.route) {
          // Çöp kamyonu: depodan çıkar, konteynerleri sırayla boşaltır, depoya döner.
          const order = [...this.containers].sort((a, b) => a.z - b.z || a.x - b.x);
          const pts = [sv.from, ...order.map((c) => [c.x, c.z]), sv.from];
          const pieces = [];
          sv.stopsAt = [];
          for (let i = 0; i + 1 < pts.length; i++) {
            const r = this.route(pts[i], pts[i + 1]);
            if (!r) continue;
            for (const p of r.pieces) pieces.push({ kind: p.kind, pts: p.pts, lane: p.lane, c0: p.c0, next: p.next, node: p.node, end: p.end });
          }
          if (!pieces.length) { sv.done = true; return; }
          sv.route = new Route(pieces);
          for (const p of sv.route.pieces) if (p.kind === "out") sv.stopsAt.push(p.s1 - 0.5);
          sv.stopsAt.pop();
        }
        this.active.set(key, { key, kind: "cop", route: sv.route, s: 0, v: 0, L: 8.5, stops: sv.stopsAt, served: 0, dwell: 25, seen: true, svc: sv, occ: {} });
        return;
      }
      if (minute > sv.t + 60) { sv.done = true; return; }
      if (!sv.out) {
        sv.out = this.route(sv.from, sv.to);
        sv.back = this.route(sv.to, sv.from);
        if (!sv.out || !sv.back) { sv.done = true; return; }
      }
      this.active.set(key, { key, kind: sv.kind, route: sv.out, s: 0, v: 0, L: sv.kind === "itfaiye" ? 9 : 6, emergency: true, seen: true, svc: sv, phase: "out", occ: {} });
    });
  }

  /**
   * Benzetimi ilerletir. dtSec: geçen benzetim süresi (sn), minute: şimdiki dakika.
   * Araçlar IDM (akıllı sürücü modeli) ile öndeki araca, ışıklara ve duraklara göre hızlanır/yavaşlar.
   */
  step(dtSec, minute, day) {
    if (this.serviceDay !== day) {
      this._planServices(day);
      this.finished = new Set();
      for (const [k, v] of this.active) if (v.kind !== "car" && v.kind !== "taxi") this.active.delete(k);
    }
    const tNow = minute * 60;
    if (this.simT == null || Math.abs(tNow - this.simT - dtSec) > 90 || dtSec < 0) {
      // Zaman sıçradı: otobüsler çizelgeden yeniden kurulur.
      for (const [k, v] of this.active) if (v.kind === "bus") this.active.delete(k);
      for (const k of [...this.finished]) if (k.startsWith("bus:")) this.finished.delete(k);
    }
    this.simT = tNow;
    this._spawnBuses(minute);
    this._spawnServices(minute);
    let remain = Math.min(Math.max(0, dtSec), 120);
    const h = 0.25;
    while (remain > 1e-6) {
      const dt = Math.min(h, remain);
      remain -= dt;
      this._substep(dt, tNow - remain);
    }
    this._tickServices(minute);
    for (const [k, v] of this.active) {
      if (v.kind === "car" || v.kind === "taxi") {
        if (!v.seen) this.active.delete(k);
        v.seen = false;
      }
    }
  }

  /** Bir sakin bu seferde bu duraktan binecek ya da inecek. */
  requestStop(line, dep, stop) {
    const key = `bus:${line}:${dep}`;
    if (!this.busRequests.has(key)) this.busRequests.set(key, new Set());
    this.busRequests.get(key).add(stop);
    // Bu durakta bu sefere binecek kaçıncı yolcu (bekleme yerindeki sırası için).
    const rk = `${key}:${stop}`;
    const n = this.stopRiders.get(rk) ?? 0;
    this.stopRiders.set(rk, n + 1);
    return n;
  }

  _substep(dt, tSec) {
    const lanes = new Map();
    for (const v of this.active.values()) {
      if (v.parked) continue;
      v.route.occupancy(v.s, v.occ);
      const key = v.occ.lane;
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key).push(v);
    }
    for (const list of lanes.values()) list.sort((a, b) => a.occ.coord - b.occ.coord);
    for (const v of this.active.values()) {
      if (v.parked) continue;
      const { route } = v;
      const k = v.occ.k;
      const piece = route.pieces[k];
      let gap = Infinity, lv = 0;
      const list = lanes.get(v.occ.lane);
      const ahead = list[list.indexOf(v) + 1];
      if (ahead) { gap = ahead.occ.coord - v.occ.coord - (ahead.L + v.L) / 2; lv = ahead.v; }
      else {
        for (let j = k + 1; j < route.pieces.length && j <= k + 3; j++) {
          const p = route.pieces[j];
          if (p.kind !== "lane" || p.lane === v.occ.lane) continue;
          const nl = lanes.get(p.lane);
          if (nl?.length) {
            const f = nl[0];
            const g2 = p.s0 - v.s + Math.max(0, f.occ.coord - p.c0) - (f.L + v.L) / 2;
            if (g2 < gap) { gap = g2; lv = f.v; }
          }
          break;
        }
      }
      // Trafik ışığı.
      if (!v.emergency && piece.kind === "lane" && route.pieces[k + 1]?.kind === "conn") {
        const conn = route.pieces[k + 1];
        if (conn.node?.signal && conn.end) {
          const gs = piece.s1 - STOP_INSET + 0.8 - v.s - v.L / 2;
          if (gs > -0.5) {
            const st = signalState(conn.node, conn.end.group, tSec);
            const canGo = st === "g" || (st === "y" && (v.v * v.v) / 7 > gs);
            if (!canGo && gs < gap) { gap = Math.max(0.01, gs); lv = 0; }
          }
        }
      }
      // Otobüs durakları: binen ya da inen yoksa durmadan geçer.
      if (v.kind === "bus") {
        const line = this.lines[v.line];
        const st = line.stops[v.served];
        if (st && !this.busRequests.get(v.key)?.has(v.served)) {
          if (st.s - v.s < 0.5) v.served++;
        } else if (st) {
          const gs = st.s - v.s;
          if (gs < 0.8 && v.v < 0.6) {
            v.arrivedAt ??= tSec;
            const leave = Math.max(v.arrivedAt + 12, (v.depMin + st.offset) * 60 + BUS_DWELL);
            if (tSec >= leave) { v.served++; v.arrivedAt = null; }
            else { v.v = 0; continue; }
          } else if (gs + S0 - 0.3 < gap) { gap = Math.max(0.01, gs + S0 - 0.3); lv = 0; }
        }
      }
      // Çöp kamyonu konteyner durakları.
      if (v.stops) {
        const st = v.stops[v.served];
        if (st != null) {
          const gs = st - v.s;
          if (gs < 0.8 && v.v < 0.6) {
            v.waitUntil ??= tSec + v.dwell;
            if (tSec >= v.waitUntil) { v.served++; v.waitUntil = null; }
            else { v.v = 0; continue; }
          } else if (gs + S0 - 0.3 < gap) { gap = Math.max(0.01, gs + S0 - 0.3); lv = 0; }
        }
      }
      // Durak ve rota sonu "duvar" değil hedef noktadır: izleme modelinin güvenlik boşluğu (S0)
      // eklenir ki araç tam o noktada dursun (yoksa 2 m geride kalıp hiç varamaz).
      const ge = route.len - v.s;
      if (ge + S0 < gap) { gap = Math.max(0.01, ge + S0 + 0.1); lv = 0; }
      const base = piece.kind === "lane" ? this.lanes[piece.lane].vmax : piece.kind === "conn" ? TURN_V : piece.rev ? 1.4 : 3.5;
      const vmax = base * (v.emergency ? 1.25 : v.kind === "bus" || v.kind === "cop" ? 0.85 : 1);
      const a = 1.6, b = 2.6, T = 1.3, s0 = S0;
      const dv = v.v - lv;
      const sStar = s0 + Math.max(0, v.v * T + (v.v * dv) / (2 * Math.sqrt(a * b)));
      let acc = a * (1 - (v.v / vmax) ** 4 - (sStar / Math.max(0.1, gap)) ** 2);
      acc = Math.max(-9, acc);
      v.v = Math.max(0, v.v + acc * dt);
      v.braking = acc < -0.8 || (v.v < 0.2 && gap < 6);
      v.s = Math.min(route.len, v.s + v.v * dt);
      if (v.s >= route.len - 0.05) this._arrive(v);
    }
  }

  _arrive(v) {
    if (v.kind === "car" || v.kind === "taxi") {
      v.parked = true;
      v.v = 0;
      this.finished.add(v.key);
      return;
    }
    if (v.kind === "bus" || v.kind === "cop") {
      this.active.delete(v.key);
      this.finished.add(v.key);
      if (v.svc) v.svc.done = true;
      return;
    }
    if (v.phase === "out") { v.phase = "wait"; v.parked = true; v.v = 0; }
    else if (v.phase === "back") { this.active.delete(v.key); this.finished.add(v.key); v.svc.done = true; }
  }

  _tickServices(minute) {
    for (const v of this.active.values()) {
      if (v.phase === "wait") {
        v.until ??= minute + v.svc.dwell;
        if (minute >= v.until) { v.phase = "back"; v.parked = false; v.route = v.svc.back; v.s = 0; }
      }
    }
  }
}

// --- çizim ---

function box(w, h, d, x = 0, y = 0, z = 0, color = "#ffffff") {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed();
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute("uv");
  return g;
}

function wheels(wb, track, r) {
  const parts = [];
  for (const z of [-wb / 2, wb / 2]) for (const x of [-track / 2, track / 2]) {
    const g = new THREE.CylinderGeometry(r, r, 0.24, 12).rotateZ(Math.PI / 2).translate(x, r, z).toNonIndexed();
    const arr = new Float32Array(g.attributes.position.count * 3).fill(0.12);
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute("uv");
    parts.push(g);
  }
  return parts;
}

function merged(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** Araç türleri: gövde (instance rengi), camlar (yarı saydam: içerideki sürücü görünür), ışıklar. Ön +z. */
const MODELS = {
  car: () => ({
    body: merged([box(1.8, 0.62, 4.3, 0, 0.32, 0), box(1.64, 0.1, 1.15, 0, 0.94, 1.45), box(1.64, 0.1, 0.8, 0, 0.94, -1.75)]),
    glass: merged([box(1.6, 0.5, 2.05, 0, 0.94, -0.25, "#3a4a5c")]),
    roof: merged([box(1.52, 0.07, 1.75, 0, 1.44, -0.3)]),
    fixed: merged([...wheels(2.6, 1.6, 0.33), box(1.82, 0.14, 0.2, 0, 0.34, 2.12, "#2a2a2e"), box(1.82, 0.14, 0.2, 0, 0.34, -2.12, "#2a2a2e"), box(0.08, 0.06, 0.2, 0.9, 1.0, 0.75, "#2a2a2e"), box(0.08, 0.06, 0.2, -0.9, 1.0, 0.75, "#2a2a2e")]),
    head: merged([box(0.32, 0.12, 0.06, -0.6, 0.72, 2.16, "#fff6d8"), box(0.32, 0.12, 0.06, 0.6, 0.72, 2.16, "#fff6d8")]),
    tail: merged([box(0.32, 0.12, 0.06, -0.6, 0.72, -2.16, "#d8302c"), box(0.32, 0.12, 0.06, 0.6, 0.72, -2.16, "#d8302c")]),
  }),
  bus: () => ({
    body: merged([box(2.5, 2.55, 12, 0, 0.4, 0)]),
    glass: merged([box(2.52, 1.0, 10.2, 0, 1.6, -0.5, "#30404f"), box(2.3, 1.3, 0.06, 0, 1.35, 6.0, "#30404f")]),
    fixed: merged([...wheels(6.6, 2.2, 0.5), box(2.4, 0.15, 11.8, 0, 2.95, 0, "#e9eef2"), box(1.6, 0.3, 0.05, 0, 2.55, 6.03, "#111111"), box(0.05, 2.1, 1.2, -1.26, 0.5, 3.4, "#28323e"), box(0.05, 2.1, 1.2, -1.26, 0.5, -1.2, "#28323e")]),
    head: merged([box(0.4, 0.18, 0.06, -0.9, 0.7, 6.02, "#fff6d8"), box(0.4, 0.18, 0.06, 0.9, 0.7, 6.02, "#fff6d8"), box(1.4, 0.2, 0.04, 0, 2.6, 6.06, "#ffb648")]),
    tail: merged([box(0.3, 0.3, 0.06, -1.0, 0.8, -6.02, "#d8302c"), box(0.3, 0.3, 0.06, 1.0, 0.8, -6.02, "#d8302c")]),
  }),
  ambulans: () => ({
    body: merged([box(2.0, 2.1, 5.6, 0, 0.45, -0.3, "#f6f6f4"), box(1.95, 1.0, 1.3, 0, 0.45, 2.85, "#f6f6f4")]),
    glass: merged([box(1.85, 0.6, 0.9, 0, 1.45, 2.45, "#3a4a5c")]),
    fixed: merged([...wheels(3.4, 1.7, 0.38), box(2.02, 0.3, 5.62, 0, 1.15, -0.3, "#d8302c"), box(0.6, 0.3, 0.06, 0, 1.6, -3.12, "#d8302c")]),
    head: merged([box(0.3, 0.14, 0.06, -0.65, 0.85, 3.52, "#fff6d8"), box(0.3, 0.14, 0.06, 0.65, 0.85, 3.52, "#fff6d8")]),
    tail: merged([box(0.3, 0.2, 0.06, -0.8, 0.9, -3.12, "#d8302c"), box(0.3, 0.2, 0.06, 0.8, 0.9, -3.12, "#d8302c")]),
    flash: merged([box(0.5, 0.18, 0.3, -0.45, 2.58, 2.0, "#ffffff"), box(0.5, 0.18, 0.3, 0.45, 2.58, 2.0, "#ffffff")]),
  }),
  itfaiye: () => ({
    body: merged([box(2.4, 2.4, 8.6, 0, 0.55, -0.4, "#c8231f"), box(2.35, 1.4, 2.0, 0, 0.55, 4.3, "#c8231f")]),
    glass: merged([box(2.2, 0.8, 1.2, 0, 1.55, 4.6, "#3a4a5c")]),
    fixed: merged([...wheels(5.2, 2.0, 0.5), box(0.9, 0.25, 7.5, 0, 3.0, -0.6, "#d9dde2"), box(0.06, 0.25, 7.5, -0.45, 3.25, -0.6, "#d9dde2"), box(0.06, 0.25, 7.5, 0.45, 3.25, -0.6, "#d9dde2"), box(2.42, 0.15, 8.62, 0, 1.5, -0.4, "#f2f2ef")]),
    head: merged([box(0.36, 0.16, 0.06, -0.8, 0.95, 5.32, "#fff6d8"), box(0.36, 0.16, 0.06, 0.8, 0.95, 5.32, "#fff6d8")]),
    tail: merged([box(0.3, 0.2, 0.06, -1.0, 1.0, -4.72, "#d8302c"), box(0.3, 0.2, 0.06, 1.0, 1.0, -4.72, "#d8302c")]),
    flash: merged([box(0.6, 0.2, 0.35, -0.5, 2.98, 4.4, "#ffffff"), box(0.6, 0.2, 0.35, 0.5, 2.98, 4.4, "#ffffff")]),
  }),
  cop: () => ({
    body: merged([box(2.4, 2.6, 5.8, 0, 0.6, -1.3, "#4f8a3e"), box(2.35, 1.6, 2.0, 0, 0.55, 2.8, "#f2f2ef")]),
    glass: merged([box(2.2, 0.8, 1.0, 0, 1.45, 3.4, "#3a4a5c")]),
    fixed: merged([...wheels(4.4, 2.0, 0.5), box(2.42, 0.12, 5.82, 0, 1.6, -1.3, "#f2c230"), box(2.2, 1.6, 0.3, 0, 0.8, -4.25, "#3d6e30")]),
    head: merged([box(0.36, 0.16, 0.06, -0.8, 0.95, 3.82, "#fff6d8"), box(0.36, 0.16, 0.06, 0.8, 0.95, 3.82, "#fff6d8")]),
    tail: merged([box(0.3, 0.2, 0.06, -1.0, 1.0, -4.42, "#d8302c"), box(0.3, 0.2, 0.06, 1.0, 1.0, -4.42, "#d8302c")]),
    flash: merged([box(0.4, 0.15, 0.3, 0, 2.2, 3.0, "#ffffff")]),
  }),
};

const CAR_COLORS = ["#e9e9e6", "#2b2d31", "#8d9399", "#b8312f", "#2f4f7a", "#c9c3b5", "#5b6e4f", "#a8a29a", "#1f3b5c", "#7d2b2b"].map((c) => new THREE.Color(c));
export const TAXI_COLOR = new THREE.Color("#f2c230");
const ON = new THREE.Color(1, 1, 1), OFF = new THREE.Color(0.12, 0.12, 0.12), DIM = new THREE.Color(0.5, 0.5, 0.5), BRAKE = new THREE.Color(1.7, 1.7, 1.7);
const FLASH_A = new THREE.Color(2.0, 0.15, 0.15), FLASH_B = new THREE.Color(0.2, 0.45, 2.0), AMBER = new THREE.Color(2.0, 1.2, 0.1);

export class Vehicles {
  constructor(capacity) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
    const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.42, depthWrite: false });
    const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.group = new THREE.Group();
    this.types = {};
    const caps = { car: capacity, bus: 40, ambulans: 6, itfaiye: 3, cop: 3 };
    for (const [type, f] of Object.entries(MODELS)) {
      const meshes = {};
      for (const [name, geo] of Object.entries(f())) {
        const m = new THREE.InstancedMesh(geo, name === "glass" ? glassMat : name === "head" || name === "tail" || name === "flash" ? lightMat : mat, caps[type]);
        m.count = 0;
        m.castShadow = name === "body" || name === "fixed";
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (name === "glass") m.renderOrder = 3;
        meshes[name] = m;
        this.group.add(m);
      }
      this.types[type] = { meshes, n: 0, cap: caps[type], records: [] };
    }
    this.taxiSign = new THREE.InstancedMesh(merged([box(0.62, 0.22, 0.3, 0, 1.5, -0.3, "#1a1a1a")]), mat, Math.max(8, capacity >> 3));
    this.taxiSign.count = 0;
    this.group.add(this.taxiSign);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
  }

  begin() {
    for (const t of Object.values(this.types)) { t.n = 0; t.records.length = 0; }
    this.nt = 0;
  }

  /** opts: {color, taxi, lights (false: sönük), brake, flash (zaman), record}. */
  add(type, x, y, z, heading, opts = {}) {
    const T = this.types[type];
    if (T.n >= T.cap) return;
    const i = T.n++;
    this._q.setFromAxisAngle(this.up, heading);
    this._m.compose(this._p.set(x, y, z), this._q, this._one);
    for (const m of Object.values(T.meshes)) m.setMatrixAt(i, this._m);
    if (opts.color) {
      T.meshes.body.setColorAt(i, opts.color);
      T.meshes.roof?.setColorAt(i, opts.color);
    }
    const lit = opts.lights !== false;
    T.meshes.head.setColorAt(i, lit ? ON : OFF);
    T.meshes.tail.setColorAt(i, lit ? (opts.brake ? BRAKE : DIM) : OFF);
    if (T.meshes.flash) {
      const on = opts.flash != null;
      const blink = on && Math.floor(opts.flash * 4) % 2 === 0;
      T.meshes.flash.setColorAt(i, !on ? OFF : type === "cop" ? (blink ? AMBER : OFF) : blink ? FLASH_A : FLASH_B);
    }
    if (opts.taxi && this.nt < this.taxiSign.instanceMatrix.count) this.taxiSign.setMatrixAt(this.nt++, this._m);
    T.records[i] = opts.record ?? null;
  }

  addCar(x, y, z, heading, colorIndex, opts = {}) {
    this.add("car", x, y, z, heading, { ...opts, color: opts.taxi ? TAXI_COLOR : CAR_COLORS[colorIndex % CAR_COLORS.length] });
  }

  end() {
    for (const T of Object.values(this.types)) {
      for (const m of Object.values(T.meshes)) {
        m.count = T.n;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
    this.taxiSign.count = this.nt;
    this.taxiSign.instanceMatrix.needsUpdate = true;
  }

  /** Işın hangi araca çarpıyor? Kaydı döner. */
  pick(raycaster) {
    let best = null;
    for (const T of Object.values(this.types)) {
      for (const name of ["body", "glass"]) {
        const hit = raycaster.intersectObject(T.meshes[name])[0];
        if (hit && hit.instanceId != null && (!best || hit.distance < best.distance)) best = { distance: hit.distance, record: T.records[hit.instanceId] };
      }
    }
    return best?.record ?? null;
  }
}

/** Trafik ışıkları: her ışıklı kavşak kolunda, dur çizgisinin sağ köşesinde direk ve üç lamba. */
export function buildSignals(traffic, world) {
  const items = [], peds = [];
  for (const n of traffic.nodes) {
    if (!n.signal) continue;
    for (const e of n.ends) {
      const r = e.edge.road;
      if (!(r.carriage > 0) || r.type === "giris" || !(e.trim > 0)) continue;
      const inDir = [-e.dir[0], -e.dir[1]];
      const rr = right(inDir);
      const base = add(n.p, mul(e.dir, e.trim + STOP_INSET + 0.6));
      const p = add(base, mul(rr, r.width / 2 - 0.55));
      items.push({ node: n, group: e.group, x: p[0], z: p[1], heading: Math.atan2(e.dir[0], e.dir[1]), y: world.surfaceY(p[0], p[1]) + 0.18 });
      world.addObstacleCircle(p[0], p[1], 0.25);
      // Yaya lambaları: geçidin iki ucunda, karşı kaldırıma bakar. Sağdaki araç direğinde, soldakinin
      // kendi kısa direği var.
      const pl = add(base, mul(rr, -(r.width / 2 - 0.55)));
      if (e.cross) peds.push({ node: n, group: e.group, x: p[0], z: p[1], y: world.surfaceY(p[0], p[1]) + 0.18, heading: Math.atan2(-rr[0], -rr[1]), pole: false });
      if (e.cross) {
        peds.push({ node: n, group: e.group, x: pl[0], z: pl[1], y: world.surfaceY(pl[0], pl[1]) + 0.18, heading: Math.atan2(rr[0], rr[1]), pole: true });
        world.addObstacleCircle(pl[0], pl[1], 0.2);
      }
    }
  }
  const N = Math.max(1, items.length);
  const metal = new THREE.MeshStandardMaterial({ color: "#2d3138", roughness: 0.5, metalness: 0.5 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 3.1, 8).translate(0, 1.55, 0), metal, N);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.95, 0.28).translate(0, 3.4, 0), metal, N);
  const visor = new THREE.InstancedMesh(mergeGeometries([0, 1, 2].map((k) => new THREE.BoxGeometry(0.3, 0.04, 0.16).translate(0, 3.75 - k * 0.3, 0.2))), metal, N);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12).rotateX(Math.PI / 2), lampMat, N * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.heading);
    m.compose(v.set(it.x, it.y, it.z), q, one);
    pole.setMatrixAt(i, m); head.setMatrixAt(i, m); visor.setMatrixAt(i, m);
    for (let k = 0; k < 3; k++) {
      const off = new THREE.Vector3(0, 3.7 - k * 0.3, 0.15).applyQuaternion(q);
      m.compose(v.set(it.x + off.x, it.y + off.y, it.z + off.z), q, one);
      lamps.setMatrixAt(i * 3 + k, m);
    }
  });
  for (const mesh of [pole, head, visor]) { mesh.count = items.length; mesh.castShadow = true; }
  lamps.count = items.length * 3;
  // Yaya lambası: iki bölmeli kutu (üstte kırmızı duran adam, altta yeşil yürüyen adam), siperlikli.
  const P = Math.max(1, peds.length);
  const pedPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 8).translate(0, 1.3, 0), metal, P);
  const pedHead = new THREE.InstancedMesh(mergeGeometries([
    new THREE.BoxGeometry(0.3, 0.62, 0.2).translate(0, 2.35, 0.12),
    new THREE.BoxGeometry(0.28, 0.03, 0.14).translate(0, 2.68, 0.25),
    new THREE.BoxGeometry(0.28, 0.03, 0.14).translate(0, 2.37, 0.25),
  ]), metal, P);
  const manTex = pedFigures();
  const pedLamps = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.24), new THREE.MeshBasicMaterial({ map: manTex.stand, transparent: true, toneMapped: false }), P);
  const pedWalk = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.24), new THREE.MeshBasicMaterial({ map: manTex.walk, transparent: true, toneMapped: false }), P);
  let np = 0;
  peds.forEach((it, i) => {
    q.setFromAxisAngle(up, it.heading);
    m.compose(v.set(it.x, it.y, it.z), q, one);
    pedHead.setMatrixAt(i, m);
    if (it.pole) pedPole.setMatrixAt(np++, m);
    const top = new THREE.Vector3(0, 2.5, 0.225).applyQuaternion(q), bot = new THREE.Vector3(0, 2.2, 0.225).applyQuaternion(q);
    m.compose(v.set(it.x + top.x, it.y + top.y, it.z + top.z), q, one); pedLamps.setMatrixAt(i, m);
    m.compose(v.set(it.x + bot.x, it.y + bot.y, it.z + bot.z), q, one); pedWalk.setMatrixAt(i, m);
  });
  pedPole.count = np; pedHead.count = pedLamps.count = pedWalk.count = peds.length;
  pedPole.castShadow = pedHead.castShadow = true;
  const group = new THREE.Group();
  group.add(pole, head, visor, lamps, pedPole, pedHead, pedLamps, pedWalk);
  const RED = new THREE.Color(2.2, 0.15, 0.1), YEL = new THREE.Color(2.2, 1.4, 0.1), GRN = new THREE.Color(0.2, 2.0, 0.6), DARK = new THREE.Color(0.08, 0.08, 0.08);
  const PRED = new THREE.Color(2.4, 0.25, 0.15), PGRN = new THREE.Color(0.3, 2.2, 1.0), PDARK = new THREE.Color(0.1, 0.1, 0.1);
  group.userData.update = (tSec) => {
    items.forEach((it, i) => {
      const st = signalState(it.node, it.group, tSec);
      lamps.setColorAt(i * 3, st === "r" ? RED : DARK);
      lamps.setColorAt(i * 3 + 1, st === "y" ? YEL : DARK);
      lamps.setColorAt(i * 3 + 2, st === "g" ? GRN : DARK);
    });
    const blink = Math.floor(tSec * 2) % 2 === 0;
    peds.forEach((it, i) => {
      const st = pedState(it.node, it.group, tSec);
      pedLamps.setColorAt(i, st === "r" ? PRED : PDARK);
      pedWalk.setColorAt(i, st === "g" || (st === "f" && blink) ? PGRN : PDARK);
    });
    for (const mesh of [lamps, pedLamps, pedWalk]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return group;
}

/** Yaya lambası figürleri (duran ve yürüyen adam), beyaz; renk örnek rengiyle verilir. */
function pedFigures() {
  const draw = (walk) => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineCap = "round";
    g.beginPath(); g.arc(32, 12, 6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8;
    g.beginPath(); g.moveTo(32, 22); g.lineTo(walk ? 30 : 32, 40); g.stroke();
    g.lineWidth = 6;
    if (walk) {
      g.beginPath(); g.moveTo(30, 40); g.lineTo(20, 58); g.moveTo(30, 40); g.lineTo(40, 57); g.stroke();
      g.beginPath(); g.moveTo(31, 25); g.lineTo(21, 36); g.moveTo(32, 25); g.lineTo(42, 33); g.stroke();
    } else {
      g.beginPath(); g.moveTo(29, 40); g.lineTo(28, 58); g.moveTo(35, 40); g.lineTo(36, 58); g.stroke();
      g.beginPath(); g.moveTo(28, 25); g.lineTo(25, 41); g.moveTo(36, 25); g.lineTo(39, 41); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { stand: draw(false), walk: draw(true) };
}

/** Otobüs durakları: kaldırımın arkasında sundurma, bank ve hat tabelası. */
export function buildStops(traffic, world) {
  const group = new THREE.Group();
  const roofMat = new THREE.MeshStandardMaterial({ color: "#d9e3ea", roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85 });
  const frame = new THREE.MeshStandardMaterial({ color: "#3c4148", roughness: 0.5, metalness: 0.5 });
  for (const line of traffic.lines) {
    const sign = new THREE.MeshStandardMaterial({ color: line.color, roughness: 0.6 });
    for (const s of line.stops) {
      const y = world.groundY(...s.shelter);
      const g = new THREE.Group();
      g.position.set(s.shelter[0], y, s.shelter[1]);
      // Sundurmanın açık yüzü yola bakar.
      g.rotation.y = s.heading + Math.PI / 2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 1.6), roofMat);
      roof.position.set(0, 2.5, 0.1);
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.1, 0.06), roofMat);
      back.position.set(0, 1.35, -0.65);
      const posts = [-1.75, 1.75].map((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), frame); p.position.set(x, 1.25, -0.65); return p; });
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.4), frame);
      bench.position.set(0, 0.48, -0.4);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), frame);
      pole.position.set(2.3, 1.4, 0.4);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), sign);
      plate.position.set(2.3, 2.6, 0.4);
      g.add(roof, back, ...posts, bench, pole, plate);
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      group.add(g);
      world.addObstacleRect(s.shelter[0], s.shelter[1], 3.8, 1.6, s.heading + Math.PI / 2);
    }
  }
  return group;
}
