// Driftwood Plajı'nın çizimi (düzen: layout.js _layoutBeach): şemsiye kümeleri ve şezlonglar, kumsala inen tahta
// yollar, duşlar, soyunma kabinleri, plaj voleybolu, yüzme alanı şamandıraları ve cankurtaran kulesi. Hepsi
// renkli köşeli tek geometrilerde birleşir (az çizim çağrısı); şamandıralar dalgayla hafifçe iner kalkar.
import * as THREE from "three";
import { box, colored, cyl, merged, MAT } from "./harbor.js";

const CANOPY = [["#e05a4a", "#f7f5f0"], ["#2f7fb5", "#f7f5f0"], ["#f2c14e", "#e8653a"], ["#3e8a86", "#f7f5f0"], ["#d98ca0", "#f7f5f0"]];
const MATTRESS = ["#2f7fb5", "#e05a4a", "#3e8a86", "#f2c14e", "#f7f5f0"];

/** Dizide k. eleman (k negatif olabilir: küme numarası kıyıdaki konumdan gelir). */
const pick = (arr, k) => arr[((k % arr.length) + arr.length) % arr.length];

/** Parçayı (yerel koordinatta kurulmuş geometri) dünya konumuna yerleştirir. */
function place(geo, x, y, z, rot) {
  return geo.rotateY(rot).translate(x, y, z);
}

export function buildBeach(world) {
  const B = world.beach;
  const group = new THREE.Group();
  if (!B) return group;
  const parts = [];
  const gy = (x, z) => Math.max(world.height(x, z), 0.3);
  const rot = B.face;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  // Yerel (sağ, ileri=deniz) → dünya.
  const off = (x, z, lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];

  // Şezlong: alüminyum çerçeve, renkli minder, ayak ucunda yastık yok (baş kara tarafında, hafif yastık).
  const sunbed = (x, z, color) => {
    const y = gy(x, z);
    const g = [
      box(0.66, 0.05, 1.9, 0, 0.3, 0, "#d9dde2"),
      box(0.6, 0.06, 1.84, 0, 0.36, 0, color),
      box(0.56, 0.08, 0.32, 0, 0.43, -0.74, "#f7f5f0"),
      ...[[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]].map(([lx, lz]) => box(0.04, 0.3, 0.04, lx, 0.15, lz, "#9aa3ad")),
    ];
    parts.push(...g.map((p) => place(p, x, y, z, rot)));
  };
  // Şemsiye: direk, sekiz dilimli iki renkli kubbe, tepe topuzu.
  const umbrella = (x, z, k) => {
    const y = gy(x, z);
    const [a, b] = pick(CANOPY, k);
    parts.push(cyl(0.035, 0.035, 2.5, x, y + 1.25, z, "#f7f5f0", 6));
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.ConeGeometry(1.5, 0.45, 8, 1, false, (i / 8) * Math.PI * 2, Math.PI / 4);
      parts.push(colored(seg.translate(x, y + 2.42, z), i % 2 ? a : b));
    }
    parts.push(cyl(0.06, 0.06, 0.1, x, y + 2.7, z, "#f7f5f0", 6));
  };
  B.clusters.forEach((c, i) => {
    umbrella(c.x, c.z, c.c);
    for (const side of [-1, 1]) {
      const [sx, sz] = off(c.x, c.z, side * 1.0, 0);
      sunbed(sx, sz, pick(MATTRESS, c.c + (side > 0 ? 1 : 0) + i));
    }
  });

  // Tahta yollar: kumsala inen 1,6 m genişlikte döşeme (tahtalar enine), kenar kirişleri.
  for (const { a, b } of B.walks) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), wr = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(len / 0.32);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      parts.push(place(box(1.6, 0.05, 0.26, 0, 0.04, 0, k % 2 ? "#b88a5e" : "#a87a50"), x, gy(x, z), z, wr));
    }
    for (const side of [-0.82, 0.82]) {
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      parts.push(place(box(0.06, 0.08, len, side, 0.03, 0, "#7a5a3e"), mx, gy(mx, mz), mz, wr));
    }
  }
  // Duş: paslanmaz boru, başlık, ahşap ızgara, musluk.
  for (const [x, z] of B.showers) {
    const y = gy(x, z);
    parts.push(place(box(1.1, 0.06, 1.1, 0, 0.03, 0, "#a87a50"), x, y, z, rot));
    parts.push(cyl(0.05, 0.05, 2.4, x, y + 1.2, z, "#c9ced4", 8));
    parts.push(place(box(0.5, 0.05, 0.05, 0, 2.38, 0.25, "#c9ced4"), x, y, z, rot));
    const [hx, hz] = off(x, z, 0, 0.5);
    parts.push(cyl(0.14, 0.06, 0.08, hx, y + 2.32, hz, "#c9ced4", 10));
    parts.push(place(box(0.12, 0.08, 0.12, 0, 1.0, 0.07, "#2f7fb5"), x, y, z, rot));
  }
  // Soyunma kabinleri: beyaz gövde, renkli çizgili kapı, saçak; denize bakar.
  B.cabins.forEach(([x, z], i) => {
    const y = gy(x, z);
    const col = ["#2f7fb5", "#e05a4a", "#3e8a86", "#f2c14e"][i % 4];
    const g = [box(1.4, 2.2, 1.4, 0, 1.1, 0, "#f7f5f0")];
    for (let s = 0; s < 4; s++) g.push(box(0.95, 0.38, 0.03, 0, 0.35 + s * 0.48, 0.71, s % 2 ? "#f7f5f0" : col));
    g.push(box(1.6, 0.1, 1.6, 0, 2.25, 0.05, col), box(0.4, 0.14, 0.4, 0, 0.07, 0.95, "#a87a50"));
    parts.push(...g.map((p) => place(p, x, y, z, rot)));
  });
  // Çöp kutuları (plaj tipi, mavi).
  for (const [x, z] of B.bins) {
    const y = gy(x, z);
    parts.push(cyl(0.28, 0.26, 0.85, x, y + 0.42, z, "#2f7fb5", 10), cyl(0.3, 0.3, 0.06, x, y + 0.87, z, "#f7f5f0", 10));
  }
  // Plaj voleybolu: iki direk, file (koyu şerit + ağ), saha ipi.
  if (B.volley) {
    const { x, z } = B.volley, y = gy(x, z), r = B.volley.rot + Math.PI / 2;
    const g = [];
    for (const lx of [-4.6, 4.6]) g.push(cyl(0.06, 0.06, 2.6, lx, 1.3, 0, "#f7f5f0", 8));
    g.push(box(9.0, 0.06, 0.03, 0, 2.4, 0, "#1d1d22"), box(9.0, 0.06, 0.03, 0, 1.6, 0, "#1d1d22"));
    for (let k = 0; k <= 30; k++) g.push(box(0.012, 0.8, 0.012, -4.5 + k * 0.3, 2.0, 0, "#3a3f47"));
    for (const [lx, lz, w, d] of [[0, -8, 8, 0.05], [0, 8, 8, 0.05], [-4, 0, 0.05, 16], [4, 0, 0.05, 16]]) g.push(box(w, 0.02, d, lx, 0.02, lz, "#2f7fb5"));
    parts.push(...g.map((p) => place(p, x, y, z, r)));
  }
  // Cankurtaran kulesi: dört ayak üstünde platform ve küçük kulübe, rampa merdiven, kırmızı-beyaz boya,
  // bayrak direği (sarı-kırmızı) ve can simidi.
  const tower = world.features.find((f) => f.type === "cankurtaran");
  if (tower) {
    const { x, z } = tower, y = gy(x, z);
    const g = [];
    for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.push(box(0.14, 2.3, 0.14, lx, 1.15, lz, "#f7f5f0"));
    for (const lz of [-0.9, 0.9]) g.push(box(1.9, 0.08, 0.08, 0, 0.9, lz, "#f7f5f0"));
    g.push(box(2.4, 0.12, 2.4, 0, 2.3, 0, "#a87a50"));
    g.push(box(2.2, 0.9, 0.06, 0, 2.8, 1.17, "#d8433d"), box(0.06, 0.9, 2.2, -1.17, 2.8, 0, "#d8433d"), box(0.06, 0.9, 2.2, 1.17, 2.8, 0, "#d8433d"));
    g.push(box(1.6, 1.5, 1.2, 0, 3.05, -0.55, "#f7f5f0"), box(1.9, 0.1, 1.6, 0, 3.85, -0.5, "#d8433d"));
    g.push(box(0.6, 0.06, 0.5, 0, 2.75, 0.3, "#e05a4a"), box(0.6, 0.5, 0.06, 0, 3.0, 0.05, "#e05a4a"));
    for (let k = 0; k < 8; k++) g.push(box(0.8, 0.06, 0.3, 0, 0.25 + k * 0.27, -1.4 - k * 0.24, "#a87a50"));
    g.push(cyl(0.04, 0.04, 6, 1.6, 3.0, 1.6, "#f7f5f0", 6));
    g.push(box(0.9, 0.6, 0.02, 2.05, 5.6, 1.6, "#e8c23a"), box(0.9, 0.3, 0.02, 2.05, 5.45, 1.6, "#d8433d"));
    g.push(colored(new THREE.TorusGeometry(0.32, 0.09, 6, 14).rotateY(Math.PI / 2).translate(1.22, 2.7, 0), "#f28c28"));
    parts.push(...g.map((p) => place(p, x, y, z, rot)));
  }
  const mesh = new THREE.Mesh(merged(parts.map((g) => (g.index ? g.toNonIndexed() : g))), MAT);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);

  // Yüzme alanı: şamandıralı ip (beyaz-kırmızı yüzücüler), uçlarda büyük sarı şamandıra. Dalgayla iner kalkar.
  const floats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.5 }), B.buoys.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  B.buoys.forEach(([x, z], i) => {
    const big = i === 0 || i === B.buoys.length - 1;
    m4.makeScale(big ? 2.4 : 1, big ? 2.4 : 1, big ? 2.4 : 1).setPosition(x, 0.05, z);
    floats.setMatrixAt(i, m4);
    floats.setColorAt(i, col.set(big ? "#f2c230" : i % 2 ? "#d8433d" : "#f7f5f0"));
  });
  group.add(floats);
  const rope = new THREE.BufferGeometry().setFromPoints(B.buoys.map(([x, z]) => new THREE.Vector3(x, 0.05, z)));
  group.add(new THREE.Line(rope, new THREE.LineBasicMaterial({ color: "#f7f5f0" })));
  const base = B.buoys.map(([x, z]) => [x, z]);
  group.userData.tick = (t) => {
    base.forEach(([x, z], i) => {
      const big = i === 0 || i === base.length - 1;
      m4.makeScale(big ? 2.4 : 1, big ? 2.4 : 1, big ? 2.4 : 1).setPosition(x, 0.05 + 0.06 * Math.sin(t * 1.3 + i * 0.7), z);
      floats.setMatrixAt(i, m4);
    });
    floats.instanceMatrix.needsUpdate = true;
  };
  return group;
}
