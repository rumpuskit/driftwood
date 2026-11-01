// Ağaçlar (fıstık çamı, servi, çınar, zeytin, palmiye) ve bulutlar. Boylar gerçektir.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CELL_D, CELL_W } from "./layout.js";
import { fbm, hash2, rng } from "./noise.js";

/** Birkaç yumruyu birleştirip doğal görünen bir taç yapar (merkez y'de). */
function clumps(seedText, lumps, spread, radius, squash, y = 0) {
  const rand = rng(seedText);
  const parts = [];
  for (let i = 0; i < lumps; i++) {
    const r = radius * (0.7 + rand() * 0.45);
    const g = new THREE.IcosahedronGeometry(r, 1);
    const a = rand() * Math.PI * 2, d = i === 0 ? 0 : spread * (0.5 + rand() * 0.5);
    g.scale(1, squash, 1).translate(Math.cos(a) * d, y + (rand() - 0.4) * radius * squash * 0.7, Math.sin(a) * d);
    parts.push(g);
  }
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  return m;
}

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

function mergeColored(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** Gövdeden tepeye uzanan dal: (x0,y0,z0) -> (x1,y1,z1). */
function branch(a, b, r0, r1, color) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(r1, r0, dir.length(), 6).translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(...a);
  return colored(g, color);
}

/** Palmiye gövdesi: hafif kavisli, halkalı (açık ve koyu bantlar). */
function palmTrunk(H, bend) {
  const parts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = bend * t0 * t0, x1 = bend * t1 * t1;
    const r0 = 0.24 - 0.08 * t0, r1 = 0.24 - 0.08 * t1;
    parts.push(branch([x0, t0 * H, 0], [x1, t1 * H, 0], r0 * (i % 2 ? 1 : 1.08), r1, i % 2 ? "#8c7458" : "#a38a6a"));
  }
  return mergeColored(parts);
}

/** Palmiye tacı: kavis yapıp sarkan yapraklar (orta damar ve iki yana inen yaprakçıklar) ve hindistan cevizleri. */
function palmCrown(H, bend, seed) {
  const rand = rng(seed);
  const top = [bend, H, 0];
  const pos = [], col = [];
  const green = new THREE.Color("#5e8f3c"), tip = new THREE.Color("#8fae4f"), dark = new THREE.Color("#46702e");
  const push = (p, c) => { pos.push(...p); col.push(c.r, c.g, c.b); };
  const fronds = 11;
  for (let f = 0; f < fronds; f++) {
    const young = f >= fronds - 3;
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const L = young ? 2.2 : 3.4 + rand() * 0.8;
    const lift = young ? 1.6 : 0.9 + rand() * 0.3, droop = young ? 0.6 : 2.0 + rand() * 0.6;
    const ca = Math.cos(a), sa = Math.sin(a);
    const seg = 7;
    let prev = null;
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const r = L * t, y = lift * t - droop * t * t;
      const w = 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (young ? 0.6 : 1);
      const c = [top[0] + ca * r, top[1] + y, top[2] + sa * r];
      // Yaprakçıklar orta damardan iki yana ve aşağı iner (V kesit).
      const l = [c[0] - sa * w, c[1] - w * 0.45, c[2] + ca * w];
      const rr = [c[0] + sa * w, c[1] - w * 0.45, c[2] - ca * w];
      if (prev) {
        const cc = green.clone().lerp(tip, t), cd = dark.clone().lerp(tip, t * 0.7);
        for (const [p, q] of [[prev.l, l], [prev.r, rr]]) {
          push(prev.c, cc); push(c, cc); push(q, cd);
          push(prev.c, cc); push(q, cd); push(p, cd);
        }
      }
      prev = { c, l, r: rr };
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const nuts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    nuts.push(colored(new THREE.IcosahedronGeometry(0.16, 0).translate(top[0] + Math.cos(a) * 0.25, top[1] - 0.3, Math.sin(a) * 0.25), "#6b4a2a"));
  }
  const crown = mergeGeometries([g, ...nuts.map((n) => { n.deleteAttribute("normal"); return n; })]);
  crown.computeVertexNormals();
  return crown;
}

/** Selvi: tabandan sivri uca daralan, hafif kabarık gövde. */
function cypress(H) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)), 0.8) * (1 - t * 0.35) + (i === 10 ? 0 : 0.02), 0.6 + t * (H - 0.6)));
  }
  pts[10].x = 0;
  return colored(new THREE.LatheGeometry(pts, 9), "#ffffff");
}

// Her ağaç türü kendi referans boyunda tek parça kurulur (gövde + dallar + taç); örnekler yalnızca
// döndürülüp orantılı ölçeklenir. Böylece taç hep gövdeye oturur.
const REF = { cam: 11, servi: 11, cinar: 10, zeytin: 5, palmiye: 8.5 };
const KINDS = {
  cam: {
    h: [9, 13], trunkR: 0.3, colors: ["#4f7a3e", "#5b8546", "#46703a"],
    trunk: (v) => { const lean = [0.35, 0.9, -0.6][v]; return mergeColored([
      branch([0, 0, 0], [lean, 8.6, 0], 0.32, 0.2, "#7a5b45"),
      branch([lean * 0.85, 7.6, 0], [lean + 1.6, 9.2, 0.6], 0.14, 0.07, "#7a5b45"),
      branch([lean * 0.85, 7.9, 0], [lean - 1.7, 9.3, -0.9], 0.14, 0.07, "#7a5b45"),
      branch([lean * 0.95, 8.2, 0], [lean + 0.3, 9.3, 1.8], 0.12, 0.06, "#7a5b45"),
    ]); },
    crown: (v) => colored(clumps("cam" + v, 6 + v, 2.5 + v * 0.3, 2.3, 0.42, 9.7).translate([0.35, 0.9, -0.6][v], 0, 0), "#ffffff"),
  },
  servi: {
    h: [9, 14], trunkR: 0.18, colors: ["#3c5e34", "#35552f", "#40633a"],
    trunk: () => mergeColored([branch([0, 0, 0], [0, 1.6, 0], 0.17, 0.13, "#6b5040")]),
    crown: (v) => cypress(REF.servi * [1, 0.92, 1.06][v]),
  },
  cinar: {
    h: [8, 12], trunkR: 0.38, colors: ["#6f9d4c", "#7aa755", "#64913f", "#86ad5c"],
    trunk: (v) => { const t = [0.1, 0.5, -0.3][v]; return mergeColored([
      branch([0, 0, 0], [t, 5.6, 0], 0.4, 0.26, "#8a7560"),
      branch([t, 4.6, 0], [t + 1.6, 6.6, 0.5], 0.16, 0.08, "#8a7560"),
      branch([t, 4.9, 0], [t - 1.3, 6.8, -0.8], 0.16, 0.08, "#8a7560"),
      branch([t, 5.2, 0], [t + 0.2, 7.0, 1.5], 0.14, 0.07, "#8a7560"),
    ]); },
    crown: (v) => colored(clumps("cinar" + v, 7 + v, 1.9 + v * 0.25, 2.2, [0.85, 0.75, 0.95][v], 7.2).translate([0.1, 0.5, -0.3][v], 0, 0), "#ffffff"),
  },
  zeytin: {
    h: [4, 6], trunkR: 0.25, colors: ["#8a9c6d", "#7d9163", "#93a578"],
    trunk: (v) => { const t = [0.4, -0.3, 0.7][v]; return mergeColored([
      branch([0, 0, 0], [t, 1.6, 0.1], 0.26, 0.2, "#6e5a48"),
      branch([t, 1.5, 0.1], [t - 0.6, 2.9, 0.3], 0.18, 0.12, "#6e5a48"),
      branch([t, 1.6, 0.1], [t + 0.8, 2.8, -0.3], 0.14, 0.09, "#6e5a48"),
    ]); },
    crown: (v) => colored(clumps("zeytin" + v, 5 + v, 1.2 + v * 0.2, 1.35, 0.68, 3.4).translate([0.4, -0.3, 0.7][v] * 0.6, 0, 0), "#ffffff"),
  },
  palmiye: {
    h: [7, 10], trunkR: 0.26, colors: ["#ffffff", "#f2f6ea", "#eef4e2"],
    trunk: (v) => palmTrunk(REF.palmiye, [0.9, 1.6, 0.4][v]),
    crown: (v) => palmCrown(REF.palmiye, [0.9, 1.6, 0.4][v], "palmiye" + v),
  },
};

function treeKind(world, x, z, h, roll) {
  const d = world.sdf(x, z);
  if (d > world.margin(x, z) - 45) return roll < 0.35 ? "palmiye" : "cam";
  if (h > 9) return roll < 0.6 ? "cam" : "servi";
  const cell = world.cellByKey.get(`${Math.round(x / CELL_W)},${Math.round(z / CELL_D)}`);
  if (cell?.type === "kir") return roll < 0.7 ? "zeytin" : "servi";
  if (cell?.type === "mahalle") return roll < 0.5 ? "cinar" : roll < 0.75 ? "servi" : "zeytin";
  return roll < 0.45 ? "cam" : roll < 0.7 ? "cinar" : roll < 0.85 ? "servi" : "zeytin";
}

function treeDensity(world, x, z, h) {
  const cell = world.cellByKey.get(`${Math.round(x / CELL_W)},${Math.round(z / CELL_D)}`);
  const inPark = world.plazas.some((p) => p.kind === "park" && x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1);
  if (inPark) return 0.5;
  if (world.parks.some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1)) return 0.35;
  const d = world.sdf(x, z);
  if (d > world.margin(x, z) - 35 && h < 1.6) return 0; // kumsal
  if (!cell) return 0.18 + Math.max(0, fbm(x / 110, z / 110, 31)) * 1.3;
  if (cell.type === "mahalle") return 0.22;
  if (cell.type === "merkez") return 0.1;
  if (cell.type === "tepe") return 0.25 + Math.max(0, fbm(x / 70, z / 70, 32)) * 1.2;
  return 0.1;
}

export function buildTrees(world) {
  const spots = [];
  const { x0, x1, z0, z1 } = world.bounds;
  const step = 7;
  for (let gx = Math.floor((x0 - 150) / step); gx <= (x1 + 150) / step; gx++) {
    for (let gz = Math.floor((z0 - 150) / step); gz <= (z1 + 150) / step; gz++) {
      const x = (gx + hash2(gx, gz, 41)) * step, z = (gz + hash2(gx, gz, 42)) * step;
      if (world.isBlocked(x, z)) continue;
      const h = world.height(x, z);
      if (h < 1.0) continue;
      if (hash2(gx, gz, 43) > treeDensity(world, x, z, h)) continue;
      spots.push({ x, z, y: h - 0.15, kind: treeKind(world, x, z, h, hash2(gx, gz, 46)), r: hash2(gx, gz, 44), t: hash2(gx, gz, 45) });
    }
  }
  // Meydan çınarları ve sahil palmiyeleri.
  for (const f of world.features) if (f.type === "agac") spots.push({ x: f.x, z: f.z, y: world.groundY(f.x, f.z) - 0.05, kind: "cinar", r: 0.6, t: 0.3 });
  // Sahil yolu palmiyeleri: yolun kara tarafında, gezinti alanının dışında.
  for (const [i, [x, z]] of (world.promenade ?? []).entries()) {
    if (i % 2 !== 0) continue;
    const pz = z - 5.2;
    if (world.isLand(x, pz) && !world.roadIndex.at(x, pz)) spots.push({ x, z: pz, y: world.height(x, pz) - 0.1, kind: "palmiye", r: (i % 5) / 5, t: (i % 7) / 7 });
  }

  const group = new THREE.Group();
  const crowns = [];
  group.userData.crowns = crowns;
  const bark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const tilt = new THREE.Quaternion(), axis = new THREE.Vector3();
  const VARIANTS = 3;
  for (const [name, kind] of Object.entries(KINDS)) {
    const all = spots.filter((t) => t.kind === name && world.isWalkable(t.x, t.z));
    for (let v = 0; v < VARIANTS; v++) {
      // Her türün üç biçimi: gövde eğimi, dal yapısı ve taç şekli farklı.
      const list = all.filter((t) => Math.floor(t.t * 1000) % VARIANTS === v);
      if (!list.length) continue;
      const trunk = new THREE.InstancedMesh(kind.trunk(v), bark, list.length);
      const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: name !== "servi", transparent: true, opacity: 1, side: name === "palmiye" ? THREE.DoubleSide : THREE.FrontSide });
      crowns.push(crownMat);
      const crown = new THREE.InstancedMesh(kind.crown(v), crownMat, list.length);
      list.forEach((t, i) => {
        const h = kind.h[0] + t.r * (kind.h[1] - kind.h[0]);
        const k = h / REF[name];
        // Her ağaç biraz farklı: en-boy oranı, hafif eğim, renk tonu.
        const r2 = (t.t * 7.31) % 1, r3 = (t.r * 5.17 + t.t) % 1;
        const wide = 0.85 + r2 * 0.32, deep = 0.85 + r3 * 0.32;
        q.setFromAxisAngle(up, t.t * 6.283);
        axis.set(Math.cos(r2 * 6.283), 0, Math.sin(r2 * 6.283));
        tilt.setFromAxisAngle(axis, (r3 - 0.5) * (name === "servi" ? 0.05 : 0.12));
        q.premultiply(tilt);
        m.compose(pos.set(t.x, t.y, t.z), q, sc.set(k * wide, k, k * deep));
        trunk.setMatrixAt(i, m);
        crown.setMatrixAt(i, m);
        color.set(kind.colors[Math.floor(t.t * 97) % kind.colors.length]);
        color.offsetHSL((r2 - 0.5) * 0.04, (r3 - 0.5) * 0.12, (r2 - 0.5) * 0.08);
        crown.setColorAt(i, color);
        world.addObstacleCircle(t.x, t.z, kind.trunkR * k + 0.25);
      });
      for (const mesh of [trunk, crown]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
  }
  return group;
}

export function buildClouds(world) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0.9 });
  const { x0, x1, z0, z1 } = world.bounds;
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Mesh(clumps("bulut" + i, 6, 30, 22, 0.5), mat);
    cloud.position.set(x0 - 400 + hash2(i, 1, 55) * (x1 - x0 + 800), 520 + hash2(i, 2, 56) * 120, z0 - 400 + hash2(i, 3, 57) * (z1 - z0 + 800));
    cloud.userData.speed = 2 + hash2(i, 4, 58) * 3;
    group.add(cloud);
  }
  group.userData.span = [x0 - 600, x1 + 600];
  return group;
}

export function driftClouds(clouds, dt) {
  const [a, b] = clouds.userData.span;
  for (const c of clouds.children) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > b) c.position.x = a;
  }
}

/** Yakına inildiğinde ağaç tepeleri saydamlaşır; altındaki insanlar görünsün. */
export function fadeTrees(trees, distance) {
  const o = Math.min(1, Math.max(0.28, (distance - 25) / 70));
  for (const m of trees.userData.crowns) {
    m.opacity = o;
    m.depthWrite = o > 0.99;
  }
}
