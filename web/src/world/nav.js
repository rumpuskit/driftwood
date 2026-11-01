// Yaya ağı: insanlar kaldırımlardan yürür, karşıya yalnızca yaya geçitlerinden geçer.
//  - Her taşıt yolunun iki yanında kaldırım çizgisi (kaldırımı olmayan köy yolunda banket) vardır.
//  - Kavşaklarda kaldırımlar köşeyi döner; her kolda yaya geçidi kaldırımları karşılıklı bağlar.
//    Işıklı kavşakta geçit, o kolun araçları kırmızıyken kullanılır (bekleme yürüyüş planına eklenir).
//  - Yaya yolları (çarşı caddeleri, sahil yolu, patikalar) kendi orta çizgileriyle ağa katılır;
//    meydanda girişler çeşmenin çevresinden dolanan yaylarla birbirine bağlanır.
import { stations } from "./roads.js";
import { MinHeap } from "./heap.js";

const CROSS_INSET = 2.3; // yaya geçidinin kavşak kesiminden uzaklığı (roads.js çizimiyle aynı)
const CROSS_PENALTY = 6; // geçitler biraz "pahalı": yayalar gereksiz yere karşıya geçmez

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const right = (d) => [-d[1], d[0]];

function polyLen(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  return cum;
}

function curve(a, c, b, n = 6) {
  if (!c) return [a, b];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

function intersect(p, d, q, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-3) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return add(p, mul(d, t));
}

export class PedNav {
  constructor(world) {
    this.world = world;
    this.nodes = []; // [x, z]
    this.edges = []; // {a, b, pts, cum, len, cross?}
    const net = world.network;
    const node = (p) => this.nodes.push([p[0], p[1]]) - 1;
    const edge = (a, b, pts, cross = null) => {
      const cum = polyLen(pts);
      this.edges.push({ a, b, pts, cum, len: cum[cum.length - 1], cross });
    };

    // 1. Kaldırım ve yaya yolu çizgileri.
    const endInfo = new Map(); // net end -> {R, L, rp, lp} ya da {P, pp}
    for (const e of net.edges) {
      const r = e.road;
      const car = r.carriage > 0;
      if (r.type === "giris") continue;
      const endA = e.a.ends.find((x) => x.edge === e && x.at === "a");
      const endB = e.b.ends.find((x) => x.edge === e && x.at === "b");
      if (car) {
        const hc = r.carriage / 2, hw = r.width / 2;
        const off = hw - hc > 0.3 ? (hc + hw) / 2 : hw + 0.6;
        const insetA = endA.trim > 0 ? CROSS_INSET : 0, insetB = endB.trim > 0 ? CROSS_INSET : 0;
        const st = stations(e.pts, e.trimA + insetA, e.trimB + insetB, 4);
        if (st.length < 2) continue;
        const side = {};
        for (const sgn of [1, -1]) {
          const pts = st.map((q) => [q.p[0] + q.n[0] * off * sgn, q.p[1] + q.n[1] * off * sgn]);
          const a = node(pts[0]), b = node(pts[pts.length - 1]);
          edge(a, b, pts);
          side[sgn] = { a, b, pa: pts[0], pb: pts[pts.length - 1] };
        }
        // Dış yöne göre sağ/sol: "a" ucunda +1 sağdadır, "b" ucunda solda.
        endInfo.set(endA, { R: side[1].a, L: side[-1].a, rp: side[1].pa, lp: side[-1].pa, off });
        endInfo.set(endB, { R: side[-1].b, L: side[1].b, rp: side[-1].pb, lp: side[1].pb, off });
      } else {
        const st = stations(e.pts, e.trimA, e.trimB, 4);
        if (st.length < 2) continue;
        const pts = st.map((q) => q.p);
        const a = node(pts[0]), b = node(pts[pts.length - 1]);
        edge(a, b, pts);
        endInfo.set(endA, { P: a, pp: pts[0] });
        endInfo.set(endB, { P: b, pp: pts[pts.length - 1] });
      }
    }

    // 2. Düğümler: köşeler, yaya geçitleri, yaya yollarının bağlanması.
    for (const n of net.nodes) {
      const walks = n.ends.filter((e) => endInfo.get(e)?.R != null).sort((x, y) => Math.atan2(x.dir[1], x.dir[0]) - Math.atan2(y.dir[1], y.dir[0]));
      const peds = n.ends.filter((e) => endInfo.get(e)?.P != null);
      const mids = [];
      if (walks.length >= 2) {
        walks.forEach((e, i) => {
          const f = walks[(i + 1) % walks.length];
          const A = endInfo.get(e), B = endInfo.get(f);
          const ctrl = intersect(A.rp, e.dir, B.lp, f.dir);
          const c = ctrl && len(sub(ctrl, n.p)) < 40 ? ctrl : null;
          const pts = curve(A.rp, c, B.lp);
          const mid = pts[Math.floor(pts.length / 2)];
          const m = node(mid);
          const h = Math.floor(pts.length / 2);
          edge(A.R, m, pts.slice(0, h + 1));
          edge(m, B.L, pts.slice(h));
          mids.push({ m, p: mid });
        });
      } else if (walks.length === 1) {
        const A = endInfo.get(walks[0]);
        edge(A.L, A.R, [A.lp, A.rp]);
      }
      // Kavşak kollarında yaya geçidi.
      for (const e of walks) {
        if (!e.cross) continue;
        const A = endInfo.get(e);
        edge(A.L, A.R, [A.lp, A.rp], { node: n, group: e.group, signal: n.signal });
      }
      // Düz devam eden yolu bir yaya yolu kesiyorsa: ışıksız geçit (iki yandaki köşe noktaları arasında).
      if (peds.length && walks.length === 2 && !walks.some((e) => e.trim > 0) && mids.length === 2) {
        edge(mids[0].m, mids[1].m, [mids[0].p, mids[1].p], { node: n, group: walks[0].group, signal: false });
      }
      for (const e of peds) {
        const P = endInfo.get(e);
        if (mids.length) {
          let best = mids[0];
          for (const q of mids) if (len(sub(q.p, P.pp)) < len(sub(best.p, P.pp))) best = q;
          edge(P.P, best.m, [P.pp, best.p]);
        } else if (walks.length) {
          const A = endInfo.get(walks[0]);
          const tgt = len(sub(A.rp, P.pp)) < len(sub(A.lp, P.pp)) ? [A.R, A.rp] : [A.L, A.lp];
          edge(P.P, tgt[0], [P.pp, tgt[1]]);
        }
      }
      if (!walks.length && peds.length > 1) {
        const c = node(n.p);
        for (const e of peds) {
          const P = endInfo.get(e);
          edge(P.P, c, [P.pp, n.p]);
        }
      }
    }

    // 3. Meydan: girişleri çeşmenin çevresinden dolanan yaylarla bağla.
    const plaza = world.plazas.find((p) => p.r);
    if (plaza) {
      const gates = [];
      this.nodes.forEach((p, i) => {
        if (Math.abs(len(sub(p, [plaza.x, plaza.z])) - plaza.r) < 3) gates.push(i);
      });
      for (let i = 0; i < gates.length; i++) {
        for (let j = i + 1; j < gates.length; j++) {
          const pa = this.nodes[gates[i]], pb = this.nodes[gates[j]];
          const a0 = Math.atan2(pa[1] - plaza.z, pa[0] - plaza.x);
          let da = Math.atan2(pb[1] - plaza.z, pb[0] - plaza.x) - a0;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          const R = 11.5, steps = Math.max(2, Math.ceil(Math.abs(da) / 0.2));
          const pts = [pa];
          for (let k = 0; k <= steps; k++) pts.push([plaza.x + Math.cos(a0 + (da * k) / steps) * R, plaza.z + Math.sin(a0 + (da * k) / steps) * R]);
          pts.push(pb);
          edge(gates[i], gates[j], pts);
        }
      }
    }

    // 4. Komşuluk ve ızgara.
    this.adj = this.nodes.map(() => []);
    this.edges.forEach((e, k) => {
      this.adj[e.a].push(k);
      this.adj[e.b].push(k);
    });
    this.grid = new Map();
    this.edges.forEach((e, k) => {
      for (let i = 1; i < e.pts.length; i++) {
        const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i];
        for (let gx = Math.floor((Math.min(ax, bx) - 1) / 30); gx <= Math.floor((Math.max(ax, bx) + 1) / 30); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - 1) / 30); gz <= Math.floor((Math.max(az, bz) + 1) / 30); gz++) {
            const key = gx * 100003 + gz;
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key).push([k, i]);
          }
        }
      }
    });
    const n = this.nodes.length;
    this.g = new Float64Array(n);
    this.stamp = new Int32Array(n);
    this.prev = new Int32Array(n);
    this.via = new Int32Array(n);
    this.run = 0;
  }

  /** Noktaya en yakın yaya çizgisi (geçitler hariç); bulamazsa genişleyerek arar. */
  locate(p) {
    const gx0 = Math.floor(p[0] / 30), gz0 = Math.floor(p[1] / 30);
    for (let ring = 1; ring <= 8; ring++) {
      let best = null;
      for (let gx = gx0 - ring; gx <= gx0 + ring; gx++) {
        for (let gz = gz0 - ring; gz <= gz0 + ring; gz++) {
          for (const [k, i] of this.grid.get(gx * 100003 + gz) ?? []) {
            const e = this.edges[k];
            if (e.cross) continue;
            const a = e.pts[i - 1], b = e.pts[i];
            const dx = b[0] - a[0], dz = b[1] - a[1];
            const l2 = dx * dx + dz * dz || 1;
            const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
            const q = [a[0] + dx * t, a[1] + dz * t];
            const d = len(sub(p, q));
            if (!best || d < best.d) best = { edge: k, along: e.cum[i - 1] + Math.sqrt(l2) * t, d, q };
          }
        }
      }
      if (best && best.d < ring * 30) return best;
    }
    return null;
  }

  _slice(e, a, b) {
    const at = (d) => {
      let j = 1;
      while (j < e.cum.length - 1 && e.cum[j] < d) j++;
      const u = (d - e.cum[j - 1]) / ((e.cum[j] - e.cum[j - 1]) || 1);
      return [e.pts[j - 1][0] + (e.pts[j][0] - e.pts[j - 1][0]) * u, e.pts[j - 1][1] + (e.pts[j][1] - e.pts[j - 1][1]) * u];
    };
    const out = [at(a)];
    if (a < b) { for (let j = 0; j < e.cum.length; j++) if (e.cum[j] > a && e.cum[j] < b) out.push(e.pts[j]); }
    else { for (let j = e.cum.length - 1; j >= 0; j--) if (e.cum[j] < a && e.cum[j] > b) out.push(e.pts[j]); }
    out.push(at(b));
    return out;
  }

  /**
   * A'dan B'ye yürüyüş: noktalar ve yol üstündeki yaya geçitleri ({d: geçide gelinen uzaklık, len, node,
   * group, signal}). A ve B ağa en yakın noktadan bağlanır.
   */
  route(A, B) {
    const la = this.locate(A), lb = this.locate(B);
    if (!la || !lb) return { pts: [A, B], crossings: [] };
    const ea = this.edges[la.edge], eb = this.edges[lb.edge];
    let core;
    if (la.edge === lb.edge) {
      core = { pts: this._slice(ea, la.along, lb.along), crossings: [] };
    } else {
      // A*: başlangıç kenarının iki ucundan, hedef kenarın iki ucuna.
      const run = ++this.run;
      const { g, stamp, prev, via } = this;
      const heap = new MinHeap();
      const h = (i) => len(sub(this.nodes[i], lb.q));
      const seed = (i, cost) => {
        if (stamp[i] === run && g[i] <= cost) return;
        stamp[i] = run; g[i] = cost; prev[i] = -1; via[i] = -1;
        heap.push(cost + h(i), i);
      };
      seed(ea.a, la.along);
      seed(ea.b, ea.len - la.along);
      const goalCost = (i) => (i === eb.a ? lb.along : i === eb.b ? eb.len - lb.along : Infinity);
      let best = Infinity, bestNode = -1;
      while (heap.size) {
        const u = heap.pop();
        if (heap.lastKey >= best) break;
        const gu = g[u];
        const gc = gu + goalCost(u);
        if (gc < best) { best = gc; bestNode = u; }
        for (const k of this.adj[u]) {
          const e = this.edges[k];
          const v = e.a === u ? e.b : e.a;
          const cost = gu + e.len + (e.cross ? CROSS_PENALTY : 0);
          if (stamp[v] !== run || cost < g[v]) {
            stamp[v] = run; g[v] = cost; prev[v] = u; via[v] = k;
            heap.push(cost + h(v), v);
          }
        }
      }
      if (bestNode < 0) return { pts: [A, B], crossings: [] };
      const chain = [];
      let first = bestNode;
      for (let v = bestNode; prev[v] >= 0; v = prev[v]) { chain.push([via[v], v]); first = prev[v]; }
      chain.reverse();
      const pts = this._slice(ea, la.along, first === ea.a ? 0 : ea.len);
      const crossings = [];
      let dist = la.d + (first === ea.a ? la.along : ea.len - la.along);
      let at = first;
      for (const [k, v] of chain) {
        const e = this.edges[k];
        const seg = e.a === at ? e.pts : [...e.pts].reverse();
        if (e.cross) crossings.push({ d: dist, len: e.len, ...e.cross });
        pts.push(...seg.slice(1));
        dist += e.len;
        at = v;
      }
      pts.push(...this._slice(eb, bestNode === eb.a ? 0 : eb.len, lb.along).slice(1));
      core = { pts, crossings };
    }
    const pts = [A, ...core.pts, B];
    const clean = [pts[0]];
    for (const p of pts.slice(1)) if (len(sub(p, clean[clean.length - 1])) > 0.05) clean.push(p);
    return { pts: clean, crossings: core.crossings };
  }
}
