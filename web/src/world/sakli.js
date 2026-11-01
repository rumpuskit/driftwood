// Günün saklı nesnesi: her gün adanın bir köşesinde küçük bir nesne (şişede mektup, kayıp kedi, eski pusula,
// kırmızı balon, deniz kabuğu). Metinler İngilizce (gazete: "Hidden on the island today: a lost cat. Look on the beach"). Yeri ve türü günden türetilir: herkes aynı yerde görür. Bulan dokunur; bulunan
// günler bu cihazda tutulur (seri), bulanların sayısı Worker'da (anonim) sayılır.
import * as THREE from "three";
import { roll } from "../sim.js";

const ITEMS = [
  { id: "sise", ad: "a message in a bottle", make: bottle },
  { id: "kedi", ad: "a lost cat", make: cat },
  { id: "pusula", ad: "an old compass", make: compass },
  { id: "balon", ad: "a red balloon", make: balloon },
  { id: "kabuk", ad: "a giant seashell", make: shell },
];

function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra }); }

function bottle() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.32, 12), mat("#7fc9b8", { transparent: true, opacity: 0.75, roughness: 0.15 })));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 10), mat("#7fc9b8", { transparent: true, opacity: 0.75 })); neck.position.y = 0.22; g.add(neck);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), mat("#a0764b")); cork.position.y = 0.3; g.add(cork);
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8), mat("#f3e6c4")); g.add(paper);
  g.rotation.z = Math.PI / 2.4; g.position.y = 0.1;
  return g;
}
function cat() {
  const g = new THREE.Group(), m = mat("#e39a3b"), dark = mat("#2b2b2b");
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.26, 4, 8).rotateZ(Math.PI / 2), m); body.position.y = 0.2; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m); head.position.set(0.25, 0.32, 0); g.add(head);
  for (const z of [-0.05, 0.05]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), m); ear.position.set(0.25, 0.44, z); g.add(ear); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 5, 4), dark); eye.position.set(0.35, 0.34, z * 0.8); g.add(eye); }
  for (const [x, z] of [[0.13, 0.06], [0.13, -0.06], [-0.13, 0.06], [-0.13, -0.06]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), m); leg.position.set(x, 0.07, z); g.add(leg); }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 6), m); tail.position.set(-0.26, 0.32, 0); tail.rotation.z = -0.6; g.add(tail);
  return g;
}
function compass() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 20), mat("#c9a14a", { metalness: 0.6, roughness: 0.3 })));
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.052, 20), mat("#f4ead2")); g.add(face);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.01, 0.02), mat("#c8312f")); needle.position.y = 0.032; needle.rotation.y = 0.6; g.add(needle);
  g.position.y = 0.03;
  return g;
}
function balloon() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10).scale(1, 1.2, 1), mat("#e0463c", { roughness: 0.3 })); b.position.y = 1.5; g.add(b);
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.25, 4), mat("#f4f4f4")); str.position.y = 0.66; g.add(str);
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06), mat("#8a8a8a")); stone.position.y = 0.04; g.add(stone);
  return g;
}
function shell() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 12, 1, true).rotateZ(Math.PI / 2), mat("#f2c9b4", { side: THREE.DoubleSide }));
  s.position.y = 0.1; g.add(s);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 14).rotateY(Math.PI / 2), mat("#f7dccb")); lip.position.set(0.17, 0.1, 0); g.add(lip);
  return g;
}

/** Saklanacak yerler: kıyı, tepe, fener, iskeleler, meydan kenarı, mahalle arkaları (yürünebilir ve açık). */
function spots(world) {
  const out = [];
  const add = (x, z, area) => { if (world.isWalkable(x, z)) out.push({ x, z, area }); };
  for (const [x, z] of world.places.plaj?.anchors ?? []) add(x + 3, z - 2, "on the beach");
  const top = world.places.tepe?.anchors[0];
  if (top) for (let k = 0; k < 6; k++) { const a = k * 1.05; add(top[0] + Math.cos(a) * 22, top[1] + Math.sin(a) * 22, "up on Bluff Head"); }
  if (world.fener) for (let k = 0; k < 3; k++) add(world.fener.x + 8 * Math.cos(k * 2), world.fener.z + 8 * Math.sin(k * 2), "by the lighthouse");
  const pier = world.ferryPier;
  if (pier) add(pier.x0 - 8, pier.z0 - 6, "by the ferry landing");
  for (const s of world.places.iskele?.spots ?? []) add(s.x, s.z - 2, "on the town dock");
  for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.4; add(Math.cos(a) * 60, Math.sin(a) * 36, "around the Town Green"); }
  for (const b of world.buildings.filter((q) => q.daireler).slice(0, 12)) add(b.x - Math.sin(b.rot) * (b.d / 2 + 2.5), b.z - Math.cos(b.rot) * (b.d / 2 + 2.5), "behind the houses");
  return out;
}

export function buildHidden(world) {
  const group = new THREE.Group();
  const all = spots(world);
  let day = null, item = null, spot = null, obj = null;
  // Parıltı: nesnenin üstünde yavaş yanıp sönen küçük ışık (uzaktan seçilebilsin).
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const g2 = cv.getContext("2d"), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,240,180,1)"); gr.addColorStop(0.3, "rgba(255,220,120,0.6)"); gr.addColorStop(1, "rgba(255,220,120,0)");
  g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.4);
  group.add(glow);
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("sakli") ?? "[]"); } catch { return []; } },
    set(list) { try { localStorage.setItem("sakli", JSON.stringify(list.slice(-60))); } catch {} },
  };
  return {
    group,
    setDay(d) {
      if (d === day || !all.length) return;
      day = d;
      if (obj) group.remove(obj);
      item = ITEMS[roll(d, "sakli_tur") % ITEMS.length];
      spot = all[roll(d, "sakli_yer") % all.length];
      obj = item.make();
      obj.position.set(spot.x, world.groundY(spot.x, spot.z), spot.z);
      obj.rotation.y = (roll(d, "sakli_yon") % 628) / 100;
      obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      group.add(obj);
      glow.position.set(spot.x, world.groundY(spot.x, spot.z) + (item.id === "balon" ? 1.6 : 0.5), spot.z);
      group.visible = !this.found();
    },
    update(real) {
      if (!obj || !group.visible) return;
      glow.material.opacity = 0.35 + 0.35 * Math.sin(real * 2.2);
      if (item.id === "balon") obj.children[0].position.y = 1.5 + Math.sin(real * 1.3) * 0.06;
    },
    pick(raycaster) {
      if (!obj || !group.visible) return false;
      return raycaster.intersectObject(obj, true).length > 0 || raycaster.ray.distanceToPoint(glow.position) < 0.9;
    },
    found() { return day != null && store.get().includes(day); },
    /** Bulundu: bu güne işaretler; seri (bugünden geriye kesintisiz gün sayısı) döner. */
    markFound() {
      const list = store.get();
      if (!list.includes(day)) list.push(day);
      store.set(list);
      group.visible = false;
      let n = 0;
      while (list.includes(day - n)) n++;
      return { seri: n, toplam: list.length };
    },
    info() { return item && spot ? { ad: item.ad, area: spot.area, x: spot.x, z: spot.z, day } : null; },
  };
}
