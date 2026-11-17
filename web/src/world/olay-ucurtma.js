// Uçurtma şenliği (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// Açık bir alanda (Mercanada Tepe; Driftwood Town Green; olay-ayar.js UCURTMA) sakinler toplanıp uçurtma uçurur; kenarlara
// kazıkla bağlı büyük gösteri uçurtmaları (dev delta, ahtapot, balık) da havalanır. Şenliğin ortasında bir uçurtma rüzgâr
// altındaki ağaca takılır; sahibi ağacın dibine yürüyüp ipini çekerek kurtarır, yeniden uçurur. Rüzgâr, ipler ve uçurtma
// salınımı (dakika, tohum) işlevidir: video günün her saniyesini aynı çizer.
import * as THREE from "three";
import { DIL, UCURTMA as YER } from "./olay-ayar.js";
import { kesir } from "./olay-plan.js";
import { adaylar, gorevler, yerlerSec, izleDurus, agaclar, agacIzgara, agacTepe } from "./olay-izleyici.js";

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const RENK = ["#e63946", "#f4a261", "#f6c90e", "#2a9d8f", "#277da1", "#8e44ad", "#ff6fb5", "#43aa8b", "#ff7b00", "#1d3557", "#9be564", "#00b4d8"];
const AGAC_TR = { cam: ["çam", "çama"], servi: ["servi", "serviye"], cinar: ["çınar", "çınara"], zeytin: ["zeytin ağacı", "zeytin ağacına"], palmiye: ["palmiye", "palmiyeye"] };
const AGAC_EN = { akcaagac: "a maple", mese: "an oak", camk: "a pine", servi: "a cedar" };
const MAKS_EL = 40, MAKS_GOS = 20, KURDELE = 520, IP_PARCA = 8;

/** Kaçıncı uçurtma türü: 0 baklava (kuyruklu), 1 delta; gösteri: 2 dev delta (iki uzun kuyruk), 3 ahtapot, 4 balık. */
function geoBaklava() {
  const g = new THREE.BufferGeometry();
  const P = [0, 0.55, 0, 0.42, 0.08, 0, 0, 0.08, 0, 0.42, 0.08, 0, 0, -0.62, 0, 0, 0.08, 0, 0, -0.62, 0, -0.42, 0.08, 0, 0, 0.08, 0, -0.42, 0.08, 0, 0, 0.55, 0, 0, 0.08, 0];
  const C = []; for (let t = 0; t < 4; t++) for (let k = 0; k < 3; k++) C.push(...(t % 2 ? [0.72, 0.72, 0.72] : [1, 1, 1]));
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}
function geoDelta(s = 1) {
  const g = new THREE.BufferGeometry();
  const P = [0, 0.5, 0, -0.78, -0.36, 0, 0, -0.2, 0.06, 0, 0.5, 0, 0, -0.2, 0.06, 0.78, -0.36, 0].map((v) => v * s);
  const C = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75];
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}
function geoAhtapot() {
  const g = new THREE.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  const n = g.attributes.position.count, C = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) { const y = g.attributes.position.getY(i); const c = y > 0.9 ? 1 : 0.8; for (let k = 0; k < 3; k++) C.set([c, c, c], (i + k) * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(C, 3));
  // Gözler: kubbenin önünde iki beyaz-siyah disk.
  return g.rotateX(-Math.PI / 2); // kubbe +z'ye (rüzgâra karşı) bakar
}
function geoBalik() {
  const g = new THREE.ConeGeometry(0.75, 4.2, 10, 4, true).toNonIndexed();
  const n = g.attributes.position.count, C = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) { const y = g.attributes.position.getY(i); const c = Math.floor((y + 2.1) / 1.05) % 2 ? 1 : 0.7; for (let k = 0; k < 3; k++) C.set([c, c, c], (i + k) * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g.rotateX(Math.PI / 2); // ağız +z (rüzgâra karşı), kuyruk -z
}

export function buildUcurtmaOlay({ world, scene, group }) {
  let K = null, G = null;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1), AY = new THREE.Vector3(0, 1, 0);
  const X = new THREE.Vector3(), Yk = new THREE.Vector3(), Nk = new THREE.Vector3(), d1 = new THREE.Vector3(), Wv = new THREE.Vector3();
  const CL = new THREE.Color();

  function gorunum() {
    if (G) return G;
    const g = new THREE.Group();
    group.add(g);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    const inst = (geo, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); m.frustumCulled = false; m.count = 0; g.add(m); return m; };
    const baklava = inst(geoBaklava(), MAKS_EL), delta = inst(geoDelta(), MAKS_EL), dev = inst(geoDelta(3.4), MAKS_GOS), ahtapot = inst(geoAhtapot(), MAKS_GOS), balik = inst(geoBalik(), MAKS_GOS);
    const kurdele = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1, 0.02).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), KURDELE);
    kurdele.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(KURDELE * 3).fill(1), 3); kurdele.frustumCulled = false; kurdele.count = 0;
    const kazik = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.35, 0.35).translate(0, 0.17, 0), new THREE.MeshStandardMaterial({ color: "#b8a27a", roughness: 1 }), MAKS_GOS);
    kazik.count = 0;
    const ipGeo = new THREE.BufferGeometry();
    ipGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((MAKS_EL + MAKS_GOS) * IP_PARCA * 6), 3));
    const ip = new THREE.LineSegments(ipGeo, new THREE.LineBasicMaterial({ color: "#f2f2ee", transparent: true, opacity: 0.55 }));
    ip.frustumCulled = false;
    g.add(kurdele, kazik, ip);
    g.visible = false;
    return (G = { g, baklava, delta, dev, ahtapot, balik, kurdele, kazik, ip, ipGeo });
  }

  function kur(o) {
    const iz = agacIzgara(agaclar(world, scene));
    let T, alanR, ic = 3;
    if (YER.yer === "cimen") {
      const c = (world.plazas ?? []).find((p) => p.kind === "cimen" && p.x0 != null);
      if (!c) return null;
      T = [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2]; alanR = Math.min(c.x1 - c.x0, c.z1 - c.z0) / 2 - 4; ic = 18;
    } else {
      T = world.placeOf?.("tepe")?.anchors?.[0];
      if (!T) return null;
      alanR = 22;
    }
    const gy = (x, z) => world.groundY?.(x, z) ?? 0;
    // Takılacak ağaç: alanın kenarında, boyu ≥ 8 m; rüzgâr alandan ağaca doğru esiyor (uçurtmalar o yana uçar).
    // Tek başına duran (7 m içinde en çok bir komşusu olan) ağaç yeğlenir: takılan uçurtma koruda kaybolmasın.
    const kalabalik = (t) => iz.yakin(t.x, t.z, 7).length - 1;
    const ag = iz.yakin(T[0], T[1], alanR + 34).filter((t) => t.h >= 8 && Math.hypot(t.x - T[0], t.z - T[1]) > alanR * 0.55)
      .map((t) => ({ t, k: Math.min(3, kalabalik(t)) + kesir("ucAgac", o.tohum, Math.round(t.x), Math.round(t.z)) }))
      .sort((a, b) => a.k - b.k).map((q) => q.t);
    const agac = ag[0] ?? null;
    const aw = agac ? Math.atan2(agac.x - T[0], agac.z - T[1]) + (kesir("ucRuz", o.tohum) - 0.5) * 0.5 : kesir("ucRuz", o.tohum) * 6.28;
    const W = [Math.sin(aw), Math.cos(aw)], N = [W[1], -W[0]];
    // Sakinlerin duracağı yerler (gorev doldurur): alanın içinde, rüzgârın üstüne doğru kaymış, 3,5 m aralıklı.
    const yerler = [];
    for (let t = 0; yerler.length < MAKS_EL && t < 900; t++) {
      const a = kesir("ucYerA", o.tohum, t) * Math.PI * 2, r = ic + Math.sqrt(kesir("ucYerR", o.tohum, t)) * (alanR - ic);
      const x = T[0] + Math.sin(a) * r - W[0] * alanR * 0.25, z = T[1] + Math.cos(a) * r - W[1] * alanR * 0.25;
      if (!world.isWalkable?.(x, z) || iz.yakin(x, z, 3).length) continue;
      if (agac && Math.hypot(x - agac.x, z - agac.z) < 10) continue;
      if (yerler.some((q) => Math.hypot(q.x - x, q.z - z) < 3.5)) continue;
      yerler.push({ x, z, heading: aw });
    }
    // Sahip: ağacın rüzgâr üstünde ~20 m (uçurtması tam ağacın üstünde uçar); ilk yer o.
    let sahip = null;
    if (agac) for (let t = 0; t < 40 && !sahip; t++) {
      const d = 18 + t * 0.4, yan = (kesir("ucSahip", o.tohum, t) - 0.5) * 6;
      const x = agac.x - W[0] * d + N[0] * yan, z = agac.z - W[1] * d + N[1] * yan;
      if (world.isWalkable?.(x, z) && !iz.yakin(x, z, 3).length && !yerler.slice(0, 3).some((q) => Math.hypot(q.x - x, q.z - z) < 3.5)) sahip = { x, z, heading: aw, sahip: true };
    }
    if (sahip) yerler.unshift(sahip);
    // Gösteri uçurtmaları: rüzgâra dik iki yanda, alanın kenarında kazıklar.
    const nG = YER.yer === "cimen" ? 18 : 10, gos = []; // Driftwood: az sakin, gösteri uçurtması çok
    for (let t = 0; gos.length < nG && t < 900; t++) {
      const yan = t % 2 ? 1 : -1, r = alanR * (0.7 + kesir("ucGos", o.tohum, t) * 0.7), u = (kesir("ucGosU", o.tohum, t) - 0.5) * alanR;
      const x = T[0] + N[0] * yan * r + W[0] * u, z = T[1] + N[1] * yan * r + W[1] * u;
      if (!world.isWalkable?.(x, z) || iz.yakin(x, z, 4).length) continue;
      if (gos.some((q) => Math.hypot(q.x - x, q.z - z) < 7) || yerler.slice(0, 30).some((q) => Math.hypot(q.x - x, q.z - z) < 3)) continue;
      const tur = 2 + (gos.length % 3);
      gos.push({ x, z, y: gy(x, z) + 0.35, tur, L: 48 + kesir("ucGosL", o.tohum, t) * 18, el: 0.62 + kesir("ucGosE", o.tohum, t) * 0.18, renk: RENK[Math.floor(kesir("ucGosR", o.tohum, t) * RENK.length)], faz: kesir("ucGosF", o.tohum, t) * 6.28,
        t0: o.bas + (0.03 + 0.06 * kesir("ucGosT", o.tohum, t)) * (o.son - o.bas), t1: o.son - 1 - 2 * kesir("ucGosT1", o.tohum, t) });
    }
    const D = o.son - o.bas;
    K = { o, T, W, N, aw, alanR, agac, yerler, gos, ucan: [], D, tS: o.bas + 0.5 * D, tK: o.bas + 0.76 * D, izleyen: 0, gy,
      odak: [T[0] + W[0] * 12, T[1] + W[1] * 12] };
    if (agac) {
      K.tepe = [agac.x - W[0] * 1.6, agacTepe(scene, agac.x - W[0] * 1.6, agac.z - W[1] * 1.6, agac.y + agac.h * 0.9) + 0.2, agac.z - W[1] * 1.6]; // tacın uçana bakan üst kenarı (görünür)
      K.agacAd = DIL === "en" ? (() => { const f = (world.features ?? []).find((q) => q.type === "agac" && Math.hypot(q.x - agac.x, q.z - agac.z) < 1.5); return AGAC_EN[f?.tur ?? agac.tur] ?? "a tree"; })() : AGAC_TR[agac.tur] ?? ["ağaç", "ağaca"];
    }
    gorunum();
    for (const m of [G.baklava, G.delta, G.dev, G.ahtapot, G.balik]) m.count = 0;
    G.kazik.count = gos.length;
    gos.forEach((q, k) => G.kazik.setMatrixAt(k, M4.compose(V.set(q.x, gy(q.x, q.z), q.z), Q.setFromAxisAngle(AY, aw), SC.set(1, 1, 1))));
    G.kazik.instanceMatrix.needsUpdate = true;
    const yon = Math.atan2(N[0] - W[0] * 0.55, N[1] - W[1] * 0.55);
    return { odak: K.odak, odakY: 14, kalabalik: [T[0] - W[0] * 4, T[1] - W[1] * 4], kiyi: null, yon, yerAdi: YER.ad, zaman: null,
      gitD: 95, gitEgim: 0.35, gitCanli: true, kalabalikArkadan: true, cekimOlcek: 1.4, cekimOlcekH: 0.9 };
  }

  /** Uçanlar ve izleyiciler (gorev): uçanlar şenliğin ilk %12'sinde gelir, sonuna dek kalır. */
  function gorev(people, day, S, plans) {
    if (!K) return [];
    const { o, D } = K, haric = new Set();
    const a1 = adaylar(people, day, plans, world, { T: o.bas + 2, odak: K.T, isR: 0, uzak: YER.yer === "cimen" ? 4 : 3.2, haric, sure: 15 });
    const n1 = Math.min(a1.length, K.yerler.length, YER.yer === "cimen" ? 14 : 26);
    const g1 = gorevler(people, day, a1, K.yerler.slice(0, n1), { T0: o.bas + 0.5, dagilim: Math.round(D * 0.1), kal: [Math.round(D * 0.78), Math.round(D * 0.9)], Tson: o.son - 0.5, modul: "ucurtma", ek: { rol: "ucan" }, tuz: "u1" });
    // Sahip (ilk yer) en geç kurtarmadan 8 dk sonrasına dek kalmalı; kalmıyorsa sahiplik düşer.
    const sahipG = g1.find((g) => g.item.sahip);
    if (sahipG && sahipG.T1 < K.tK + 8) sahipG.T1 = Math.min(o.son - 0.5, K.tK + 9);
    K.ucan = g1.map((g, k) => {
      const r = kesir("ucK", o.tohum, k);
      return { x: g.item.x, z: g.item.z, gy: K.gy(g.item.x, g.item.z), T0: g.T0, T1: g.T1, sahip: !!g.item.sahip && sahipG?.T0 < K.tS - 3, tur: r < 0.55 ? 0 : 1, renk: RENK[Math.floor(kesir("ucR", o.tohum, k) * RENK.length)],
        renk2: RENK[Math.floor(kesir("ucR2", o.tohum, k) * RENK.length)], L: 26 + kesir("ucL", o.tohum, k) * 16, el: 0.78 + kesir("ucE", o.tohum, k) * 0.2, faz: kesir("ucF", o.tohum, k) * 6.28 };
    });
    g1.forEach((g, k) => { haric.add(g.i); g.item.k = k; });
    if (!K.ucan.some((u) => u.sahip)) K.agacOlay = false; else K.agacOlay = !!K.agac;
    // İzleyiciler: alanın kenarında, gökyüzüne bakarak.
    const a2 = adaylar(people, day, plans, world, { T: o.bas + 8, odak: K.T, isR: 120, uzak: 1.6, haric });
    const y2 = yerlerSec(world, null, [K.T[0] - K.W[0] * (K.alanR + 6), K.T[1] - K.W[1] * (K.alanR + 6)], K.odak, Math.min(12, a2.length), 3, 12, o.tohum + 3, { kiyida: true, yay: 2.4 });
    const g2 = gorevler(people, day, a2, y2, { T0: o.bas + 5, dagilim: 12, kal: [10, 20], Tson: o.son, modul: "ucurtma", tavirlar: ["cek", "goster", "bak", "konus", "siper"], ek: { rol: "izle" }, tuz: "u2" });
    K.izleyen = g2.length;
    return [...g1, ...g2];
  }

  /** Uçurtmanın o saniyedeki yeri (u: uçan kaydı, sec): { x, y, z, roll, gor, L (ip boyu), takili }. */
  const KP = { x: 0, y: 0, z: 0, roll: 0, gor: false, takili: false, elde: false };
  function kitePoz(u, minute, out) {
    const sec = minute * 60, { W, N } = K;
    out.gor = false; out.takili = false; out.elde = false;
    const ac = u.T0 + 0.6, kapan = u.T1 - 0.4;
    if (minute < ac || minute > kapan) return out;
    let f = Math.min(ease((minute - ac) / 1.3), ease((kapan - minute) / 1.1)); // ip boyu oranı (yükselme/sarma)
    if (u.sahip && K.agacOlay) {
      const yeni = K.tK + 1.7; // kurtarıldıktan sonra yerine dönüp yeniden uçurur
      if (minute > K.tK + 0.35 && minute < yeni) { out.gor = true; out.elde = true; return out; }
      if (minute >= yeni) f = Math.min(f, ease((minute - yeni) / 1.3));
    }
    const L = u.L * (0.12 + 0.88 * f), el = 0.25 + (u.el - 0.25) * f;
    const sw = Math.sin(sec * 0.31 + u.faz) * 3.2 + Math.sin(sec * 0.83 + u.faz * 2) * 1.1;
    const hd = L * Math.cos(el), ht = L * Math.sin(el) + Math.sin(sec * 0.57 + u.faz) * 0.9 * f;
    out.x = u.x + W[0] * hd + N[0] * sw * f; out.z = u.z + W[1] * hd + N[1] * sw * f; out.y = u.gy + 1.6 + ht;
    out.roll = Math.cos(sec * 0.31 + u.faz) * 0.45 + Math.cos(sec * 0.83 + u.faz * 2) * 0.25;
    out.gor = true;
    if (u.sahip && K.agacOlay && minute >= K.tS && minute <= K.tK + 0.35) {
      // Rüzgâr döner, uçurtma ağaca dalar (0,5 dk), takılı kalır; kurtarılınca sahibinin eline süzülür.
      const [tx, ty, tz] = K.tepe;
      if (minute < K.tS + 0.5) { const a = ease((minute - K.tS) / 0.5); out.x += (tx - out.x) * a; out.y += (ty - out.y) * a + Math.sin(a * Math.PI) * 3; out.z += (tz - out.z) * a; out.roll += a * 2.2; }
      else if (minute < K.tK) { out.x = tx; out.y = ty + Math.sin(sec * 3.1) * 0.08; out.z = tz; out.roll = 2.4 + Math.sin(sec * 2.3) * 0.15; out.takili = true; }
      else { const a = ease((minute - K.tK) / 0.35), h = sahipYer(minute); out.x = tx + (h[0] - tx) * a; out.y = ty + (K.gy(h[0], h[1]) + 1.4 - ty) * a; out.z = tz + (h[1] - tz) * a; out.roll = 2.4 * (1 - a); out.takili = true; }
    }
    return out;
  }

  /** Sahibin o dakikadaki yeri: kendi yeri → ağacın dibi (takılınca) → yerine dönüş. */
  function sahipYer(minute) {
    const u = K.ucan.find((q) => q.sahip);
    if (!u || !K.agacOlay) return [u?.x ?? 0, u?.z ?? 0, 0];
    const dib = [K.agac.x - K.W[0] * 2.6, K.agac.z - K.W[1] * 2.6];
    const git0 = K.tS + 0.5, git1 = K.tS + 1.4, don0 = K.tK + 0.5, don1 = K.tK + 1.5;
    let a = 0, yur = 0;
    if (minute > git0 && minute < git1) { a = (minute - git0) / (git1 - git0); yur = 1; }
    else if (minute >= git1 && minute <= don0) a = 1;
    else if (minute > don0 && minute < don1) { a = 1 - (minute - don0) / (don1 - don0); yur = -1; }
    return [u.x + (dib[0] - u.x) * a, u.z + (dib[1] - u.z) * a, yur];
  }

  function kitMatris(kp, olcek, out) {
    // Yüz rüzgârın üstüne (uçana) ve biraz aşağı bakar; omurga yukarı; salınımda yuvarlanır.
    const b = 0.5, W = K.W;
    Wv.set(W[0], 0, W[1]);
    Nk.set(-W[0] * Math.cos(b), -Math.sin(b), -W[1] * Math.cos(b));
    Yk.set(-W[0] * Math.sin(b), Math.cos(b), -W[1] * Math.sin(b));
    X.crossVectors(Yk, Nk);
    out.makeBasis(X, Yk, Nk);
    Q.setFromAxisAngle(Nk, kp.roll);
    out.premultiply(M4.makeRotationFromQuaternion(Q));
    out.scale(V.set(olcek, olcek, olcek));
    out.setPosition(kp.x, kp.y, kp.z);
    return out;
  }

  const MK = new THREE.Matrix4(), P0 = new THREE.Vector3(), P1 = new THREE.Vector3();
  let kn = 0;
  /** Kurdele (kuyruk/dokunaç): kök noktasından rüzgâr altına ve aşağı sarkan, dalgalanan parçalar. */
  function kurdele(x, y, z, n, boy, renk, faz, sec, sark = 0.8, gen = 1, dalga = 0.35) {
    const { W, N } = K;
    let px = x, py = y, pz = z;
    for (let i = 1; i <= n && kn < KURDELE; i++) {
      const s = i / n, dal = Math.sin(sec * 2.6 + faz + i * 0.8) * dalga * s * boy * i * 0.3;
      const nx = x + W[0] * i * boy * 0.62 + N[0] * dal, ny = y - i * boy * sark * 0.62, nz = z + W[1] * i * boy * 0.62 + N[1] * dal;
      d1.set(nx - px, ny - py, nz - pz);
      const L = d1.length() || 0.01;
      Q.setFromUnitVectors(AY, d1.divideScalar(L));
      G.kurdele.setMatrixAt(kn, MK.compose(P0.set(px, py, pz), Q, SC.set(gen, L, 1)));
      G.kurdele.setColorAt(kn, CL.set(renk));
      kn++;
      px = nx; py = ny; pz = nz;
    }
  }

  function update(o, evre, minute, real) {
    if (!o || !K || K.o !== o) { if (G) G.g.visible = false; if (K && !o) K = null; return; }
    const gor = minute >= o.bas && minute <= o.son;
    G.g.visible = gor;
    if (!gor) return;
    const sec = minute * 60, ip = G.ipGeo.attributes.position.array;
    let ipn = 0, nb = 0, nd = 0, ndv = 0, na = 0, nf = 0;
    kn = 0;
    const ipCiz = (ax, ay, az, bx, by, bz, sag) => {
      for (let s = 0; s < IP_PARCA; s++) {
        for (const [k, t] of [[0, s / IP_PARCA], [3, (s + 1) / IP_PARCA]]) {
          ip[ipn + k] = ax + (bx - ax) * t; ip[ipn + k + 1] = ay + (by - ay) * t - sag * 4 * t * (1 - t); ip[ipn + k + 2] = az + (bz - az) * t;
        }
        ipn += 6;
      }
    };
    for (const u of K.ucan) {
      kitePoz(u, minute, KP);
      if (!KP.gor) continue;
      const el = u.sahip && K.agacOlay ? sahipYer(minute) : [u.x, u.z];
      const hx = el[0] + K.W[0] * 0.45, hz = el[1] + K.W[1] * 0.45, hy = K.gy(el[0], el[1]) + 1.62;
      if (KP.elde) { KP.x = hx; KP.y = hy - 0.2; KP.z = hz; KP.roll = 0.3; }
      const m = u.tur === 0 ? G.baklava : G.delta, idx = u.tur === 0 ? nb++ : nd++;
      m.setMatrixAt(idx, kitMatris(KP, KP.elde ? 1.2 : 1.9, MK));
      m.setColorAt(idx, CL.set(u.renk));
      if (!KP.elde) {
        if (u.tur === 0) kurdele(KP.x - K.W[0] * 0.3, KP.y - 1.1, KP.z - K.W[1] * 0.3, 7, 0.75, u.renk2, u.faz, sec, 1.1, 1.8);
        else kurdele(KP.x, KP.y - 0.6, KP.z, 4, 0.9, u.renk2, u.faz, sec, 1.2, 1.1);
        const L = Math.hypot(KP.x - hx, KP.y - hy, KP.z - hz);
        ipCiz(hx, hy, hz, KP.x, KP.y, KP.z, KP.takili ? L * 0.02 : L * 0.05);
      }
    }
    for (const q of K.gos) {
      if (minute < q.t0 || minute > q.t1) continue;
      const f = Math.min(ease((minute - q.t0) / 2), ease((q.t1 - minute) / 1.5));
      const L = q.L * (0.1 + 0.9 * f), el = 0.2 + (q.el - 0.2) * f;
      const sw = Math.sin(sec * 0.19 + q.faz) * 4 * f, hd = L * Math.cos(el), ht = L * Math.sin(el) + Math.sin(sec * 0.4 + q.faz) * 1.2 * f;
      KP.x = q.x + K.W[0] * hd + K.N[0] * sw; KP.y = q.y + ht; KP.z = q.z + K.W[1] * hd + K.N[1] * sw; KP.roll = Math.cos(sec * 0.19 + q.faz) * 0.25;
      if (q.tur === 2) {
        G.dev.setMatrixAt(ndv, kitMatris(KP, 1, MK)); G.dev.setColorAt(ndv++, CL.set(q.renk));
        for (const s of [-1, 1]) kurdele(KP.x + K.N[0] * s * 2.2, KP.y - 1.1, KP.z + K.N[1] * s * 2.2, 14, 0.85, q.renk, q.faz + s, sec, 0.45, 2.2);
      } else if (q.tur === 3) {
        kitMatris(KP, 1, MK); MK.multiply(M4.makeRotationX(0.5)); // kubbe rüzgâra karşı, biraz yukarı
        G.ahtapot.setMatrixAt(na, MK); G.ahtapot.setColorAt(na++, CL.set(q.renk));
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; kurdele(KP.x + K.N[0] * Math.cos(a) * 1.1, KP.y - 0.3 + Math.sin(a) * 0.9, KP.z + K.N[1] * Math.cos(a) * 1.1, 10, 0.95, q.renk, q.faz + k * 0.7, sec, 0.9, 2.2, 0.6); }
      } else {
        // Balık: rüzgârla dolan hortum (ağız rüzgâra karşı), gövdesi dalgalanır.
        Q.setFromAxisAngle(AY, K.aw + Math.PI + Math.sin(sec * 1.3 + q.faz) * 0.12);
        G.balik.setMatrixAt(nf, MK.compose(P1.set(KP.x, KP.y, KP.z), Q, SC.set(1.3, 1.3, 1.3))); G.balik.setColorAt(nf++, CL.set(q.renk));
        kurdele(KP.x + K.W[0] * 2.7, KP.y, KP.z + K.W[1] * 2.7, 6, 0.6, q.renk, q.faz, sec, 0.15, 2.4);
      }
      const L2 = Math.hypot(KP.x - q.x, KP.y - q.y, KP.z - q.z);
      ipCiz(q.x, q.y, q.z, KP.x, KP.y - (q.tur === 2 ? 1.2 : 0), KP.z, L2 * 0.04);
    }
    G.baklava.count = nb; G.delta.count = nd; G.dev.count = ndv; G.ahtapot.count = na; G.balik.count = nf; G.kurdele.count = kn;
    for (const m of [G.baklava, G.delta, G.dev, G.ahtapot, G.balik, G.kurdele]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    ip.fill(0, ipn);
    G.ipGeo.attributes.position.needsUpdate = true;
    G.ipGeo.setDrawRange(0, ipn / 3);
  }

  /** Hedef (video, "Olaya git"): takılma sırasında ağaçtaki uçurtma (ağaç ve sahibi), diğer anlarda uçurtma bulutu. */
  function canli(minute) {
    if (!K || minute < K.o.bas || minute > K.o.son) return null;
    if (K.agacOlay && minute >= K.tS + 0.4 && minute <= K.tK + 0.5) return [K.agac.x, K.agac.y + K.agac.h * 0.7, K.agac.z];
    // Diğer anlarda uçurtma bulutunun ortası (uçanların ~24 m üstü, ~20 m rüzgâr altında): kamera uçurtmaları ve uçanları alır.
    const x = K.T[0] + K.W[0] * 20, z = K.T[1] + K.W[1] * 20;
    return [x, K.gy(K.T[0], K.T[1]) + 24, z];
  }

  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    if (!K) return false;
    if (it.rol === "izle") {
      const c = K.odak;
      return izleDurus(it, t, p, ph, stand, idleGesture, [c[0], K.gy(c[0], c[1]) + 26, c[1]], K.gy(it.x, it.z));
    }
    const u = K.ucan[it.k];
    if (!u) { stand(it.x, it.z, it.heading); idleGesture(p, t, ph, false); return true; }
    kitePoz(u, minute, KP);
    if (u.sahip && K.agacOlay && minute > K.tS + 0.5 && minute < K.tK + 1.5) {
      const [x, z, yur] = sahipYer(minute);
      if (yur) {
        // Yürüyüş: ağaca giderken/dönerken (bacaklar salınır, baş uçurtmada).
        const h = yur > 0 ? Math.atan2(K.agac.x - x, K.agac.z - z) : Math.atan2(u.x - x, u.z - z);
        stand(x, z, h);
        const s = Math.sin(t * 7 + ph);
        p.hipL = 0.4 * s; p.hipR = -0.4 * s; p.kneeL = 0.1 + 0.6 * Math.max(0, Math.cos(t * 7 + ph)); p.kneeR = 0.1 + 0.6 * Math.max(0, -Math.cos(t * 7 + ph));
        p.shL = 1.2; p.elL = 0.5; p.shR = 0.3 * s; p.headPitch = -0.4;
        return true;
      }
      // Ağacın dibinde: başı yukarıda, iki eliyle ipi çekiştiriyor (kurtarılınca uçurtma elinde).
      stand(x, z, Math.atan2(K.agac.x - x, K.agac.z - z));
      if (minute < K.tK) { const c = Math.max(0, Math.sin(t * 2.4 + ph)); p.shL = p.shR = 1.5 + 0.6 * c; p.elL = p.elR = 0.3 + 0.5 * c; p.lean = -0.12 * c; p.headPitch = -0.9; }
      else { p.shL = p.shR = 0.9; p.elL = p.elR = 1.2; p.headPitch = 0.1; }
      return true;
    }
    stand(it.x, it.z, it.heading + (KP.gor && !KP.elde ? 0.12 * Math.sin(minute * 60 * 0.31 + u.faz) : 0)); // uçurtmanın salınımını izler
    if (KP.gor && !KP.elde) {
      // Uçuruyor: iki kol önde yukarıda, ara sıra ipi çeker; baş uçurtmada.
      const c = Math.max(0, Math.sin(t * 0.9 + ph)) ** 3;
      p.shL = p.shR = 1.65 + 0.25 * c; p.elL = 0.35 + 0.4 * c; p.elR = 0.4 + 0.4 * c; p.headPitch = -0.6; p.lean = -0.05 * c;
    } else idleGesture(p, t, ph, false);
    return true;
  }

  function ses(minute) {
    if (!K || minute < K.o.bas + 3 || minute > K.o.son - 3) return null;
    return { kalabalik: 0.35 };
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const n1 = K.ucan.length, nG = K.gos.length, top = n1 + nG, izl = K.izleyen;
    const agacOldu = K.agacOlay && minute >= K.tS + 0.5, kurtuldu = K.agacOlay && minute >= K.tK + 0.35;
    if (DIL === "en") {
      const Y = YER.ad;
      const bas = `At ${saatYaz(o.bas)} a kite festival started on ${Y}: ${nG} big show kites were staked down at the edges${n1 ? ` and ${n1} ${n1 === 1 ? "neighbor is" : "neighbors are"} flying kites` : ""}.`;
      const ag = agacOldu ? ` At ${saatYaz(K.tS + 0.5)} one kite got caught in ${K.agacAd} tree; ${kurtuldu ? `its owner tugged it free at ${saatYaz(K.tK + 0.35)} and flew it again.` : "its owner is tugging at the line under the tree."}` : "";
      const iz = izl ? ` ${izl} more came to watch.` : "";
      if (minute < o.son) return { kisa: agacOldu && !kurtuldu ? "A kite is stuck in a tree!" : minute < o.bas + 0.12 * K.D ? `Kite festival on ${Y}` : `${top} kites over ${Y}!`, uzun: bas + ag + iz };
      return { kisa: `Kite festival ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`, uzun: `At ${saatYaz(o.bas)} ${top} kites went up over ${Y}: ${nG} big show kites on stakes${n1 ? ` and ${n1} flown by neighbors` : ""}.${K.agacOlay ? ` One got caught in ${K.agacAd} tree at ${saatYaz(K.tS + 0.5)}; its owner tugged it free at ${saatYaz(K.tK + 0.35)}.` : ""}${iz}` };
    }
    const Y = YER;
    const bas = `Saat ${saatte(o.bas)} ${Y.de} uçurtma şenliği başladı: kenarlara ${nG} büyük gösteri uçurtması kazıkla bağlandı${n1 ? `, ${n1} kişi uçurtmasını uçuruyor` : ""}.`;
    const ag = agacOldu ? ` Saat ${saatte(K.tS + 0.5)} bir uçurtma ${K.agacAd[1]} takıldı; ${kurtuldu ? `sahibi ipini çekerek saat ${saatte(K.tK + 0.35)} kurtardı ve yeniden uçurdu.` : "sahibi ağacın dibinde ipini çekiştiriyor."}` : "";
    const iz = izl ? ` ${izl} kişi de izlemeye geldi.` : "";
    if (minute < o.son) return { kisa: agacOldu && !kurtuldu ? "Bir uçurtma ağaca takıldı!" : minute < o.bas + 0.12 * K.D ? `${Y.de} uçurtma şenliği` : `${Y.de} ${top} uçurtma havada!`, uzun: bas + ag + iz };
    return { kisa: `Bugün ${Y.de} uçurtma şenliği vardı · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(o.bas)} ${Y.de} ${top} uçurtma havalandı: ${nG} büyük gösteri uçurtması${n1 ? ` ve ${n1} kişinin uçurttuğu uçurtmalar` : ""}.${K.agacOlay ? ` Saat ${saatte(K.tS + 0.5)} bir uçurtma ${K.agacAd[1]} takıldı, sahibi saat ${saatte(K.tK + 0.35)} ipini çekerek kurtardı.` : ""}${iz}` };
  }

  return { kur, update, canli, yazi, gorev, durus, ses, seyirci: { r0: 10, r1: 20, isR: 0, uzak: 1, en: 0 } };
}
