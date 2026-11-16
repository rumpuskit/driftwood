// Deniz canlıları (16 Kasım 2026): yunus sürüsü (Mercanada) ve balina (kambur balina + yavrusu; Driftwood). olay.js çağırır.
// Arayüz: buildDeniz({ world, scene }) → {
//   group,
//   yerSec(o) → { deniz: [x, z] (hayvanların oynadığı yerin ortası), kiyi: [x, z] (seyircilerin toplanacağı kara noktası,
//     su kenarından ~7 m içeride), bakis: [x, z] (kamera için kara/iskele noktası), yon (kiyi → deniz, radyan: atan2(dx, dz)),
//     ad ("plaj" | "sahil_yolu" | "iskele" | "fener" | "kiyi") } | null,
//   update(o, evre, minute, real, env),
//   odak(minute) → [x, y, z]: şu an en ilgi çekici hayvan (havadaki/sıçramak üzere olan yunus; balinada etkinlikteki),
//   merkez(minute) → [x, y, z]: sürünün (balinanın) ortası, yumuşak hareket (kamera hedefi için),
//   havada(minute) → havada olan yunus sayısı (balinada 0),
//   yer → son yerSec sonucu }
// odak/merkez/havada'da minute verilmezse son update dakikası kullanılır; odak/merkez aynı diziyi yeniden kullanır
// (ayırmasız): saklanacaksa kopyalanmalı. Denetimde (?denetle) API ayrıca __ada.scene.getObjectByName("deniz").userData.deniz.
// Hız: sıçrayışlar gerçek zamanlıdır (yunus ~1,5 sn, balina ~3,5 sn); hiz=4'te dörtte bire iner: deniz çekimleri hiz=1–2.
//
// Belirlenimcilik: her şey yalnız (minute, o.tohum, dünya) işlevidir: Math.random ve kare arası durum yok. Video kaydı
// herhangi bir dakikayı aynı çizer. Zaman t = (minute − o.bas)·60 benzetim saniyesi; yunus sıçramaları "vuruş"lara
// (B = 2,5 sn) bağlıdır: her vuruşun sahibi (b·adım mod N) bir eylem yapar (nefes, sıçrama, yüksek, burgu, eşli, kuyruk
// vurma, yan düşüş); sıçrayış ve köpük o vuruşun zamanından hesaplanır. Balina 46 sn'lik döngü izler (soluk, sırt, kuyruk
// gösterip dalış, sıçrama / yüzgeç vurma / kuyruk vurma, soluk); yavru aynı programı 23 sn kaymış izler.
// Olay yokken grup gizli, güncelleme hiç iş yapmaz; karede ayırma yok.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// --- yardımcılar ---
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
/** Sayısal karma (ayırmasız): tamsayılar → [0, 1). */
function hr(a, b, c = 0, d = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15) ^ b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13) ^ c, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 16) ^ d, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;

// --- geometri ---
const C = new THREE.Color();
/** Dönel gövde: prof [s (0 burun → 1 kuyruk), r, wx, wy, yo]; z = L·(0,5 − s) (burun +z). boya(renk, sinA, s, k). */
function govde(prof, L, na, boya, burunUcu = true, kuyrukUcu = true) {
  const pos = [], col = [], idx = [];
  for (const [s, r, wx, wy, yo] of prof) {
    for (let k = 0; k < na; k++) {
      const a = (k / na) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(r * wx * ca, r * wy * sa + yo, L * (0.5 - s));
      boya(C, sa, s, k); col.push(C.r, C.g, C.b);
    }
  }
  const n = prof.length;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < na; k++) {
    const A = i * na + k, Bk = i * na + ((k + 1) % na), Cc = A + na, D = Bk + na;
    idx.push(A, Cc, Bk, Bk, Cc, D);
  }
  const uc = (i, z, y, ters) => {
    const t = pos.length / 3; pos.push(0, y, z);
    boya(C, 0, prof[i][0], 0); col.push(C.r, C.g, C.b);
    for (let k = 0; k < na; k++) { const a = i * na + k, b = i * na + ((k + 1) % na); ters ? idx.push(t, b, a) : idx.push(t, a, b); }
  };
  if (burunUcu) uc(0, L * (0.5 - prof[0][0]) + prof[0][1] * 0.6, prof[0][4], false);
  if (kuyrukUcu) uc(n - 1, L * (0.5 - prof[n - 1][0]) - prof[n - 1][1] * 0.6, prof[n - 1][4], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const ni = g.toNonIndexed(); ni.computeVertexNormals();
  return ni;
}
/** Düz yüzgeç: noktalar XY'de, kalınlık z; renk(renk, normal, konum). */
function levha(noktalar, kalin, renk) {
  const sh = new THREE.Shape(noktalar.map(([x, y]) => new THREE.Vector2(x, y)));
  let g = new THREE.ExtrudeGeometry(sh, { depth: kalin, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -kalin / 2);
  g.deleteAttribute("uv");
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  g.userData.renk = renk;
  return g;
}
/** Renk özniteliğini normal/konuma göre doldurur (dönüşümlerden sonra çağrılır). */
function boyaLevha(g) {
  const p = g.attributes.position, nr = g.attributes.normal, col = new Float32Array(p.count * 3);
  const n = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(nr, i); v.fromBufferAttribute(p, i);
    g.userData.renk(C, n, v); col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function kure(r, x, y, z, hex, d = 0) {
  const g = new THREE.IcosahedronGeometry(r, d).translate(x, y, z); g.deleteAttribute("uv");
  const c = new THREE.Color(hex), col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

// Yunus (2,4 m; şişe burunlu): gri-mavi sırt, açık karın. Kuyruk ayrı parça (pivot s = 0,78).
const YL = 2.4, YS = 0.78, YZP = YL * (0.5 - YS);
const Y_SIRT = new THREE.Color("#52687a"), Y_YAN = new THREE.Color("#8195a5"), Y_KARIN = new THREE.Color("#e3e8ea");
function yunusBoya(c, sa) {
  if (sa > 0.1) c.copy(Y_YAN).lerp(Y_SIRT, ss(0.1, 0.6, sa));
  else c.copy(Y_KARIN).lerp(Y_YAN, ss(-0.55, 0.1, sa));
}
function yunusGovde() {
  const prof = [
    [0.0, 0.028, 1, 0.8, -0.05], [0.045, 0.045, 1, 0.8, -0.05], [0.085, 0.06, 1, 0.85, -0.045], [0.11, 0.125, 1, 1.0, -0.01],
    [0.16, 0.18, 1, 1.05, 0.0], [0.24, 0.225, 1, 1.08, 0.0], [0.34, 0.25, 0.95, 1.1, 0.0], [0.46, 0.245, 0.92, 1.1, 0.0],
    [0.58, 0.2, 0.85, 1.12, 0.0], [0.68, 0.14, 0.75, 1.2, 0.01], [0.79, 0.085, 0.6, 1.3, 0.02],
  ];
  const g = govde(prof, YL, 9, yunusBoya);
  const koyu = (c) => c.copy(Y_SIRT);
  const sirt = levha([[-0.14, 0], [0.04, 0.17], [0.13, 0.32], [0.17, 0.31], [0.13, 0.18], [0.24, 0]], 0.05, koyu);
  sirt.rotateY(Math.PI / 2).translate(0, 0.25, YL * (0.5 - 0.44) + 0.1);
  const yuzgec = (sg) => {
    const f = levha([[0, 0.05], [0.1 * sg, 0.01], [0.19 * sg, -0.08], [0.23 * sg, -0.15], [0.16 * sg, -0.13], [0, -0.07]], 0.02, (c, n) => c.copy(n.y < -0.3 ? Y_KARIN : Y_YAN));
    f.rotateX(Math.PI / 2).rotateZ(-0.75 * sg).translate(0.14 * sg, -0.14, YL * (0.5 - 0.27));
    return f;
  };
  const parca = [g, boyaLevha(sirt), boyaLevha(yuzgec(1)), boyaLevha(yuzgec(-1)),
    kure(0.02, 0.112, 0.012, YL * (0.5 - 0.118), "#1d2328"), kure(0.02, -0.112, 0.012, YL * (0.5 - 0.118), "#1d2328")];
  return mergeGeometries(parca);
}
function yunusKuyruk() {
  const prof = [[0.75, 0.1, 0.62, 1.28, 0.02], [0.86, 0.06, 0.55, 1.3, 0.02], [0.93, 0.04, 0.5, 1.2, 0.01], [0.985, 0.022, 0.6, 0.9, 0]];
  const g = govde(prof, YL, 8, yunusBoya, true, true);
  const p = [[0, 0.04], [0.14, -0.03], [0.31, -0.13], [0.27, -0.17], [0.1, -0.13], [0, -0.1], [-0.1, -0.13], [-0.27, -0.17], [-0.31, -0.13], [-0.14, -0.03]];
  const k = levha(p, 0.03, (c, n) => c.copy(n.y < -0.3 ? Y_YAN : Y_SIRT));
  k.rotateX(Math.PI / 2).translate(0, 0.0, YL * (0.5 - 0.95));
  return mergeGeometries([g, boyaLevha(k)]).translate(0, 0, -YZP);
}

// Kambur balina (13 m): koyu sırt, çizgili beyaz boğaz, uzun beyaz göğüs yüzgeçleri, alt yüzü desenli kuyruk.
const BL = 13, BS = 0.75, BZP = BL * (0.5 - BS);
const B_SIRT = new THREE.Color("#2b3138"), B_YAN = new THREE.Color("#454d56"), B_KARIN = new THREE.Color("#e2e4e1"), B_OLUK = new THREE.Color("#8d949a");
function balinaBoya(c, sa, s, k) {
  if (sa > -0.25) c.copy(B_YAN).lerp(B_SIRT, ss(-0.2, 0.5, sa));
  else {
    c.copy(B_YAN).lerp(B_KARIN, ss(-0.3, -0.7, sa) * (s < 0.62 ? 1 : 0.35));
    if (s > 0.04 && s < 0.5 && sa < -0.4 && k % 2) c.lerp(B_OLUK, 0.65); // boğaz olukları
  }
}
function balinaGovde() {
  const prof = [
    [0.0, 0.3, 1.0, 0.45, -0.25], [0.04, 0.55, 1.0, 0.5, -0.25], [0.1, 0.85, 1.0, 0.62, -0.2], [0.18, 1.15, 1.0, 0.78, -0.15],
    [0.28, 1.45, 1.0, 0.88, -0.1], [0.4, 1.6, 0.98, 0.92, -0.05], [0.52, 1.5, 0.95, 0.95, 0.0], [0.62, 1.15, 0.85, 1.0, 0.05],
    [0.7, 0.8, 0.72, 1.1, 0.08], [0.76, 0.58, 0.62, 1.2, 0.1],
  ];
  const parca = [govde(prof, BL, 12, balinaBoya)];
  // Kafadaki yumrular (tüberküller): üst çene boyunca iki sıra.
  for (let i = 0; i < 6; i++) {
    const s = 0.015 + i * 0.022, r = mix(0.3, 0.95, s / 0.13) * 0.55;
    for (const sg of [-1, 1]) parca.push(kure(0.12, sg * r * 0.55, mix(-0.12, 0.25, s / 0.13) + 0.05, BL * (0.5 - s), "#22272d"));
  }
  const sirt = levha([[-0.6, 0], [0.0, 0.32], [0.3, 0.52], [0.42, 0.42], [0.7, 0]], 0.28, (c) => c.copy(B_SIRT));
  sirt.rotateY(Math.PI / 2).translate(0, 1.12, BL * (0.5 - 0.64));
  parca.push(boyaLevha(sirt));
  return mergeGeometries(parca);
}
function balinaKuyruk() {
  const prof = [[0.72, 0.68, 0.64, 1.18, 0.09], [0.82, 0.4, 0.55, 1.2, 0.08], [0.9, 0.27, 0.55, 1.1, 0.05], [0.97, 0.17, 0.6, 0.9, 0.02]];
  const g = govde(prof, BL, 10, balinaBoya);
  const yari = [[0, 0.35], [0.6, 0.2], [1.4, -0.05], [2.0, -0.35], [2.25, -0.62], [2.05, -0.82], [1.72, -0.72], [1.42, -0.84], [1.1, -0.76], [0.8, -0.86], [0.5, -0.78], [0.22, -0.9], [0, -0.74]];
  const p = [...yari, ...yari.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  const k = levha(p, 0.22, (c, n, v) => {
    // Üst yüz koyu; alt yüz beyaz, arka kenarı ve ortası siyah (her balinanın deseni ayrı: burada tek desen).
    if (n.y > -0.4) return c.copy(B_SIRT);
    const arka = v.z < BL * (0.5 - 0.94) - 0.64, orta = Math.abs(v.x) < 0.35;
    c.copy(arka || orta ? B_SIRT : B_KARIN);
  });
  k.rotateX(Math.PI / 2).translate(0, 0, BL * (0.5 - 0.94));
  return mergeGeometries([g, boyaLevha(k)]).translate(0, 0, -BZP);
}
function balinaYuzgec(sg) {
  const p = [[0, 0.45], [0.8, 0.42], [1.2, 0.52], [1.8, 0.36], [2.2, 0.44], [2.8, 0.22], [3.2, 0.3], [3.8, 0.06], [4.2, -0.06], [3.8, -0.2], [2.8, -0.3], [1.6, -0.42], [0.6, -0.46], [0, -0.4]];
  const g = levha(p.map(([x, y]) => [x * sg, y]), 0.15, (c, n, v) => c.copy(B_KARIN).lerp(B_YAN, n.y > 0.3 ? 0.55 * (1 - ss(0.4, 2.6, Math.abs(v.x))) : 0));
  g.rotateX(Math.PI / 2);
  return boyaLevha(g);
}

/** Su altındaki kısım derinlikle suyun rengine karışır (saydam su yüzeyinin altında "havada" gibi durmasın). */
const SU_ALTI = { value: new THREE.Color("#1f6f9a") };
function suAlti(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSuAlti = SU_ALTI;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vDenizY;")
      .replace("#include <project_vertex>", `#include <project_vertex>
      vec4 dwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        dwp = instanceMatrix * dwp;
      #endif
      vDenizY = (modelMatrix * dwp).y;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vDenizY;\nuniform vec3 uSuAlti;")
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uSuAlti, clamp(-vDenizY * 0.26, 0.0, 0.62) * step(vDenizY, 0.0));`);
  };
  return m;
}

// --- köpük, damla, buhar (örnekli; örnek başına saydamlık örnek renginin kırmızısında) ---
function kopukMalzeme() {
  // Geometrinin köşe rengi (kırmızı) yumuşak kenar saydamlığı, örnek rengi örnek başına saydamlık: ikisi çarpılır.
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "diffuseColor.a *= vColor.r;"); };
  return m;
}
function tacGeo() {
  // Sıçrama tacı: üstü dişli, açık koni (yükseklik 1, taban yarıçapı 1); dişlere doğru saydamlaşır.
  const n = 18, pos = [], col = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU, ca = Math.cos(a), sa = Math.sin(a), h = k % 2 ? 0.55 : 1, r = k % 2 ? 1.15 : 1.35;
    pos.push(ca, 0, sa, ca * (1 + (r - 1) * 0.5), h * 0.5, sa * (1 + (r - 1) * 0.5), ca * r, h, sa * r);
    col.push(0.9, 0.9, 0.9, 0.75, 0.75, 0.75, 0, 0, 0);
  }
  for (let k = 0; k < n; k++) for (let l = 0; l < 2; l++) { const a = k * 3 + l, b = a + 3; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  return yumusak(pos, col, idx);
}
function yumusak(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
/** Yatay halka/leke: yarıçap oranları ve o yarıçaptaki saydamlık (kenarları yumuşak). */
function yatayGeo(rr, aa, n = 28) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i < rr.length; i++) for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU; pos.push(Math.cos(a) * rr[i], 0, Math.sin(a) * rr[i]); col.push(aa[i], aa[i], aa[i]);
  }
  for (let i = 0; i < rr.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * n + k, b = i * n + ((k + 1) % n); idx.push(a, a + n, b, b, a + n, b + n);
  }
  return yumusak(pos, col, idx);
}
function bulutGeo() {
  const g = new THREE.IcosahedronGeometry(1, 1); g.deleteAttribute("uv"); g.deleteAttribute("normal");
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = 0.55 + 0.45 * Math.max(0, p.getY(i)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildDeniz({ world, scene }) {
  const group = new THREE.Group();
  group.name = "deniz";
  group.visible = false;

  // Yunuslar: gövde + kuyruk, örnekli (2 çizim).
  const YN = 10;
  const yMat = suAlti(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.38, metalness: 0.06 }));
  const ornek = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
    return m;
  };
  const yGovde = ornek(yunusGovde(), yMat, YN), yKuyruk = ornek(yunusKuyruk(), yMat, YN);
  yGovde.castShadow = yKuyruk.castShadow = true;
  group.add(yGovde, yKuyruk);

  // Balinalar: anne (1) ve yavru (0,42).
  const bMat = suAlti(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.04 }));
  const bGeo = { govde: balinaGovde(), kuyruk: balinaKuyruk(), yR: balinaYuzgec(1), yL: balinaYuzgec(-1) };
  const balina = (olcek) => {
    const kok = new THREE.Group(); kok.rotation.order = "YXZ"; kok.scale.setScalar(olcek);
    const g = new THREE.Mesh(bGeo.govde, bMat), kuyruk = new THREE.Group(), km = new THREE.Mesh(bGeo.kuyruk, bMat);
    kuyruk.position.z = BZP; kuyruk.add(km);
    const yR = new THREE.Group(), yL = new THREE.Group();
    yR.rotation.order = yL.rotation.order = "YXZ";
    yR.position.set(1.15, -0.62, BL * (0.5 - 0.3)); yL.position.set(-1.15, -0.62, BL * (0.5 - 0.3));
    yR.add(new THREE.Mesh(bGeo.yR, bMat)); yL.add(new THREE.Mesh(bGeo.yL, bMat));
    kok.add(g, kuyruk, yR, yL);
    kok.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    kok.visible = false;
    group.add(kok);
    return { kok, kuyruk, yR, yL, olcek };
  };
  const balinalar = [balina(1), balina(0.42)];

  // Köpük havuzları.
  const kMat = kopukMalzeme();
  const dMat = new THREE.MeshBasicMaterial({ color: 0xf2f9fc });
  const havuz = (geo, mat, n) => {
    const m = ornek(geo, mat, n); m.renderOrder = 3;
    for (let i = 0; i < n; i++) m.setColorAt(i, C.setRGB(1, 1, 1));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    return m;
  };
  const damla = havuz(new THREE.IcosahedronGeometry(1, 0), dMat, 560);
  const tac = havuz(tacGeo(), kMat, 48);
  const halka = havuz(yatayGeo([0.72, 0.84, 0.92, 1], [0, 1, 0.8, 0], 32), kMat, 64);
  const leke = havuz(yatayGeo([0, 0.45, 0.8, 1], [1, 0.8, 0.35, 0], 20), kMat, 200);
  const bulut = havuz(bulutGeo(), kMat, 80);
  const P = { damla: 0, tac: 0, halka: 0, leke: 0, bulut: 0 };

  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ");
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  const koy = (mesh, sayac, x, y, z, sx, sy, sz, alfa, ry = 0) => {
    const i = P[sayac]; if (i >= mesh.instanceMatrix.count) return;
    _q.setFromAxisAngle(_Y, ry); _p.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
    if (alfa !== null) mesh.setColorAt(i, C.setRGB(alfa, alfa, alfa));
    P[sayac] = i + 1;
  };
  const _Y = new THREE.Vector3(0, 1, 0);

  /** Sıçrama köpüğü: (x, z) su yüzünde, str gücü, age saniye önce, olc boyut (yunus 1, balina 2,2). */
  function sicrama(x, z, str, age, tohum, olc) {
    const omur = 2.4 + 0.3 * str;
    if (age < 0 || age > omur) return;
    const k = Math.sqrt(str), n = Math.min(80, Math.round(10 + 20 * str));
    for (let i = 0; i < n; i++) {
      const r1 = hr(tohum, i, 1), r2 = hr(tohum, i, 2), r3 = hr(tohum, i, 3), r4 = hr(tohum, i, 4);
      const tk = age - 0.08 * r4;
      if (tk < 0) continue;
      const vy = (2 + 4.2 * r2) * k * (0.75 + 0.25 * olc);
      const y = vy * tk - 4.9 * tk * tk;
      if (y < 0) continue;
      const a = r1 * TAU, d = (0.5 + 1.6 * r3) * k * olc * 0.8 * tk + 0.15 * olc;
      const sz = (0.035 + 0.075 * r4 * r4) * (0.7 + 0.5 * k) * olc * (1 - 0.4 * Math.min(1, tk));
      koy(damla, "damla", x + Math.cos(a) * d, y, z + Math.sin(a) * d, sz, sz * 1.3, sz, null);
    }
    const tl = 0.9 + 0.4 * olc;
    if (age < tl) {
      const u = age / tl, h = 1.1 * k * olc * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.6) + 0.01;
      const r = (0.3 + 1.1 * Math.sqrt(age)) * k * olc * 0.8;
      koy(tac, "tac", x, 0, z, r, h, r, 0.55 * (1 - u) * (1 - u * 0.5), r1Ang(tohum));
      // İkinci, daha geniş ve alçak taç (sıçrayan su perdesi).
      koy(tac, "tac", x, 0, z, r * 1.45, h * 0.45, r * 1.45, 0.35 * (1 - u), r1Ang(tohum) + 0.3);
    }
    const u = age / omur;
    const r = (0.5 + 2.2 * Math.sqrt(age)) * k * olc;
    koy(halka, "halka", x, 0.05, z, r, 1, r, 0.65 * Math.pow(1 - u, 1.4));
    const rl = (0.45 + 0.6 * Math.sqrt(age)) * k * olc;
    koy(leke, "leke", x, 0.04, z, rl, 1, rl, 0.85 * Math.pow(1 - u, 2));
  }
  const r1Ang = (t) => hr(t, 99) * TAU;

  /** Balina soluğu: (x, z) soluk deliği, age saniye, sc boyut. */
  function ufle(x, z, age, sc, tohum) {
    if (age < 0 || age > 3.8) return;
    const H = 5.6 * sc, n = 16, ks = Math.sqrt(sc);
    for (let i = 0; i < n; i++) {
      const a = age - 0.035 * i;
      if (a < 0) continue;
      const f = Math.pow((i + 1) / n, 0.8), r1 = hr(tohum, i, 7), r2 = hr(tohum, i, 8);
      const y = 0.4 * sc + H * f * (1 - Math.exp(-3.2 * a));
      const yay = (0.05 + 0.4 * f + 0.45 * a) * ks * (r2 * 2 - 1), ang = r1 * TAU;
      const sz = (0.16 + 0.4 * f + 0.55 * a) * Math.pow(sc, 0.6);
      const al = 0.5 * Math.pow(Math.max(0, 1 - a / 3.8), 1.4) * Math.min(1, a * 6);
      koy(bulut, "bulut", x + Math.cos(ang) * yay + 0.55 * a, y, z + Math.sin(ang) * yay + 0.18 * a, sz, sz * (1.7 - 0.6 * Math.min(1, a)), sz, al);
    }
  }

  // --- yer seçimi ---
  const S = { tohum: null, tur: null, bas: 0, son: 0, yer: null, dk: 0 };
  function derinYon(x, z) {
    // En yakın derin suya (−2 m) yön: 32 yönde tarar, en yakın birkaç yönün ortalaması.
    let best = Infinity; const d = new Float64Array(32);
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * TAU, dx = Math.sin(a), dz = Math.cos(a);
      d[k] = Infinity;
      for (let s = 2; s < 200; s += 2) if (world.height(x + dx * s, z + dz * s) < -2) { d[k] = s; break; }
      best = Math.min(best, d[k]);
    }
    if (!isFinite(best)) return null;
    let sx = 0, sz = 0;
    for (let k = 0; k < 32; k++) if (d[k] < best + 8) { const a = (k / 32) * TAU; sx += Math.sin(a); sz += Math.cos(a); }
    const l = Math.hypot(sx, sz) || 1;
    return [sx / l, sz / l];
  }
  const vapur = () => world.features?.find((f) => f.type === "vapur");
  function vapurUzak(x, z) {
    const f = vapur();
    if (!f) return Infinity;
    // Vapur yolu (harbor.js setMinute): yanaştığı yerden 26 m doğuya, 160 m açığa.
    const ax = f.x, az = f.z - 30, bx = f.x + 26, bz = f.z + 170, ex = bx - ax, ez = bz - az;
    const q = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    return Math.hypot(ax + ex * q - x, az + ez * q - z);
  }
  function iskeleUzak(x, z) {
    let d = Infinity;
    for (const p of world.piers ?? []) d = Math.min(d, Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1)));
    return d;
  }
  function alanUygun(Dx, Dz, e1x, e1z, a, b, pay) {
    for (let i = -3; i <= 3; i++) for (let j = -1; j <= 1; j++) {
      const lx = (i / 3) * (a + pay), ly = j * (b + pay);
      const x = Dx + e1x * lx - e1z * ly, z = Dz + e1z * lx + e1x * ly;
      if (world.height(x, z) > -1.5) return false;
      if (iskeleUzak(x, z) < 8) return false;
      if (vapurUzak(x, z) < 40) return false;
    }
    return true;
  }
  function yerSec(o) {
    if (!o) return null;
    if (S.tohum === o.tohum && S.tur === o.tur && S.bas === o.bas && S.son === o.son) return S.yer;
    S.tohum = o.tohum; S.tur = o.tur; S.bas = o.bas; S.son = o.son; S.yer = null;
    const balinaMi = o.tur === "balina";
    const pl = world.places ?? {};
    const adaylar = [];
    const ekle = (ad, noktalar, w) => { if (noktalar?.length) adaylar.push({ ad, noktalar, w }); };
    ekle("plaj", pl.plaj?.anchors, 3);
    ekle("sahil_yolu", pl.sahil_yolu?.anchors, 3);
    if (pl.iskele?.anchors?.length) {
      // Balık iskelesi: seyirciler iskelenin kara başında (iskele dar), kamera iskelenin ucunda.
      const a = pl.iskele.anchors[0];
      ekle("iskele", [world.nearestWalkable(a[0], a[1] - 24, 8)], 1.5);
    }
    // Driftwood (16 Kasım): ada büyük, fener kasabadan uzak; plaj/sahil yolu henüz yokken balina kasabanın kıyısında
    // görünsün (seyirciler oradan yürüyebilir, kamera kasabayı da alır).
    const mey = pl.meydan?.anchors?.[0];
    if (mey) {
      const kasaba = [];
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; kasaba.push(world.coastPoint(mey[0], mey[1], Math.sin(a), Math.cos(a), 9)); }
      const yakin = kasaba.filter(Boolean).sort((p1, p2) => Math.hypot(p1[0] - mey[0], p1[1] - mey[1]) - Math.hypot(p2[0] - mey[0], p2[1] - mey[1])).slice(0, 5);
      ekle("kasaba", yakin, 8);
    }
    if (world.fener) ekle("fener", pl.fener?.anchors?.length ? pl.fener.anchors : [[world.fener.x, world.fener.z]], 0.4);
    // Yedek: adanın her yanından kıyı noktaları.
    const bb = world.bounds, yed = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
      const p = world.coastPoint(cx, cz, Math.sin(a), Math.cos(a), 9);
      yed.push(p);
    }
    ekle("kiyi", yed, 0.01);
    // Ağırlıklı, tohuma bağlı sıra.
    const sira = adaylar.map((c, i) => [Math.pow(hr(o.tohum, 31, i), 1 / c.w), c]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
    const A = balinaMi ? [40, 32, 26] : [28, 22, 17], Bm = balinaMi ? 16 : 12, pay = balinaMi ? 16 : 9;
    const uz = balinaMi ? [78, 92, 66, 104] : [50, 60, 42, 72, 86, 100];
    for (const c of sira) {
      const n = c.noktalar.length, bas = Math.floor(hr(o.tohum, 32, n) * n);
      // Önce ortadaki noktalar (plaj/sahilin ortası), tohumla kaydırılmış.
      for (let ii = 0; ii < n; ii++) {
        const i = mod(bas + (ii % 2 ? -1 : 1) * Math.ceil(ii / 2), n);
        const [x0, z0] = c.noktalar[i];
        const y = derinYon(x0, z0);
        if (!y) continue;
        const [e2x, e2z] = y;
        const W = world.coastPoint(x0, z0, e2x, e2z, 0);
        let [kx, kz] = world.nearestWalkable(W[0] - e2x * 7, W[1] - e2z * 7, 6);
        if (!world.isWalkable(kx, kz) || !world.isLand(kx, kz)) continue;
        // Seyirci yayı için kara: yanlarda ve geride yürünebilir yer.
        let ok = 0;
        for (const [la, ge] of [[-9, -2], [9, -2], [0, -6], [-6, -7], [6, -7]]) if (world.isWalkable(kx + e2z * la + e2x * ge, kz - e2x * la + e2z * ge)) ok++;
        if (ok < 3) continue;
        let bulundu = null;
        for (const d of uz) {
          const Dx = W[0] + e2x * d, Dz = W[1] + e2z * d;
          if (world.height(Dx, Dz) >= -2) continue;
          for (const a of A) if (alanUygun(Dx, Dz, e2z, -e2x, a, Bm, pay)) { bulundu = { Dx, Dz, a }; break; }
          if (bulundu) break;
        }
        if (!bulundu) continue;
        const { Dx, Dz, a } = bulundu;
        // Kamera: kıyının yanında, ya da hayvanlara daha yakın bir iskele ucu.
        let bakis = null;
        const dKiyi = Math.hypot(Dx - kx, Dz - kz);
        for (const p of world.piers ?? []) {
          const uc = world.height((p.x0 + p.x1) / 2, p.z0) < world.height((p.x0 + p.x1) / 2, p.z1) ? [(p.x0 + p.x1) / 2, p.z0 + 2] : [(p.x0 + p.x1) / 2, p.z1 - 2];
          const dd = Math.hypot(uc[0] - Dx, uc[1] - Dz);
          if (dd < dKiyi + 10 && dd < 110 && dd > 25 && (!bakis || dd < bakis[2])) bakis = [uc[0], uc[1], dd];
        }
        if (bakis) bakis.length = 2;
        else {
          const sg = hr(o.tohum, 33) < 0.5 ? -1 : 1;
          const bx = kx + e2z * 14 * sg, bz = kz - e2x * 14 * sg;
          const by = derinYon(bx, bz) ?? [e2x, e2z];
          const Wb = world.coastPoint(bx - by[0] * 20, bz - by[1] * 20, by[0], by[1], 3);
          bakis = world.nearestWalkable(Wb[0], Wb[1], 8);
          if (!world.isWalkable(bakis[0], bakis[1])) bakis = [kx, kz];
        }
        S.yer = { deniz: [Dx, Dz], kiyi: [kx, kz], bakis, yon: Math.atan2(e2x, e2z), ad: c.ad };
        hazirla(o, Dx, Dz, e2x, e2z, a, Bm);
        return S.yer;
      }
    }
    return null;
  }

  // --- hareket planı (yerSec'ten) ---
  const H = {
    tohum: 0, tur: "", T: 1, t1: 0, t2: 0, Dx: 0, Dz: 0, e1x: 1, e1z: 0, e2x: 0, e2z: 1, a: 20, b: 10, w: 0.1, fi: 0, fi2: 0,
    f1x: 0, f1z: 0, f2x: 0, f2z: 0, N: 8, adim: 3, lat: new Float64Array(YN), lon: new Float64Array(YN), ph: new Float64Array(YN),
    per: new Float64Array(YN),
  };
  function hazirla(o, Dx, Dz, e2x, e2z, a, b) {
    const t = o.tohum | 0, bal = o.tur === "balina";
    Object.assign(H, { tohum: t, tur: o.tur, T: (o.son - o.bas) * 60, Dx, Dz, e2x, e2z, e1x: e2z, e1z: -e2x, a, b });
    H.t1 = H.T * 0.15; H.t2 = H.T * 0.85;
    const yol = bal ? 4 * Math.hypot(a, b) * 1.05 : 4 * Math.hypot(a, b) * 1.05, hiz = bal ? 1.8 : 3.3;
    H.w = (TAU / (yol / hiz)) * (hr(t, 2) < 0.5 ? 1 : -1);
    H.fi = hr(t, 3) * TAU; H.fi2 = hr(t, 4) * TAU;
    // Geliş ve gidiş: açıktan (yan kaymalı) gelir, başka yana uzaklaşır.
    const sg = hr(t, 5) < 0.5 ? -1 : 1;
    const uzak = (d, yan) => {
      for (let k = 0; k < 6; k++) {
        const x = Dx + e2x * d + H.e1x * yan, z = Dz + e2z * d + H.e1z * yan;
        if (world.height(x, z) < -2 && world.height((x + Dx) / 2, (z + Dz) / 2) < -1) return [x, z];
        yan *= -0.6; d *= 1.15;
      }
      return [Dx + e2x * d, Dz + e2z * d];
    };
    [H.f1x, H.f1z] = uzak(bal ? 260 : 230, sg * 70);
    [H.f2x, H.f2z] = uzak(bal ? 300 : 260, -sg * 90);
    // Yunus sürüsü: 7–9 yunus, sıralar halinde (j ile j+1 çoğunlukla yan yana: eşli sıçrama).
    H.N = 7 + Math.floor(hr(t, 6) * 3);
    H.adim = H.N === 9 ? 2 : 3;
    for (let j = 0; j < YN; j++) {
      H.lat[j] = ((j % 3) - 1) * 2.3 + (hr(t, 7, j) - 0.5) * 1.0;
      H.lon[j] = 3 - Math.floor(j / 3) * 3.1 + (hr(t, 8, j) - 0.5) * 1.2;
      H.ph[j] = hr(t, 9, j) * TAU;
      H.per[j] = 5 + 3 * hr(t, 10, j);
    }
    VB.fill(NaN);
  }

  /** Sürünün (balinanın) yolu: sekiz çizen döngü + geliş/gidiş. */
  function merkezYol(t, out) {
    const al = ss(0, H.t1 * 0.9, t), be = ss(H.t2, H.T, t);
    const u = H.w * t + H.fi;
    const ps = 0.35 * Math.sin(t / 170 + H.fi2), cp = Math.cos(ps), sp = Math.sin(ps);
    const lx = H.a * Math.sin(u), ly = H.b * Math.sin(2 * u), k = (0.35 + 0.65 * al) * (1 - 0.7 * be);
    const rx = (lx * cp - ly * sp) * k, ry = (lx * sp + ly * cp) * k;
    out.x = H.Dx + H.e1x * rx + H.e2x * ry + (H.f1x - H.Dx) * (1 - al) + (H.f2x - H.Dx) * be;
    out.z = H.Dz + H.e1z * rx + H.e2z * ry + (H.f1z - H.Dz) * (1 - al) + (H.f2z - H.Dz) * be;
  }

  // --- yunus eylemleri ---
  const B = 2.5, G = 9, Y0 = -1.1;
  const OYUN_ESIK = [0.1, 0.42, 0.55, 0.67, 0.85, 0.92, 1]; // oyun evresinde tip olasılıkları (birikimli)
  // Vuruş önbelleği (8 yuva): tip 0 yok, 1 nefes, 2 sıçrama, 3 yüksek, 4 burgu, 5 eşli, 6 kuyruk vurma, 7 yan düşüş.
  const VB = new Float64Array(8).fill(NaN), VT = new Int8Array(8), VS = new Int8Array(8), VO1 = new Int8Array(8), VO2 = new Int8Array(8);
  const VH = new Float64Array(8), VOF = new Float64Array(8), VYON = new Int8Array(8), VTUR = new Int8Array(8), VSURE = new Float64Array(8);
  function vurus(b) {
    const i = b & 7;
    if (VB[i] === b) return i;
    VB[i] = b;
    const tb = b * B, u = tb / H.T, t = H.tohum;
    const r = hr(t, b, 1), r2 = hr(t, b, 2), r3 = hr(t, b, 3);
    let tip = 0;
    if (tb < 22 || tb > H.T - 48) tip = 0;
    else if (u < 0.15) tip = r < 0.42 ? 1 : r < 0.74 ? 2 : r < 0.8 ? 3 : 0;
    else if (u < 0.85) {
      tip = 1;
      while (tip < 7 && r >= OYUN_ESIK[tip - 1]) tip++;
    } else {
      const f = 1 - (u - 0.85) / 0.15;
      tip = r < 0.4 ? 1 : r < 0.4 + 0.33 * f ? 2 : r < 0.4 + 0.4 * f ? 5 : 0;
    }
    VT[i] = tip;
    VS[i] = mod(b * H.adim, H.N);
    VO1[i] = tip === 5 ? mod(VS[i] + 1, H.N) : -1;
    VO2[i] = tip === 5 && r2 < 0.5 ? mod(VS[i] - 1, H.N) : -1;
    VH[i] = tip === 2 ? 1.3 + 0.9 * r2 : tip === 3 ? 2.6 + 0.8 * r2 : tip === 4 ? 2.0 + 0.6 * r2 : tip === 5 ? 1.7 + 0.6 * r2 : tip === 7 ? 1.5 + 0.4 * r2 : 0;
    VOF[i] = 0.5 * B * r3;
    VYON[i] = r2 > 0.5 ? 1 : -1;
    VTUR[i] = r3 < 0.3 ? 2 : 1;
    VSURE[i] = tip === 1 ? 1.4 : tip === 6 ? 2.2 : tip ? 2 * Math.sqrt((2 * (VH[i] - Y0)) / G) : 0;
    return i;
  }
  const katilim = (i, j) => (VS[i] === j ? 0 : VO1[i] === j ? 1 : VO2[i] === j ? 2 : -1);

  const M0 = { x: 0, z: 0 }, M1 = { x: 0, z: 0 };
  const YD = { x: 0, y: 0, z: 0, fx: 0, fz: 1, roll: 0, bend: 0, pov: NaN, pw: 0, havada: false, aktif: -1 };
  const YD2 = { x: 0, y: 0, z: 0, fx: 0, fz: 1, roll: 0, bend: 0, pov: NaN, pw: 0, havada: false, aktif: -1 };
  /** Yunus j'nin t anındaki durumu (konum, yuvarlanma, kuyruk, gerekirse dikilme açısı). */
  function yunusDurum(j, t, out) {
    merkezYol(t, M0); merkezYol(t + 0.6, M1);
    let fx = M1.x - M0.x, fz = M1.z - M0.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    let ileri = 0, ay = 0, w = 0, roll = 0, bend = 0, pov = NaN, pw = 0, aktif = -1;
    const c = Math.floor(t / B);
    for (let b = c - 3; b <= c; b++) {
      const i = vurus(b), tip = VT[i];
      if (!tip) continue;
      const k = katilim(i, j);
      if (k < 0) continue;
      const s = t - (b * B + VOF[i] + 0.07 * k), Tw = VSURE[i];
      if (s < 0) continue;
      const A = tip === 1 ? 0.6 : tip === 6 ? 0 : 1.4 * Tw;
      ileri += A * (s < Tw ? ss(0, Tw, s) : 1 - ss(Tw, Tw + 4, s));
      if (s > Tw) continue;
      aktif = i;
      if (tip === 1) {
        ay = -0.75 + 0.6 * Math.sin((Math.PI * s) / Tw); w = ss(0, 0.2, s) * (1 - ss(Tw - 0.2, Tw, s));
      } else if (tip === 6) {
        // Kuyruk vurma: yüzeyde burun aşağı, kuyruk iki kez kalkıp suya iner (s = 0,9 ve 1,6).
        const zarf = ss(0, 0.35, s) * (1 - ss(1.85, 2.2, s));
        ay = -0.42; w = zarf; pov = -0.7; pw = zarf;
        bend = s > 0.2 && s < 1.6 ? 0.95 * (0.5 - 0.5 * Math.cos((TAU * (s - 0.2)) / 0.7)) : 0;
      } else {
        const h = VH[i], half = Tw / 2, air = Math.sqrt((2 * h) / G);
        ay = h - 0.5 * G * (s - half) * (s - half); w = ss(0, 0.25, s) * (1 - ss(Tw - 0.25, Tw, s));
        if (tip === 4) roll = VYON[i] * TAU * VTUR[i] * ss(half - air * 0.5, half + air * 0.5, s);
        else if (tip === 7) roll = VYON[i] * 1.45 * ss(half - 0.1, half + air * 0.9, s) * (1 - ss(half + air + 0.05, Tw, s));
        bend = -0.12 * Math.sin((Math.PI * s) / Tw);
      }
    }
    const lat = H.lat[j] + 1.2 * Math.sin(t * 0.31 + H.ph[j]);
    const lon = H.lon[j] + 1.4 * Math.sin(t * 0.23 + H.ph[j] * 1.7) + ileri;
    out.x = M0.x + fx * lon + fz * lat; out.z = M0.z + fz * lon - fx * lat;
    // Yüzme derinliği: aralıkla sırt yüzgeci suyu yarar; geliş ve gidişte derinde.
    let base = -0.62 - 0.38 * Math.cos((TAU * t) / H.per[j] + H.ph[j]);
    base -= 2.2 * (1 - ss(0, 25, t)) + 2.6 * ss(H.T - 50, H.T - 5, t);
    out.y = mix(base, ay, w);
    out.fx = fx; out.fz = fz; out.roll = roll; out.bend = bend; out.pov = pov; out.pw = pw; out.aktif = aktif;
    out.havada = out.y > -0.3;
    return out;
  }

  // --- balina programı ---
  const BW = 46;
  const BD = { x: 0, y: 0, z: 0, fx: 0, fz: 1, roll: 0, bend: 0, pov: NaN, pw: 0, flap: 0, yan: 1, olay: false };
  const BD2 = { x: 0, y: 0, z: 0, fx: 0, fz: 1, roll: 0, bend: 0, pov: NaN, pw: 0, flap: 0, yan: 1, olay: false };
  const BG = 7; // sıçrama yerçekimi (biraz ağır çekim: büyük hayvan)
  /** Döngü k'nin özel eylemi: 0 yok, 1 sıçrama, 2 yüzgeç vurma, 3 kuyruk vurma. */
  function balinaTur(i, k) {
    const tc = k * BW - (i ? 23 : 0) - H.fi * 2; // döngünün başladığı t
    if (tc + 22 < H.t1 * 0.6 || tc + 34 > H.t2 + 0.5 * (H.T - H.t2)) return 0;
    const r = hr(H.tohum, k, 20 + i);
    const pb = i ? 0.62 : 0.5;
    return r < pb ? 1 : r < pb + 0.25 ? 2 : 3;
  }
  const _kd = [0, 0];
  function dongu(i, t) { const tt = t + (i ? 23 : 0) + H.fi * 2; const k = Math.floor(tt / BW); _kd[0] = k; _kd[1] = tt - k * BW; return _kd; }
  // Sıçrama (breach): gövde ortasının tepe yüksekliği, başlangıç derinliği, süre; boyuta göre bir kez hesaplanır.
  const BR = [1, 0.42].map((sc) => { const hc = 3.0 * Math.pow(sc, 0.7), y0 = -8 * sc; return { hc, y0, Tb: 2 * Math.sqrt((2 * (hc - y0)) / BG), air: Math.sqrt((2 * hc) / BG) }; });
  const batik = (sc, t) => 3 * sc * (1 - ss(0, 20, t)) + 4 * sc * ss(H.T - 60, H.T - 5, t);
  function balinaDurum(i, t, out) {
    merkezYol(t, M0); merkezYol(t + 1.2, M1);
    let fx = M1.x - M0.x, fz = M1.z - M0.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const sc = balinalar[i].olcek;
    if (i === 0) { out.x = M0.x; out.z = M0.z; }
    else {
      const lat = -7 + 1.4 * Math.sin(t * 0.21), lon = 1.5 + 1.8 * Math.sin(t * 0.17 + 1);
      out.x = M0.x + fx * lon + fz * lat; out.z = M0.z + fz * lon - fx * lat;
    }
    dongu(i, t);
    const k = _kd[0], tau = _kd[1], tur = balinaTur(i, k);
    const arc = (t0) => sc * (-2.2 + 1.25 * Math.sin((Math.PI * Math.min(3.6, Math.max(0, tau - t0))) / 3.6));
    let y = -2.2 * sc, pov = NaN, pw = 0, roll = 0, bend = 0, flap = 0, olay = false;
    // Yan: yüzgeç vurmada yavrudan uzak yan (yavru annenin solunda), sıçramada rastgele.
    const yan = tur === 2 ? (i ? -1 : 1) : hr(H.tohum, k, 40 + i) < 0.5 ? -1 : 1;
    if (tau < 3.6) { y = arc(0); olay = true; }
    else if (tau >= 8 && tau < 11.6) { y = arc(8); olay = true; }
    else if (tau >= 13.5 && tau < 21) {
      // Kuyruk gösterip dalış.
      const s = tau - 13.5;
      y = sc * (-2.2 + 1.35 * ss(0, 1.8, s) - 6.0 * ss(2.4, 7.5, s));
      pov = -(0.12 * ss(0.5, 2.2, s) + 1.05 * ss(2.0, 5.0, s)); pw = 1 - ss(6.5, 7.5, s);
      bend = 0.55 * ss(2.6, 4.6, s) * (1 - ss(5.8, 7.2, s));
      olay = true;
    } else if (tau >= 21 && tau < 38) {
      const derin = -6.85 * sc;
      y = mix(derin, -2.2 * sc, ss(33.5, 37, tau));
      if (tur === 1) {
        const { hc, y0, Tb } = BR[i], s = tau - 29;
        y = mix(derin, y0, ss(21, 26, tau));
        if (s >= 0 && s <= Tb) {
          y = hc - 0.5 * BG * (s - Tb / 2) * (s - Tb / 2);
          pov = 1.25 * ss(0, 0.5, s) - 1.15 * ss(Tb / 2 - 0.2, Tb - 0.2, s); pw = 1;
          roll = yan * 1.7 * ss(Tb * 0.3, Tb * 0.85, s);
          bend = -0.25 * ss(0, Tb / 2, s) + 0.35 * ss(Tb / 2, Tb, s);
          olay = true;
        } else if (s > Tb) {
          const r = s - Tb;
          y = mix(-1.5 * sc, -2.2 * sc, ss(0, 4, r)) - 1.5 * sc * Math.sin(Math.PI * Math.min(1, r / 4));
          pov = 0.1 * (1 - ss(0, 3, r)); pw = 1 - ss(2, 4, r);
          roll = yan * 1.7 * (1 - ss(0, 3.5, r));
        }
      } else if (tur === 2 && tau < 35) {
        // Yan yatıp göğüs yüzgeciyle suya vurma.
        const zarf = ss(21.5, 23.5, tau) * (1 - ss(31.5, 33.5, tau));
        y = mix(mix(derin, -2.2 * sc, ss(33, 35, tau)), -1.0 * sc, zarf);
        roll = yan * 1.3 * zarf; pov = 0; pw = zarf;
        flap = tau > 23.5 && tau < 30.3 ? 0.5 - 0.5 * Math.cos((TAU * (tau - 23.5)) / 1.7) : 0;
        olay = zarf > 0.3;
      } else if (tur === 3 && tau < 35) {
        // Baş aşağı, kuyrukla suya vurma.
        const zarf = ss(21.5, 23.5, tau) * (1 - ss(31.8, 33.5, tau));
        y = mix(mix(derin, -2.2 * sc, ss(33, 35, tau)), -3.6 * sc, zarf);
        pov = -0.95; pw = zarf;
        bend = zarf * (tau > 23.5 && tau < 31.2 ? -0.075 + 0.675 * Math.cos((TAU * (tau - 23.5)) / 2.2) : 0.6);
        olay = zarf > 0.3;
      }
    } else if (tau >= 38 && tau < 41.6) { y = arc(38); olay = true; }
    y -= batik(sc, t);
    out.y = y; out.fx = fx; out.fz = fz; out.roll = roll; out.bend = bend; out.pov = pov; out.pw = pw; out.flap = flap; out.yan = yan; out.olay = olay;
    return out;
  }

  // --- kare güncellemesi ---
  const odakDizi = [0, 0, 0], merkezDizi = [0, 0, 0];
  let aktifTur = null;
  function gizle() { group.visible = false; aktifTur = null; }

  function yunuslariCiz(t) {
    yGovde.count = yKuyruk.count = H.N;
    for (let j = 0; j < H.N; j++) {
      yunusDurum(j, t, YD); yunusDurum(j, t + 0.05, YD2);
      const dx = YD2.x - YD.x, dy = YD2.y - YD.y, dz = YD2.z - YD.z, vh = Math.hypot(dx, dz) || 1e-6;
      const yaw = Math.atan2(dx, dz);
      let pitch = Math.atan2(dy, vh);
      if (YD.pw > 0) pitch = mix(pitch, YD.pov, YD.pw);
      _e.set(-pitch, yaw, YD.roll, "YXZ"); _q.setFromEuler(_e); _p.set(YD.x, YD.y, YD.z);
      _m.compose(_p, _q, _one); yGovde.setMatrixAt(j, _m);
      // Kuyruk: yüzerken çırpar, havada hafif bükük.
      const suda = 1 - ss(-0.4, 0.2, YD.y);
      const bend = YD.bend + 0.24 * Math.sin(t * TAU * 1.5 + H.ph[j]) * suda * (YD.pw > 0 ? 0 : 1);
      _m2.makeRotationX(bend); _m2.setPosition(0, 0, YZP); _m2.premultiply(_m); yKuyruk.setMatrixAt(j, _m2);
      // İz: sırt yüzgeci suyu yararken arkada köpük.
      for (let k = 0; k <= 5; k++) {
        const D = k === 0 ? YD : yunusDurum(j, t - 0.3 * k, YD2);
        const ust = D.y + 0.55;
        if (ust < 0 || D.y > 0.25) continue;
        const al = 0.42 * (1 - k / 6.5) * Math.min(1, ust / 0.25);
        const r = 0.3 + 0.13 * k;
        koy(leke, "leke", D.x - D.fx * 0.5, 0.035, D.z - D.fz * 0.5, r, 1, r * 2.2, al, Math.atan2(D.fx, D.fz));
      }
    }
    yGovde.instanceMatrix.needsUpdate = yKuyruk.instanceMatrix.needsUpdate = true;
    // Sıçrama köpükleri: son vuruşların eylemlerinden (çıkış, giriş, kuyruk vuruşları).
    const c = Math.floor(t / B);
    for (let b = c - 3; b <= c; b++) {
      const i = vurus(b), tip = VT[i];
      if (!tip) continue;
      for (let k = 0; k < 3; k++) {
        const j = k === 0 ? VS[i] : k === 1 ? VO1[i] : VO2[i];
        if (j < 0) continue;
        const bas = b * B + VOF[i] + 0.07 * k, Tw = VSURE[i], tk = (H.tohum ^ (b * 131 + k * 17)) | 0;
        if (tip === 1) yAn(j, bas + Tw * 0.5, 0.2, 0, tk + 1, t);
        else if (tip === 6) { yAn(j, bas + 0.9, 0.75, 1.0, tk + 2, t); yAn(j, bas + 1.6, 0.75, 1.0, tk + 3, t); }
        else {
          const air = Math.sqrt((2 * VH[i]) / G), half = Tw / 2;
          yAn(j, bas + half - air, 0.5, -0.4, tk + 4, t);
          yAn(j, bas + half + air, tip === 3 ? 1.25 : tip === 7 ? 1.5 : tip === 4 ? 1.0 : 0.85, 0.3, tk + 5, t);
        }
      }
    }
  }
  /** Yunus j'nin tm anındaki suya çıkış/giriş köpüğü (geri: kuyruğa doğru kaydırma, m). */
  function yAn(j, tm, str, geri, tohum, t) {
    const age = t - tm;
    if (age < 0 || age > 2.4 + 0.3 * str) return;
    yunusDurum(j, tm, YD2);
    sicrama(YD2.x - YD2.fx * geri, YD2.z - YD2.fz * geri, str, age, tohum, 1);
  }

  function balinalariCiz(t) {
    for (let i = 0; i < 2; i++) {
      const W = balinalar[i], sc = W.olcek;
      balinaDurum(i, t, BD); balinaDurum(i, t + 0.1, BD2);
      const dx = BD2.x - BD.x, dy = BD2.y - BD.y, dz = BD2.z - BD.z, vh = Math.hypot(dx, dz) || 1e-6;
      let pitch = Math.atan2(dy * 0.6, vh);
      if (BD.pw > 0) pitch = mix(pitch, BD.pov, BD.pw);
      W.kok.visible = BD.y > -9 * sc;
      W.kok.position.set(BD.x, BD.y, BD.z);
      W.kok.rotation.set(-pitch, Math.atan2(dx, dz), BD.roll);
      const suda = 1 - ss(-1.5 * sc, 0, BD.y);
      W.kuyruk.rotation.x = BD.bend + 0.12 * Math.sin(t * 0.9 + i) * suda;
      // Göğüs yüzgeçleri: geride ve aşağı; yüzgeç vurmada üstteki kalkıp iner.
      const ust = BD.roll * BD.yan > 0.3 ? BD.yan : 0;
      const kanat = (g, sg) => {
        let droop = 0.42 + 0.06 * Math.sin(t * 0.7 + sg);
        if (ust === sg) droop = mix(0.42, -0.35, ss(0, 0.6, BD.roll * BD.yan)) + 1.75 * BD.flap;
        g.rotation.set(0, 0.55 * sg, -droop * sg);
      };
      kanat(W.yR, 1); kanat(W.yL, -1);
      // Yüzeydeyken sırt boyunca köpük.
      if (BD.y > -1.3 * sc && BD.y < 0.5) {
        const al = 0.4 * ss(-1.3 * sc, -0.7 * sc, BD.y);
        const yaw = Math.atan2(dx, dz);
        for (let k = 0; k < 3; k++) {
          const o = (k - 0.5) * 3.5 * sc;
          koy(leke, "leke", BD.x + BD.fx * o, 0.035, BD.z + BD.fz * o, 1.6 * sc + 0.4 * k, 1, 3.2 * sc, al, yaw);
        }
      }
      // Olaylar (bu ve önceki döngü): soluk, kuyruk girişi, sıçrama, yüzgeç/kuyruk vuruşları, dalış izi.
      const k0 = dongu(i, t)[0];
      for (let k = k0 - 1; k <= k0; k++) {
        const tc = k * BW - (i ? 23 : 0) - H.fi * 2, tur = balinaTur(i, k), id = (H.tohum ^ (k * 977 + i * 31)) | 0;
        bOlay(i, tc + 1.0, 0, 0, id + 7, t); bOlay(i, tc + 9.0, 0, 0, id + 63, t); bOlay(i, tc + 39.0, 0, 0, id + 273, t);
        // Kuyruk: çıkarken damla, girerken köpük, sonra pürüzsüz "ayak izi".
        bOlay(i, tc + 13.5 + 3.4, 1, 0, id + 1, t); bOlay(i, tc + 13.5 + 6.4, 2, 0, id + 2, t);
        if (tur === 1) { bOlay(i, tc + 29 + BR[i].Tb / 2 - BR[i].air, 3, 0, id + 3, t); bOlay(i, tc + 29 + BR[i].Tb / 2 + BR[i].air, 4, 0, id + 4, t); }
        else if (tur === 2) for (let n = 0; n < 4; n++) bOlay(i, tc + 23.5 + 0.85 + 1.7 * n, 5, n, id + 10 + n, t);
        else if (tur === 3) for (let n = 0; n < 4; n++) bOlay(i, tc + 23.5 + 1.1 + 2.2 * n, 6, n, id + 20 + n, t);
      }
    }
  }
  /** Balina i'nin tm anındaki olayının köpüğü/soluğu (kod: 0 soluk, 1–2 kuyruk çıkış/giriş, 3–4 sıçrama, 5 yüzgeç, 6 kuyruk vurma). */
  function bOlay(i, tm, kod, n, id, t) {
    const age = t - tm;
    if (age < 0 || age > (kod === 2 ? 12 : 4)) return;
    const sc = balinalar[i].olcek;
    if (batik(sc, tm) > 1.2 * sc) return; // derinden (geliş, son dalış) köpük yok
    const D = balinaDurum(i, tm, BD2), rx = D.fz * D.yan, rz = -D.fx * D.yan;
    switch (kod) {
      case 0: ufle(D.x + D.fx * 0.28 * BL * sc, D.z + D.fz * 0.28 * BL * sc, age, sc, id); break;
      case 1: sicrama(D.x - D.fx * 4.5 * sc, D.z - D.fz * 4.5 * sc, 0.6, age, id, 1.4 * sc + 0.4); break;
      case 2: {
        sicrama(D.x - D.fx * 2 * sc, D.z - D.fz * 2 * sc, 1.0, age, id, 1.6 * sc + 0.4);
        const r = (3 + 2 * Math.sqrt(age)) * sc + 1;
        koy(leke, "leke", D.x, 0.03, D.z, r, 1, r * 1.4, 0.22 * (1 - age / 12), Math.atan2(D.fx, D.fz));
        break;
      }
      case 3: sicrama(D.x, D.z, 2.6, age, id, 2.2 * sc + 0.3); sicrama(D.x - D.fx * 2 * sc, D.z - D.fz * 2 * sc, 1.4, age - 0.4, id + 9, 2 * sc + 0.3); break;
      case 4:
        sicrama(D.x, D.z, 3.5, age, id, 2.2 * sc + 0.3);
        sicrama(D.x + rx * 3.5 * sc + D.fx * 3 * sc, D.z + rz * 3.5 * sc + D.fz * 3 * sc, 2.4, age - 0.15, id + 5, 1.8 * sc + 0.3);
        sicrama(D.x + rx * 2 * sc - D.fx * 4 * sc, D.z + rz * 2 * sc - D.fz * 4 * sc, 2.0, age - 0.25, id + 6, 1.8 * sc + 0.3);
        break;
      case 5: sicrama(D.x + rx * 4.6 * sc + D.fx * 2 * sc, D.z + rz * 4.6 * sc + D.fz * 2 * sc, 1.3, age, id, 1.5 * sc + 0.3); break;
      case 6: sicrama(D.x - D.fx * 5.8 * sc, D.z - D.fz * 5.8 * sc, 1.8, age, id, 1.6 * sc + 0.3); break;
    }
  }

  function update(o, evre, minute, real, env) {
    const tur = o?.tur;
    if (!evre || (tur !== "yunus" && tur !== "balina") || evre.ad === "sonra") { if (group.visible) gizle(); return; }
    if (!yerSec(o)) { if (group.visible) gizle(); return; }
    const t = (minute - o.bas) * 60;
    S.dk = minute;
    group.visible = true;
    if (aktifTur !== tur) {
      aktifTur = tur;
      yGovde.visible = yKuyruk.visible = tur === "yunus";
      for (const b of balinalar) b.kok.visible = tur === "balina";
    }
    P.damla = P.tac = P.halka = P.leke = P.bulut = 0;
    if (tur === "yunus") yunuslariCiz(t); else balinalariCiz(t);
    // Gündüz beyaz köpük; alacakaranlıkta sönük (olaylar gündüz, yine de).
    const isik = 0.45 + 0.55 * Math.min(1, Math.max(0, env?.light ?? 1));
    kMat.color.setScalar(isik); dMat.color.setRGB(0.95 * isik, 0.98 * isik, isik);
    for (let k = 0; k < HAVUZ.length; k += 2) {
      const m = HAVUZ[k], n = P[HAVUZ[k + 1]];
      m.count = n;
      if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    }
  }
  const HAVUZ = [damla, "damla", tac, "tac", halka, "halka", leke, "leke", bulut, "bulut"];

  /** Şu an en ilgi çekici hayvan [x, y, z] (y ≥ 0,3). */
  function odak(minute = S.dk) {
    if (!H.T || !S.yer) return null;
    const t = (minute - S.bas) * 60;
    if (H.tur === "yunus") {
      // Şimdiki ya da bir sonraki vuruşun sahibi (eylem başlamadan kamera oraya bakabilsin).
      const c = Math.floor(t / B);
      let j = -1;
      for (let b = c; b <= c + 2 && j < 0; b++) { const i = vurus(b); if (VT[i] >= 2) j = VS[i]; }
      if (j < 0) j = VS[vurus(c)];
      yunusDurum(j, t, YD2);
      odakDizi[0] = YD2.x; odakDizi[1] = Math.max(0.3, YD2.y); odakDizi[2] = YD2.z;
    } else {
      balinaDurum(0, t, BD2);
      if (!BD2.olay) { const ax = BD2.x, ay = BD2.y, az = BD2.z; balinaDurum(1, t, BD2); if (!BD2.olay) { BD2.x = ax; BD2.y = ay; BD2.z = az; } }
      odakDizi[0] = BD2.x; odakDizi[1] = Math.max(0.3, BD2.y); odakDizi[2] = BD2.z;
    }
    return odakDizi;
  }
  function merkez(minute = S.dk) {
    if (!H.T || !S.yer) return null;
    merkezYol((minute - S.bas) * 60, M0);
    merkezDizi[0] = M0.x; merkezDizi[1] = 0.3; merkezDizi[2] = M0.z;
    return merkezDizi;
  }
  function havada(minute = S.dk) {
    if (!H.T || !S.yer || H.tur !== "yunus") return 0;
    const t = (minute - S.bas) * 60;
    let n = 0;
    for (let j = 0; j < H.N; j++) if (yunusDurum(j, t, YD2).y > -0.2) n++;
    return n;
  }
  const api = { group, yerSec, update, odak, merkez, havada, get yer() { return S.yer; } };
  group.userData.deniz = api; // denetim (?denetle): __ada.scene içinden erişilir
  return api;
}
