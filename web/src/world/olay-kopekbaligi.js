// Köpekbalığı (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// Driftwood: kıyının açığında büyük bir köpekbalığının sırt yüzgeci görünür, bir süre kıyıya koşut dolaşır. Su kenarı
// boşaltılır (tahliye: kıyı şeridindeki ve iskeledeki sakinler 15 m geriye çekilir), kırmızı ve mor uyarı bayrakları
// çekilir (ABD'de mor bayrak: tehlikeli deniz canlısı); sakinler güvenli mesafeden izler. Yüzgeç açığa dönünce bayraklar
// iner, kıyı açılır. Plaj kurulmuşsa plajda, yoksa kasabanın kıyısında (rıhtım önü).
// Her şey (dakika, o.tohum, dünya) işlevidir: Math.random ve kare arası birikim yok.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DIL } from "./olay-ayar.js";
import { TAU, ss, mix, hr, kiyiYeri, kiyiAdi, iskeleUzak, vapurUzak, govde, levha, boyaLevha, kure, suAlti, kopukHavuzu } from "./olay-kiyi.js";

const L = 4.6, KS = 0.8, KZ = L * (0.5 - KS); // boy, kuyruk eklemi
const SIRT = new THREE.Color("#57616a"), YAN = new THREE.Color("#7c868e"), KARIN = new THREE.Color("#e6e6e0");
function boya(c, sa) {
  if (sa > -0.12) c.copy(YAN).lerp(SIRT, ss(-0.12, 0.6, sa));
  else c.copy(KARIN);
}
function balikGeo() {
  const pr = (rows) => rows.map(([s, r, wx, wy, yo]) => [s, r * L, wx, wy, yo * L]);
  const g = govde(pr([[0.0, 0.012, 1, 0.8, -0.01], [0.04, 0.04, 1.05, 0.8, -0.01], [0.1, 0.07, 1.05, 0.9, -0.005], [0.2, 0.1, 1.02, 1.0, 0], [0.33, 0.115, 1.0, 1.05, 0], [0.46, 0.108, 0.98, 1.05, 0.005], [0.6, 0.085, 0.95, 1.05, 0.01], [0.72, 0.055, 0.9, 1.1, 0.012], [0.82, 0.028, 0.85, 1.15, 0.012]]), L, 12, boya);
  const koyu = (c) => c.copy(SIRT);
  // Sırt yüzgeci (sudan çıkan üçgen): ~0,95 m, geriye yatık.
  const sirt = levha([[-0.32, 0], [0.05, 0.55], [0.18, 0.95], [0.26, 0.92], [0.2, 0.5], [0.3, 0.12], [0.42, 0]], 0.07, koyu);
  sirt.rotateY(Math.PI / 2).translate(0, 0.115 * L * 1.0, L * (0.5 - 0.4));
  const gogus = (sg) => {
    const f = levha([[0, 0.12], [0.35 * sg, -0.05], [0.75 * sg, -0.3], [0.62 * sg, -0.33], [0.3 * sg, -0.22], [0, -0.12]], 0.05, (c, n) => c.copy(n.y < -0.3 ? KARIN : SIRT));
    f.rotateX(Math.PI / 2).rotateZ(-0.35 * sg).translate(0.08 * L * sg, -0.05 * L, L * (0.5 - 0.3));
    return boyaLevha(f);
  };
  const govdeG = mergeGeometries([g, boyaLevha(sirt), gogus(1), gogus(-1), kure(0.03, 0.06 * L, 0.012 * L, L * (0.5 - 0.09), "#111111"), kure(0.03, -0.06 * L, 0.012 * L, L * (0.5 - 0.09), "#111111")]);
  // Kuyruk: sap + hilal yüzgeç (üst lob büyük; suyun üstünde ara sıra görünür).
  const sap = govde(pr([[0.78, 0.035, 0.85, 1.1, 0.012], [0.9, 0.02, 0.8, 1.2, 0.01], [0.95, 0.016, 0.8, 1.2, 0.01]]), L, 8, boya);
  const hilal = levha([[0, 0.06], [-0.35, 0.75], [-0.48, 0.8], [-0.3, 0.3], [-0.12, 0.02], [-0.3, -0.45], [-0.38, -0.5], [-0.15, -0.1]], 0.05, koyu);
  hilal.rotateY(Math.PI / 2).translate(0, 0.012 * L, L * (0.5 - 0.94));
  return { govde: govdeG, kuyruk: mergeGeometries([sap, boyaLevha(hilal)]).translate(0, 0, -KZ) };
}

/** Bayrak direği + iki bayrak (kırmızı, mor). Bayraklar ayrı (direk boyunca kalkar, rüzgârda dalgalanır). */
function direkGeo() {
  const g = new THREE.CylinderGeometry(0.05, 0.06, 4.2, 6).translate(0, 2.1, 0); g.deleteAttribute("uv");
  const c = new THREE.Color("#d9d9d4"), col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function bayrakGeo() {
  // 1,2 × 0,75 m, 6 dikey dilim (dalgalanma köşe gölgelendiricisinde).
  const g = new THREE.PlaneGeometry(1.2, 0.75, 6, 1).translate(0.6, 0, 0); g.deleteAttribute("uv");
  return g;
}

export function buildKopekbaligiOlay({ world, group: olayGrubu }) {
  let G = null, K = null;
  function hazirla() {
    if (G) return G;
    const group = new THREE.Group(); group.name = "olay-kopekbaligi"; group.visible = false;
    olayGrubu.add(group);
    const geo = balikGeo();
    const mat = suAlti(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.05 }));
    const kok = new THREE.Group(); kok.rotation.order = "YXZ";
    const kuyruk = new THREE.Group(); kuyruk.position.z = KZ; kuyruk.add(new THREE.Mesh(geo.kuyruk, mat));
    kok.add(new THREE.Mesh(geo.govde, mat), kuyruk);
    group.add(kok);
    // Bayraklar: 3 direk; bayraklar tek örnekli çizimde (renk örnek başına), dalgalanma gölgelendiricide.
    const direk = new THREE.InstancedMesh(direkGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 3);
    const uZaman = { value: 0 };
    const bMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
    bMat.onBeforeCompile = (sh) => {
      sh.uniforms.uZaman = uZaman;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uZaman;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
        float bk = position.x / 1.2;
        transformed.z += sin(position.x * 4.0 - uZaman * 7.0 + float(gl_InstanceID) * 1.7) * 0.12 * bk;
        transformed.y -= bk * bk * 0.05;`);
    };
    const bayrak = new THREE.InstancedMesh(bayrakGeo(), bMat, 6);
    for (let i = 0; i < 6; i++) bayrak.setColorAt(i, new THREE.Color(i % 2 ? "#6a2c91" : "#d2251f"));
    direk.castShadow = bayrak.castShadow = true;
    direk.frustumCulled = bayrak.frustumCulled = false;
    group.add(direk, bayrak);
    const kopuk = kopukHavuzu(group, { damla: 60, leke: 70, halka: 10 });
    G = { group, kok, kuyruk, direk, bayrak, uZaman, kopuk };
    return G;
  }

  function kur(o) {
    // Dolaşma alanı: kıyıdan 22–70 m açık, kıyı boyunca ±55 m; iskele ve vapur yolundan uzak, derin.
    let D = null;
    const yer = kiyiYeri(world, o, {
      tuz: 3, kaynak: ["plaj", "kasaba", "sahil_yolu", "iskele"],
      deniz: (W, e2, e1) => {
        for (const sap of [0, 25, -25, 50, -50]) {
          let ok = true;
          for (const la of [-55, -25, 0, 25, 55]) for (const d of [22, 40, 70]) {
            const x = W[0] + e1[0] * (la + sap) + e2[0] * d, z = W[1] + e1[1] * (la + sap) + e2[1] * d;
            if (world.height(x, z) > -2.2 || iskeleUzak(world, x, z) < 10 || vapurUzak(world, x, z) < 45) { ok = false; break; }
          }
          if (ok) { D = { x: W[0] + e1[0] * sap, z: W[1] + e1[1] * sap }; return true; }
        }
        return false;
      },
    });
    if (!yer) return null;
    hazirla();
    const { e1, e2 } = yer, t = o.tohum | 0, Ts = (o.son - o.bas) * 60;
    // Kıyı noktası: dolaşma alanının karşısı (sap kaydırması varsa W de kayar).
    const W = world.coastPoint(D.x - e2[0] * 30, D.z - e2[1] * 30, e2[0], e2[1], 0);
    const kiyi = world.nearestWalkable(W[0] - e2[0] * 7, W[1] - e2[1] * 7, 6);
    const kal = world.nearestWalkable(W[0] - e2[0] * 16, W[1] - e2[1] * 16, 8);
    const sg = hr(t, 5) < 0.5 ? -1 : 1;
    const E = { g: Ts * 0.12, b: Ts * 0.3, k: Ts * 0.88 }; // evreler (olay-plan.js kopekbaligi)
    // Bayrak direkleri: su kenarından 4 m içeride, kıyı boyunca −28, 0, +28 m (yürünebilir yere).
    const direkler = [-28, 0, 28].map((la) => world.nearestWalkable(W[0] + e1[0] * la - e2[0] * 4, W[1] + e1[1] * la - e2[1] * 4, 5));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    direkler.forEach(([x, z], i) => { m.compose(new THREE.Vector3(x, world.groundY(x, z), z), q, new THREE.Vector3(1, 1, 1)); G.direk.setMatrixAt(i, m); });
    G.direk.instanceMatrix.needsUpdate = true;
    K = { o, yer, W, e1, e2, Ts, t, sg, E, direkler, kiyi, kal, ad: kiyiAdi(world, { ...yer, W }, DIL),
      merkez: [W[0] + e2[0] * 38, W[1] + e2[1] * 38], uzak1: [W[0] + e2[0] * 150 + e1[0] * sg * 90, W[1] + e2[1] * 150 + e1[1] * sg * 90],
      uzak2: [W[0] + e2[0] * 170 - e1[0] * sg * 110, W[1] + e2[1] * 170 - e1[1] * sg * 110],
      bas: o.bas + E.g / 60, kapat: o.bas + E.g / 60 + 1.5, ac: o.bas + E.k / 60 + 2 };
    // "Olaya git": denizden kıyıya bakış (yüzgeç önde, bayraklar, seyirci ve kasaba arkada). Video kıyıdan bakar (kiyi).
    const yon = Math.atan2(K.merkez[0] - kiyi[0], K.merkez[1] - kiyi[1]) + sg * 0.3;
    return { odak: K.merkez, odakY: 0.5, kalabalik: kal, kiyi, yon, yerAdi: K.ad.ad, zaman: null, gitD: 70, gitEgim: 0.2, cekimOlcek: 0.6, kalabalikArkadan: true }; // yüzgeç küçük (1 m): kadraj yakın
  }

  // --- yüzgecin yolu ---
  const P0 = { x: 0, z: 0 }, P1 = { x: 0, z: 0 };
  /** Köpekbalığının (gövde ortası) t anındaki yatay konumu: geliş, dolaşma (sekiz), gidiş. */
  function yol(ts, out) {
    const { E, e1, e2, merkez: M, uzak1, uzak2, Ts, t } = K;
    const al = ss(0, E.g + 60, ts), be = ss(E.k, Ts, ts);
    // Dolaşma: kıyı boyunca ±45 m, açıklık 10 m; kapalı evrede kıyıya biraz daha yakın (27–48 m).
    const u = (TAU / 150) * ts * K.sg + hr(t, 7) * TAU, yak = ss(E.b - 120, E.b + 60, ts) * (1 - be);
    const la = 45 * Math.sin(u), ge = 10 * Math.sin(2 * u) - 4 * yak + 6 * (1 - al);
    const lx = M[0] + e1[0] * la + e2[0] * ge, lz = M[1] + e1[1] * la + e2[1] * ge;
    out.x = lx + (uzak1[0] - lx) * (1 - al) + (uzak2[0] - lx) * be;
    out.z = lz + (uzak1[1] - lz) * (1 - al) + (uzak2[1] - lz) * be;
    return out;
  }
  /** Derinlik: çoğunlukla yüzgeç dışarıda (gövde −0,55 m); arada dalış (100 sn'de bir ~14 sn), geliş/gidişte derinde. */
  function derin(ts) {
    const k = Math.floor(ts / 100), tau = ts - k * 100, r = hr(K.t, 11, k);
    const dal = r < 0.55 ? ss(70, 74, tau) * (1 - ss(84, 88, tau)) : 0;
    return -0.55 - 1.4 * dal - 1.6 * (1 - ss(0, 40, ts)) - 1.8 * ss(K.Ts - 50, K.Ts - 8, ts);
  }

  const _B = new THREE.Vector3(), _M = new THREE.Matrix4();
  function update(o, evre, minute, real, env) {
    if (!o || !K || K.o !== o || !evre || evre.ad === "sonra") { if (G) G.group.visible = false; if (!o) K = null; return; }
    G.group.visible = true;
    const ts = (minute - o.bas) * 60, kp = G.kopuk;
    yol(ts, P0); yol(ts + 0.8, P1);
    const y = derin(ts), yaw = Math.atan2(P1.x - P0.x, P1.z - P0.z);
    G.kok.position.set(P0.x, y, P0.z);
    G.kok.rotation.set(0, yaw + 0.06 * Math.sin(ts * 2.2), 0);
    G.kuyruk.rotation.y = 0.32 * Math.sin(ts * 2.2);
    G.kok.visible = y > -3.2;
    // İz: yüzgeç suyu yararken arkasında V köpük ve önünde küçük kabarma.
    kp.bas(env?.light ?? 1);
    const fin = ss(-1.0, -0.6, y);
    if (fin > 0.02) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw), bx = P0.x + fx * L * 0.1, bz = P0.z + fz * L * 0.1;
      kp.ekle("leke", bx + fx * 0.35, 0.05, bz + fz * 0.35, 0.35, 1, 0.5, 0.55 * fin, yaw);
      for (let k = 1; k <= 6; k++) {
        yol(ts - 0.45 * k, P1);
        const a = 0.42 * fin * (1 - k / 7), r = 0.35 + 0.22 * k;
        kp.ekle("leke", P1.x + fx * L * 0.1, 0.04, P1.z + fz * L * 0.1, r, 1, r * 2.4, a, yaw);
      }
      if (y > -0.7) kp.ekle("halka", bx, 0.05, bz, 0.6 + 0.15 * Math.sin(ts * 3), 1, 1.1, 0.35 * fin, yaw);
    }
    kp.bitir();
    // Bayraklar: boşaltmada 40 sn'de çekilir, açılışta iner.
    const kalk = ss(K.E.g + 20, K.E.g + 60, ts) * (1 - ss(K.E.k + 60, K.E.k + 100, ts));
    G.bayrak.visible = G.direk.visible = ts > K.E.g - 1 && ts < K.E.k + 160;
    if (G.bayrak.visible) {
      G.uZaman.value = ts;
      const m = _M;
      K.direkler.forEach(([x, z], i) => {
        const gy = world.groundY(x, z);
        for (let b = 0; b < 2; b++) {
          const hy = mix(1.0, b ? 3.15 : 3.85, kalk);
          m.makeRotationY(Math.atan2(K.e1[0], K.e1[1]) - Math.PI / 2 + 0.4);
          m.setPosition(_B.set(x, gy + hy, z));
          G.bayrak.setMatrixAt(i * 2 + b, m);
        }
      });
      G.bayrak.instanceMatrix.needsUpdate = true;
    }
  }

  function canli(minute) {
    if (!K) return null;
    const ts = (minute - K.o.bas) * 60;
    yol(ts, P0);
    return [P0.x, 0.4, P0.z];
  }

  /** Su kenarı boşaltılır: kıyı boyunca ±70 m, su kenarından 12 m içeriye dek (iskeleler dahil) → 15–18 m geriye. */
  function tahliye(x, z, minute) {
    if (!K || minute < K.bas || minute > K.ac + 1.5) return null;
    const { W, e1, e2 } = K, dx = x - W[0], dz = z - W[1], u = dx * e1[0] + dz * e1[1], v = dx * e2[0] + dz * e2[1];
    if (Math.abs(u) > 70 || v < -12) return null;
    const v2 = -15 - (Math.abs(u * 7.3) % 3);
    const e = Math.min(1, (minute - K.bas) / 1.5, (K.ac + 1.5 - minute) / 1.5);
    const vv = v + (v2 - v) * Math.max(0, Math.min(1, e));
    let nx = W[0] + e1[0] * u + e2[0] * vv, nz = W[1] + e1[1] * u + e2[1] * vv;
    if (e >= 1 && !world.isWalkable(nx, nz)) [nx, nz] = world.nearestWalkable(nx, nz, 4);
    const yuru = e < 1 ? (Math.abs(vv - v) / 0.72) * Math.PI : 0;
    const geri = minute > K.ac;
    const bak = e < 1 ? Math.atan2(nx - x, nz - z) + (geri ? Math.PI : 0) : Math.atan2(K.merkez[0] - nx, K.merkez[1] - nz);
    return { x: nx, z: nz, heading: bak, yuru };
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K || K.o !== o) return null;
    const ts = (minute - o.bas) * 60, n = S.seyirci, A = K.ad, sure = Math.round((K.ac - K.kapat));
    const tGor = saatYaz(o.bas);
    if (DIL !== "en") {
      const izle = n ? ` ${n} kişi güvenli mesafeden izliyor.` : "";
      if (ts < K.E.g) return { kisa: "Kıyıda köpekbalığı yüzgeci!", uzun: `Saat ${saatte(o.bas)} ${A.in ?? "kıyının"} açığında büyük bir köpekbalığının sırt yüzgeci göründü; kıyıya koşut dolaşıyor.` };
      if (ts < K.E.k + 120) return { kisa: "Köpekbalığı · kıyı kapatıldı", uzun: `Saat ${saatte(o.bas)} ${A.in ?? "kıyının"} açığında görünen köpekbalığı kıyıya koşut dolaşıyor; kırmızı ve mor uyarı bayrakları çekildi, su kenarı kapatıldı.${izle}` };
      return { kisa: `Bugün köpekbalığı göründü · ${tGor}`, uzun: `Saat ${saatte(o.bas)} ${A.in ?? "kıyının"} açığında bir köpekbalığı göründü; su kenarı ${sure} dakika kapalı kaldı. Yüzgeç açığa dönünce bayraklar indi, kıyı yeniden açıldı.${n ? ` ${n} kişi kıyıdan izledi.` : ""}` };
    }
    const izle = n ? ` ${n} ${n === 1 ? "neighbor is" : "neighbors are"} watching from a safe distance.` : "";
    if (ts < K.E.g) return { kisa: "Shark fin off the waterfront!", uzun: `At ${tGor} a large shark fin was spotted off ${A.ad}, cruising along the shore.` };
    if (ts < K.E.k + 120) return { kisa: "Shark sighting · shore closed", uzun: `A shark has been circling off ${A.ad} since ${tGor}. Red and purple warning flags are up and the water's edge is closed.${izle}` };
    return { kisa: `Shark sighting ${o.yuva ? "this afternoon" : "this morning"} · ${tGor}`, uzun: `At ${tGor} a shark fin was spotted off ${A.ad}. The water's edge was closed for ${sure} minutes with red and purple flags up; once the fin turned back out to sea the flags came down and the shore reopened.${n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} watched from the shore.` : ""}` };
  }

  return {
    kur, update, canli, yazi, tahliye,
    seyirci: { r0: 1.5, r1: 7, isR: 300, uzak: 2.2, kiyida: true, en: 30, tavirlar: ["goster", "cek", "sasir", "goster", "cek", "konus", "bak"] },
  };
}
