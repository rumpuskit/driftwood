// Binalar ve kent eşyası. Ölçüler gerçektir (metre).
// Aynı parçalar (pencere, balkon, çatı...) tek bir InstancedMesh ile çizilir; telefonda da akıcı kalsın diye.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLAT_Y, FLOOR_H, playgroundItems, rihtimNoktalari, unitLayout } from "./layout.js";
import * as P from "./palette.js";
import * as T from "./textures.js";

/**
 * Dünya koordinatından üç yönlü doku: duvarlarda (x+z, y), çatılarda eğim yönüne göre. Instance ölçeği
 * dokuyu esnetmez; her binada aynı ölçekte sıva ve kiremit görünür.
 */
function worldTextured(material, tex, scale) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wTex = { value: tex };
    shader.uniforms.wScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;")
      .replace("#include <project_vertex>", `#include <project_vertex>
      vec4 wp4 = vec4(transformed, 1.0);
      vec3 wn = objectNormal;
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix * wp4;
        wn = mat3(instanceMatrix) * wn;
      #endif
      vWPos = (modelMatrix * wp4).xyz;
      vWNrm = normalize(mat3(modelMatrix) * wn);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; uniform sampler2D wTex; uniform float wScale;")
      .replace("#include <color_fragment>", `#include <color_fragment>
      vec3 an = abs(vWNrm);
      vec2 uvw = an.y > 0.6 ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
      diffuseColor.rgb *= texture2D(wTex, uvw / wScale).rgb * 1.08;`);
  };
  material.needsUpdate = true;
  return material;
}

const v = new THREE.Vector3();
const s = new THREE.Vector3();
const q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
}

/** Bina yerel koordinatından dünyaya: lx sağa, ly yukarı, lz öne (cephe +z). */
export function local(b, lx, ly, lz) {
  const c = Math.cos(b.rot), sn = Math.sin(b.rot);
  return v.set(b.x + lx * c + lz * sn, FLAT_Y + ly, b.z - lx * sn + lz * c);
}

class Batch {
  constructor(geometry, material, { shadow = true } = {}) {
    Object.assign(this, { geometry, material, shadow, items: [] });
  }

  add(pos, rot, scale, color) {
    q.setFromAxisAngle(UP, rot);
    this.items.push({ m: new THREE.Matrix4().compose(pos.clone(), q.clone(), scale.clone()), color: color != null ? new THREE.Color(color) : null, owner: Batch.owner });
    return this.items.length - 1;
  }

  build() {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, Math.max(1, this.items.length));
    mesh.count = this.items.length;
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.color) mesh.setColorAt(i, it.color);
    });
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = true;
    this.mesh = mesh;
    return mesh;
  }
}

/** Kırma çatı (dört yana eğimli). r = genişlik/derinlik; birim kutu içinde, mahya x ekseninde. */
function hipRoof(r) {
  const a = Math.max(0, 0.5 - 0.5 / r);
  const p = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, a, 1, 0, -0.5, 0, 0.5, a, 1, 0, -a, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -a, 1, 0, 0.5, 0, -0.5, -a, 1, 0, a, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -a, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, a, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

/** Beşik çatı: mahya x ekseninde, iki ucu üçgen alınlık. */
function gableRoof() {
  const p = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

const HIP_RATIOS = [1, 1.4, 1.8, 2.4];

/** Bina parçalarının toplandığı InstancedMesh kümeleri. */
export function makeKit() {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  return {
    B: {
      // walls: ahşap kaplama (clapboard); brick: tuğla cepheler (Main Street, kamu binaları)
      walls: new Batch(box, worldTextured(std(0xffffff, { roughness: 0.92 }), T.clapboard(), 2.4)),
      brick: new Batch(box, worldTextured(std(0xffffff, { roughness: 0.95 }), T.brick(), 1.7)),
      sheet: new Batch(box, worldTextured(std(0xffffff, { roughness: 0.6, metalness: 0.25 }), T.sheet(), 1.6)),
      plinth: new Batch(box, worldTextured(std("#b4ada3"), T.stoneBase(), 2.4)),
      trims: new Batch(box, std(0xffffff, { roughness: 0.7 }), { shadow: false }),
      hips: HIP_RATIOS.map((r) => new Batch(hipRoof(r), worldTextured(std(0xffffff, { roughness: 0.85, flatShading: true }), T.shingles(), 1.4))),
      gable: new Batch(gableRoof(), worldTextured(std(0xffffff, { roughness: 0.85, flatShading: true }), T.shingles(), 1.4)),
      spires: new Batch(new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), std(0xffffff, { roughness: 0.6, flatShading: true })),
      parapet: new Batch(box, std("#e7e2d9")),
      frames: new Batch(box, std("#f7f5f0", { roughness: 0.6 }), { shadow: false }),
      doors: new Batch(box, std("#6b4a35", { roughness: 0.6 }), { shadow: false }),
      slabs: new Batch(box, std("#e9e5dd")),
      rails: new Batch(box, std("#4a4f57", { roughness: 0.4, metalness: 0.5 }), { shadow: false }),
      awnings: new Batch(box, std(0xffffff, { roughness: 0.9 })),
      signs: new Batch(box, std(0xffffff, { roughness: 0.6 }), { shadow: false }),
      tanks: new Batch(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateZ(Math.PI / 2).translate(0, 0.5, 0), std("#d9dde2", { metalness: 0.4, roughness: 0.4 })),
      solar: new Batch(box, std("#24324f", { roughness: 0.3, metalness: 0.3 }), { shadow: false }),
      chimneys: new Batch(box, std("#a29a90")),
      railPanels: new Batch(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: T.railing(), alphaTest: 0.2, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.5, color: "#3a3f47" }), { shadow: false }),
      domes: new Batch(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff, { roughness: 0.5, metalness: 0.3 })),
      // Kemer başı: yarım daire levha (pencere ve revak kemerleri); ölçek x: yarıçap, z: kalınlık.
      arches: new Batch(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), std(0xffffff, { roughness: 0.8 }), { shadow: false }),
    },
    glass: new Batch(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), { shadow: false }),
    windowOwners: [], // cam -> {slot} (daire) veya {workplace, seed}
    windowInfo: [], // daire pencereleri: dünya konumu, dışa bakan yön, genişlik (tercih.js pencere çiçekleri)
    named: [], // adlı dükkân tabelaları: { owner, pos, rot, w, h, text, bg, fg, font }
  };
}

/**
 * Dükkân tabelası: zemin rengi üstünde işletmenin adı, kenarda ince çerçeve. Yazı tabelaya sığacak boyda;
 * yazı tipi geç yüklenirse (Nunito) bir kez yeniden çizilir.
 */
function nameSign({ w, h, text, bg, fg, font }) {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = Math.max(64, Math.round((1024 * h) / w));
  const g = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    g.fillStyle = bg;
    g.fillRect(0, 0, cv.width, cv.height);
    const bw = Math.max(6, cv.height * 0.07);
    g.strokeStyle = fg; g.globalAlpha = 0.55; g.lineWidth = bw * 0.5;
    g.strokeRect(bw, bw, cv.width - 2 * bw, cv.height - 2 * bw);
    g.globalAlpha = 1;
    let px = Math.round(cv.height * 0.56);
    const face = font === "serif" ? `italic 700 ${px}px Georgia, "Times New Roman", serif` : `900 ${px}px Nunito, sans-serif`;
    g.font = face;
    const max = cv.width - bw * 6;
    const tw = g.measureText(text).width;
    if (tw > max) { px = Math.floor(px * (max / tw)); g.font = face.replace(/\d+px/, `${px}px`); }
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, cv.width / 2, cv.height / 2 + px * 0.05);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
}

function kitBatches(K) {
  return [...Object.values(K.B).flatMap((x) => (Array.isArray(x) ? x : [x])), K.glass];
}

/** Kümeyi InstancedMesh'lere çevirir. */
export function buildKit(K) {
  const group = new THREE.Group();
  for (const batch of kitBatches(K)) group.add(batch.build());
  for (const n of K.named) {
    const m = nameSign(n);
    m.position.copy(n.pos);
    m.rotation.y = n.rot;
    n.mesh = m;
    group.add(m);
  }
  return group;
}

/** Bir binayı kümeye ekler. maxFloors verilirse yalnızca alttaki o kadar kat çizilir (kesit görünümü). */
export function drawBuilding(K, b, maxFloors = Infinity) {
  const { B, glass, windowOwners } = K;
  const addGlass = (b, lx, ly, lz, w, h, back, owner) => {
    glass.add(local(b, lx, ly, lz), b.rot + (back ? Math.PI : 0), s.set(w, h, 1), P.WINDOW_DAY);
    windowOwners.push(owner);
  };
  /** Pencere: çerçeve + cam + denizlik. side: 1 ön, -1 arka. */
  const addWindow = (b, lx, ly, side, w, h, owner) => {
    const z = side * (b.d / 2);
    B.frames.add(local(b, lx, ly - 0.08, z), b.rot, s.set(w + 0.24, h + 0.24, 0.16));
    // Cam çerçevenin (ön yüzü z ± 0,08) 2 cm önünde: uzaktan bakınca titreşmesin.
    addGlass(b, lx, ly + h / 2 - 0.08 + 0.04, z + side * 0.1, w, h, side < 0, owner);
    if (owner?.slot != null && K.windowInfo) {
      const at = local(b, lx, ly + 0.24, z + side * 0.1);
      K.windowInfo.push({ slot: owner.slot, x: at.x, y: at.y, z: at.z, nx: side * Math.sin(b.rot), nz: side * Math.cos(b.rot), w });
    }
    B.trims.add(local(b, lx, ly - 0.16, z + side * 0.1), b.rot, s.set(w + 0.5, 0.1, 0.28), "#f2efe8");
  };

  const floors = Math.min(b.floors, maxFloors);
  const full = floors === b.floors;
  const h = floors * FLOOR_H;
  if (floors <= 0) return;
  const st = b.style ?? {};
  // Duvar ve taş taban zeminin 0,8 m altından başlar: arazideki küçük iniş çıkışlar binanın dibinde
  // boşluk ya da titreşen kesişme bırakmaz.
  (b.industrial || st.diner ? B.sheet : isBrick(b) ? B.brick : B.walls).add(local(b, 0, -0.8, 0), b.rot, s.set(b.w, h + 0.8, b.d), b.wall);
  B.plinth.add(local(b, 0, -0.8, 0), b.rot, s.set(b.w + 0.12, b.industrial ? 1.6 : 1.4, b.d + 0.12));
  // Kat silmeleri.
  for (let f = 1; f < floors; f++) B.trims.add(local(b, 0, f * FLOOR_H - 0.1, 0), b.rot, s.set(b.w + 0.14, 0.2, b.d + 0.14), "#f6f3ee");
  // Çatı.
  if (full && b.roofType === "dome") {
    // Cami: kasnak üstünde kurşun kubbe ve alem.
    B.walls.add(local(b, 0, h, 0), b.rot, s.set(b.w * 0.82, 1.4, b.d * 0.82), b.wall);
    B.domes.add(local(b, 0, h + 1.4, 0), b.rot, s.set(b.w * 0.4, b.w * 0.36, b.d * 0.4), b.roof);
    B.rails.add(local(b, 0, h + 1.4 + b.w * 0.36, 0), b.rot, s.set(0.15, 1.6, 0.15));
  } else if (!full) {
    // Kesit görünümü: çatı yok, üst kat döşemesi.
    B.walls.add(local(b, 0, h, 0), b.rot, s.set(b.w + 0.1, 0.12, b.d + 0.1), "#d6d0c6");
  } else if (b.roofType === "hip") {
    const r = b.w / b.d;
    const k = HIP_RATIOS.reduce((best, x, i) => (Math.abs(x - r) < Math.abs(HIP_RATIOS[best] - r) ? i : best), 0);
    B.hips[k].add(local(b, 0, h, 0), b.rot, s.set(b.w + 1, b.d * 0.3, b.d + 1), b.roof);
    if (b.kind === "konut") B.chimneys.add(local(b, b.w * 0.25, h + b.d * 0.12, -b.d * 0.15), b.rot, s.set(0.6, b.d * 0.22, 0.6));
  } else if (b.roofType === "gable") {
    // Endüstriyel yapılarda çatı basık (sac, düşük eğim).
    const rh = b.industrial ? Math.min(2.6, b.d * 0.16) : Math.min(5, b.w * 0.35);
    B.gable.add(local(b, 0, h, 0), b.rot + Math.PI / 2, s.set(b.d + 0.8, rh, b.w + 0.8), b.roof);
  } else {
    B.walls.add(local(b, 0, h, 0), b.rot, s.set(b.w + 0.3, 0.12, b.d + 0.3), "#d6d0c6");
    for (const [lx, lz, w, d] of [[0, b.d / 2, b.w + 0.3, 0.3], [0, -b.d / 2, b.w + 0.3, 0.3], [b.w / 2, 0, 0.3, b.d], [-b.w / 2, 0, 0.3, b.d]]) {
      B.parapet.add(local(b, lx, h, lz), b.rot, s.set(w, 0.9, d));
    }
    if (b.kind === "konut" || b.kind === "otel") {
      // Çatıda güneş enerjili su ısıtıcıları.
      const n = Math.max(1, Math.floor(b.w / 6));
      for (let i = 0; i < n; i++) {
        const lx = -b.w / 2 + 3 + i * 5.5;
        B.solar.add(local(b, lx, h + 0.5, -1), b.rot, s.set(1.9, 0.08, 2.2));
        B.tanks.add(local(b, lx, h + 1.1, -2.6), b.rot, s.set(2, 0.6, 0.6));
      }
    }
  }

  if (b.kind === "konut" && b.house) {
    drawHouse(K, b, floors, full, addWindow);
    return;
  }

  if (b.kind === "konut") {
    // Apartman: ortada merdiven çekirdeği, iki yanında daireler (unitLayout). Her dairenin önde balkonlu
    // ya da düz penceresi, arkada penceresi var; çekirdeğin önünde her katta merdiven penceresi.
    const plan = unitLayout(b);
    const cumbaUnit = b.cumba ? plan.units[0] : null;
    for (let k = 0; k < b.daireler; k++) {
      const floor = Math.floor(k / b.perFloor), col = k % b.perFloor;
      if (floor >= floors) continue;
      const unit = plan.units[col];
      const fx = unit.cx;
      const ly = floor * FLOOR_H;
      const owner = { slot: b.slot0 + k };
      if (cumbaUnit === unit && floor > 0) {
        // Cumbanın kendi penceresi var.
      } else if (b.balconies && floor > 0) {
        addWindow(b, fx - 0.7, ly + 0.25, 1, 1.0, 2.15, owner);
        addWindow(b, fx + 0.9, ly + 0.95, 1, 1.0, 1.35, owner);
        B.slabs.add(local(b, fx, ly - 0.05, b.d / 2 + 0.6), b.rot, s.set(3.6, 0.16, 1.2));
        // Korkuluk: üstte küpeşte, altında ince parmaklıklar (saydam dokulu panel).
        B.rails.add(local(b, fx, ly + 1.0, b.d / 2 + 1.17), b.rot, s.set(3.62, 0.05, 0.06));
        B.railPanels.add(local(b, fx, ly + 0.55, b.d / 2 + 1.17), b.rot, s.set(3.6, 0.9, 1));
        for (const e of [-1.79, 1.79]) {
          B.rails.add(local(b, fx + e, ly + 1.0, b.d / 2 + 0.6), b.rot, s.set(0.05, 0.05, 1.15));
          B.railPanels.add(local(b, fx + e, ly + 0.55, b.d / 2 + 0.6), b.rot + Math.PI / 2, s.set(1.12, 0.9, 1));
        }
      } else {
        addWindow(b, fx, ly + 0.95, 1, 1.4, 1.4, owner);
      }
      addWindow(b, fx, ly + (plan.corridor ? 1.3 : 0.95), -1, plan.corridor ? 0.9 : 1.2, plan.corridor ? 0.9 : 1.35, owner);
    }
    // Merdiven penceresi (çekirdeğin önünde, kat aralarında) ve yanlarda birer pencere.
    for (let f = 0; f < floors; f++) {
      if (f > 0) addWindow(b, 0, f * FLOOR_H - 0.6, 1, 0.8, 1.2, { workplace: "merdiven", seed: f });
      for (const side of [-1, 1]) {
        const fake = { ...b, rot: b.rot + (side * Math.PI) / 2, w: b.d, d: b.w };
        addWindow(fake, -side * 2.4, f * FLOOR_H + 1.0, 1, 0.9, 1.1, { workplace: "yan", seed: f });
      }
    }
    // Cumba: üst katlarda sokağa taşan çıkma (Türk evlerinin tipik ayrıntısı).
    if (cumbaUnit) {
      for (let f = 1; f < floors; f++) {
        B.walls.add(local(b, cumbaUnit.cx, f * FLOOR_H + 0.1, b.d / 2 + 0.45), b.rot, s.set(3.4, FLOOR_H - 0.25, 0.9), b.wall);
        addWindow({ ...b, d: b.d + 1.8 }, cumbaUnit.cx, f * FLOOR_H + 0.95, 1, 2.2, 1.4, { slot: b.slot0 + f * b.perFloor });
      }
    }
    // Giriş: kapı, saçak, basamak.
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.02), b.rot, s.set(1.3, 2.3, 0.1)), y: 0.15, z: b.d / 2 + 0.02, w: 1.3, h: 2.3 };
    B.slabs.add(local(b, 0, 2.6, b.d / 2 + 0.6), b.rot, s.set(2.2, 0.12, 1.2));
    B.slabs.add(local(b, 0, 0, b.d / 2 + 0.7), b.rot, s.set(2.2, 0.15, 1.4));
    return;
  }

  if (b.kind === "cami" && st.church) {
    drawChurch(K, b, floors, full, h, addGlass);
    return;
  }

  if (b.kind === "cami") {
    // Cami: iki sıra kemerli pencere (dört cephe), önde beş kemerli son cemaat yeri ve üstünde küçük
    // kubbeler, köşelerde kasnaklı küçük kubbeler, ahşap kapı.
    const sides = [[0, b.w, b.d], [Math.PI, b.w, b.d], [Math.PI / 2, b.d, b.w], [-Math.PI / 2, b.d, b.w]];
    sides.forEach(([dr, fw, fd], si) => {
      const fake = { ...b, rot: b.rot + dr, w: fw, d: fd };
      const n = 4;
      for (let k = 0; k < n; k++) {
        const lx = -fw / 2 + (k + 0.5) * (fw / n);
        if (si === 0 && Math.abs(lx) < 2) continue; // kapı
        for (const [y, hgt, wd] of [[0.9, 2.0, 1.0], [3.9, 1.6, 0.9]]) {
          B.frames.add(local(fake, lx, y - 0.12, fd / 2), fake.rot, s.set(wd + 0.3, hgt + 0.2, 0.16), "#d9cfbd");
          addGlass(fake, lx, y + hgt / 2, fd / 2 + 0.1, wd, hgt, false, { workplace: "cami", seed: si * 8 + k });
          B.arches.add(local(fake, lx, y + hgt, fd / 2 + 0.02), fake.rot, s.set(wd / 2 + 0.15, 1, 0.2), "#d9cfbd");
          B.arches.add(local(fake, lx, y + hgt, fd / 2 + 0.09), fake.rot, s.set(wd / 2, 1, 0.05), "#7fa3b8");
        }
      }
    });
    // Son cemaat yeri (revak): 6 sütun, kemerler, düz çatı ve üstünde 5 küçük kubbe.
    const pd = 4.2, pz = b.d / 2 + pd / 2;
    for (let k = 0; k < 6; k++) {
      const lx = -b.w / 2 + 0.4 + (k * (b.w - 0.8)) / 5;
      B.trims.add(local(b, lx, 0, b.d / 2 + pd - 0.3), b.rot, s.set(0.45, 3.2, 0.45), "#f4f1ea");
      if (k < 5) {
        const ax = lx + (b.w - 0.8) / 10;
        B.arches.add(local(b, ax, 3.2, b.d / 2 + pd - 0.3), b.rot, s.set((b.w - 0.8) / 10, 1, 0.45), "#f4f1ea");
        B.domes.add(local(b, ax, 4.35, pz), b.rot, s.set(1.15, 0.9, 1.15), b.roof);
      }
    }
    B.walls.add(local(b, 0, 3.2, pz), b.rot, s.set(b.w, 1.15, pd), b.wall);
    B.slabs.add(local(b, 0, 0, pz), b.rot, s.set(b.w + 0.4, 0.15, pd + 0.4), "#d6cfc2");
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.02), b.rot, s.set(1.6, 2.8, 0.1)), y: 0.15, z: b.d / 2 + 0.02, w: 1.6, h: 2.8 };
    B.arches.add(local(b, 0, 2.95, b.d / 2 + 0.05), b.rot, s.set(0.8, 1, 0.1), "#6b4a35");
    // Köşe kubbeleri (kasnaklı).
    if (full) for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      B.walls.add(local(b, lx * (b.w / 2 - 1.3), h, lz * (b.d / 2 - 1.3)), b.rot, s.set(2.2, 0.8, 2.2), b.wall);
      B.domes.add(local(b, lx * (b.w / 2 - 1.3), h + 0.8, lz * (b.d / 2 - 1.3)), b.rot, s.set(1.15, 1.0, 1.15), b.roof);
    }
    return;
  }

  if (b.industrial) {
    // Endüstriyel yapı (ambar, tersane atölyesi, ahır): önde büyük sürgülü kapılar ve yanında personel
    // kapısı; üstte boydan boya şerit pencere; yan cephelerde havalandırma panjurları. Kat pencereleri yok.
    const tall = h >= 6;
    const n = Math.max(1, Math.floor(b.w / 13));
    const dw = Math.min(5.5, b.w / n - 2.5), dh = tall ? Math.min(5.2, h - 1.6) : Math.min(3.2, h - 0.6);
    for (let k = 0; k < n; k++) {
      const lx = -b.w / 2 + (k + 0.5) * (b.w / n);
      B.signs.add(local(b, lx, 0.1, b.d / 2 + 0.05), b.rot, s.set(dw, dh, 0.08), st.door ?? "#5b6b7d");
      for (let r = 1; r < Math.floor(dh / 0.45); r++) B.trims.add(local(b, lx, 0.1 + r * 0.45, b.d / 2 + 0.1), b.rot, s.set(dw, 0.04, 0.03), "#3f4a57");
      B.rails.add(local(b, lx, 0.1 + dh, b.d / 2 + 0.12), b.rot, s.set(dw + 0.5, 0.18, 0.18));
    }
    b.door = { idx: B.doors.add(local(b, b.w / 2 - 1.6, 0.15, b.d / 2 + 0.02), b.rot, s.set(1.1, 2.3, 0.1)), x: b.w / 2 - 1.6, y: 0.15, z: b.d / 2 + 0.02, w: 1.1, h: 2.3 };
    B.slabs.add(local(b, b.w / 2 - 1.6, 2.6, b.d / 2 + 0.5), b.rot, s.set(1.8, 0.1, 1.0));
    if (tall) {
      const ly = h - 1.35;
      for (const side of [1, -1]) {
        const z = side * (b.d / 2);
        const segs = Math.max(1, Math.round(b.w / 4));
        for (let k = 0; k < segs; k++) {
          const lx = -b.w / 2 + (k + 0.5) * (b.w / segs);
          addGlass(b, lx, ly, z + side * 0.06, b.w / segs - 0.3, 0.8, side < 0, { workplace: b.kind, seed: k + (side < 0 ? 50 : 0) });
        }
        B.frames.add(local(b, 0, ly - 0.5, z), b.rot, s.set(b.w - 0.4, 1.0, 0.1));
      }
    }
    for (const side of [-1, 1]) {
      const fake = { ...b, rot: b.rot + (side * Math.PI) / 2, w: b.d, d: b.w };
      for (let k = 0; k < 2; k++) B.trims.add(local(fake, (k - 0.5) * b.d * 0.4, h - 1.8, b.w / 2 + 0.06), fake.rot, s.set(1.2, 0.9, 0.06), "#5b636e");
    }
    // Dış cephede kurşun borular (yağmur oluğu) ve kapı üstü lamba.
    for (const lx of [-b.w / 2 + 0.3, b.w / 2 - 0.3]) B.rails.add(local(b, lx, -0.2, b.d / 2 + 0.12), b.rot, s.set(0.14, h + 0.2, 0.14));
    if (st.sign) B.signs.add(local(b, -b.w / 4, h - 2.6, b.d / 2 + 0.12), b.rot, s.set(Math.min(10, b.w * 0.4), 0.9, 0.1), st.sign);
    return;
  }

  // İş yerleri ve diğer binalar.
  const perFloor = Math.max(2, Math.round(b.w / 3.4));
  const bay = b.w / perFloor;
  const owner = (k) => ({ workplace: b.kind, seed: k });
  if (st.shop) {
    // Zemin kat dükkân vitrini, tente ve tabela.
    // Vitrin ortada camlı kapıyla ikiye bölünür.
    // Cam taş tabanın ön yüzünün (b.d / 2 + 0,06) önünde: aynı düzlemde olunca alt kenarı titreşiyordu.
    const pane = (b.w - 2.4 - 1.5) / 2;
    addGlass(b, -(0.75 + pane / 2), 0.45 + 1.3, b.d / 2 + 0.09, pane, 2.6, false, { workplace: b.kind, seed: 0, shop: true });
    addGlass(b, 0.75 + pane / 2, 0.45 + 1.3, b.d / 2 + 0.09, pane, 2.6, false, { workplace: b.kind, seed: 1, shop: true });
    B.frames.add(local(b, 0, 0.35, b.d / 2), b.rot, s.set(b.w - 2.1, 2.9, 0.1));
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.07), b.rot, s.set(1.3, 2.45, 0.06)), y: 0.15, z: b.d / 2 + 0.07, w: 1.3, h: 2.45 };
    B.awnings.add(local(b, 0, 3.0, b.d / 2 + 0.9), b.rot, s.set(b.w - 1.6, 0.12, 1.9), st.awning);
    B.awnings.add(local(b, 0, 2.75, b.d / 2 + 1.85), b.rot, s.set(b.w - 1.6, 0.35, 0.06), st.awning);
    // Tabela: işletmenin adı tente üstündeki levhada (şube rengi zeminde açık yazı).
    const sw = Math.min(b.w - 2, 7);
    B.signs.add(local(b, 0, 3.22, b.d / 2 + 0.1), b.rot, s.set(sw + 0.12, 0.82, 0.12), st.signFrame ?? "#3a3530");
    if (b.isim) K.named.push({ owner: b, pos: local(b, 0, 3.63, b.d / 2 + 0.165).clone(), rot: b.rot, w: sw, h: 0.7, text: b.isim, bg: st.awning, fg: st.signFg ?? "#fbf6ec", font: st.signFont });
    else B.signs.add(local(b, 0, 3.28, b.d / 2 + 0.12), b.rot, s.set(sw, 0.7, 0.12), st.awning);
  } else if (st.garage) {
    // Garaj kapıları (itfaiye, belediye garajı) ve yanında yaya kapısı.
    const n = Math.max(1, Math.floor((b.w - 4) / 5.5));
    for (let k = 0; k < n; k++) {
      const lx = -b.w / 2 + 2.5 + k * 5.5 + 2.2;
      B.signs.add(local(b, lx, 0.15, b.d / 2 + 0.04), b.rot, s.set(4.2, 3.6, 0.08), st.garage);
      for (let r = 1; r < 6; r++) B.trims.add(local(b, lx, 0.15 + r * 0.6, b.d / 2 + 0.09), b.rot, s.set(4.2, 0.05, 0.04), "#f2f2ef");
    }
    b.door = { idx: B.doors.add(local(b, b.w / 2 - 1.4, 0.15, b.d / 2 + 0.02), b.rot, s.set(1.1, 2.3, 0.1)), x: b.w / 2 - 1.4, y: 0.15, z: b.d / 2 + 0.02, w: 1.1, h: 2.3 };
    B.signs.add(local(b, 0, 4.4, b.d / 2 + 0.1), b.rot, s.set(Math.min(b.w - 2, 9), 0.9, 0.12), st.garage);
  } else if (!st.glass) {
    const dw = b.w > 20 ? 2.6 : 1.6;
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.02), b.rot, s.set(dw, 2.5, 0.1)), y: 0.15, z: b.d / 2 + 0.02, w: dw, h: 2.5 };
    B.slabs.add(local(b, 0, 2.9, b.d / 2 + 0.8), b.rot, s.set(b.w > 20 ? 4 : 2.4, 0.15, 1.6));
  }
  for (let f = 0; f < floors; f++) {
    if (f === 0 && st.shop) continue;
    for (let c = 0; c < perFloor; c++) {
      const lx = -b.w / 2 + (c + 0.5) * bay;
      if (f === 0 && Math.abs(lx) < 2.2) continue;
      if (st.glass) {
        addGlass(b, lx, f * FLOOR_H + 1.6, b.d / 2 + 0.05, bay - 0.25, FLOOR_H - 0.5, false, owner(f * perFloor + c));
        addGlass(b, lx, f * FLOOR_H + 1.6, -b.d / 2 - 0.05, bay - 0.25, FLOOR_H - 0.5, true, owner(f * perFloor + c + 1));
      } else {
        // Garajlı binalarda zemin katın önü kapılarla dolu: orada pencere yok.
        if (!(f === 0 && st.garage)) addWindow(b, lx, f * FLOOR_H + 0.95, 1, Math.min(1.4, bay - 0.8), 1.5, owner(f * perFloor + c));
        addWindow(b, lx, f * FLOOR_H + 0.95, -1, Math.min(1.4, bay - 0.8), 1.5, owner(f * perFloor + c + 7));
      }
      if (st.balconies && f > 0) {
        // Balkon: döşeme, önde ve yanlarda küpeşte ile parmaklık paneli (konut balkonuyla aynı); tek küpeşte
        // dikmesiz kalınca pencerelerin önünde havada bir çizgi gibi görünüyordu.
        const ly = f * FLOOR_H, bw = bay - 0.6;
        B.slabs.add(local(b, lx, ly - 0.05, b.d / 2 + 0.6), b.rot, s.set(bw, 0.15, 1.2));
        B.rails.add(local(b, lx, ly + 1.0, b.d / 2 + 1.17), b.rot, s.set(bw + 0.02, 0.05, 0.06));
        B.railPanels.add(local(b, lx, ly + 0.55, b.d / 2 + 1.17), b.rot, s.set(bw, 0.9, 1));
        for (const e of [-bw / 2, bw / 2]) {
          B.rails.add(local(b, lx + e, ly + 1.0, b.d / 2 + 0.6), b.rot, s.set(0.05, 0.05, 1.15));
          B.railPanels.add(local(b, lx + e, ly + 0.55, b.d / 2 + 0.6), b.rot + Math.PI / 2, s.set(1.12, 0.9, 1));
        }
      }
    }
  }
  if (st.glass) {
    // Cam bina girişi: döner kapı ve saçak.
    b.door = { idx: B.doors.add(local(b, 0, 0.15, b.d / 2 + 0.12), b.rot, s.set(2.4, 2.6, 0.1)), y: 0.15, z: b.d / 2 + 0.12, w: 2.4, h: 2.6 };
    B.slabs.add(local(b, 0, 3.0, b.d / 2 + 1.2), b.rot, s.set(5, 0.18, 2.4));
  }
  if (st.glass) for (let f = 1; f <= floors; f++) B.trims.add(local(b, 0, f * FLOOR_H - 0.25, 0), b.rot, s.set(b.w + 0.1, 0.25, b.d + 0.1), "#e8edf2");
  if (!full) return;
  if (st.tower) {
    // Saat kulesi (cupola): çatının ortasında beyaz kare kaide, dört yüzde saat, açık kemerli çan katı ve külah.
    B.walls.add(local(b, 0, h, 0), b.rot, s.set(5, 6.5, 5), "#f4f1ea");
    for (const [dr, dz] of [[0, 2.55], [Math.PI, -2.55], [Math.PI / 2, 2.55], [-Math.PI / 2, 2.55]]) {
      const fake = { ...b, rot: b.rot + dr };
      B.frames.add(local(fake, 0, h + 3.3, dz), fake.rot, s.set(2.4, 2.4, 0.12), "#f7f5f0");
      B.rails.add(local(fake, 0, h + 4.4, dz + 0.08), fake.rot, s.set(0.08, 1.0, 0.04));
      B.rails.add(local(fake, 0.3, h + 4.5, dz + 0.08), fake.rot, s.set(0.6, 0.08, 0.04));
    }
    B.trims.add(local(b, 0, h + 6.5, 0), b.rot, s.set(5.6, 0.35, 5.6), "#f4f1ea");
    for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) B.trims.add(local(b, lx, h + 6.85, lz), b.rot, s.set(0.4, 3, 0.4), "#f4f1ea");
    B.trims.add(local(b, 0, h + 9.85, 0), b.rot, s.set(4.4, 0.35, 4.4), "#f4f1ea");
    B.spires.add(local(b, 0, h + 10.2, 0), b.rot + Math.PI / 8, s.set(2.6, 5.5, 2.6), "#3f4247");
  }
  if (st.cornice) B.trims.add(local(b, 0, h - 0.45, 0), b.rot, s.set(b.w + 0.35, 0.55, b.d + 0.35), "#3f3a36");
  if (st.columns) for (let i = 0; i < 6; i++) B.trims.add(local(b, -b.w / 2 + 2 + i * ((b.w - 4) / 5), 0.6, b.d / 2 + 1.5), b.rot, s.set(0.8, h - 0.6, 0.8), "#f4f1ea");
  if (st.columns) B.slabs.add(local(b, 0, h - 0.4, b.d / 2 + 1.5), b.rot, s.set(b.w, 0.6, 3));
  // Resmî binalar (polis merkezi, muhtarlık): zemin kat üstünde renk şeridi, girişin üstünde tabela.
  if (st.band) B.signs.add(local(b, 0, FLOOR_H - 0.15, b.d / 2 + 0.14), b.rot, s.set(b.w + 0.1, 0.4, 0.1), st.band);
  if (st.plate) {
    if (floors > 1) B.signs.add(local(b, 0, h - 1.5, b.d / 2 + 0.14), b.rot, s.set(7, 1.1, 0.12), st.plate);
    else B.signs.add(local(b, 0, h - 0.42, b.d / 2 + 0.14), b.rot, s.set(4, 0.36, 0.1), st.plate);
  }
  if (st.sign) {
    B.signs.add(local(b, 0, h - 1.6, b.d / 2 + 0.12), b.rot, s.set(2.6, 0.8, 0.12), st.sign);
    B.signs.add(local(b, 0, h - 2.5, b.d / 2 + 0.12), b.rot, s.set(0.8, 2.6, 0.12), st.sign);
  }
  if (b.kind === "belediye" || (st.flag && floors > 1)) { // okulun bayrağı bahçede (okul_bahce)
    // Bayrak direği ve bayrak.
    B.rails.add(local(b, b.w / 2 - 2, 0, b.d / 2 + 4), b.rot, s.set(0.12, 10, 0.12), "#e8e8e8");
    usFlag(B, b, b.w / 2 - 2 + 1.25, 8.4, b.d / 2 + 4, 2.4);
  } else if (st.flag) { // küçük yapı (Community Center): yan duvarın dibinde kısa direk
    B.rails.add(local(b, b.w / 2 + 1, 0, b.d / 2 - 0.5), b.rot, s.set(0.08, 5.5, 0.08), "#e8e8e8");
    usFlag(B, b, b.w / 2 + 1 + 0.78, 4.6, b.d / 2 - 0.5, 1.5);
  }
}

const BRICKS = new Set(["#a34a3a", "#9b4a3a", "#b0533f", "#8a3e32"]);
function isBrick(b) {
  return !!b.style?.brick || BRICKS.has(b.wall);
}

/** ABD bayrağı: kırmızı-beyaz çizgiler ve sol üstte lacivert kanton (yandan bakınca levha). w genişlik. */
export function usFlag(B, b, lx, ly, lz, w) {
  const hgt = w * 0.53;
  B.signs.add(local(b, lx, ly, lz), b.rot, s.set(w, hgt, 0.03), "#f4f4f2");
  for (let k = 0; k < 7; k++) B.signs.add(local(b, lx, ly + (k * 2 * hgt) / 13, lz), b.rot, s.set(w, hgt / 13, 0.04), "#b22234");
  B.signs.add(local(b, lx - w * 0.3, ly + hgt * (6 / 13), lz), b.rot, s.set(w * 0.4, hgt * (7 / 13), 0.05), "#3c3b6e");
}

const SHUTTERS = ["#1f2a24", "#2f4256", "#2e2e2e", "#5a2a24", "#3e5a44"];
const PORCH = "#f7f5f0";

/**
 * Amerikan evleri (layout.js HOUSE_DIMS): Cape Cod kulübesi (tek kat, dik beşik çatı, iki çatı penceresi, kapı
 * sundurması), iki aileli ev (sokağa bakan alınlık, iki katlı ön veranda), four-square (kırma çatı, ön çatı penceresi,
 * boydan veranda), garden apartment (3 kat, ortada giriş saçağı). Pencereler kepenkli; daire sahibi pencereye bağlı.
 */
function drawHouse(K, b, floors, full, addWindow) {
  const { B } = K;
  const h = floors * FLOOR_H;
  const seed = b.pathSeed ?? 1;
  const sh = SHUTTERS[seed % SHUTTERS.length];
  const tip = b.house;
  // Pencerenin dairesi iç planla aynı (unitLayout); çekirdeğin penceresi merdiven boşluğunu aydınlatır.
  const plan = unitLayout(b);
  const unit = (f, lx) => {
    const u = plan.units.find((q) => lx >= q.x0 - 0.01 && lx <= q.x1 + 0.01);
    const k = u ? f * b.perFloor + u.col : Infinity;
    return k < b.daireler ? { slot: b.slot0 + k } : { workplace: "merdiven", seed: f };
  };
  const win = (lx, ly, side, w, hh, owner, shutters = b.shutters) => {
    addWindow(b, lx, ly, side, w, hh, owner);
    if (shutters) for (const e of [-1, 1]) B.signs.add(local(b, lx + e * (w / 2 + 0.3), ly - 0.05, side * (b.d / 2 + 0.06)), b.rot, s.set(0.42, hh + 0.1, 0.06), sh);
  };
  const sideWins = (f, ly, list) => {
    for (const side of [-1, 1]) {
      const fake = { ...b, rot: b.rot + (side * Math.PI) / 2, w: b.d, d: b.w };
      for (const lx of list) addWindow(fake, lx, ly, 1, 0.9, 1.25, unit(f, -side * b.w / 2));
    }
  };
  // Köşe pervazları (beyaz) ve ön kapı.
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.trims.add(local(b, lx * (b.w / 2 + 0.02), -0.2, lz * (b.d / 2 + 0.02)), b.rot, s.set(0.22, h + 0.2, 0.22), "#f7f5f0");
  const door = (lx, w = 1.0) => ({ idx: B.doors.add(local(b, lx, 0.55, b.d / 2 + 0.02), b.rot, s.set(w, 2.2, 0.1), ["#2f4256", "#5a2a24", "#2e2e2e", "#3e5a44", "#f4f1ea"][(seed >> 3) % 5]), x: lx, y: 0.55, z: b.d / 2 + 0.02, w, h: 2.2 });
  // Basamak ve ön veranda zemini.
  const porchDeck = (lx, w, d, y = 0.5) => {
    B.slabs.add(local(b, lx, y - 0.1, b.d / 2 + d / 2), b.rot, s.set(w, 0.12, d), "#cfc6b8");
    B.plinth.add(local(b, lx, -0.6, b.d / 2 + d / 2), b.rot, s.set(w, y + 0.5, d));
  };
  const posts = (lx0, lx1, z, y, hh, n) => {
    for (let i = 0; i < n; i++) B.trims.add(local(b, lx0 + ((lx1 - lx0) * i) / (n - 1), y, z), b.rot, s.set(0.2, hh, 0.2), PORCH);
  };
  const railing = (lx0, lx1, z, y) => {
    B.trims.add(local(b, (lx0 + lx1) / 2, y + 0.85, z), b.rot, s.set(lx1 - lx0, 0.08, 0.1), PORCH);
    B.trims.add(local(b, (lx0 + lx1) / 2, y + 0.12, z), b.rot, s.set(lx1 - lx0, 0.06, 0.08), PORCH);
    for (let x = lx0 + 0.2; x < lx1 - 0.1; x += 0.25) B.trims.add(local(b, x, y + 0.12, z), b.rot, s.set(0.04, 0.75, 0.04), PORCH);
  };

  if (tip === "cottage") {
    // Cape Cod: ortada kapı ve iki yanında kepenkli pencereler; dik çatı, iki çatı penceresi, yan bacası.
    win(-2.4, 0.95, 1, 1.0, 1.35, unit(0, -1));
    win(2.4, 0.95, 1, 1.0, 1.35, unit(0, 1));
    win(-2.2, 0.95, -1, 1.0, 1.25, unit(0, -1), false);
    win(2.2, 0.95, -1, 1.0, 1.25, unit(0, 1), false);
    b.door = door(0);
    porchDeck(0, 2.6, 1.6, 0.45);
    if (full) {
      const rh = 4.2;
      B.gable.add(local(b, 0, h, 0), b.rot, s.set(b.w + 0.6, rh, b.d + 0.9), b.roof);
      // Kapı sundurması: iki ince direk, küçük alınlık.
      posts(-1.0, 1.0, b.d / 2 + 1.25, 0.45, 2.35, 2);
      B.gable.add(local(b, 0, 2.8, b.d / 2 + 0.85), b.rot + Math.PI / 2, s.set(1.9, 0.7, 2.6), b.roof);
      for (const lx of [-2.2, 2.2]) {
        B.walls.add(local(b, lx, h + 0.55, b.d / 4 - 0.2), b.rot, s.set(1.6, 1.5, 2.2), b.wall);
        B.gable.add(local(b, lx, h + 2.05, b.d / 4 - 0.2), b.rot + Math.PI / 2, s.set(2.4, 0.8, 1.9), b.roof);
        addWindow({ ...b, d: b.d / 2 + 1.5 }, lx, h + 0.75, 1, 0.8, 0.9, unit(0, lx));
      }
      B.chimneys.add(local(b, -b.w / 2 + 0.9, h - 0.2, -0.6), b.rot, s.set(0.9, rh + 0.6, 0.9), "#8a4a3a");
      // Çatı arası penceresi (yan alınlıklar).
      for (const side of [-1, 1]) {
        const fake = { ...b, rot: b.rot + (side * Math.PI) / 2, w: b.d, d: b.w };
        addWindow(fake, 0, h + 1.0, 1, 0.8, 0.9, unit(0, 0));
      }
    }
    return;
  }

  if (tip === "twofamily") {
    // İki aileli ev: alınlık sokağa bakar; zemin ve üst kat birer daire, iki katlı ön veranda. Merdiven sol yan
    // duvar boyunca (unitLayout çekirdeği): önde merdiven kapısı, yanında zemin kat dairesinin kapısı.
    for (let f = 0; f < floors; f++) {
      win(1.9, f * FLOOR_H + 0.95, 1, 1.0, 1.4, unit(f, 1.9));
      if (f > 0) win(-0.9, f * FLOOR_H + 0.95, 1, 1.0, 1.4, unit(f, -0.9));
      for (const lx of [-0.6, 2.4]) addWindow(b, lx, f * FLOOR_H + 0.95, -1, 1.0, 1.3, unit(f, lx));
      sideWins(f, f * FLOOR_H + 0.95, [-3.5, 0, 3.5]);
    }
    b.door = door(-0.9);
    B.doors.add(local(b, plan.core[0] + 1.2, 0.55, b.d / 2 + 0.02), b.rot, s.set(0.9, 2.2, 0.1), "#6b4a35"); // üst kat merdiven kapısı
    porchDeck(0, b.w + 0.2, 2.4);
    B.slabs.add(local(b, 0, FLOOR_H + 0.4, b.d / 2 + 1.2), b.rot, s.set(b.w + 0.2, 0.15, 2.4), "#cfc6b8");
    posts(-b.w / 2 + 0.2, b.w / 2 - 0.2, b.d / 2 + 2.25, 0.5, 2 * FLOOR_H - 0.4, 4);
    railing(-b.w / 2 + 0.3, b.w / 2 - 0.3, b.d / 2 + 2.25, FLOOR_H + 0.45);
    if (full) {
      B.slabs.add(local(b, 0, 2 * FLOOR_H + 0.05, b.d / 2 + 1.2), b.rot, s.set(b.w + 0.4, 0.18, 2.6), b.roof);
      B.gable.add(local(b, 0, h, 0), b.rot + Math.PI / 2, s.set(b.d + 0.8, 3.8, b.w + 0.7), b.roof);
      addWindow(b, 0, h + 1.0, 1, 0.9, 1.1, unit(floors - 1, 0)); // çatı arası
      B.chimneys.add(local(b, 2.6, h + 1.0, -2.5), b.rot, s.set(0.7, 3.2, 0.7), "#8a4a3a");
    }
    return;
  }

  if (tip === "fourplex") {
    // Four-square: her katta iki daire, boydan zemin kat verandası, kırma çatı ve ön çatı penceresi.
    for (let f = 0; f < floors; f++) {
      for (const lx of [-4.4, -2.0, 2.0, 4.4]) {
        if (f === 0 && Math.abs(lx) < 2.5) continue;
        win(lx, f * FLOOR_H + 0.95, 1, 1.0, 1.4, unit(f, lx));
      }
      for (const lx of [-4.2, -1.6, 1.6, 4.2]) addWindow(b, lx, f * FLOOR_H + 0.95, -1, 1.0, 1.3, unit(f, lx));
      sideWins(f, f * FLOOR_H + 0.95, [-4, 0, 4]);
    }
    b.door = door(0, 1.4);
    porchDeck(0, b.w + 0.2, 2.6);
    posts(-b.w / 2 + 0.2, b.w / 2 - 0.2, b.d / 2 + 2.45, 0.5, FLOOR_H - 0.3, 5);
    railing(-b.w / 2 + 0.3, -1.2, b.d / 2 + 2.45, 0.5);
    railing(1.2, b.w / 2 - 0.3, b.d / 2 + 2.45, 0.5);
    B.slabs.add(local(b, 0, FLOOR_H + 0.2, b.d / 2 + 1.3), b.rot, s.set(b.w + 0.4, 0.18, 2.8), b.roof);
    if (full) {
      B.hips[0].add(local(b, 0, h, 0), b.rot, s.set(b.w + 1.0, 3.6, b.d + 1.0), b.roof);
      B.walls.add(local(b, 0, h + 0.6, b.d / 2 - 2.2), b.rot, s.set(2.2, 1.5, 2.4), b.wall);
      B.hips[0].add(local(b, 0, h + 2.1, b.d / 2 - 2.2), b.rot, s.set(2.8, 0.8, 2.9), b.roof);
      addWindow({ ...b, d: b.d - 2.0 }, 0, h + 0.8, 1, 1.2, 0.8, unit(floors - 1, 0));
      B.chimneys.add(local(b, 3.2, h + 1.5, -1.8), b.rot, s.set(0.8, 3.2, 0.8), "#8a4a3a");
    }
    return;
  }

  // Garden apartment: her katta altı pencere çifti; ortada giriş, üstünde saçak; yanlarda pencere.
  const cols = [-11.5, -8.5, -4.5, -1.5, 1.5, 4.5, 8.5, 11.5];
  for (let f = 0; f < floors; f++) {
    for (const lx of cols) {
      if (f === 0 && Math.abs(lx) < 2) continue;
      win(lx, f * FLOOR_H + 0.95, 1, 1.1, 1.4, unit(f, lx), b.shutters && Math.abs(lx) > 2);
      addWindow(b, lx, f * FLOOR_H + 0.95, -1, 1.1, 1.3, unit(f, lx));
    }
    sideWins(f, f * FLOOR_H + 0.95, [-3.5, 3.5]);
    if (f > 0) addWindow(b, 0, f * FLOOR_H - 0.5, 1, 0.9, 1.2, { workplace: "merdiven", seed: f });
  }
  b.door = door(0, 1.6);
  B.slabs.add(local(b, 0, 2.75, b.d / 2 + 0.9), b.rot, s.set(3.2, 0.15, 1.8), "#f7f5f0");
  posts(-1.4, 1.4, b.d / 2 + 1.7, 0, 2.75, 2);
  B.slabs.add(local(b, 0, 0, b.d / 2 + 0.9), b.rot, s.set(3.2, 0.15, 1.8), "#cfc6b8");
  if (full) {
    B.gable.add(local(b, 0, h, 0), b.rot, s.set(b.w + 0.8, 3.2, b.d + 0.9), b.roof);
    for (const lx of [-8, 8]) B.chimneys.add(local(b, lx, h + 0.6, -1.5), b.rot, s.set(0.8, 3.0, 0.8), "#8a4a3a");
  }
}

/**
 * Beyaz ahşap New England kilisesi: sokağa bakan alınlık, yanlarda uzun pencereler, önde kule (kaide, açık çan katı,
 * sekizgen külah). (Ön cephe +z.)
 */
function drawChurch(K, b, floors, full, h, addGlass) {
  const { B } = K;
  for (const side of [-1, 1]) {
    const fake = { ...b, rot: b.rot + (side * Math.PI) / 2, w: b.d, d: b.w };
    for (let k = 0; k < 4; k++) {
      const lx = -b.d / 2 + 3 + k * ((b.d - 6) / 3);
      B.frames.add(local(fake, lx, 1.2, b.w / 2), fake.rot, s.set(1.5, 4.0, 0.14), "#f7f5f0");
      addGlass(fake, lx, 3.2, b.w / 2 + 0.09, 1.1, 3.6, false, { workplace: "cami", seed: k + (side > 0 ? 10 : 0) });
      B.arches.add(local(fake, lx, 5.0, b.w / 2 + 0.03), fake.rot, s.set(0.7, 1, 0.15), "#f7f5f0");
      for (const e of [-1, 1]) B.signs.add(local(fake, lx + e * 1.05, 1.2, b.w / 2 + 0.06), fake.rot, s.set(0.45, 3.9, 0.06), "#2e2e2e");
    }
  }
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.trims.add(local(b, lx * (b.w / 2 + 0.03), -0.2, lz * (b.d / 2 + 0.03)), b.rot, s.set(0.3, h + 0.2, 0.3), "#ffffff");
  // Ön kule: kapı kulenin dibinde.
  const tz = b.d / 2 + 2.0;
  B.walls.add(local(b, 0, -0.8, tz), b.rot, s.set(4.4, h + 3.6, 4.4), b.wall);
  b.door = { idx: B.doors.add(local(b, 0, 0.2, tz + 2.22), b.rot, s.set(1.8, 3.0, 0.1), "#7a2a24"), y: 0.2, z: tz + 2.22, w: 1.8, h: 3.0 };
  B.gable.add(local(b, 0, 3.4, tz + 2.3), b.rot + Math.PI / 2, s.set(0.5, 0.9, 2.6), "#ffffff");
  B.frames.add(local(b, 0, h - 0.6, tz + 2.21), b.rot, s.set(1.1, 1.8, 0.1), "#2e2e2e");
  B.slabs.add(local(b, 0, -0.05, tz + 3.3), b.rot, s.set(4.0, 0.25, 2.2), "#cfc6b8");
  if (!full) return;
  B.gable.add(local(b, 0, h, 0), b.rot + Math.PI / 2, s.set(b.d + 0.8, 4.6, b.w + 0.8), b.roof);
  const y0 = h + 2.8;
  B.trims.add(local(b, 0, y0, tz), b.rot, s.set(4.8, 0.4, 4.8), "#ffffff");
  // Çan katı: dört köşe direk, açık kemerler; üstte korniş ve külah.
  for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) B.trims.add(local(b, lx, y0 + 0.4, tz + lz), b.rot, s.set(0.45, 3.2, 0.45), "#ffffff");
  B.walls.add(local(b, 0, y0 + 0.4, tz), b.rot, s.set(1.4, 1.4, 1.4), "#2e2e2e"); // çan
  B.trims.add(local(b, 0, y0 + 3.6, tz), b.rot, s.set(4.2, 0.45, 4.2), "#ffffff");
  B.spires.add(local(b, 0, y0 + 4.05, tz), b.rot + Math.PI / 8, s.set(2.3, 9.5, 2.3), "#f7f5f0");
  B.rails.add(local(b, 0, y0 + 13.4, tz), b.rot, s.set(0.08, 1.2, 0.08), "#c9a441");
}

export function buildCity(world) {
  const K = makeKit();
  for (const b of world.buildings) {
    Batch.owner = b;
    drawBuilding(K, b);
  }
  Batch.owner = null;
  const group = buildKit(K);
  const features = buildFeatures(world);
  group.add(features);
  group.add(buildFrontPaths(world));
  const batches = kitBatches(K);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    tick: (t) => features.userData.tick(t),
    setFlood: (s, f) => features.userData.setFlood(s, f),
    windows: K.glass.mesh,
    windowOwners: K.windowOwners,
    windowInfo: K.windowInfo,
    wallMaterials: [K.B.walls.material, K.B.brick.material, K.B.plinth.material, K.B.doors.material],
    /** Bir binayı gizler ya da geri getirir (ev içi görünümü için). */
    setHidden(b, on) {
      for (const batch of batches) {
        let touched = false;
        batch.items.forEach((it, i) => {
          if (it.owner !== b) return;
          batch.mesh.setMatrixAt(i, on ? hidden : it.m);
          touched = true;
        });
        if (touched) batch.mesh.instanceMatrix.needsUpdate = true;
      }
      for (const n of K.named) if (n.owner === b) n.mesh.visible = !on;
    },
    /** Kapılar: içinden biri geçenler açılır (menteşesinden dışa doğru), diğerleri kapanır. */
    setOpenDoors(open) {
      const mesh = K.B.doors.mesh;
      let touched = false;
      const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
      for (const b of this._open ?? []) {
        if (open.has(b) || !b.door) continue;
        mesh.setMatrixAt(b.door.idx, K.B.doors.items[b.door.idx].m);
        touched = true;
      }
      for (const b of open) {
        if (!b?.door || this._hidden === b) continue;
        const a = 1.25, d = b.door;
        // Menteşe kapının sol kenarında; kapı ortada değilse (d.x) kanat yerinde açılır, ortaya kaymaz.
        const lx = (d.x ?? 0) - d.w / 2 + (d.w / 2) * Math.cos(a), lz = d.z + (d.w / 2) * Math.sin(a);
        const c = Math.cos(b.rot), sn = Math.sin(b.rot);
        pp.set(b.x + lx * c + lz * sn, FLAT_Y + d.y, b.z - lx * sn + lz * c);
        qq.setFromAxisAngle(UP, b.rot - a);
        m.compose(pp, qq, ss.set(d.w, d.h, 0.08));
        mesh.setMatrixAt(d.idx, m);
        touched = true;
      }
      this._open = new Set(open);
      if (touched) mesh.instanceMatrix.needsUpdate = true;
    },
    /** Işın hangi binaya çarpıyor? */
    pickBuilding(raycaster) {
      const hits = [K.B.walls, K.B.brick, K.B.sheet].map((bt) => [bt, raycaster.intersectObject(bt.mesh)[0]]).filter(([, h]) => h?.instanceId != null);
      hits.sort((a, b) => a[1].distance - b[1].distance);
      return hits.length ? hits[0][0].items[hits[0][1].instanceId].owner : null;
    },
  };
}

/** Yumuşak ışık halkası dokusu (parlama için). */
function glareTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// --- apartman önü patikaları: kaldırımdan kapıya, her binada farklı ---

function buildFrontPaths(world) {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const gravel = new Batch(box, std(0xffffff, { roughness: 1 }), { shadow: false });
  const stone = new Batch(box, std(0xffffff, { roughness: 0.9 }), { shadow: false });
  const hedge = new Batch(new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.7, 1).translate(0, 0.3, 0), std(0xffffff, { roughness: 1, flatShading: true }));
  const flowers = new Batch(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), { shadow: false });
  const GRAVELS = ["#cdbb9c", "#bfae94", "#d6c7ad", "#b8a68a"];
  const STONES = ["#d9d4ca", "#c9c2b6", "#e2dccf", "#bdb5a8"];
  const HEDGES = ["#4f7d3e", "#5c8a47", "#476f38"];
  const BLOOMS = ["#e05a6a", "#f2c230", "#f4f1ea", "#9a6ad8", "#f28c5a"];
  const rnd = (seed, n) => ((Math.imul(seed * 2654435761 + n * 40503, 2246822519) >>> 0) % 10000) / 10000;
  for (const b of world.buildings) {
    if (!b.daireler || !b.yard) continue;
    const seed = b.pathSeed ?? 1;
    const y0 = b.d / 2, y1 = b.d / 2 + b.yard + 0.15; // bina önünden kaldırım kenarına (yerel z)
    const L = y1 - y0;
    const kind = Math.floor(rnd(seed, 1) * 4);
    const w = 1.2 + rnd(seed, 2) * 0.7;
    const slab = (lx, lz, sw, sd, color, batch, rot = 0) => batch.add(local(b, lx, -0.06, lz), b.rot + rot, s.set(sw, 0.1, sd), color);
    if (kind === 0) {
      slab(0, (y0 + y1) / 2, w, L, GRAVELS[Math.floor(rnd(seed, 3) * 4)], gravel);
    } else if (kind === 1) {
      // Basamak taşları: hafif yana kayan, biraz dönük.
      const n = Math.max(2, Math.floor(L / 0.75));
      for (let i = 0; i < n; i++) {
        const lz = y0 + 0.4 + (i * (L - 0.6)) / Math.max(1, n - 1);
        slab((i % 2 ? 0.15 : -0.15) + (rnd(seed, 10 + i) - 0.5) * 0.1, lz, 0.75, 0.5, STONES[i % 4], stone, (rnd(seed, 20 + i) - 0.5) * 0.4);
      }
    } else if (kind === 2) {
      // Taş döşeme, iki yanında ince bordür.
      slab(0, (y0 + y1) / 2, w, L, STONES[Math.floor(rnd(seed, 3) * 4)], stone);
      for (const e of [-1, 1]) slab(e * (w / 2 + 0.07), (y0 + y1) / 2, 0.12, L, "#9e978b", stone);
    } else {
      // Kıvrılan çakıl yol: kapıdan biraz ilerleyip yana kayar.
      const sx = (rnd(seed, 4) < 0.5 ? -1 : 1) * (1.0 + rnd(seed, 5) * 1.2);
      const mid = y0 + L * 0.45;
      const color = GRAVELS[Math.floor(rnd(seed, 3) * 4)];
      slab(0, (y0 + mid) / 2, w, mid - y0 + 0.2, color, gravel);
      const dx = sx, dz = y1 - mid;
      const len = Math.hypot(dx, dz);
      slab(sx / 2, (mid + y1) / 2, w, len + 0.2, color, gravel, Math.atan2(dx, dz));
    }
    // Bazı bahçelerde yolun iki yanında çit ve çiçekler.
    if (rnd(seed, 6) < 0.6) {
      const n = Math.floor(L / 0.9);
      for (const e of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const lz = y0 + 0.5 + i * 0.9, lx = e * (w / 2 + 0.6 + rnd(seed, 30 + i) * 0.3);
          if (rnd(seed, 40 + i + e) < 0.65) hedge.add(local(b, lx, 0, lz), b.rot, s.set(0.9, 0.8 + rnd(seed, 50 + i) * 0.5, 0.9), HEDGES[(i + seed) % 3]);
          else for (let f = 0; f < 3; f++) flowers.add(local(b, lx + (f - 1) * 0.2, 0.15, lz + (f % 2) * 0.15), 0, s.set(1, 1, 1), BLOOMS[(seed + f + i) % 5]);
        }
      }
    }
  }
  // Posta kutuları (ev önünde, kaldırım kenarında direkli) ve yangın muslukları (kaldırımda, birkaç evde bir).
  const mailPost = new Batch(new THREE.BoxGeometry(0.1, 1.05, 0.1).translate(0, 0.52, 0), std("#6b5a48"), { shadow: false });
  const mailBox = new Batch(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.1, 0), std(0xffffff, { roughness: 0.4, metalness: 0.4 }));
  const hydrant = new Batch(mergeGeometries([
    new THREE.CylinderGeometry(0.14, 0.17, 0.6, 10).translate(0, 0.3, 0),
    new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.6, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.36, 8).rotateZ(Math.PI / 2).translate(0, 0.42, 0),
  ]), std("#c8231f", { roughness: 0.45 }));
  const BOXES = ["#1d1d20", "#1d1d20", "#2f4256", "#8e2f2a", "#f4f1ea"];
  for (const b of world.buildings) {
    if (!b.house || b.house === "apartments") continue;
    const seed = b.pathSeed ?? 1;
    const lz = b.d / 2 + b.yard + 0.35, lx = b.w / 2 + 1.0;
    mailPost.add(local(b, lx, -0.05, lz), b.rot, s.set(1, 1, 1));
    mailBox.add(local(b, lx, -0.05, lz), b.rot, s.set(1, 1, 1), BOXES[seed % BOXES.length]);
    if (seed % 5 === 0) {
      const at = local(b, -b.w / 2 - 1.2, 0, b.d / 2 + b.yard + 1.9).clone();
      hydrant.add(v.set(at.x, world.groundY(at.x, at.z) - 0.02, at.z), 0, s.set(1, 1, 1));
      world.addObstacleCircle(at.x, at.z, 0.22);
    }
    const mp = local(b, lx, 0, lz);
    world.addObstacleCircle(mp.x, mp.z, 0.15);
  }
  const group = new THREE.Group();
  for (const batch of [gravel, stone, hedge, flowers, mailPost, mailBox, hydrant]) group.add(batch.build());
  return group;
}

// --- kent eşyası ve özel yapılar ---

function buildFeatures(world) {
  const group = new THREE.Group();
  const add = (geo, mat, x, y, z, rot = 0, shadow = true) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const water = new THREE.MeshStandardMaterial({ color: "#6fc6d8", roughness: 0.08, metalness: 0.1 });
  // Stadyum ışıkları: gece yanan mercekler ve parlama (setFlood ile).
  const floodPole = std("#8a929c", { metalness: 0.6, roughness: 0.45 });
  const floodHousing = std("#3a3f47", { metalness: 0.5, roughness: 0.5 });
  const floodLens = new THREE.MeshStandardMaterial({ color: "#c9d2dc", roughness: 0.15, metalness: 0.2, emissive: new THREE.Color("#f4f7ff"), emissiveIntensity: 0 });
  const floodGlareMat = new THREE.SpriteMaterial({ map: glareTexture(), color: "#eef3ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const stone = std("#d8d0c4");
  const wood = std("#9b7353", { roughness: 0.9 });
  const darkWood = std("#6b4a35");
  const white = std("#f7f5f0");
  const metal = std("#4a4f57", { roughness: 0.4, metalness: 0.5 });

  // Bank ve masa gibi çok sayıdaki eşyalar tek InstancedMesh.
  const benchSeat = new Batch(new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.45, 0), wood);
  const benchBack = new Batch(new THREE.BoxGeometry(1.8, 0.4, 0.06).rotateX(-0.15).translate(0, 0.75, -0.22), wood);
  const benchLegs = new Batch(new THREE.BoxGeometry(1.6, 0.45, 0.4).translate(0, 0.22, 0), metal, { shadow: false });
  const tables = new Batch(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12).translate(0, 0.74, 0), white);
  const tableLegs = new Batch(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6).translate(0, 0.36, 0), metal, { shadow: false });
  const chairs = new Batch(new THREE.BoxGeometry(0.42, 0.05, 0.42).translate(0, 0.45, 0), wood);
  const chairBacks = new Batch(new THREE.BoxGeometry(0.42, 0.45, 0.04).translate(0, 0.7, -0.2), wood);
  // Sandalye ayakları (dört ince ayak, tek parça).
  const chairLegs = new Batch(mergeGeometries([[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z]) => new THREE.CylinderGeometry(0.018, 0.018, 0.44, 5).translate(x, 0.22, z))), metal, { shadow: false });
  const chairBackLegs = new Batch(mergeGeometries([-0.18, 0.18].map((x) => new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5).translate(x, 0.72, -0.2))), metal, { shadow: false });
  // Çöp kutusu (kaldırımda) ve konteyner (park şeridinde).
  const bins = new Batch(mergeGeometries([new THREE.CylinderGeometry(0.24, 0.22, 0.8, 10).translate(0, 0.4, 0), new THREE.CylinderGeometry(0.27, 0.27, 0.06, 10).translate(0, 0.82, 0)]), std("#4a6b4a", { metalness: 0.4, roughness: 0.5 }));
  const binPoles = new Batch(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6).translate(0, 0.5, -0.3), metal, { shadow: false });
  const containers = new Batch(mergeGeometries([
    new THREE.BoxGeometry(1.35, 1.1, 1.1).translate(0, 0.55, 0),
    new THREE.BoxGeometry(1.42, 0.1, 1.18).rotateX(-0.08).translate(0, 1.15, -0.02),
    ...[[-0.55, -0.42], [0.55, -0.42], [-0.55, 0.42], [0.55, 0.42]].map(([x, z]) => new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8).rotateZ(Math.PI / 2).translate(x, 0.08, z)),
  ]), std("#5f6a73", { metalness: 0.35, roughness: 0.55 }));
  const benchAt = (x, z, rot) => {
    const y = world.groundY(x, z);
    for (const batch of [benchSeat, benchBack, benchLegs]) batch.add(v.set(x, y, z), rot, s.set(1, 1, 1));
  };

  const fenerLamps = [];
  const glowSigns = []; // gece yanan tabelalar (hastanenin "EMERGENCY" bandı)
  const fruit = [];
  const fountains = [];
  const ferrisWheels = [];
  for (const f of world.features) {
    switch (f.type) {
      case "cesme": {
        // Meydan çeşmesi: sekizgen büyük havuz, oymalı kenar, üç kademeli çanak, fıskiyeler ve
        // havuza dökülen su perdeleri; çevresinde çiçek tarhları.
        const y = world.groundY(f.x, f.z);
        const marble = std("#ece6da", { roughness: 0.55 });
        const rimMat = std("#d9cfbf", { roughness: 0.6 });
        const gold = std("#c9a24a", { metalness: 0.7, roughness: 0.3 });
        const pool = new THREE.MeshStandardMaterial({ color: "#5fc2d6", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 });
        const spray = new THREE.MeshStandardMaterial({ color: "#e8f8fc", roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
        const R = 7.6;
        add(new THREE.CylinderGeometry(R, R + 0.3, 0.75, 8), marble, f.x, y + 0.37, f.z, Math.PI / 8);
        add(new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.14, 8), rimMat, f.x, y + 0.8, f.z, Math.PI / 8);
        add(new THREE.CylinderGeometry(R - 0.45, R - 0.45, 0.06, 32), pool, f.x, y + 0.66, f.z, 0, false);
        // Kenarda sekiz küçük kaide ve üzerlerinde topuz.
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
          const px = f.x + Math.cos(a) * (R + 0.05), pz = f.z + Math.sin(a) * (R + 0.05);
          add(new THREE.BoxGeometry(0.7, 0.5, 0.7), marble, px, y + 1.1, pz, -a);
          add(new THREE.SphereGeometry(0.28, 12, 8), marble, px, y + 1.55, pz);
        }
        // Orta ayak ve kademeler.
        add(new THREE.CylinderGeometry(1.1, 1.5, 0.6, 16), marble, f.x, y + 0.95, f.z);
        add(new THREE.CylinderGeometry(0.55, 0.8, 1.6, 16), marble, f.x, y + 2.0, f.z);
        add(new THREE.CylinderGeometry(3.4, 1.0, 0.55, 24), marble, f.x, y + 2.95, f.z);
        add(new THREE.CylinderGeometry(3.1, 3.1, 0.06, 24), pool, f.x, y + 3.2, f.z, 0, false);
        add(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 12), marble, f.x, y + 3.9, f.z);
        add(new THREE.CylinderGeometry(1.8, 0.6, 0.4, 20), marble, f.x, y + 4.75, f.z);
        add(new THREE.CylinderGeometry(1.6, 1.6, 0.05, 20), pool, f.x, y + 4.93, f.z, 0, false);
        add(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 10), marble, f.x, y + 5.4, f.z);
        add(new THREE.SphereGeometry(0.32, 14, 10), gold, f.x, y + 6.0, f.z);
        // Su perdeleri: çanakların kenarından aşağı dökülen ince silindirler (dalgalanır).
        const curtains = [
          add(new THREE.CylinderGeometry(3.25, 3.45, 2.25, 32, 1, true), spray, f.x, y + 1.85, f.z, 0, false),
          add(new THREE.CylinderGeometry(1.7, 1.9, 1.55, 24, 1, true), spray, f.x, y + 4.0, f.z, 0, false),
        ];
        // Tepedeki fıskiye ve havuz kenarından içe doğru kavis yapan sekiz su kemeri.
        const jet = add(new THREE.ConeGeometry(0.28, 2.4, 10, 1, true), spray, f.x, y + 7.3, f.z, 0, false);
        jet.rotation.x = Math.PI;
        const arcs = [];
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const p0 = new THREE.Vector3(f.x + Math.cos(a) * (R - 0.5), y + 0.9, f.z + Math.sin(a) * (R - 0.5));
          const p2 = new THREE.Vector3(f.x + Math.cos(a) * 3.6, y + 0.7, f.z + Math.sin(a) * 3.6);
          const p1 = p0.clone().lerp(p2, 0.5).setY(y + 3.6);
          const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 16, 0.07, 6, false);
          const m = new THREE.Mesh(tube, spray);
          group.add(m);
          arcs.push(m);
        }
        fountains.push({ curtains, jet, arcs, pool });
        // Çevresinde sekiz çiçek tarhı (yürüyüş halkasının dışında, bankların arasında; meydan
        // düzenlenince gelir).
        for (const [px, pz] of world.flowerBeds ?? []) {
          const k = Math.round((Math.atan2(pz - f.z, px - f.x) / (Math.PI * 2)) * 8 + 8) % 8;
          add(new THREE.CylinderGeometry(1.5, 1.6, 0.4, 12), rimMat, px, y + 0.2, pz);
          add(new THREE.CylinderGeometry(1.35, 1.35, 0.1, 12), std("#5b4636"), px, y + 0.4, pz, 0, false);
          for (let j = 0; j < 9; j++) {
            const b2 = (j / 9) * Math.PI * 2;
            const r = j === 0 ? 0 : 0.8;
            add(new THREE.IcosahedronGeometry(0.22, 0), std(["#e05a6a", "#f2c230", "#9a6ad8", "#f4f1ea", "#f28c5a"][(j + k) % 5], { flatShading: true }), px + Math.cos(b2) * r, y + 0.6, pz + Math.sin(b2) * r, 0, false);
          }
        }
        break;
      }
      case "bank":
        benchAt(f.x, f.z, f.rot);
        break;
      case "masa1":
        tables.add(v.set(f.x, world.groundY(f.x, f.z), f.z), 0, s.set(1, 1, 1));
        tableLegs.add(v.set(f.x, world.groundY(f.x, f.z), f.z), 0, s.set(1, 1, 1));
        break;
      case "sandalye":
        for (const batch of [chairs, chairBacks, chairLegs, chairBackLegs]) batch.add(v.set(f.x, world.groundY(f.x, f.z), f.z), f.rot, s.set(1, 1, 1));
        break;
      case "cop_kutusu":
        bins.add(v.set(f.x, world.groundY(f.x, f.z), f.z), f.rot ?? 0, s.set(1, 1, 1));
        binPoles.add(v.set(f.x, world.groundY(f.x, f.z), f.z), f.rot ?? 0, s.set(1, 1, 1));
        break;
      case "konteyner":
        containers.add(v.set(f.x, world.surfaceY(f.x, f.z) + 0.06, f.z), (f.rot ?? 0) + Math.PI / 2, s.set(1, 1, 1));
        break;
      case "tabela_h": {
        const y0 = world.groundY(f.x, f.z);
        add(new THREE.CylinderGeometry(0.08, 0.08, 4, 8), metal, f.x, y0 + 2, f.z);
        add(new THREE.BoxGeometry(0.15, 1.6, 1.6), std("#2f6fb5"), f.x, y0 + 4.5, f.z, Math.PI / 2);
        add(new THREE.BoxGeometry(0.17, 1.0, 0.25), white, f.x, y0 + 4.5, f.z, Math.PI / 2, false);
        add(new THREE.BoxGeometry(0.17, 0.25, 0.8), white, f.x, y0 + 4.5, f.z, Math.PI / 2, false);
        break;
      }
      case "okul_bahce": {
        // Okul bahçesi: alçak duvar ve parmaklık, kapı direkleri, bayrak direği ve bayrak, mini kaleler,
        // seksek ve top sahası çizgileri, çınar gölgesinde banklar.
        const { x0, x1, z0, z1, gateX } = f;
        const y0 = FLAT_Y + 0.12, wallM = std("#e9e1d2"), rail = metal;
        const wall = (ax, az, bx, bz) => {
          const L = Math.hypot(bx - ax, bz - az), h = Math.atan2(bx - ax, bz - az);
          add(new THREE.BoxGeometry(0.3, 0.7, L), wallM, (ax + bx) / 2, y0 + 0.35, (az + bz) / 2, h);
          add(new THREE.BoxGeometry(0.06, 0.06, L), rail, (ax + bx) / 2, y0 + 1.5, (az + bz) / 2, h, false);
          for (let u = 0; u <= L; u += 0.25) add(new THREE.BoxGeometry(0.03, 0.8, 0.03), rail, ax + ((bx - ax) * u) / L, y0 + 1.1, az + ((bz - az) * u) / L, 0, false);
        };
        wall(x0, z0, x0, z1); wall(x1, z0, x1, z1); wall(x0, z1, gateX - 2, z1); wall(gateX + 2, z1, x1, z1);
        for (const gx of [gateX - 2, gateX + 2]) add(new THREE.BoxGeometry(0.5, 2.0, 0.5), std("#b5563f"), gx, y0 + 1.0, z1);
        // Bayrak.
        add(new THREE.CylinderGeometry(0.06, 0.08, 9, 8), rail, x0 + 2, y0 + 4.5, z0 + 1.5);
        add(new THREE.BoxGeometry(0.03, 1.2, 1.8), std("#d8233a"), x0 + 2, y0 + 8.3, z0 + 1.5 + 0.95, 0, false);
        // Saha çizgileri ve mini kaleler (doğu-batı), seksek.
        const line = std("#f4f1ea", { roughness: 0.9 });
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0 - 3, D = z1 - z0 - 6;
        for (const [x, z, w, d] of [[cx, cz - D / 2, W, 0.08], [cx, cz + D / 2, W, 0.08], [cx - W / 2, cz, 0.08, D], [cx + W / 2, cz, 0.08, D], [cx, cz, 0.08, D]]) add(new THREE.BoxGeometry(w, 0.02, d), line, x, y0 + 0.01, z, 0, false);
        for (const s of [-1, 1]) {
          const gx = cx + s * (W / 2 - 0.2);
          for (const dz of [-1.1, 1.1]) add(new THREE.BoxGeometry(0.06, 1.1, 0.06), white, gx, y0 + 0.55, cz + dz, 0, false);
          add(new THREE.BoxGeometry(0.06, 0.06, 2.3), white, gx, y0 + 1.1, cz, 0, false);
        }
        for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.7, 0.02, 0.7), std(["#e8c22e", "#5a8fd8", "#e86a5a"][k % 3], { roughness: 0.9 }), x1 - 3, y0 + 0.012, z0 + 2 + k * 0.75, 0, false);
        break;
      }
      case "hastane_on": {
        // Hastanenin önü (cephe x = f.x, doğuya bakar): sütunlu acil saçağı ve "ACİL" bandı, cam sürgülü
        // kapı, boyalı ambulans yerleri, saksılar ve banklar; çatıda helikopter pisti.
        const y0 = FLAT_Y;
        const label = (text, w, h, bg, fg) => {
          const cv = document.createElement("canvas");
          cv.width = 256; cv.height = Math.round((256 * h) / w);
          const g = cv.getContext("2d");
          g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
          g.fillStyle = fg; g.font = `800 ${Math.round(cv.height * 0.7)}px Nunito, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText(text, cv.width / 2, cv.height / 2 + 2);
          const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
          return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
        };
        add(new THREE.BoxGeometry(7, 0.35, 12), white, f.x + 3.5, y0 + 4.2, f.z);
        // Bant saçağın ön kenarında, boyu z ekseninde (yazı +x yüzünde okunur).
        // Gece ışıklı tabela: yazı dokusu kendi ışığıyla parlar (setFlood).
        const acil = label("EMERGENCY", 12, 0.8, "#d8342b", "#ffffff");
        acil.emissive = new THREE.Color("#ffffff"); acil.emissiveMap = acil.map; acil.emissiveIntensity = 0;
        glowSigns.push(acil);
        add(new THREE.BoxGeometry(0.1, 0.8, 12), acil, f.x + 7.05, y0 + 3.85, f.z, 0, false);
        for (const dz of [-5.5, 5.5]) add(new THREE.CylinderGeometry(0.2, 0.2, 4.1, 10), white, f.x + 6.5, y0 + 2.05, f.z + dz);
        add(new THREE.BoxGeometry(0.08, 2.6, 4), new THREE.MeshStandardMaterial({ color: "#a9cbe0", roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.6 }), f.x + 0.12, y0 + 1.3, f.z, 0, false);
        add(new THREE.BoxGeometry(0.1, 0.12, 4.2), metal, f.x + 0.14, y0 + 2.65, f.z, 0, false);
        // Ambulans park yerleri (giriş yolunun iki yanında), sarı tarama.
        const paint = std("#f4f1ea", { roughness: 0.9 }), yellow = std("#e8c22e", { roughness: 0.9 });
        for (const dz of [-6, 6]) {
          const cz = f.z + dz;
          for (const [x, z, w, d] of [[f.x + 9, cz - 1.75, 9, 0.12], [f.x + 9, cz + 1.75, 9, 0.12], [f.x + 4.5, cz, 0.12, 3.5]]) add(new THREE.BoxGeometry(w, 0.02, d), paint, x, y0 + 0.22, z, 0, false);
          const tag = add(new THREE.PlaneGeometry(3.2, 0.9), label("AMBULANS", 3.2, 0.9, "#00000000", "#f4f1ea"), f.x + 10, y0 + 0.235, cz, 0, false);
          tag.rotation.x = -Math.PI / 2; tag.rotation.z = Math.PI / 2; tag.material.transparent = true;
        }
        for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.4, 0.02, 3), yellow, f.x + 15 + k * 0.9, y0 + 0.22, f.z - 10, 0.6, false);
        // Saksılar (bitkili) ve banklar, plaza kenarında.
        for (const [dx, dz] of [[2, -11], [2, 11], [16, -12.5], [16, 12.5]]) {
          add(new THREE.CylinderGeometry(0.7, 0.6, 0.7, 12), std("#cfc8bc"), f.x + dx, y0 + 0.55, f.z + dz);
          add(new THREE.SphereGeometry(0.75, 10, 8), std("#5f8f4f"), f.x + dx, y0 + 1.3, f.z + dz);
        }
        for (const dz of [-9, 9]) {
          add(new THREE.BoxGeometry(0.45, 0.08, 1.8), wood, f.x + 2.2, y0 + 0.65, f.z + dz);
          add(new THREE.BoxGeometry(0.06, 0.45, 1.8), wood, f.x + 1.98, y0 + 0.9, f.z + dz);
        }
        // Çatı: helikopter pisti.
        const pad = add(new THREE.CylinderGeometry(6, 6, 0.12, 32), label("H", 6, 6, "#4b5b52", "#ffffff"), f.bx, y0 + f.roofY + 0.1, f.z, 0, false);
        pad.rotation.y = Math.PI / 2;
        add(new THREE.TorusGeometry(5.2, 0.12, 6, 40).rotateX(Math.PI / 2), paint, f.bx, y0 + f.roofY + 0.18, f.z, 0, false);
        break;
      }
      case "gol": {
        add(new THREE.CylinderGeometry(f.r + 0.6, f.r + 0.8, 0.5, 28), stone, f.x, FLAT_Y + 0.15, f.z);
        add(new THREE.CylinderGeometry(f.r, f.r, 0.1, 28), water, f.x, FLAT_Y + 0.38, f.z, 0, false);
        break;
      }
      case "havuz": {
        // Açık yüzme havuzu: taş güverte, gömme havuz (mavi karo iç duvar, açık mavi taban, yarı saydam
        // su), kenar taşı, kulvar ipleri, merdivenler; güneyde şezlong ve şemsiyeler, çit, duşlar.
        const deckY = FLAT_Y + 0.3, tile = std("#5fa9c9", { roughness: 0.3 }), coping = std("#f4f1ea");
        const hw = f.w / 2, hd = f.d / 2, depth = 1.6;
        for (const [x, z, w, d] of [[0, -hd - 3, f.w + 8, 6], [0, hd + 3.5, f.w + 8, 7], [-hw - 2, 0, 4, f.d], [hw + 2, 0, 4, f.d]]) add(new THREE.BoxGeometry(w, 0.3, d), stone, f.x + x, deckY - 0.15, f.z + z);
        add(new THREE.BoxGeometry(f.w, 0.1, f.d), std("#bfe6f2"), f.x, deckY - depth, f.z, 0, false);
        for (const [x, z, w, d] of [[0, -hd, f.w, 0.2], [0, hd, f.w, 0.2], [-hw, 0, 0.2, f.d], [hw, 0, 0.2, f.d]]) {
          add(new THREE.BoxGeometry(w, depth, d), tile, f.x + x, deckY - depth / 2, f.z + z, 0, false);
          add(new THREE.BoxGeometry(w + (d > w ? 0.6 : 0.6), 0.08, d + (d > w ? 0 : 0.4)), coping, f.x + x, deckY + 0.04, f.z + z, 0, false);
        }
        add(new THREE.BoxGeometry(f.w - 0.2, 0.04, f.d - 0.2), new THREE.MeshStandardMaterial({ color: "#3fb6d8", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72 }), f.x, deckY - 0.18, f.z, 0, false);
        for (let k = 1; k < 5; k++) add(new THREE.CylinderGeometry(0.05, 0.05, f.w - 0.4, 6).rotateZ(Math.PI / 2), std(k % 2 ? "#d8342b" : "#f4f1ea"), f.x, deckY - 0.15, f.z - hd + (k * f.d) / 5, 0, false);
        for (const sx of [-1, 1]) {
          const lx = f.x + sx * (hw - 1.5), lz = f.z - hd + 0.25;
          for (const dx of [-0.3, 0.3]) add(new THREE.TorusGeometry(0.35, 0.03, 6, 10, Math.PI).rotateY(Math.PI / 2), metal, lx + dx, deckY + 0.2, lz, 0, false);
          for (let r = 0; r < 3; r++) add(new THREE.BoxGeometry(0.6, 0.04, 0.12), metal, lx, deckY - 0.35 - r * 0.35, lz + 0.08, 0, false);
        }
        // Şezlonglar ve şemsiyeler (güney güvertesi).
        for (let i = 0; i < 8; i++) {
          const x = f.x - hw + 1.6 + i * ((f.w - 3.2) / 7), z = f.z + hd + 3.3;
          add(new THREE.BoxGeometry(0.7, 0.12, 1.9), white, x, deckY + 0.32, z);
          const back = add(new THREE.BoxGeometry(0.7, 0.08, 0.7), white, x, deckY + 0.5, z - 0.85, 0, false);
          back.rotation.x = 0.7;
          for (const [dx, dz] of [[-0.3, -0.8], [0.3, -0.8], [-0.3, 0.8], [0.3, 0.8]]) add(new THREE.BoxGeometry(0.04, 0.26, 0.04), metal, x + dx, deckY + 0.13, z + dz, 0, false);
          if (i % 2 === 0) {
            add(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), metal, x + 1.1, deckY + 1.2, z - 0.4, 0, false);
            add(new THREE.ConeGeometry(1.5, 0.45, 8), std(["#d8342b", "#2f5d8a", "#f2d36b", "#3e8a86"][(i / 2) % 4]), x + 1.1, deckY + 2.5, z - 0.4);
          }
        }
        // Çit (güverte çevresi, kuzeyde giriş açıklığı) ve duşlar.
        const fw = f.w + 8, fd = f.d + 13, fz = f.z + 0.5;
        for (const [x, z, w, d] of [[0, fd / 2, fw, 0.05], [-fw / 2, 0, 0.05, fd], [fw / 2, 0, 0.05, fd], [-fw / 4 - 1.5, -fd / 2, fw / 2 - 3, 0.05], [fw / 4 + 1.5, -fd / 2, fw / 2 - 3, 0.05]]) {
          add(new THREE.BoxGeometry(w, 1.1, d), new THREE.MeshStandardMaterial({ color: "#cfe3ee", transparent: true, opacity: 0.35, roughness: 0.1 }), f.x + x, deckY + 0.55, fz + z, 0, false);
          add(new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.04), metal, f.x + x, deckY + 1.12, fz + z, 0, false);
        }
        for (const sx of [-1, 1]) {
          add(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), metal, f.x + sx * (hw + 2.5), deckY + 1.15, f.z - hd - 2, 0, false);
          add(new THREE.CylinderGeometry(0.15, 0.08, 0.1, 10), metal, f.x + sx * (hw + 2.5), deckY + 2.25, f.z - hd - 1.75, 0, false);
        }
        break;
      }
      case "tezgah": {
        const c = P.CLOTHES[f.c % P.CLOTHES.length];
        add(new THREE.BoxGeometry(3, 0.9, 1.6), wood, f.x, FLAT_Y + 0.5, f.z);
        add(new THREE.BoxGeometry(3.4, 0.08, 2.2), std(c), f.x, FLAT_Y + 2.4, f.z, 0, true).rotation.x = -0.12 * (f.dir ?? 1);
        for (const dx of [-1.6, 1.6]) for (const dz of [-1, 1]) add(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 4), metal, f.x + dx, FLAT_Y + 1.2, f.z + dz, 0, false);
        // Mallar: üç kasa, içlerinde yığın yığın meyve-sebze (tezgâha göre).
        const goods = [["#d8342b", "#c62f28"], ["#f28c28", "#e88a1e"], ["#f2d03a", "#e8c22e"], ["#7fae45", "#6e9e3a"], ["#5b2a6e", "#4a2259"], ["#e86a5a", "#7fae45"]];
        for (let k = 0; k < 3; k++) {
          const gx = f.x - 1.0 + k * 1.0;
          add(new THREE.BoxGeometry(0.9, 0.22, 1.0), std("#b08a5a"), gx, FLAT_Y + 1.06, f.z, 0, false);
          const [c1, c2] = goods[(f.c + k) % goods.length];
          for (let i = 0; i < 9; i++) fruit.push([gx - 0.28 + (i % 3) * 0.28, FLAT_Y + 1.22 + (i % 2) * 0.05, f.z - 0.3 + Math.floor(i / 3) * 0.3, i % 2 ? c2 : c1]);
        }
        break;
      }
      case "vinc": {
        add(new THREE.BoxGeometry(1.4, 26, 1.4), std("#e8b93a"), f.x, FLAT_Y + 13, f.z);
        add(new THREE.BoxGeometry(22, 1.2, 1.2), std("#e8b93a"), f.x - 8, FLAT_Y + 25.5, f.z);
        add(new THREE.BoxGeometry(0.05, 12, 0.05), metal, f.x - 16, FLAT_Y + 19.5, f.z, 0, false);
        break;
      }
      case "rihtim": {
        // Rıhtım duvarı: kıyı çizgisi boyunca granit gövde (sudan rıhtım üstüne), üstte açık renk başlık taşı, kara
        // tarafında granit kaplama şeridi (duvardan 0,65–5,05 m): duvarın dibindeki arazi inişini örter (arazi ağı
        // rıhtımda 4 m; iniş bir hücreden geniş olamaz). Üçü de kıyı boyunca tek parça süpürülür: kutu parçaları
        // eklerde dikiş, kıvrımlarda diş, köşelerde sivri uç bırakıyordu.
        const granite = std("#8f8a82", { roughness: 0.9 }), cap = std("#bdb7ad", { roughness: 0.8 }), coping = std("#a59f95", { roughness: 0.9 });
        for (const m of [granite, cap, coping]) m.side = THREE.DoubleSide;
        const kesik = (f.kesik ?? []).filter((k) => world.piers.includes(k.pier));
        const pts = rihtimNoktalari(f.pts, kesik);
        const runs = [];
        let run = [];
        for (let i = 0; i < pts.length; i++) {
          const pt = pts[i], prev = run.at(-1);
          if (!pt || (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 12)) { if (run.length > 1) runs.push(run); run = pt ? [pt] : []; }
          else run.push(pt);
        }
        if (run.length > 1) runs.push(run);
        const dir = (a, b2) => { const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]) || 1; return [(b2[0] - a[0]) / L, (b2[1] - a[1]) / L]; };
        for (const r of runs) {
          // Kara yönü (n): ±3 noktalık pencere (kıyının kırıklarını izleyip dalgalanmasın); pencere köşeyi (yön 30°'den
          // fazla döner: dolgu kenarı) aşmaz, köşe noktasında iki kenarın açıortayı (gönye; genişlik 1/cos ile korunur).
          // İskele kesiğinin ucunda n = -z: duvar iskelenin kenarına paralel biter.
          const corner = r.map((_, i) => {
            if (i === 0 || i === r.length - 1) return false;
            const u = dir(r[i - 1], r[i]), v = dir(r[i], r[i + 1]);
            return u[0] * v[0] + u[1] * v[1] < Math.cos(Math.PI / 6);
          });
          const N = r.map((pt, i) => {
            if (pt[2]) return [0, -1];
            if (corner[i]) {
              const p = dir(r[Math.max(0, i - 3)], r[i]), q = dir(r[i], r[Math.min(r.length - 1, i + 3)]);
              const n1 = [p[1], -p[0]], n2 = [q[1], -q[0]], m = [n1[0] + n2[0], n1[1] + n2[1]], L = Math.hypot(m[0], m[1]) || 1;
              const c = Math.max(0.5, (m[0] * n1[0] + m[1] * n1[1]) / L);
              return [m[0] / L / c, m[1] / L / c];
            }
            let a = i, b2 = i;
            while (a > Math.max(0, i - 3) && (a === i || !corner[a])) a--;
            while (b2 < Math.min(r.length - 1, i + 3) && (b2 === i || !corner[b2])) b2++;
            const d = dir(r[a], r[b2]);
            return [d[1], -d[0]];
          });
          // Kesit kıyı boyunca süpürülür: prof [[o, y]] (o: kara yönünde uzaklık); her kesit kenarı ayrı yüz şeridi
          // (kenarlar keskin, kıyı boyunca yumuşak); kapalı kesitte iki uca kapak.
          // ids: kullanılan noktalar (geniş kesitte köşeye kesitten yakın noktalar atlanır: iç kenar geri katlanmasın).
          const sweep = (prof, mat, closed, ids = r.map((_, i) => i)) => {
            const P = [], I = [];
            for (let e = 0; e < (closed ? prof.length : prof.length - 1); e++) {
              const [o0, y0] = prof[e], [o1, y1] = prof[(e + 1) % prof.length], base = P.length / 3;
              ids.forEach((i, k) => {
                const [x, z] = r[i], [nx, nz] = N[i];
                P.push(x + nx * o0, y0, z + nz * o0, x + nx * o1, y1, z + nz * o1);
                if (k) { const a = base + (k - 1) * 2, b2 = base + k * 2; I.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
              });
            }
            if (closed) for (const i of [ids[0], ids.at(-1)]) {
              const base = P.length / 3;
              for (const [o, y] of prof) P.push(r[i][0] + N[i][0] * o, y, r[i][1] + N[i][1] * o);
              for (let k = 1; k < prof.length - 1; k++) I.push(base, base + k, base + k + 1);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
            geo.setIndex(I);
            geo.computeVertexNormals();
            add(geo, mat, 0, 0, 0, 0, false);
          };
          sweep([[-0.5, -3.05], [-0.5, FLAT_Y + 0.15], [0.5, FLAT_Y + 0.15], [0.5, -3.05]], granite, true);
          sweep([[-0.65, FLAT_Y + 0.125], [-0.65, FLAT_Y + 0.375], [0.65, FLAT_Y + 0.375], [0.65, FLAT_Y + 0.125]], cap, true);
          const near = (i) => !corner[i] && r.some((q, j) => corner[j] && Math.hypot(q[0] - r[i][0], q[1] - r[i][1]) < 5.2);
          sweep([[0.65, FLAT_Y + 0.07], [5.05, FLAT_Y + 0.07], [5.05, FLAT_Y - 0.3]], coping, false, r.map((_, i) => i).filter((i) => !near(i)));
        }
        // İskele kesiklerinde güvertenin altında dayanak: denize bakan yüzü duvarla aynı hizada, kara ucu iskelenin
        // kara ucunda; üstü kirişlerin altında (layout.js kesik.dayanak.top).
        for (const k of kesik) {
          if (!k.dayanak) continue;
          const { z0, top } = k.dayanak, y0 = -3.05;
          const c = [[k.xa, k.za + 0.5], [k.xb, k.zb + 0.5], [k.xb, z0], [k.xa, z0]];
          const P = [];
          for (const y of [y0, top]) for (const [x, z] of c) P.push(x, y, z);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
          geo.setIndex([4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
          const flat = geo.toNonIndexed();
          flat.computeVertexNormals();
          add(flat, granite, 0, 0, 0, 0, false);
        }
        break;
      }
      case "okul_otobusu": {
        // Sarı okul otobüsü (park hâlinde): sarı gövde, siyah şeritler, pencere sırası, STOP kolu, siyah tampon.
        const y0 = world.groundY(f.x, f.z);
        const g = new THREE.Group();
        g.position.set(f.x, y0, f.z);
        g.rotation.y = f.rot;
        group.add(g);
        const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
        const yellow = std("#f2b51e", { roughness: 0.5 }), black = std("#1d1d20"), glassM = std("#33414f", { roughness: 0.2, metalness: 0.4 });
        put(new THREE.BoxGeometry(2.4, 2.3, 9.6), yellow, 0, 1.75, -0.4);
        put(new THREE.BoxGeometry(2.3, 1.2, 1.6), yellow, 0, 1.2, 5.1);
        put(new THREE.BoxGeometry(2.44, 0.75, 8.2), glassM, 0, 2.3, -0.8);
        put(new THREE.BoxGeometry(2.2, 0.8, 0.06), glassM, 0, 2.3, 4.32);
        for (const y of [1.25, 1.6]) put(new THREE.BoxGeometry(2.45, 0.07, 9.6), black, 0, y, -0.4);
        put(new THREE.BoxGeometry(2.5, 0.3, 0.3), black, 0, 0.55, 5.95);
        put(new THREE.BoxGeometry(0.05, 0.45, 0.45), std("#c8231f"), -1.25, 1.9, 3.4);
        for (const z of [-3.6, 3.9]) for (const x of [-1.05, 1.05]) put(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateZ(Math.PI / 2), black, x, 0.5, z);
        break;
      }
      case "bandstand": {
        // Town Green çardağı: sekizgen beyaz ahşap, yüksek döşeme, ince direkler, korkuluk ve sekizgen külah.
        const y0 = world.groundY(f.x, f.z);
        const g = new THREE.Group();
        g.position.set(f.x, y0, f.z);
        group.add(g);
        const put = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
        const R = 5.2;
        put(new THREE.CylinderGeometry(R + 0.2, R + 0.4, 1.0, 8), std("#cfc6b8"), 0, 0.5, 0, Math.PI / 8);
        put(new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.18, 8), white, 0, 1.08, 0, Math.PI / 8);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          put(new THREE.BoxGeometry(0.22, 3.2, 0.22), white, Math.sin(a) * R, 2.75, Math.cos(a) * R);
          if (k === 0) continue; // giriş
          const b2 = (k + 0.5) / 8 * Math.PI * 2, rr = R * Math.cos(Math.PI / 8);
          put(new THREE.BoxGeometry(2 * R * Math.sin(Math.PI / 8) - 0.2, 0.08, 0.1), white, Math.sin(b2) * rr, 2.05, Math.cos(b2) * rr, b2);
          put(new THREE.BoxGeometry(2 * R * Math.sin(Math.PI / 8) - 0.2, 0.06, 0.08), white, Math.sin(b2) * rr, 1.35, Math.cos(b2) * rr, b2);
        }
        put(new THREE.CylinderGeometry(R + 0.6, R + 0.6, 0.25, 8), white, 0, 4.45, 0, Math.PI / 8);
        put(new THREE.ConeGeometry(R + 0.7, 2.6, 8), std("#4d5560", { roughness: 0.7, flatShading: true }), 0, 5.85, 0, Math.PI / 8);
        put(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), metal, 0, 7.6, 0);
        put(new THREE.BoxGeometry(1.3, 0.4, 0.8), std("#cfc6b8"), 0, 0.2, R + 0.9);
        break;
      }
      case "dikilitas": {
        // Sade granit dikilitaş (anma taşı): kademeli kaide, sivrilen gövde.
        const y0 = world.groundY(f.x, f.z);
        const granite = std("#b9b6b0", { roughness: 0.7 });
        add(new THREE.BoxGeometry(1.6, 0.5, 1.6), granite, f.x, y0 + 0.25, f.z);
        add(new THREE.BoxGeometry(1.0, 0.4, 1.0), granite, f.x, y0 + 0.7, f.z);
        add(new THREE.CylinderGeometry(0.22, 0.42, 4.2, 4).rotateY(Math.PI / 4), granite, f.x, y0 + 3.0, f.z);
        add(new THREE.ConeGeometry(0.3, 0.5, 4).rotateY(Math.PI / 4), granite, f.x, y0 + 5.35, f.z);
        break;
      }
      case "lunapark": {
        // Eğlence iskelesi: kazıklar üstünde ahşap güverte, korkuluklar, oyun tezgâhları, atlıkarınca ve dönme dolap.
        const top = world.lunapark?.pier.top ?? 1.9;
        const x0 = f.x - 9, x1 = f.x + 9, z0 = f.z0, z1 = f.z1, L = z1 - z0;
        const planks = std("#a5835e", { roughness: 0.95 });
        add(new THREE.BoxGeometry(18, 0.3, L), planks, f.x, top - 0.15, (z0 + z1) / 2);
        const pile = new Batch(new THREE.CylinderGeometry(0.22, 0.22, 1, 6).translate(0, 0.5, 0), std("#6b5a48"), { shadow: false });
        for (let z = z0 + 2; z < z1; z += 6) for (const x of [x0 + 0.5, f.x, x1 - 0.5]) pile.add(v.set(x, -6, z), 0, s.set(1, top + 6 - 0.15, 1));
        group.add(pile.build());
        for (const x of [x0 + 0.1, x1 - 0.1]) {
          add(new THREE.BoxGeometry(0.1, 0.08, L), white, x, top + 1.0, (z0 + z1) / 2, 0, false);
          for (let z = z0 + 1; z < z1; z += 2) add(new THREE.BoxGeometry(0.08, 1.0, 0.08), white, x, top + 0.5, z, 0, false);
        }
        const stripe = ["#c43a3a", "#2f4256", "#e9b23a", "#3e7a5a"];
        for (let k = 0; k < 4; k++) {
          const z = z1 - 14 - k * 9, x = k % 2 ? x1 - 2.6 : x0 + 2.6;
          add(new THREE.BoxGeometry(3.4, 2.4, 3.6), std("#f4f1ea"), x, top + 1.2, z);
          add(new THREE.BoxGeometry(3.8, 0.12, 4.0), std(stripe[k]), x, top + 2.55, z);
        }
        // Atlıkarınca: çatılı yuvarlak platform, direkler.
        const cz = z0 + 62;
        add(new THREE.CylinderGeometry(5, 5, 0.4, 24), std("#f4f1ea"), f.x, top + 0.2, cz);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          add(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), std("#c9a441", { metalness: 0.5 }), f.x + Math.sin(a) * 3.8, top + 2.0, cz + Math.cos(a) * 3.8, 0, false);
          add(new THREE.BoxGeometry(0.35, 0.6, 1.1), std(stripe[k % 4]), f.x + Math.sin(a) * 3.8, top + 1.2 + (k % 2) * 0.4, cz + Math.cos(a) * 3.8, a, false);
        }
        add(new THREE.ConeGeometry(5.6, 2.0, 24), std("#c43a3a", { flatShading: true }), f.x, top + 4.6, cz);
        // Dönme dolap: kıyıya bakan düzlemde (eksen z), A ayaklar; gece renkli ampuller.
        const [wx, wz] = f.wheel, R = 14, hub = top + R + 3;
        const legs = std("#e8e8e8", { metalness: 0.4, roughness: 0.4 });
        for (const sz of [-1.6, 1.6]) for (const sx of [-1, 1]) {
          const leg = add(new THREE.CylinderGeometry(0.22, 0.3, (hub - top) / Math.cos(0.3), 8), legs, wx + sx * Math.tan(0.3) * (hub - top) / 2, (hub + top) / 2, wz + sz);
          leg.rotation.z = -sx * 0.3;
        }
        add(new THREE.CylinderGeometry(0.4, 0.4, 3.6, 10).rotateX(Math.PI / 2), legs, wx, hub, wz);
        const wheel = new THREE.Group();
        wheel.userData.keep = true; // döner
        wheel.position.set(wx, hub, wz);
        group.add(wheel);
        const rim = std("#f4f1ea", { metalness: 0.3, roughness: 0.4 });
        for (const sz of [-1.2, 1.2]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 6, 48), rim);
          ring.position.z = sz;
          wheel.add(ring);
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, R, 0.08).translate(0, R / 2, 0), rim);
            sp.rotation.z = a;
            sp.position.z = sz;
            wheel.add(sp);
          }
        }
        const bulbMat = new THREE.MeshStandardMaterial({ color: "#ffe9b0", emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 0 });
        const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), bulbMat, 96);
        for (let k = 0; k < 96; k++) { const a = (k / 96) * Math.PI * 2; bulbs.setMatrixAt(k, new THREE.Matrix4().makeTranslation(Math.sin(a) * (R + 0.25), Math.cos(a) * (R + 0.25), 1.3)); }
        wheel.add(bulbs);
        const cars = [];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const car = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.8).translate(0, -0.9, 0), std(stripe[k % 4]));
          car.position.set(Math.sin(a) * R, Math.cos(a) * R, 0);
          car.castShadow = true;
          wheel.add(car);
          cars.push(car);
        }
        ferrisWheels.push({ wheel, cars, bulbMat });
        break;
      }
      case "fener": {
        // Deniz feneri: sekizgen taş kaide ve kapı, kırmızı-beyaz bantlı konik gövde ve pencereleri,
        // konsollu seyir balkonu ve korkuluğu, kayıtlı camlı fener odası (içinde mercek), bakır kubbe,
        // havalandırma topu ve paratoner. Gece mercek yanar ve iki ışık huzmesi döner.
        const y0 = world.height(f.x, f.z);
        const g = new THREE.Group();
        g.userData.keep = true; // huzme döner
        g.position.set(f.x, y0, f.z);
        group.add(g);
        const toLand = world.fener?.door ? Math.atan2(world.fener.door[0] - f.x, world.fener.door[1] - f.z) : 0;
        g.rotation.y = toLand;
        const put = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
        const H = 17, r0 = 2.7, r1 = 1.95;
        put(new THREE.CylinderGeometry(4.3, 4.7, 1.3, 8), stone, 0, 0.65, 0);
        put(new THREE.CylinderGeometry(4.0, 4.0, 0.15, 8), std("#bdb5a8"), 0, 1.35, 0, false);
        // Gövde bantları (gövde koniği boyunca, birbirine tam oturan halkalar).
        const bands = 5;
        for (let i = 0; i < bands; i++) {
          const ya = 1.4 + (i * (H - 1.4)) / bands, yb = 1.4 + ((i + 1) * (H - 1.4)) / bands;
          const ra = r0 + ((r1 - r0) * (ya - 1.4)) / (H - 1.4), rb = r0 + ((r1 - r0) * (yb - 1.4)) / (H - 1.4);
          put(new THREE.CylinderGeometry(rb, ra, yb - ya, 24), std(f.abd ? "#f7f5f0" : i % 2 ? "#c8312f" : "#f7f5f0", { roughness: 0.6 }), 0, (ya + yb) / 2, 0);
        }
        // Kapı (kara tarafında) ve basamaklar; gövdede kademeli küçük pencereler.
        put(new THREE.BoxGeometry(1.1, 2.2, 0.3), std("#4a3426"), 0, 2.5, r0 - 0.05, false);
        put(new THREE.BoxGeometry(1.5, 0.2, 0.6), stone, 0, 1.45, r0 + 0.3, false);
        for (let k = 0; k < 4; k++) {
          const y = 5 + k * 3, rr = r0 + ((r1 - r0) * (y - 1.4)) / (H - 1.4), a = k * 1.3 + 0.6;
          const w = put(new THREE.BoxGeometry(0.5, 0.8, 0.12), std("#2a3440"), Math.sin(a) * rr, y, Math.cos(a) * rr, false);
          w.rotation.y = a;
        }
        // Balkon: konsollar, döşeme, korkuluk.
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const c = put(new THREE.BoxGeometry(0.2, 0.6, 0.6), std("#f7f5f0"), Math.sin(a) * (r1 + 0.3), H - 0.35, Math.cos(a) * (r1 + 0.3), false);
          c.rotation.y = a;
        }
        put(new THREE.CylinderGeometry(r1 + 0.85, r1 + 0.85, 0.22, 24), metal, 0, H + 0.08, 0);
        for (let k = 0; k < 20; k++) {
          const a = (k / 20) * Math.PI * 2;
          put(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), metal, Math.sin(a) * (r1 + 0.8), H + 0.7, Math.cos(a) * (r1 + 0.8), false);
        }
        put(new THREE.TorusGeometry(r1 + 0.8, 0.04, 6, 40).rotateX(Math.PI / 2), metal, 0, H + 1.2, 0, false);
        put(new THREE.TorusGeometry(r1 + 0.8, 0.025, 6, 40).rotateX(Math.PI / 2), metal, 0, H + 0.7, 0, false);
        // Fener odası: alt duvar, camlar ve kayıtlar, mercek.
        put(new THREE.CylinderGeometry(1.45, 1.45, 0.8, 16), std(f.abd ? "#1f2224" : "#f7f5f0"), 0, H + 0.6, 0);
        put(new THREE.CylinderGeometry(1.42, 1.42, 2.1, 16, 1, true), new THREE.MeshStandardMaterial({ color: "#cfe3ee", transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }), 0, H + 2.05, 0, false);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          put(new THREE.BoxGeometry(0.06, 2.1, 0.06), metal, Math.sin(a) * 1.43, H + 2.05, Math.cos(a) * 1.43, false);
        }
        const lensMat = new THREE.MeshStandardMaterial({ color: "#fff6d6", emissive: new THREE.Color("#fff1c4"), emissiveIntensity: 0.15, roughness: 0.1 });
        const lens = put(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 12), lensMat, 0, H + 2.0, 0, false);
        put(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 16), metal, 0, H + 3.15, 0);
        put(new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(f.abd ? "#1f2224" : "#3e6b5a", { roughness: 0.5, metalness: 0.3 }), 0, H + 3.2, 0);
        put(new THREE.SphereGeometry(0.28, 10, 8), std(f.abd ? "#1f2224" : "#3e6b5a", { metalness: 0.3 }), 0, H + 4.85, 0);
        put(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), metal, 0, H + 5.6, 0, false);
        // Işık huzmeleri: gece görünür, yavaşça döner.
        // Huzme: kaynağında parlak, uzaklaştıkça sönen ince ışık konisi (uv.y: 1 kaynak, 0 uç).
        const beamMat = new THREE.ShaderMaterial({
          uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color("#fff3c8") } },
          vertexShader: "varying float vT; void main() { vT = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: "uniform float uOpacity; uniform vec3 uColor; varying float vT; void main() { gl_FragColor = vec4(uColor, uOpacity * pow(vT, 2.2)); }",
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        const beam = new THREE.Group();
        beam.position.set(0, H + 2.0, 0);
        for (const s of [1, -1]) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 60, 16, 1, true).translate(0, -30, 0).rotateX(s * Math.PI / 2), beamMat);
          beam.add(cone);
        }
        beam.visible = false;
        g.add(beam);
        fenerLamps.push({ lens, lensMat, beam, beamMat });
        break;
      }
      case "tribun": {
        const y0 = world.groundY((f.x0 + f.x1) / 2, f.z);
        const len = f.x1 - f.x0, cx = (f.x0 + f.x1) / 2;
        const concrete = std("#cfcac2");
        // Basamaklar, koridor merdivenleri, kenar duvarları, ön korkuluk; koltuklar ayrıca (kova koltuk).
        for (let r = 0; r < 4; r++) {
          const z = f.z + f.side * (1.2 + r * 0.8);
          add(new THREE.BoxGeometry(len, 0.4 + r * 0.4, 0.8), concrete, cx, y0 + (0.4 + r * 0.4) / 2, z);
          for (let ax = f.x0; ax <= f.x1; ax += 15) {
            add(new THREE.BoxGeometry(1.1, 0.2, 0.4), std("#bdb7ae"), ax + 0.6, y0 + 0.4 + r * 0.4 + 0.1, z - f.side * 0.2, 0, false);
            add(new THREE.BoxGeometry(0.05, 0.04, 0.05), std("#e8c22e"), ax + 0.6, y0 + 0.62 + r * 0.4, z - f.side * 0.38, 0, false);
          }
        }
        for (const ex of [f.x0 - 0.15, f.x1 + 0.15]) for (let r = 0; r < 4; r++) add(new THREE.BoxGeometry(0.3, 0.9 + r * 0.4, 0.8), concrete, ex, y0 + (0.9 + r * 0.4) / 2, f.z + f.side * (1.2 + r * 0.8));
        for (let x = f.x0; x <= f.x1; x += 2.5) add(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), metal, x, y0 + 0.5, f.z + f.side * 0.75, 0, false);
        add(new THREE.BoxGeometry(len, 0.05, 0.05), metal, cx, y0 + 1.0, f.z + f.side * 0.75, 0, false);
        add(new THREE.BoxGeometry(len, 2.6, 0.25), concrete, cx, y0 + 1.3, f.z + f.side * 4.4);
        if (f.side < 0) {
          // Kuzey tribününe çatı.
          for (let x = f.x0; x <= f.x1; x += 15) add(new THREE.BoxGeometry(0.2, 4.6, 0.2), metal, x, y0 + 2.3, f.z - 4.3);
          const roof = add(new THREE.BoxGeometry(len + 1, 0.15, 4.6), std("#e9eef2", { metalness: 0.3, roughness: 0.4 }), cx, y0 + 4.7, f.z - 2.4);
          roof.rotation.x = -0.08;
        }
        break;
      }
      case "kale": {
        const y0 = world.groundY(f.x, f.z) + 0.1;
        if (f.football) {
          // Amerikan futbolu kale direği: tek ayaklı sarı "Y" (ayak, kavisli kol, 3 m'de yatay direk, 5,6 m arayla dikmeler).
          const yellow = std("#f2c230", { roughness: 0.5, metalness: 0.2 });
          add(new THREE.CylinderGeometry(0.11, 0.13, 3.05, 8), yellow, f.x - f.dir * 1.6, y0 + 1.52, f.z);
          add(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8).rotateZ(Math.PI / 2), yellow, f.x - f.dir * 0.8, y0 + 3.05, f.z);
          add(new THREE.CylinderGeometry(0.07, 0.07, 5.64, 8).rotateX(Math.PI / 2), yellow, f.x, y0 + 3.05, f.z);
          for (const dz of [-2.82, 2.82]) add(new THREE.CylinderGeometry(0.05, 0.05, 6.1, 8), yellow, f.x, y0 + 3.05 + 3.05, f.z + dz);
          break;
        }
        const post = std("#ffffff");
        for (const dz of [-3.66, 3.66]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.44, 8), post, f.x, y0 + 1.22, f.z + dz);
        add(new THREE.CylinderGeometry(0.06, 0.06, 7.32, 8).rotateX(Math.PI / 2), post, f.x, y0 + 2.44, f.z);
        const net = new THREE.MeshStandardMaterial({ color: "#f4f4f4", transparent: true, opacity: 0.35, roughness: 1, side: THREE.DoubleSide });
        add(new THREE.BoxGeometry(2, 2.44, 7.32), net, f.x - f.dir * 1, y0 + 1.22, f.z, 0, false);
        break;
      }
      case "projektor": {
        // Stadyum ışık direği: konik direk, bakım merdiveni, platform ve korkuluk; çerçevede 4×3
        // projektör sahanın ortasına eğik bakar. Gece yanar, uzaktan parlama görünür.
        const y0 = world.groundY(f.x, f.z);
        const H = 24, facing = Math.atan2(145 - f.x, -84 - f.z);
        add(new THREE.CylinderGeometry(0.28, 0.6, H, 12), floodPole, f.x, y0 + H / 2, f.z);
        add(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 12), stone, f.x, y0 + 0.3, f.z);
        const g = new THREE.Group();
        g.position.set(f.x, y0 + H, f.z);
        g.rotation.y = facing;
        group.add(g);
        const put = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; g.add(m); return m; };
        // Merdiven (direğin arkasında), platform ve korkuluk.
        for (const sx of [-0.22, 0.22]) put(new THREE.BoxGeometry(0.05, H - 1, 0.05), floodPole, sx, -(H - 1) / 2 - 0.5, -0.75, false);
        for (let y = 1; y < H - 1; y += 0.6) put(new THREE.BoxGeometry(0.44, 0.03, 0.03), floodPole, 0, -y, -0.75, false);
        put(new THREE.BoxGeometry(4.8, 0.12, 1.6), floodPole, 0, 0.1, 0.1);
        for (const [x, z, w, d] of [[0, 0.88, 4.8, 0.04], [0, -0.68, 4.8, 0.04], [-2.4, 0.1, 0.04, 1.6], [2.4, 0.1, 0.04, 1.6]]) {
          put(new THREE.BoxGeometry(w, 0.04, d), floodPole, x, 1.1, z, false);
          put(new THREE.BoxGeometry(w, 0.03, d), floodPole, x, 0.6, z, false);
        }
        for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) for (const z of [-0.68, 0.88]) put(new THREE.BoxGeometry(0.04, 1.0, 0.04), floodPole, x, 0.6, z, false);
        // Projektör çerçevesi: platformun üstünde, sahaya doğru öne eğik.
        const frame = new THREE.Group();
        frame.position.set(0, 2.9, 0.4);
        frame.rotation.x = 0.42;
        g.add(frame);
        for (const y of [-1.35, 1.35]) { const m = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.12), floodPole); m.position.y = y; frame.add(m); }
        for (const x of [-2.3, 2.3]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), floodPole); m.position.x = x; frame.add(m); }
        const sup = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), floodPole);
        sup.position.set(0, 1.4, 0.2); g.add(sup);
        for (let r = 0; r < 3; r++) {
          for (let k = 0; k < 4; k++) {
            const x = -1.65 + k * 1.1, y = -0.9 + r * 0.9;
            const house = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.5), floodHousing);
            house.position.set(x, y, -0.05);
            house.castShadow = true;
            frame.add(house);
            const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.56), floodLens);
            lens.position.set(x, y, 0.205);
            frame.add(lens);
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.04, 0.22), floodHousing);
            visor.position.set(x, y + 0.36, 0.3);
            frame.add(visor);
          }
        }
        // Parlama: gece projektörlerin önünde yumuşak bir ışık halkası.
        const glare = new THREE.Sprite(floodGlareMat);
        glare.scale.set(9, 7, 1);
        glare.position.set(0, 0, 0.6);
        frame.add(glare);
        break;
      }
      case "minare": {
        // Minare: kare taş kaide (pabuç), on iki köşeli gövde, mukarnaslı şerefe ve korkuluğu, üst gövde,
        // kurşun külah ve alem.
        const y0 = world.groundY(f.x, f.z);
        add(new THREE.BoxGeometry(2.6, 2.6, 2.6), stone, f.x, y0 + 1.3, f.z);
        add(new THREE.CylinderGeometry(1.25, 1.45, 0.8, 12), stone, f.x, y0 + 3.0, f.z);
        add(new THREE.CylinderGeometry(0.95, 1.12, 19.6, 12), white, f.x, y0 + 13.2, f.z);
        add(new THREE.CylinderGeometry(1.65, 1.0, 0.9, 12), stone, f.x, y0 + 23.4, f.z);
        add(new THREE.CylinderGeometry(1.7, 1.7, 0.15, 12), stone, f.x, y0 + 23.9, f.z);
        add(new THREE.TorusGeometry(1.62, 0.04, 6, 24).rotateX(Math.PI / 2), metal, f.x, y0 + 24.85, f.z, 0, false);
        for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), metal, f.x + Math.cos(a) * 1.62, y0 + 24.4, f.z + Math.sin(a) * 1.62, 0, false); }
        add(new THREE.CylinderGeometry(0.85, 0.95, 3.6, 12), white, f.x, y0 + 25.8, f.z);
        add(new THREE.CylinderGeometry(1.0, 1.0, 0.25, 12), stone, f.x, y0 + 27.7, f.z);
        add(new THREE.ConeGeometry(1.0, 5, 12), std("#7d8e9c", { metalness: 0.3, roughness: 0.5 }), f.x, y0 + 30.3, f.z);
        add(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), std("#c9a24a", { metalness: 0.7, roughness: 0.3 }), f.x, y0 + 33.4, f.z, 0, false);
        add(new THREE.SphereGeometry(0.16, 8, 6), std("#c9a24a", { metalness: 0.7, roughness: 0.3 }), f.x, y0 + 33.5, f.z, 0, false);
        break;
      }
      case "sadirvan": {
        const y0 = world.groundY(f.x, f.z);
        add(new THREE.CylinderGeometry(2.2, 2.4, 0.9, 8), stone, f.x, y0 + 0.45, f.z);
        add(new THREE.CylinderGeometry(2.0, 2.0, 0.08, 8), water, f.x, y0 + 0.85, f.z, 0, false);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), stone, f.x + Math.cos(a) * 2.6, y0 + 1.3, f.z + Math.sin(a) * 2.6, 0, false); }
        add(new THREE.ConeGeometry(3.4, 1.4, 8), std("#7d8e9c", { metalness: 0.3, roughness: 0.5 }), f.x, y0 + 3.3, f.z);
        break;
      }
      case "oyun": {
        // Her park farklı: aletler, yerleşim, renkler tohumdan.
        const y0 = world.groundY(f.x, f.z);
        const PAL = [["#d8433d", "#e8b93a", "#2f6fb5"], ["#3e8a86", "#f28c28", "#f4f1ea"], ["#8a62d1", "#7fae45", "#e05a6a"], ["#2f4a6d", "#e8b93a", "#d98ca0"], ["#6f7d4a", "#c8312f", "#8fb6d9"]];
        for (const it of playgroundItems(f)) {
          const [c1, c2, c3] = PAL[it.c].map((c) => std(c));
          const g = new THREE.Group();
          g.position.set(it.x, y0, it.z);
          g.rotation.y = it.rot;
          const put = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
          const post = (x, z, hgt, mat = metal) => put(new THREE.CylinderGeometry(0.06, 0.06, hgt, 8), mat, x, hgt / 2, z);
          switch (it.kind) {
            case "kule": {
              for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) post(x, z, 2.9, c1);
              put(new THREE.BoxGeometry(1.8, 0.1, 1.8), wood, 0, 1.4, 0);
              put(new THREE.ConeGeometry(1.45, 1.0, 4), c2, 0, 3.4, 0).rotation.y = Math.PI / 4;
              for (const z of [-0.85, 0.85]) put(new THREE.BoxGeometry(1.7, 0.5, 0.05), c3, 0, 1.75, z);
              const sl = put(new THREE.BoxGeometry(0.7, 0.08, 3.0), c2, 2.0, 0.75, 0, 0, -0.5);
              sl.rotation.set(0, Math.PI / 2, 0); sl.rotateX(0.5);
              for (let k = 0; k < 5; k++) put(new THREE.BoxGeometry(0.6, 0.05, 0.08), metal, -1.1, 0.25 + k * 0.28, 0);
              for (const z of [-0.3, 0.3]) put(new THREE.BoxGeometry(0.05, 1.5, 0.05), metal, -1.1, 0.75, z);
              break;
            }
            case "salincak": {
              const n = 2 + (it.c % 2);
              for (const x of [-it.w / 2 + 0.2, it.w / 2 - 0.2]) {
                put(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), c1, x, 1.25, -0.5, 0.35);
                put(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), c1, x, 1.25, 0.5, -0.35);
              }
              put(new THREE.CylinderGeometry(0.07, 0.07, it.w, 8), c1, 0, 2.45, 0, 0, Math.PI / 2);
              for (let k = 0; k < n; k++) {
                const x = -it.w / 2 + ((k + 1) * it.w) / (n + 1);
                for (const dx of [-0.2, 0.2]) put(new THREE.CylinderGeometry(0.012, 0.012, 1.95, 4), metal, x + dx, 1.45, 0);
                put(new THREE.BoxGeometry(0.5, 0.05, 0.22), c2, x, 0.48, 0);
              }
              break;
            }
            case "tahterevalli": {
              put(new THREE.BoxGeometry(0.3, 0.45, 0.4), c1, 0, 0.22, 0);
              const beam = put(new THREE.BoxGeometry(3.4, 0.08, 0.3), c2, 0, 0.5, 0, 0, 0.14);
              void beam;
              for (const x of [-1.5, 1.5]) put(new THREE.BoxGeometry(0.06, 0.3, 0.3), metal, x, 0.5 + x * 0.14 + 0.2, 0);
              break;
            }
            case "yayli": {
              for (let k = 0; k < 2; k++) {
                const x = -0.8 + k * 1.6;
                put(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), metal, x, 0.25, 0);
                put(new THREE.SphereGeometry(0.35, 10, 8).scale(1.3, 0.8, 0.7), k ? c2 : c3, x, 0.7, 0);
                put(new THREE.SphereGeometry(0.18, 8, 6), k ? c2 : c3, x + 0.45, 0.95, 0);
              }
              break;
            }
            case "kum": {
              for (const [x, z, w2, d2] of [[0, -1.6, 3.4, 0.2], [0, 1.6, 3.4, 0.2], [-1.6, 0, 0.2, 3.4], [1.6, 0, 0.2, 3.4]]) put(new THREE.BoxGeometry(w2, 0.3, d2), wood, x, 0.15, z);
              put(new THREE.BoxGeometry(3.0, 0.18, 3.0), std("#e9d5a6"), 0, 0.09, 0);
              put(new THREE.ConeGeometry(0.3, 0.25, 8), std("#e05a6a"), 0.6, 0.3, -0.4);
              put(new THREE.BoxGeometry(0.25, 0.2, 0.25), std("#2f6fb5"), -0.7, 0.28, 0.5);
              break;
            }
            case "kubbe": {
              const dome = put(new THREE.IcosahedronGeometry(1.7, 1), new THREE.MeshStandardMaterial({ color: PAL[it.c][0], wireframe: true }), 0, 0.2, 0);
              dome.scale.y = 0.9;
              break;
            }
            case "atlikarinca": {
              put(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 20), c1, 0, 0.35, 0);
              put(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 8), metal, 0, 0.9, 0);
              for (let k = 0; k < 4; k++) {
                const a = (k / 4) * Math.PI * 2;
                put(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), c2, Math.cos(a) * 0.7, 1.15, Math.sin(a) * 0.7, Math.sin(a) * 1.2, -Math.cos(a) * 1.2);
              }
              break;
            }
            case "tirmanma": {
              for (const x of [-2, 2]) for (const z of [-0.5, 0.5]) post(x, z, 2.1, c1);
              for (let k = 0; k < 9; k++) put(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), metal, -1.8 + k * 0.45, 2.05, 0, Math.PI / 2);
              for (const z of [-0.5, 0.5]) put(new THREE.CylinderGeometry(0.05, 0.05, 4.0, 8), c2, 0, 2.1, z, 0, Math.PI / 2);
              break;
            }
          }
          group.add(g);
        }
        break;
      }
      case "pota": {
        const y0 = world.groundY(f.x, f.z);
        const g = new THREE.Group();
        g.position.set(f.x, y0, f.z);
        g.rotation.y = f.rot ?? 0;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), metal); pole.position.set(0, 1.7, -0.4);
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.05), white); board.position.set(0, 3.35, -0.2);
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2), std("#e05a2a")); hoop.position.set(0, 3.05, 0.1);
        g.add(pole, board, hoop);
        g.traverse((o) => { o.castShadow = true; });
        group.add(g);
        break;
      }
      case "semsiye": {
        const y0 = f.town ? world.groundY(f.x, f.z) : Math.max(world.height(f.x, f.z), 0.3);
        add(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 5), white, f.x, y0 + 1.2, f.z, 0, false);
        add(new THREE.ConeGeometry(1.4, 0.5, 10), std(["#e05a4a", "#2f7fb5", "#f2c14e", "#3e8a86"][f.c % 4]), f.x, y0 + 2.4, f.z);
        break;
      }
    }
  }
  for (const batch of [benchSeat, benchBack, benchLegs, tables, tableLegs, chairs, chairBacks, chairLegs, chairBackLegs, bins, binPoles, containers]) group.add(batch.build());
  group.userData.fenerLamps = fenerLamps;
  // Pazar tezgâhlarındaki meyve-sebze yığınları (tek InstancedMesh).
  if (fruit.length) {
    const fm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), std(0xffffff, { roughness: 0.5 }), fruit.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    fruit.forEach(([x, y, z, c], i) => { fm.setMatrixAt(i, m4.makeTranslation(x, y, z)); fm.setColorAt(i, col.set(c)); });
    group.add(fm);
  }
  // Tribün koltukları: her oturma yerinde kova koltuk (oturak + sırtlık), bölüm bölüm renkli.
  {
    const seats = world.seats.filter((s) => s.place === "tribun");
    if (seats.length) {
      const geo = mergeGeometries([new THREE.BoxGeometry(0.44, 0.06, 0.4).translate(0, 0, 0), new THREE.BoxGeometry(0.44, 0.42, 0.05).translate(0, 0.22, -0.2)]);
      const mesh = new THREE.InstancedMesh(geo, std(0xffffff, { roughness: 0.6 }), seats.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
      seats.forEach((s, i) => {
        q.setFromAxisAngle(up, s.heading);
        mesh.setMatrixAt(i, m.compose(pv.set(s.x, s.top - 0.03, s.z), q, one));
        const sec = Math.floor((s.x - 100) / 15);
        mesh.setColorAt(i, col.set(["#d8433d", "#2f6fb5", "#f4f1ea", "#2f6fb5", "#d8433d", "#e8c22e"][sec % 6]));
      });
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
  /** stadium: saha projektörleri (akşam saatlerinde), fener: gece boyunca. */
  group.userData.setFlood = (stadium, fener = stadium) => {
    floodLens.emissiveIntensity = 3.2 * stadium;
    floodGlareMat.opacity = 0.75 * stadium;
    for (const f of fenerLamps) { f.lensMat.emissiveIntensity = 0.15 + 3.5 * fener; f.beamMat.uniforms.uOpacity.value = 0.35 * fener; f.beam.visible = fener > 0; }
    for (const m of glowSigns) m.emissiveIntensity = 0.9 * fener;
    for (const w of ferrisWheels) w.bulbMat.emissiveIntensity = 2.2 * fener;
  };
  group.userData.tick = (t) => {
    for (const f of fenerLamps) f.beam.rotation.y = t * 0.6;
    // Dönme dolap: bir tur ~4 dakika; kabinler hep dik durur.
    for (const w of ferrisWheels) {
      w.wheel.rotation.z = -t * 0.026;
      for (const c of w.cars) c.rotation.z = t * 0.026;
    }
    for (const fo of fountains) {
      fo.curtains.forEach((c, i) => { c.scale.set(1 + Math.sin(t * 3 + i) * 0.015, 1, 1 + Math.cos(t * 3 + i) * 0.015); c.material.opacity = 0.45 + 0.1 * Math.sin(t * 5); });
      fo.jet.scale.set(1, 0.9 + 0.12 * Math.sin(t * 4.3), 1);
      fo.arcs.forEach((a, i) => { a.scale.y = 0.94 + 0.06 * Math.sin(t * 3.7 + i); });
    }
  };
  // Statik birleştirme: tek tek eklenen, sonradan hareket etmeyen parçalar (şemsiyeler, oyun aletleri, potalar,
  // rıhtım duvarı...) malzemeye göre tek mesh'te toplanır; 20.000 nüfusta binlerce çizim çağrısı birkaç yüze iner.
  // Hareket edenler (çeşme, fener, dönme dolap) ayrı gruplarda ya da listede: dokunulmaz.
  const moving = new Set(fountains.flatMap((fo) => [...fo.curtains, fo.jet, ...fo.arcs]));
  const matKey = (m) => [m.type, m.color?.getHexString(), m.map?.uuid ?? "", m.roughness, m.metalness, m.transparent, m.opacity, m.side, m.emissive?.getHexString() ?? "", m.wireframe, m.flatShading].join("|");
  const byMat = new Map();
  group.updateMatrixWorld(true);
  const take = (o) => {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    const key = matKey(o.material);
    if (!byMat.has(key)) byMat.set(key, { mat: o.material, geos: [], shadow: false });
    const e = byMat.get(key);
    e.geos.push(g);
    e.shadow ||= o.castShadow;
  };
  for (const o of [...group.children]) {
    if (o.isInstancedMesh || o.isSprite || o.isPoints || o.isLine || moving.has(o) || o.userData.keep) continue;
    if (o.isMesh && !Array.isArray(o.material)) { take(o); group.remove(o); continue; }
    if (o.isGroup) {
      // Statik alt grup (oyun parkı, çardak, okul otobüsü...): içindeki düz mesh'ler de birleşir.
      let ok = true;
      o.traverse((c) => { if (c !== o && (c.isInstancedMesh || c.isSprite || c.isPoints || c.isLine || c.userData.keep || moving.has(c) || Array.isArray(c.material) || (c.isGroup && c.userData.keep))) ok = false; });
      if (!ok) continue;
      o.traverse((c) => { if (c.isMesh) take(c); });
      group.remove(o);
    }
  }
  for (const { mat, geos, shadow } of byMat.values()) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

/**
 * Sıradaki gelişim adımının binaları: yarı saydam taslak, turuncu kenar çizgileri ve çevresinde şantiye
 * çiti. Ada büyüdükçe yerini gerçek bina alır; ziyaretçi neyin geleceğini haritada görür.
 */
export function buildSites(world) {
  const group = new THREE.Group();
  group.name = "santiye"; // video kaydı yakın sabit kameralarda gizler (kaydet.mjs)
  const fill = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.2, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: "#e8892a", transparent: true, opacity: 0.85 });
  const posts = [], rails = [];
  for (const b of world.sites ?? []) {
    const h = (b.floors ?? 1) * FLOOR_H;
    const geo = new THREE.BoxGeometry(b.w, h, b.d).translate(0, h / 2, 0);
    for (const m of [new THREE.Mesh(geo, fill), new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge)]) {
      m.position.set(b.x, FLAT_Y, b.z);
      m.rotation.y = b.rot;
      m.renderOrder = 2;
      group.add(m);
    }
    // Çit: binanın 1,5 m dışında, 2,5 m arayla direkler ve üstlerinde bant.
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const hw = b.w / 2 + 1.5, hd = b.d / 2 + 1.5;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.5));
      for (let i = 0; i < n; i++) {
        const lx = ax + ((bx - ax) * i) / n, lz = az + ((bz - az) * i) / n;
        const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
        posts.push([x, world.groundY(x, z), z]);
      }
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      rails.push({ x: b.x + mx * c + mz * s, z: b.z - mx * s + mz * c, len: L, rot: b.rot + (k % 2 ? Math.PI / 2 : 0) });
    }
  }
  const mat = new THREE.MeshStandardMaterial({ color: "#e8892a", roughness: 0.7 });
  if (posts.length) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(0, 0.55, 0), mat, posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, y, z], i) => m.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    group.add(m);
    const r = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.18, 0.04), new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.6 }), rails.length);
    const q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    rails.forEach((o, i) => r.setMatrixAt(i, m4.compose(p.set(o.x, world.groundY(o.x, o.z) + 0.9, o.z), q.setFromAxisAngle(UP, o.rot), sc.set(o.len, 1, 1))));
    group.add(r);
  }
  return group;
}
