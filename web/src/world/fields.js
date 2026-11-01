// Tarlaların bitki örtüsü (düzen: layout.js tarla parselleri, ekin türüyle): zeytinlikte ızgara düzeninde zeytin
// ağaçları, bağda telli asma sıraları, buğdayda başak sıraları, sebzede sıra sıra öbekler; her çiftliğin çevresinde
// ahşap çit. Hepsi InstancedMesh (binlerce bitki az çizim çağrısıyla).
import * as THREE from "three";

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

/** Aynı geometriden birçok kopya: [x, y, z, sx, sy, sz, rotY, renk?]. */
function batch(geo, mat, items, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach(([x, y, z, sx, sy, sz, r = 0, c], i) => {
    mesh.setMatrixAt(i, m4.compose(pos.set(x, y, z), q.setFromAxisAngle(up, r), sc.set(sx, sy, sz)));
    if (c) mesh.setColorAt(i, col.set(c));
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildFields(world) {
  const group = new THREE.Group();
  const fields = world.plazas.filter((p) => p.kind === "tarla");
  if (!fields.length) return group;
  const top = world.flatY + 0.08;
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
  const trunks = [], crowns = [], rows = [], bushes = [], vines = [], vinePosts = [], wires = [], posts = [], rails = [];
  for (const f of fields) {
    const w = f.x1 - f.x0, d = f.z1 - f.z0, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
    if (f.ekin === "zeytin") {
      // Zeytin: 7 m aralıklı ızgara; kısa, kıvrık gövde ve gri-yeşil yayvan tepe (her ağaç biraz farklı).
      for (let x = f.x0 + 4; x < f.x1 - 2; x += 7) for (let z = f.z0 + 4; z < f.z1 - 2; z += 7) {
        const h = hash(x, z), s = 0.85 + h * 0.35;
        trunks.push([x, top + 0.8 * s, z, s, s, s, h * 6]);
        crowns.push([x + (h - 0.5) * 0.6, top + 2.1 * s, z, 2.2 * s, 1.5 * s, 2.0 * s, h * 6, h > 0.5 ? "#8a9a6a" : "#7d8f62"]);
      }
    } else if (f.ekin === "bag") {
      // Bağ: 2,6 m aralıklı asma sıraları (uzun yaprak duvarı), sıra başlarında ve arada kazık, üstte tel.
      for (let z = f.z0 + 2; z < f.z1 - 1; z += 2.6) {
        vines.push([cx, top + 0.75, z, w - 4, 1.1, 0.7]);
        for (let x = f.x0 + 2; x <= f.x1 - 2; x += 6) vinePosts.push([x, top + 0.8, z, 1, 1, 1]);
        wires.push([cx, top + 1.45, z, w - 4, 1, 1]);
      }
    } else if (f.ekin === "bugday") {
      // Buğday: 1 m aralıklı başak sıraları (her sıra biraz farklı boyda), tarlanın uzun kenarı boyunca.
      for (let z = f.z0 + 1; z < f.z1 - 0.5; z += 1) rows.push([cx, top + 0.3, z, w - 2, 0.55 + hash(cx, z) * 0.2, 0.55, 0, hash(z, cx) > 0.5 ? "#d9be62" : "#cdb055"]);
    } else {
      // Sebze: 1,6 m aralıklı sıralarda yuvarlak öbekler (lahana, marul...).
      for (let z = f.z0 + 1.5; z < f.z1 - 1; z += 1.6) for (let x = f.x0 + 1.2; x < f.x1 - 1; x += 1.2) {
        const h = hash(x, z);
        bushes.push([x, top + 0.18, z, 0.45 + h * 0.15, 0.32, 0.45 + h * 0.15, h * 3, h > 0.66 ? "#6f9a3f" : h > 0.33 ? "#7fae45" : "#5f8a37"]);
      }
    }
  }
  // Çit: her çiftliğin (dört parselin) çevresinde, 3 m'de bir kazık ve iki kat ahşap kuşak; köy yolu tarafında kapı.
  const farms = new Map();
  for (const f of fields) {
    const k = Math.round(f.x0 / 190);
    const b = farms.get(k) ?? { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    farms.set(k, { x0: Math.min(b.x0, f.x0), z0: Math.min(b.z0, f.z0), x1: Math.max(b.x1, f.x1), z1: Math.max(b.z1, f.z1) });
  }
  for (const b of farms.values()) {
    const x0 = b.x0 - 2, x1 = b.x1 + 2, z0 = b.z0 - 2, z1 = b.z1 + 2, gate = (x0 + x1) / 2;
    const side = (ax, az, bx, bz, skipGate) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 3), r = Math.atan2(bx - ax, bz - az);
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
        if (skipGate && Math.abs(x - gate) < 2.5) continue;
        posts.push([x, world.groundY(x, z) + 0.6, z, 1, 1, 1]);
        if (k < n && !(skipGate && Math.abs(x + (bx - ax) / n / 2 - gate) < 2.5)) {
          const mx = x + (bx - ax) / n / 2, mz = z + (bz - az) / n / 2, gy = world.groundY(mx, mz);
          rails.push([mx, gy + 0.45, mz, 1, 1, len / n, r], [mx, gy + 0.95, mz, 1, 1, len / n, r]);
        }
      }
    };
    side(x0, z0, x1, z0); side(x0, z1, x1, z1, true); side(x0, z0, x0, z1); side(x1, z0, x1, z1);
  }
  const wood = std("#7a5a3e"), white = std("#ffffff");
  if (trunks.length) group.add(batch(new THREE.CylinderGeometry(0.16, 0.26, 1.6, 6).rotateZ(0.12), std("#6b5644"), trunks));
  if (crowns.length) group.add(batch(new THREE.IcosahedronGeometry(1, 1).scale(1, 0.7, 1), white, crowns));
  if (rows.length) group.add(batch(new THREE.BoxGeometry(1, 1, 1), white, rows, false));
  if (bushes.length) group.add(batch(new THREE.IcosahedronGeometry(1, 0), white, bushes, false));
  if (vines.length) group.add(batch(new THREE.BoxGeometry(1, 1, 1), std("#5f8a3a"), vines));
  if (vinePosts.length) group.add(batch(new THREE.BoxGeometry(0.08, 1.6, 0.08), wood, vinePosts, false));
  if (wires.length) group.add(batch(new THREE.BoxGeometry(1, 0.015, 0.015), std("#8a8f96"), wires, false));
  if (posts.length) group.add(batch(new THREE.BoxGeometry(0.12, 1.2, 0.12), wood, posts, false));
  if (rails.length) group.add(batch(new THREE.BoxGeometry(0.06, 0.08, 1), wood, rails, false));
  return group;
}
