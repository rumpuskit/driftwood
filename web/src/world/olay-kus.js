// Kuş olayı (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// Adaya göre (olay-ayar.js KUS.tur):
//   leylek (Mercanada): göç eden yüzlerce leylek kuzeyden akın akın gelir, adanın üstünde bir termikte daire çizerek
//     yükselir, sonra tepeden ayrılıp güneye, denizin üstünden uzaklaşır. Sakinler başlarını kaldırıp izler.
//   kartal (Driftwood): bir kel kartal koyun üstünde alçalarak döner, suya dalıp pençesiyle balık kapar, kıyıdaki bir
//     ağacın tepesine konup yer, sonra uçup gider. Sakinler iskeleden izler.
// Sürü InstancedMesh; her kuşun yeri yalnız (saniye, tohum) işlevidir (kare arası birikim yok): video aynı kareyi çizer.
import * as THREE from "three";
import { DIL, KUS } from "./olay-ayar.js";
import { kesir } from "./olay-plan.js";
import { adaylar, gorevler, yerlerSec, izleDurus, agaclar, agacTepe, pusula } from "./olay-izleyici.js";

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const lerp = THREE.MathUtils.lerp;

/** Renkli kutuları tek geometride birleştirir (yerel konum, boyut, renk, isteğe bağlı dönüş). */
function birlestir(parcalar) {
  const P = [], C = [], c = new THREE.Color(), m = new THREE.Matrix4(), e = new THREE.Euler();
  for (const { geo, pos = [0, 0, 0], rot = [0, 0, 0], renk } of parcalar) {
    const g = geo.toNonIndexed();
    g.applyMatrix4(m.makeRotationFromEuler(e.set(...rot)).setPosition(...pos));
    c.set(renk);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { P.push(a.getX(i), a.getY(i), a.getZ(i)); C.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}
/** Kanat: kökten (x=0) uca (x=+1·boy) düz levha; iç kısım renk1, uç (birincil tüyler) renk2, uçta "parmaklar". */
function kanatGeo(boy, kok, uc, r1, r2, parmak = 0) {
  const P = [], C = [], a = new THREE.Color(r1), b = new THREE.Color(r2);
  const tri = (p, q, r, c) => { P.push(...p, ...q, ...r); for (let i = 0; i < 3; i++) C.push(c.r, c.g, c.b); };
  const ic = boy * 0.6;
  // İç kısım: ön kenar z=+kok/2, arka kenar z=-kok/2 → uca doğru daralır.
  tri([0, 0, kok * 0.45], [ic, 0.02, kok * 0.42], [0, 0, -kok * 0.55], a);
  tri([ic, 0.02, kok * 0.42], [ic, 0.02, -uc * 0.6], [0, 0, -kok * 0.55], a);
  if (parmak) {
    const n = parmak;
    tri([ic, 0.02, kok * 0.42], [boy * 0.82, 0.04, uc * 0.3], [ic, 0.02, -uc * 0.6], b);
    for (let k = 0; k < n; k++) {
      const z0 = uc * 0.3 - (k / n) * uc * 0.95, z1 = uc * 0.3 - ((k + 1) / n) * uc * 0.95;
      tri([boy * 0.82, 0.04, z0], [boy * (1 - 0.03 * k), 0.06, (z0 + z1) / 2], [boy * 0.82, 0.04, z1], b);
      tri([ic, 0.02, -uc * 0.6], [boy * 0.82, 0.04, z0], [boy * 0.82, 0.04, z1], b);
    }
  } else {
    tri([ic, 0.02, kok * 0.42], [boy, 0.05, -uc * 0.1], [ic, 0.02, -uc * 0.6], b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

export function buildKusOlay({ world, scene, group }) {
  const TUR = KUS?.tur ?? "leylek";
  let K = null, G = null;
  const M = new THREE.Matrix4(), MB = new THREE.Matrix4(), MW = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion();
  const V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), E = new THREE.Euler(0, 0, 0, "YXZ");
  const merkez = () => world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
  const gy = (x, z) => Math.max(0, world.groundY?.(x, z) ?? world.height?.(x, z) ?? 0);

  // ------------------------------------------------------------------ leylek
  function leylekGorunum(N) {
    if (G?.N >= N) return G;
    if (G) { group.remove(G.g); }
    const g = new THREE.Group(); group.add(g);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    // Gövde (+z ileri): beyaz gövde, öne uzanan boyun ve baş, kırmızı gaga; arkaya uzanan kırmızı bacaklar.
    const govde = birlestir([
      { geo: new THREE.BoxGeometry(0.22, 0.2, 0.62), renk: "#f4f2ec" },
      { geo: new THREE.BoxGeometry(0.08, 0.08, 0.42), pos: [0, 0.02, 0.5], renk: "#f4f2ec" },
      { geo: new THREE.BoxGeometry(0.1, 0.1, 0.14), pos: [0, 0.03, 0.74], renk: "#f4f2ec" },
      { geo: new THREE.BoxGeometry(0.04, 0.04, 0.24), pos: [0, 0.02, 0.92], renk: "#d8402b" },
      { geo: new THREE.BoxGeometry(0.03, 0.03, 0.55), pos: [0.05, -0.05, -0.55], renk: "#d8402b" },
      { geo: new THREE.BoxGeometry(0.03, 0.03, 0.55), pos: [-0.05, -0.05, -0.55], renk: "#d8402b" },
      { geo: new THREE.BoxGeometry(0.2, 0.03, 0.18), pos: [0, 0.02, -0.38], renk: "#1e1e1e" },
    ]);
    const kanatS = kanatGeo(1.0, 0.36, 0.34, "#f4f2ec", "#151515", 5), kanatL = kanatS.clone().scale(-1, 1, 1);
    const inst = (geo) => { const m = new THREE.InstancedMesh(geo, mat, N); m.frustumCulled = false; m.count = 0; g.add(m); return m; };
    G = { g, N, govde: inst(govde), sag: inst(kanatS), sol: inst(kanatL) };
    return G;
  }

  function leylekKur(o) {
    const N = 260 + (o.tohum % 90), t0 = o.bas * 60, t1 = o.son * 60, D = t1 - t0;
    const Mz = merkez();
    // Termik: meydandan 90–170 m, karanın üstünde.
    let C = null;
    for (let k = 0; k < 24 && !C; k++) {
      const a = kesir("kusC", o.tohum, k) * 6.28, r = 90 + kesir("kusCr", o.tohum, k) * 80, x = Mz[0] + Math.sin(a) * r, z = Mz[1] + Math.cos(a) * r;
      if ((world.height?.(x, z) ?? 1) > 0.5) C = [x, z];
    }
    C ??= [Mz[0], Mz[1]];
    const g0 = gy(C[0], C[1]);
    const B = [];
    for (let i = 0; i < N; i++) {
      const r = 12 + kesir("kusR", o.tohum, i) ** 0.7 * 62, v = 9 + kesir("kusV", o.tohum, i) * 3;
      const ta = t0 + (0.02 + 0.15 * kesir("kusTa", o.tohum, i)) * D, td = t0 + (0.72 + 0.17 * kesir("kusTd", o.tohum, i)) * D;
      const phi = (kesir("kusPhi", o.tohum, i) - 0.5) * 0.5; // geliş yönü sapması (+z = güneye doğru)
      const tx = Math.sin(phi), tz = Math.cos(phi);
      const th0 = Math.atan2(-tx, tz);
      B.push({ r, w: v / r, v, ta, td, th0, tx, tz, h0: g0 + 50 + kesir("kusH0", o.tohum, i) * 70, h1: g0 + 150 + kesir("kusH1", o.tohum, i) * 140,
        dyon: (kesir("kusDy", o.tohum, i) - 0.5) * 0.35, faz: kesir("kusF", o.tohum, i) * 6.28 });
    }
    K = { o, tur: "leylek", C, g0, B, N, t0, t1, D, izleyen: 0 };
    leylekGorunum(N);
    G.g.visible = false;
    // Seyirciler termiğin altında (meydana doğru); kamera yönü: meydandan termiğe bakış (arkada gökyüzü, deniz).
    const k = (world.height?.(Mz[0], Mz[1]) ?? 1) > 0 ? Mz : C;
    K.kal = [lerp(C[0], k[0], 0.5), lerp(C[1], k[1], 0.5)];
    return { odak: [C[0], C[1]], odakY: 120, kalabalik: K.kal, kiyi: null, yon: Math.atan2(K.kal[0] - C[0], K.kal[1] - C[1]), yerAdi: null, zaman: null,
      gitD: 260, gitEgim: 0.12, gitCanli: true, cekimOlcek: 2.6, cekimOlcekH: 1.4, kalabalikArkadan: true };
  }

  /** Termiğin merkezi (rüzgârla yavaşça güneye kayar). */
  const termik = (sec, out) => { out[0] = K.C[0]; out[1] = K.C[1] + Math.max(0, sec - K.t0) * 0.04; return out; };
  const TC = [0, 0];
  /** Bir leyleğin o saniyedeki yeri, yönü, yatışı: p = { x, y, z, yon (yatay), egim, yatis, cirp, gor }. */
  function leylekPoz(b, sec, p) {
    p.gor = false;
    const Lg = 1500, tg = Lg / b.v;
    if (sec < b.ta - tg) return p;
    termik(Math.min(sec, b.td), TC);
    if (sec < b.ta) {
      // Geliş: kuzeyden süzülerek termiğe (giriş noktası dairenin teğetinde).
      const ex = TC[0] + b.r * Math.cos(b.th0), ez = TC[1] + b.r * Math.sin(b.th0), s = (b.ta - sec) * b.v;
      p.x = ex - b.tx * s; p.z = ez - b.tz * s; p.y = b.h0 + s * 0.04;
      p.yon = Math.atan2(b.tx, b.tz); p.egim = -0.04; p.yatis = 0; p.cirp = Math.sin(sec * 0.4 + b.faz) > 0.55 ? 1 : 0; p.gor = true;
      return p;
    }
    const thAt = (s) => b.th0 + b.w * (s - b.ta);
    const hAt = (s) => lerp(b.h0, b.h1, ease((s - b.ta) / (b.td - b.ta)));
    if (sec < b.td) {
      const th = thAt(sec);
      p.x = TC[0] + b.r * Math.cos(th); p.z = TC[1] + b.r * Math.sin(th); p.y = hAt(sec) + Math.sin(sec * 0.2 + b.faz) * 1.5;
      p.yon = Math.atan2(-Math.sin(th), Math.cos(th)); p.egim = 0.04; p.yatis = Math.atan(b.v * b.v / (9.8 * b.r)); p.cirp = 0; p.gor = true; // içe (merkeze) yatar
      return p;
    }
    // Ayrılış: teğetten güneye dönen eğri (20 sn), sonra güneye düz süzülüş; 1,8 km sonra görünmez.
    const th = thAt(b.td), Xx = TC[0] + b.r * Math.cos(th), Xz = TC[1] + b.r * Math.sin(th), Tx = -Math.sin(th), Tz = Math.cos(th);
    const Dx = Math.sin(b.dyon), Dz = Math.cos(b.dyon), tau = 20, s = sec - b.td, h = hAt(b.td);
    const c1x = Xx + Tx * b.v * tau / 2, c1z = Xz + Tz * b.v * tau / 2, c2x = c1x + Dx * b.v * tau / 2, c2z = c1z + Dz * b.v * tau / 2;
    if (s < tau) {
      const u = s / tau, m = 1 - u;
      p.x = m * m * Xx + 2 * m * u * c1x + u * u * c2x; p.z = m * m * Xz + 2 * m * u * c1z + u * u * c2z;
      const dx = 2 * m * (c1x - Xx) + 2 * u * (c2x - c1x), dz = 2 * m * (c1z - Xz) + 2 * u * (c2z - c1z);
      p.yon = Math.atan2(dx, dz); p.yatis = 0.35 * (1 - u);
    } else {
      const d = (s - tau) * b.v;
      if (d > 1800) return p;
      p.x = c2x + Dx * d; p.z = c2z + Dz * d; p.yon = Math.atan2(Dx, Dz); p.yatis = 0;
    }
    p.y = h - s * 0.6; p.egim = -0.05; p.cirp = Math.sin(sec * 0.35 + b.faz) > 0.5 ? 1 : 0; p.gor = true;
    return p;
  }

  const LP = { x: 0, y: 0, z: 0, yon: 0, egim: 0, yatis: 0, cirp: 0, gor: false };
  function leylekUpdate(sec) {
    let n = 0;
    const OL = 1.35; // okunurluk için %35 büyük
    for (let i = 0; i < K.N; i++) {
      const b = K.B[i];
      leylekPoz(b, sec, LP);
      if (!LP.gor) continue;
      E.set(-LP.egim, LP.yon, LP.yatis, "YXZ");
      Q.setFromEuler(E);
      MB.compose(V.set(LP.x, LP.y, LP.z), Q, S1.set(OL, OL, OL));
      G.govde.setMatrixAt(n, MB);
      // Kanat: süzülürken hafif yukarı (dihedral), çırparken gövde ekseninde iner kalkar.
      const ac = LP.cirp ? Math.sin(sec * 5.2 + b.faz) * 0.55 : 0.08 + Math.sin(sec * 0.9 + b.faz) * 0.03;
      G.sag.setMatrixAt(n, MW.multiplyMatrices(MB, M.makeRotationZ(ac).setPosition(0.1, 0.05, 0.05)));
      G.sol.setMatrixAt(n, MW.multiplyMatrices(MB, M.makeRotationZ(-ac).setPosition(-0.1, 0.05, 0.05)));
      n++;
    }
    for (const m of [G.govde, G.sag, G.sol]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }

  // ------------------------------------------------------------------ kartal
  function kartalGorunum() {
    if (G?.kartal) return G;
    const g = new THREE.Group(); group.add(g);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const kahve = "#3b2414", beyaz = "#f3f1ea", sari = "#f0b323";
    const govde = new THREE.Mesh(birlestir([
      { geo: new THREE.BoxGeometry(0.3, 0.26, 0.62), renk: kahve },
      { geo: new THREE.BoxGeometry(0.2, 0.2, 0.2), pos: [0, 0.07, 0.4], renk: beyaz },
      { geo: new THREE.BoxGeometry(0.07, 0.08, 0.12), pos: [0, 0.04, 0.54], rot: [0.3, 0, 0], renk: sari },
      { geo: new THREE.BoxGeometry(0.34, 0.03, 0.34), pos: [0, 0, -0.45], renk: beyaz },
    ]), mat);
    const ayak = new THREE.Mesh(birlestir([
      { geo: new THREE.BoxGeometry(0.05, 0.22, 0.05), pos: [0.07, -0.11, 0], renk: sari },
      { geo: new THREE.BoxGeometry(0.05, 0.22, 0.05), pos: [-0.07, -0.11, 0], renk: sari },
      { geo: new THREE.BoxGeometry(0.1, 0.03, 0.12), pos: [0.07, -0.22, 0.03], renk: "#222" },
      { geo: new THREE.BoxGeometry(0.1, 0.03, 0.12), pos: [-0.07, -0.22, 0.03], renk: "#222" },
    ]), mat);
    ayak.position.set(0, -0.08, 0.05);
    const kS = new THREE.Mesh(kanatGeo(1.05, 0.5, 0.42, kahve, "#2a190e", 5), mat), kL = new THREE.Mesh(kanatGeo(1.05, 0.5, 0.42, kahve, "#2a190e", 5).scale(-1, 1, 1), mat);
    kS.position.set(0.12, 0.06, 0.04); kL.position.set(-0.12, 0.06, 0.04);
    const balik = new THREE.Mesh(birlestir([
      { geo: new THREE.BoxGeometry(0.09, 0.07, 0.38), renk: "#b9c6cf" },
      { geo: new THREE.BoxGeometry(0.02, 0.12, 0.1), pos: [0, 0, -0.22], renk: "#8b98a3" },
    ]), mat);
    balik.position.set(0, -0.36, 0.02);
    const kus = new THREE.Group();
    kus.add(govde, ayak, kS, kL, balik);
    // Su sıçraması: damlacıklar (Points) ve genişleyen halka.
    const SN = 140, sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SN * 3), 3));
    const sicrama = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: "#f4fbff", size: 0.7, transparent: true, opacity: 0.95, depthWrite: false }));
    sicrama.frustumCulled = false;
    const halka = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false }));
    g.add(kus, sicrama, halka);
    g.visible = false;
    G = { g, kartal: true, kus, govde, ayak, kS, kL, balik, sicrama, sGeo, SN, halka };
    return G;
  }

  function kartalKur(o) {
    const isk = world.places?.iskele?.anchors;
    if (!isk?.length) return null;
    // İskelenin ucu ve açığı: en derin yön (16 yön, 50 m).
    const P = isk[Math.floor(isk.length / 2)], uc = isk[isk.length - 1];
    let en = null;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.283, h = world.height(uc[0] + Math.sin(a) * 55, uc[1] + Math.cos(a) * 55); if (!en || h < en.h) en = { a, h }; }
    if (!en || en.h > -1) return null;
    const dx = Math.sin(en.a), dz = Math.cos(en.a);
    const Wp = [uc[0] + dx * 48 + dz * 14 * (o.tohum & 1 ? 1 : -1), uc[1] + dz * 48 - dx * 14 * (o.tohum & 1 ? 1 : -1)];
    // Konacağı ağaç: iskeleye en yakın, kıyıda (40 m içinde su), boyu ≥ 8 m.
    const suYakin = (x, z) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; if (world.height(x + Math.sin(a) * 40, z + Math.cos(a) * 40) < 0) return true; } return false; };
    const agac = agaclar(world, scene).filter((t) => t.h >= 8 && Math.hypot(t.x - P[0], t.z - P[1]) < 260 && world.height(t.x, t.z) > 0.5 && suYakin(t.x, t.z))
      .sort((a, b) => Math.hypot(a.x - P[0], a.z - P[1]) - Math.hypot(b.x - P[0], b.z - P[1]))[0];
    if (!agac) return null;
    const t0 = o.bas * 60, t1 = o.son * 60, D = t1 - t0;
    // Dalış "dalis" evresinin (0,14) başından tam 150 sn sonra: video "olay:dalis+2.45" o anı yakalar (süreden bağımsız).
    const T = { gel: t0 + 0.04 * D, alcal: t0 + 0.14 * D, dal: t0 + 0.14 * D + 150, kon: t0 + 0.3 * D, kalk: t0 + 0.86 * D };
    T.su = T.dal + 5; T.cik = T.su + 8; T.son = T.kon - 25;
    const tepe = [agac.x, agacTepe(scene, agac.x, agac.z, agac.y + agac.h * 0.9) + 0.1, agac.z]; // taç tepesi (ışınla)
    // Kaçış yönü (uzaklaşma): karaya doğru, iskeleden uzağa.
    const kac = Math.atan2(-dx, -dz) + (kesir("kartalKac", o.tohum) - 0.5) * 1.2;
    const sp = Wp; // daire merkezi (koyun üstü)
    const izl = isk.map((a) => [a[0], a[1]]);
    K = { o, tur: "kartal", P, uc, Wp: sp, agac, tepe, T, t0, t1, D, kac, izl, deniz: [dx, dz], izleyen: 0, kalanDk: Math.round((T.kalk - T.kon) / 60) };
    // Yer adı: iskeleye en yakın etiket (≤ 120 m), yoksa "the fishing pier".
    const et = (world.labels ?? []).map((l) => ({ l, d: Math.hypot(l.x - P[0], l.z - P[1]) })).filter((q) => q.d < 120).sort((a, b) => a.d - b.d)[0];
    K.yer = et ? `the ${et.l.text.replace(/^The /, "")}` : "the fishing pier";
    kartalGorunum();
    G.g.visible = false;
    const kal = [P[0], P[1]];
    // Kalabalık çekimi yüzlerden (kalabalikArkadan yok): arkadan çekimde kamera koyun üstündeki boş gökyüzüne bakıyordu.
    return { odak: [sp[0], sp[1]], odakY: 3, kalabalik: kal, kiyi: [P[0], P[1]], yon: Math.atan2(P[0] - sp[0], P[1] - sp[1]), yerAdi: K.yer, zaman: null,
      gitD: 75, gitEgim: 0.3, gitCanli: true, cekimOlcek: 0.55, cekimOlcekH: 0.6, kalabalikArkadan: false };
  }

  /** Kartalın duruşu: p = { x, y, z, yon, egim, yatis, kanat (0 kapalı … 1 açık), cirp, ayak (0 toplu … 1 uzanık), balik, gor }. */
  function kartalPoz(sec, p) {
    const { T, Wp, tepe } = K;
    p.gor = sec >= K.t0 && sec <= K.t1; p.kanat = 1; p.cirp = 0; p.ayak = 0; p.balik = sec >= T.su; p.egim = 0; p.yatis = 0; p.sicrama = sec - T.su;
    const daire = (s, r, h, w0 = 0.32) => {
      const th = s * (6.5 / r) * w0 + 1.3; // ~6,5 m/sn süzülüş
      p.x = Wp[0] + r * Math.cos(th); p.z = Wp[1] + r * Math.sin(th); p.y = h;
      p.yon = Math.atan2(-Math.sin(th), Math.cos(th)); p.yatis = 0.38;
      return th;
    };
    if (sec < T.gel) {
      // Geliş: karadan yüksekten süzülerek koya (daireye giriş noktasına).
      daire(T.gel - K.t0, 42, 70);
      const ex = p.x, ez = p.z, u = (T.gel - sec) / (T.gel - K.t0), a = K.kac;
      p.x = ex + Math.sin(a) * 520 * u; p.z = ez + Math.cos(a) * 520 * u; p.y = 70 + 60 * u; p.yon = a + Math.PI; p.yatis = 0;
      p.cirp = Math.sin(sec * 0.5) > 0.6 ? 1 : 0;
      return p;
    }
    if (sec < T.dal) {
      const u = (sec - T.gel) / (T.dal - T.gel);
      daire(sec - K.t0, lerp(42, 26, u), lerp(70, 22, ease(u)));
      return p;
    }
    if (sec < T.cik) {
      // Dalış: dairenin noktasından suya (5 sn), pençeler öne; suya değer, kanat çırparak kalkar.
      daire(T.dal - K.t0, 26, 22);
      const ax = p.x, az = p.z, sx = Wp[0], sz = Wp[1];
      if (sec < T.su) {
        const u = (sec - T.dal) / (T.su - T.dal), e = u * u;
        p.x = lerp(ax, sx, u); p.z = lerp(az, sz, u); p.y = lerp(22, 0.5, e); p.yon = Math.atan2(sx - ax, sz - az); p.egim = -0.5 * (1 - u) + 0.3 * u; p.yatis = 0;
        p.kanat = 0.55 + 0.45 * u; p.ayak = clamp01((u - 0.5) * 2);
      } else {
        const u = (sec - T.su) / (T.cik - T.su);
        p.x = sx + Math.sin(K.kac) * 30 * u; p.z = sz + Math.cos(K.kac) * 30 * u; p.y = 0.5 + 14 * ease(u); p.yon = K.kac; p.egim = 0.3 * (1 - u); p.cirp = 1; p.ayak = 1 - u;
      }
      return p;
    }
    if (sec < T.son) {
      // Balıkla bir tur daha döner, sonra ağaca.
      const u = (sec - T.cik) / (T.son - T.cik);
      daire(sec - K.t0, 34, lerp(15, 30, ease(u)));
      return p;
    }
    if (sec < T.kon) {
      daire(T.son - K.t0, 34, 30);
      const ax = p.x, ay = p.y, az = p.z, u = (sec - T.son) / (T.kon - T.son), e = ease(u);
      p.x = lerp(ax, tepe[0], e); p.z = lerp(az, tepe[2], e); p.y = lerp(ay, tepe[1], e) + Math.sin(u * Math.PI) * 4;
      p.yon = Math.atan2(tepe[0] - ax, tepe[2] - az); p.yatis = 0; p.egim = u > 0.8 ? 0.5 : 0; p.cirp = u > 0.75 ? 1 : 0; p.ayak = u > 0.7 ? 1 : 0;
      return p;
    }
    if (sec < T.kalk) {
      // Ağaçta: kanatlar kapalı, balığı ayağının altında tutup yer (baş iner kalkar); arada kanatlarını açıp gerinir.
      p.x = tepe[0]; p.y = tepe[1]; p.z = tepe[2]; p.yon = K.kac + Math.PI + Math.sin(sec * 0.05) * 0.4;
      const gerin = ((sec - T.kon) % 95) < 3;
      p.kanat = gerin ? 0.9 : 0; p.ayak = 1; p.egim = Math.sin(sec * 1.7) > 0.2 ? 0.05 : 0.5; // dik oturur, eğilip yer p.balik = (sec - T.kon) < (T.kalk - T.kon) * 0.8;
      p.yer = true;
      return p;
    }
    // Uzaklaşma: ağaçtan atılıp kanat çırparak yükselir, karaya doğru genişleyen dairelerle süzülür.
    const s = sec - T.kalk, a = K.kac;
    const r = 30 + s * 0.4, th = s * 0.12;
    p.x = tepe[0] + Math.sin(a) * s * 5 + r * Math.cos(th) - r; p.z = tepe[2] + Math.cos(a) * s * 5 + r * Math.sin(th); p.y = tepe[1] + s * 0.9;
    p.yon = a + th * 0.3; p.cirp = s < 8 ? 1 : 0; p.yatis = -0.2; p.ayak = s < 2 ? 1 : 0; p.balik = false;
    return p;
  }

  const KP = { x: 0, y: 0, z: 0, yon: 0, egim: 0, yatis: 0, kanat: 1, cirp: 0, ayak: 0, balik: false, gor: false, yer: false, sicrama: -1 };
  function kartalUpdate(sec) {
    KP.yer = false;
    kartalPoz(sec, KP);
    G.kus.visible = KP.gor;
    const OL = 1.5;
    G.kus.position.set(KP.x, KP.y, KP.z);
    G.kus.rotation.set(-KP.egim, KP.yon, KP.yatis, "YXZ");
    G.kus.scale.setScalar(OL);
    // Kanat: açık (yatay) / kapalı (gövdeye katlanmış, aşağı); çırpma.
    const kap = 1 - KP.kanat;
    const ac = KP.cirp ? Math.sin(sec * 6.5) * 0.7 : 0.06;
    G.kS.rotation.set(0, kap * 1.25, ac - kap * 1.1); G.kL.rotation.set(0, -kap * 1.25, -ac + kap * 1.1);
    G.kS.scale.x = G.kL.scale.x = 1 - kap * 0.45;
    G.ayak.rotation.x = KP.yer ? 0 : KP.ayak ? -1.0 : 0.9; // ağaçta dik, dalışta/konarken öne uzanık, uçarken geriye toplu
    G.balik.visible = KP.balik;
    // Sıçrama: suya değdiği an (3 sn).
    const s = KP.sicrama, sAcik = s > -0.2 && s < 3;
    G.sicrama.visible = G.halka.visible = sAcik;
    if (sAcik) {
      const a = G.sGeo.attributes.position.array, t = Math.max(0, s);
      for (let i = 0; i < G.SN; i++) {
        const ang = kesir("kartalS", K.o.tohum, i) * 6.283, hz = 0.6 + kesir("kartalS2", K.o.tohum, i) * 2.2, vy = 3 + kesir("kartalS3", K.o.tohum, i) * 6;
        a[i * 3] = K.Wp[0] + Math.sin(ang) * hz * t; a[i * 3 + 1] = Math.max(0, 0.1 + vy * t - 4.9 * t * t); a[i * 3 + 2] = K.Wp[1] + Math.cos(ang) * hz * t;
      }
      G.sGeo.attributes.position.needsUpdate = true;
      G.sicrama.material.opacity = 0.9 * (1 - t / 3);
      G.halka.position.set(K.Wp[0], 0.08, K.Wp[1]); G.halka.scale.setScalar(1.2 + t * 2.8); G.halka.material.opacity = 0.6 * (1 - t / 3);
    }
  }

  // ------------------------------------------------------------------ ortak arayüz
  function kur(o) { return TUR === "kartal" ? kartalKur(o) : leylekKur(o); }

  function update(o, evre, minute) {
    if (!o || !K || K.o !== o) { if (G) G.g.visible = false; if (K && !o) K = null; return; }
    const sec = minute * 60, gor = sec >= K.t0 && sec <= K.t1;
    G.g.visible = gor;
    if (!gor) return;
    if (K.tur === "leylek") leylekUpdate(sec); else kartalUpdate(sec);
  }

  /** Hareketli hedef: leylekte termiğin ortası (sürünün o anki ortalama yüksekliği), ayrılışta sürünün ortası;
   *  kartalda kuşun kendisi. */
  let sonDk = null, sonC = null; // aynı karede seyircilerin her biri yeniden hesaplamasın
  function canli(minute) {
    if (!K) return null;
    if (minute === sonDk && sonC?.K === K) return sonC.v;
    const v = canli0(minute);
    sonDk = minute; sonC = { K, v };
    return v;
  }
  function canli0(minute) {
    const sec = minute * 60;
    if (sec < K.t0 || sec > K.t1) return null;
    if (K.tur === "kartal") { kartalPoz(sec, KP); return [KP.x, KP.y + 0.3, KP.z]; }
    // Termiğe 500 m'den yakın kuşların ortası (uzaktan gelen ve giden uçlar ortalamayı kaydırmasın); yoksa öndeki grup.
    termik(sec, TC);
    const t0x = TC[0], t0z = TC[1];
    let sx = 0, sy = 0, sz = 0, n = 0, fx = 0, fy = 0, fz = 0, fn = 0;
    for (let i = 0; i < K.N; i += 3) {
      leylekPoz(K.B[i], sec, LP);
      if (!LP.gor) continue;
      if (Math.hypot(LP.x - t0x, LP.z - t0z) < 500) { sx += LP.x; sy += LP.y; sz += LP.z; n++; } else { fx += LP.x; fy += LP.y; fz += LP.z; fn++; }
    }
    if (n >= 6) return [sx / n, sy / n, sz / n];
    if (fn) return [fx / fn, fy / fn, fz / fn];
    return [t0x, K.g0 + 120, t0z];
  }

  function gorev(people, day, S, plans) {
    if (!K) return [];
    const { o } = K;
    if (K.tur === "leylek") {
      // Termiğin altındaki meydan ve sokaklarda: gelenler başlarını kaldırıp bakar, telefonla çeker, gösterir.
      const T0 = o.bas + 0.12 * (o.son - o.bas);
      const a = adaylar(people, day, plans, world, { T: T0, odak: K.kal, isR: 160, uzak: 1.4 });
      const y = yerlerSec(world, null, K.kal, [K.C[0], K.C[1]], Math.min(34, a.length), 0, 30, o.tohum, { kiyida: true, yay: 6.28, araliK: 1.2 });
      const g = gorevler(people, day, a, y, { T0, dagilim: 8, kal: [10, 22], Tson: o.son, modul: "kus", tavirlar: ["cek", "siper", "goster", "bak", "cek", "sasir"], tuz: "k" });
      K.izleyen = g.length;
      return g;
    }
    // Kartal: iskelede (dar iskele: yerler iskele boyunca) izleyenler.
    const T0 = o.bas + 0.06 * (o.son - o.bas);
    const a = adaylar(people, day, plans, world, { T: T0, odak: K.P, isR: 300, uzak: 3, disari: true });
    const yerler = [];
    for (let k = 0; k < 60 && yerler.length < 12; k++) {
      const q = K.izl[k % K.izl.length], x = q[0] + (kesir("kartalY", o.tohum, k) - 0.5) * 2.2, z = q[1] + (kesir("kartalY2", o.tohum, k) - 0.5) * 2.5;
      if (!world.isWalkable?.(x, z) || yerler.some((p) => Math.hypot(p.x - x, p.z - z) < 1)) continue;
      yerler.push({ x, z, heading: Math.atan2(K.Wp[0] - x, K.Wp[1] - z), look: K.Wp });
    }
    const g = gorevler(people, day, a, yerler, { T0, dagilim: 5, kal: [18, 30], Tson: o.son, modul: "kus", tavirlar: ["cek", "goster", "bak", "siper", "cek"], tuz: "k" });
    K.izleyen = g.length;
    return g;
  }

  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    if (!K) return false;
    let h = canli(minute);
    if (K.tur === "leylek" && h) { const sp = (it.x * 7 + it.z * 3) % 40; h = [h[0] + sp - 20, h[1], h[2] + ((it.x * 3) % 30) - 15]; }
    return izleDurus(it, t, p, ph, stand, idleGesture, h, gy(it.x, it.z));
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const sec = minute * 60, n = K.izleyen;
    if (K.tur === "kartal") {
      const { T } = K, Y = K.yer;
      const izle = n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} watched from ${Y}.` : "";
      const gitYon = pusula(K.kac, "en");
      let u = `At ${saatYaz(o.bas)} a bald eagle appeared over the water by ${Y} and began circling low over the bay.`;
      if (sec >= T.su) u += ` At ${saatYaz(T.su / 60)} it dove into the water and came up with a fish in its talons.`;
      if (sec >= T.kon) u += ` It landed at the top of a tall tree on the shore to eat it.`;
      if (sec >= T.kalk + 10) u += ` After ${K.kalanDk} minutes in the tree it flew off to the ${gitYon}.`;
      const kisa = sec < T.su ? "A bald eagle over the bay!" : sec < T.kon ? "Eagle catches a fish!" : sec < T.kalk ? "Bald eagle in a tree by the water" : minute < o.son ? "The eagle flies off" : `Bald eagle ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`;
      return { kisa, uzun: u + izle };
    }
    const T1 = K.t0 + 0.15 * K.D, T2 = K.t0 + 0.72 * K.D;
    const izle = n ? ` ${n} kişi başını kaldırıp izledi.` : "";
    let u = `Saat ${saatte(o.bas)} adaya kuzeyden ${K.N} leylek geldi; sürü adanın üstünde termikte daire çizerek yükseliyor.`;
    if (sec >= T2) u = `Saat ${saatte(o.bas)} adaya kuzeyden ${K.N} leylek geldi ve adanın üstünde termikte daire çizerek yükseldi. Saat ${saatte(T2 / 60)}n itibaren sürü güneye, denizin üstünden uzaklaştı.`; // bulunma eki + n = ayrılma eki ('ta → 'tan)
    const kisa = sec < T1 ? "Leylekler geliyor!" : sec < T2 ? `Adanın üstünde ${K.N} leylek!` : minute < o.son ? "Leylekler güneye gidiyor" : `Bugün leylekler geçti · ${saatYaz(o.bas)}`;
    return { kisa, uzun: u + izle };
  }

  return { kur, update, canli, yazi, gorev, durus, seyirci: { r0: 10, r1: 30, isR: 0, uzak: 1, en: 0 } };
}
