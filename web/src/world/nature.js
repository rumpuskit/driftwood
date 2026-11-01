// Ağaçlar (New England: akçaağaç, meşe, sahil çamı, ardıç) ve bulutlar. Boylar gerçektir. Akçaağaç ve meşenin
// rengi mevsime göre (world.month): Ekim–Kasım sonbahar renkleri, kışın soluk.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

/** Ardıç: tabandan sivri uca daralan, hafif kabarık gövde. */
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
const REF = { camk: 9, servi: 8, akcaagac: 10, mese: 11 };

/** Mevsim renkleri (ay 0-11). Akçaağaç: yazın yeşil, Ekim–Kasım kırmızı-turuncu-sarı, kışın soluk kahve. */
function seasonColors(kind, month) {
  if (kind === "akcaagac") {
    if (month >= 9 && month <= 10) return ["#c8452c", "#e07a2a", "#e9b23a", "#b8352f", "#d9662f", "#f0c24a"];
    if (month === 8) return ["#7aa755", "#a8b04a", "#6f9d4c", "#c9a23a"];
    if (month === 11 || month <= 2) return ["#8d7a66", "#9a8670", "#7f6e5c"];
    return ["#6f9d4c", "#7aa755", "#64913f", "#86ad5c"];
  }
  if (kind === "mese") {
    if (month >= 9 && month <= 10) return ["#9a6a35", "#a8743a", "#7f5a32", "#8f7a3a"];
    if (month === 11 || month <= 2) return ["#7a6650", "#857058", "#6e5c48"];
    return ["#567f3c", "#4f7536", "#5e8a42"];
  }
  return null;
}

const KINDS = {
  camk: {
    // Sahil çamı (pitch pine): eğri gövde, katlı ve dağınık koyu taç.
    h: [7, 11], trunkR: 0.26, colors: ["#3f6236", "#46693a", "#385a30"],
    trunk: (v) => { const lean = [0.5, -0.7, 0.2][v]; return mergeColored([
      branch([0, 0, 0], [lean, 7.4, 0.2], 0.28, 0.14, "#5e4a3a"),
      branch([lean * 0.6, 4.6, 0.1], [lean + 1.5, 5.6, 0.5], 0.1, 0.05, "#5e4a3a"),
      branch([lean * 0.7, 5.6, 0.1], [lean - 1.4, 6.5, -0.6], 0.1, 0.05, "#5e4a3a"),
    ]); },
    crown: (v) => { const lean = [0.5, -0.7, 0.2][v]; return mergeColored([
      colored(clumps("camk-a" + v, 4, 1.4, 1.3, 0.55, 5.5).translate(lean * 0.7 + 0.9, 0, 0.3), "#ffffff"),
      colored(clumps("camk-b" + v, 4, 1.3, 1.2, 0.55, 6.4).translate(lean * 0.8 - 0.9, 0, -0.4), "#ffffff"),
      colored(clumps("camk-c" + v, 5, 1.3, 1.4, 0.6, 7.6).translate(lean, 0, 0.2), "#ffffff"),
    ]); },
  },
  servi: {
    // Doğu kırmızı ardıcı (eastern red cedar): fundalık ve kumul kenarlarında dar, sivri.
    h: [5, 9], trunkR: 0.16, colors: ["#3c5a34", "#35502f", "#43603a"],
    trunk: () => mergeColored([branch([0, 0, 0], [0, 1.2, 0], 0.16, 0.12, "#6b5040")]),
    crown: (v) => cypress(REF.servi * [1, 0.92, 1.06][v]),
  },
  akcaagac: {
    // Şeker akçaağacı: düz gövde, yuvarlak dolgun taç.
    h: [8, 13], trunkR: 0.34, colors: ["#6f9d4c"],
    trunk: (v) => { const t = [0.1, 0.35, -0.25][v]; return mergeColored([
      branch([0, 0, 0], [t, 5.2, 0], 0.36, 0.24, "#6e6258"),
      branch([t, 4.2, 0], [t + 1.4, 6.2, 0.5], 0.15, 0.08, "#6e6258"),
      branch([t, 4.5, 0], [t - 1.2, 6.4, -0.7], 0.15, 0.08, "#6e6258"),
      branch([t, 4.8, 0], [t + 0.2, 6.6, 1.3], 0.13, 0.07, "#6e6258"),
    ]); },
    crown: (v) => colored(clumps("akcaagac" + v, 8 + v, 1.7 + v * 0.2, 2.3, [0.95, 0.88, 1.0][v], 7.0).translate([0.1, 0.35, -0.25][v], 0, 0), "#ffffff"),
  },
  mese: {
    // Ak meşe: kalın gövde, geniş ve basık, düzensiz taç.
    h: [9, 14], trunkR: 0.45, colors: ["#567f3c"],
    trunk: (v) => { const t = [0.2, -0.4, 0.5][v]; return mergeColored([
      branch([0, 0, 0], [t, 4.4, 0], 0.48, 0.32, "#5f5348"),
      branch([t, 3.8, 0], [t + 2.4, 5.8, 0.7], 0.2, 0.1, "#5f5348"),
      branch([t, 4.0, 0], [t - 2.2, 6.0, -0.9], 0.2, 0.1, "#5f5348"),
      branch([t, 4.2, 0], [t + 0.3, 6.4, 2.2], 0.18, 0.09, "#5f5348"),
    ]); },
    crown: (v) => colored(clumps("mese" + v, 9 + v, 2.6 + v * 0.3, 2.4, [0.7, 0.62, 0.75][v], 7.0).translate([0.2, -0.4, 0.5][v], 0, 0), "#ffffff"),
  },
};

function treeKind(world, x, z, h, roll, zone) {
  if (world.sdf(x, z) > -45 || zone === "kumul") return roll < 0.75 ? "camk" : "servi";
  if (zone === "tepe") return roll < 0.55 ? "servi" : "camk";
  if (zone === "mahalle") return roll < 0.5 ? "akcaagac" : roll < 0.85 ? "mese" : "camk";
  if (zone === "merkez") return roll < 0.7 ? "akcaagac" : "mese";
  return roll < 0.42 ? "mese" : roll < 0.75 ? "camk" : "akcaagac";
}

function treeDensity(world, x, z, h, zone) {
  if (world.sdf(x, z) > -35 && h < 1.6) return 0; // kumsal
  if (zone === "mahalle" || zone === "merkez") {
    // Parklar yalnız yerleşik alanda: büyük park (göl) ve mahalle parkları.
    if ((world._bigParks ??= world.plazas.filter((p) => p.kind === "park")).some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1)) return 0.5;
    if (world.parks.some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1)) return 0.35;
    return zone === "mahalle" ? 0.22 : 0.08;
  }
  if ((world._bigParks ??= world.plazas.filter((p) => p.kind === "park")).some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1)) return 0.5;
  if (zone === "tepe") return 0.03 + Math.max(0, fbm(x / 70, z / 70, 32)) * 0.25; // fundalık: seyrek ardıç
  if (zone === "kumul") return 0.015;
  if (zone === "tarla") return 0.03;
  // Kır: korular ve açıklıklar.
  return 0.015 + Math.max(0, fbm(x / 140, z / 140, 31)) * 0.65;
}

export function buildTrees(world) {
  const spots = [];
  const { x0, x1, z0, z1 } = world.bounds;
  const step = 7;
  for (let gx = Math.floor((x0 - 150) / step); gx <= (x1 + 150) / step; gx++) {
    for (let gz = Math.floor((z0 - 150) / step); gz <= (z1 + 150) / step; gz++) {
      const roll = hash2(gx, gz, 43);
      if (roll > 0.5) continue; // yoğunluk hiçbir yerde 0,5'i geçmez: pahalı hesaplardan önce ele
      const x = (gx + hash2(gx, gz, 41)) * step, z = (gz + hash2(gx, gz, 42)) * step;
      if (world.isBlocked(x, z)) continue;
      const h = world.height(x, z);
      if (h < 1.0) continue;
      const zone = world.zoneAt(x, z);
      if (roll > treeDensity(world, x, z, h, zone)) continue;
      spots.push({ x, z, y: h - 0.15, kind: treeKind(world, x, z, h, hash2(gx, gz, 46), zone), r: hash2(gx, gz, 44), t: hash2(gx, gz, 45) });
    }
  }
  // Green'in akçaağaçları (sokak ağaçları).
  for (const f of world.features) if (f.type === "agac") spots.push({ x: f.x, z: f.z, y: world.groundY(f.x, f.z) - 0.05, kind: f.tur ?? "akcaagac", r: 0.6, t: (Math.abs(f.x * 7 + f.z * 3) % 100) / 100 });

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
      const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: name !== "servi", transparent: true, opacity: 1 });
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
        const palette = seasonColors(name, world.month ?? 9) ?? kind.colors;
        color.set(palette[Math.floor((t.t * 97 + t.r * 31) % palette.length)]);
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
