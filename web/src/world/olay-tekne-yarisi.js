// Istakoz teknesi yarışı (Lobster boat race, Maine geleneği; 17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik
// çok önemli"; arayüz olay-moduller.js). Beş ıstakoz teknesi (her birinin rengi, numarası, adı köşkünde ve çatısında yazılı)
// açıktan gelip balık iskelesinin batısında start çizgisine dizilir; iskelenin önündeki oval parkurda (iki dönüş şamandırası)
// üç tur köpük saçarak yarışır, bitiş çizgisi iskelenin ucunun önündedir (iki bayraklı şamandıra). Kıyı tezahürat yapar.
// Kazanan tohumdan bellidir (metindeki ad/numara görüntüdekiyle aynı: TEKNELER). Yarıştan sonra tekneler bir tur yavaşlayarak
// döner, bitişin batısında yan yana durur; kazanan iskelenin önünde daireler çizer; sonra hepsi açığa gider.
// Her şey (dakika, plan, dünya) işlevidir: video günün her saniyesini aynı çizer. Kimse yaralanmaz.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DIL } from "./olay-ayar.js";
import { isOpen } from "../sim.js";
import { istakozTeknesi, kopukHavuzu, tekneIzi, birlestir, TEKNE_MAT, ease, clamp01, lerp } from "./olay-tekne.js";
import { colored } from "./harbor.js";

const EN = DIL === "en";
/** Yarışan tekneler: numara, ad, gövde/şerit rengi, renk adı (metin). Sıra = şerit (iç → dış). */
export const TEKNELER = [
  { no: 7, ad: "Miss Ellie", govde: "#c8352a", serit: "#f4f1ea", renk: ["kırmızı", "red"] },
  { no: 12, ad: "Sea Smoke", govde: "#2f7a4a", serit: "#f4f1ea", renk: ["yeşil", "green"] },
  { no: 3, ad: "Lady Grace", govde: "#24406e", serit: "#e2b72e", renk: ["lacivert", "navy"] },
  { no: 21, ad: "Hannah Rose", govde: "#e2b72e", serit: "#24406e", renk: ["sarı", "yellow"] },
  { no: 9, ad: "Island Girl", govde: "#f4f1ea", serit: "#1d2026", renk: ["beyaz", "white"] },
];
const N = TEKNELER.length, BOY = 11;
// Zamanlar (olayın başından sn; olay 36 dk, evreler olay-plan.js E.tekne_yarisi: toplanma 0–10,4 · yarış –15,8 · kutlama).
const START = 10.5 * 60, DONUT0 = 17 * 60, DONUT1 = 23.7 * 60, AYRIL = 30 * 60;

/** Numara levhası atlası: her tekneye bir hücre (beyaz zemin, büyük numara, altında ad). */
function atlas() {
  const W = 256, H = 128, c = document.createElement("canvas"); c.width = W * N; c.height = H;
  const g = c.getContext("2d");
  TEKNELER.forEach((t, i) => {
    g.fillStyle = "#f7f6f2"; g.fillRect(i * W, 0, W, H);
    g.fillStyle = "#15181d"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 92px sans-serif"; g.fillText(String(t.no), i * W + W / 2, H * 0.4);
    g.font = "bold 22px sans-serif"; g.fillText(t.ad.toUpperCase(), i * W + W / 2, H * 0.86);
  });
  const tx = new THREE.CanvasTexture(c); tx.anisotropy = 4;
  return tx;
}
/** UV'si atlas hücresine bakan düzlem. */
function levha(w, h, i) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / N);
  return g;
}

export function buildTekneYarisiOlay({ world, scene }) {
  let G = null, K = null;
  const _a = { x: 0, z: 0, h: 0 };

  function geoKur() {
    const group = new THREE.Group(); group.name = "olay-yaris"; scene.add(group);
    const tex = atlas(), lmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const tekneler = TEKNELER.map((t, i) => {
      const T = istakozTeknesi(BOY, t.govde, t.serit, "#f6f4ee"), k = T.kosk, g = new THREE.Group();
      g.add(T.mesh);
      // Numara levhaları: köşkün iki yanında ve çatısında.
      const zc = (k.z0 + k.z1) / 2, lw = (k.z1 - k.z0) * 0.86, lh = k.ch * 0.42, y = k.cy + k.ch * 0.27;
      const parts = [
        levha(lw, lh, i).rotateY(Math.PI / 2).translate(k.cw / 2 + 0.02, y, zc),
        levha(lw, lh, i).rotateY(-Math.PI / 2).translate(-k.cw / 2 - 0.02, y, zc),
        levha(k.cw * 0.95, k.cw * 0.95 * 0.5, i).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(0, k.cy + k.ch + 0.12, (k.roofZ0 + k.z1) / 2),
      ];
      g.add(new THREE.Mesh(mergeGeometries(parts), lmat));
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      group.add(g);
      return g;
    });
    // Şamandıralar: iki dönüş (turuncu, büyük) ve bitiş çizgisi (iki sarı, damalı bayraklı).
    const sam = (renk, r) => birlestir([colored(new THREE.SphereGeometry(r, 12, 8).scale(1, 0.8, 1), renk), colored(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5).translate(0, 1.3, 0), "#2a2d33")]);
    const donus = new THREE.Mesh(sam("#f28c28", 0.9), TEKNE_MAT()), donus2 = donus.clone();
    const bitis = new THREE.Mesh(sam("#e8c22e", 0.7), TEKNE_MAT()), bitis2 = bitis.clone();
    const bc = document.createElement("canvas"); bc.width = 64; bc.height = 48;
    const bg = bc.getContext("2d");
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { bg.fillStyle = (x + y) % 2 ? "#111" : "#fafafa"; bg.fillRect(x * 16, y * 12, 16, 12); }
    const bayrakMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(bc), side: THREE.DoubleSide, roughness: 0.8 });
    const bayrak = new THREE.PlaneGeometry(1.2, 0.85).translate(0.6, 2.05, 0);
    for (const b of [bitis, bitis2]) b.add(new THREE.Mesh(bayrak, bayrakMat));
    group.add(donus, donus2, bitis, bitis2);
    const kop = kopukHavuzu(group, 520);
    group.visible = false;
    return { group, tekneler, donus, donus2, bitis, bitis2, kop };
  }

  // --- parkur ---
  /** Merkez çizgisinde s (m, iç düzlüğün batı ucundan doğuya) ve şerit kayması d (dışa, m) → konum, yön. */
  function parkur(s, d, out) {
    const P = K.P, lap = P.lap, Ls = P.xe - P.xw, Lc = Math.PI * P.r;
    let q = ((s % lap) + lap) % lap;
    if (q < Ls) { out.x = P.xw + q; out.z = P.za - d; out.h = Math.PI / 2; return out; }
    q -= Ls;
    if (q < Lc) { const f = q / P.r, rr = P.r + d; out.x = P.xe + rr * Math.sin(f); out.z = P.zc - rr * Math.cos(f); out.h = Math.atan2(Math.cos(f), Math.sin(f)); return out; }
    q -= Lc;
    if (q < Ls) { out.x = P.xe - q; out.z = P.zb + d; out.h = -Math.PI / 2; return out; }
    q -= Ls;
    const f = q / P.r, rr = P.r + d; out.x = P.xw - rr * Math.sin(f); out.z = P.zc + rr * Math.cos(f); out.h = Math.atan2(-Math.cos(f), -Math.sin(f));
    return out;
  }
  const bez = (a, b, c, e, out) => {
    const n = 1 - e;
    out.x = n * n * a[0] + 2 * n * e * b[0] + e * e * c[0]; out.z = n * n * a[1] + 2 * n * e * b[1] + e * e * c[1];
    const tx = 2 * n * (b[0] - a[0]) + 2 * e * (c[0] - b[0]), tz = 2 * n * (b[1] - a[1]) + 2 * e * (c[1] - b[1]);
    if (tx * tx + tz * tz > 1e-6) out.h = Math.atan2(tx, tz);
    return out;
  };

  /** Teknenin (i) olayın sn'sindeki duruşu; görünmüyorsa null. */
  function poz(i, sn, out) {
    if (!K) return null;
    const P = K.P, d = P.seritler[i], gel = K.gelis[i];
    const startXZ = [P.xs, P.za - d];
    if (sn < gel - 180) return null;
    if (sn < gel) {
      // Açıktan (güneybatı) gelip start çizgisine doğuya dönük dizilir.
      const u = (sn - gel + 180) / 180, e = 1 - (1 - u) ** 2;
      return bez(K.uzak[i], [P.xs - 170, P.za - d], startXZ, e, out);
    }
    if (sn < START) { out.x = startXZ[0]; out.z = startXZ[1]; out.h = Math.PI / 2; return out; }
    const tau = sn - START, F = K.bitis[i];
    if (tau < F) return parkur(P.s0 + P.Lr * yarisEgri(i, tau / F), d, out);
    // Bitişten sonra: bir tur yavaşlayarak (ease-out) döner, bitişin 50 m batısında durur.
    const Tp = (3 * P.Dpost) / P.vBitis[i], tp = tau - F;
    const sDur = P.s0 + P.Lr + P.Dpost;
    const kazanan = i === K.kazanan;
    if (tp < Tp && !(kazanan && sn >= DONUT0 && sn < DONUT1 + 20)) return parkur(P.s0 + P.Lr + P.Dpost * (1 - (1 - tp / Tp) ** 3), d, out);
    const dur = parkur(sDur, d, _a), durXZ = [dur.x, dur.z];
    if (kazanan && sn >= DONUT0 && sn < DONUT1 + 20) {
      // Kazanan iskelenin önünde daireler çizer (giriş/çıkış 20 sn).
      const C = K.donutC, R = 16, w = 8 / R; // 8 m/sn
      const ang = (t) => (t - DONUT0 - 20) * w;
      const daire = (t, o) => { const a = ang(t); o.x = C[0] + R * Math.sin(a); o.z = C[1] - R * Math.cos(a); o.h = a + Math.PI / 2; return o; };
      if (sn < DONUT0 + 20) { const giris = daire(DONUT0 + 20, { x: 0, z: 0, h: 0 }); return bez(durXZ, [durXZ[0] + 30, durXZ[1] + 4], [giris.x, giris.z], ease((sn - DONUT0) / 20), out); }
      if (sn < DONUT1) return daire(sn, out);
      const cik = daire(DONUT1, { x: 0, z: 0, h: 0 });
      bez([cik.x, cik.z], [durXZ[0] - 20, durXZ[1] + 10], durXZ, ease((sn - DONUT1) / 20), out);
      if ((sn - DONUT1) / 20 > 0.85) out.h = lerp(out.h, Math.PI / 2, ((sn - DONUT1) / 20 - 0.85) / 0.15);
      return out;
    }
    if (sn < AYRIL + i * 25) { out.x = dur.x; out.z = dur.z; out.h = Math.PI / 2; return out; }
    // Ayrılış: açığa (güneybatı) hızlanarak.
    const u = (sn - AYRIL - i * 25) / 420;
    if (u > 1) return null;
    return bez(durXZ, [durXZ[0] + 60, durXZ[1] + 220], K.uzak[i], u ** 1.7, out);
  }
  /** Yarış ilerlemesi (0..1): kalkış ivmesi + tekneye özgü dalgalanma (sıralar yarış içinde değişir, sona doğru oturur). */
  function yarisEgri(i, u) {
    const a = 0.045, n = 1 - a * (1 - Math.exp(-1 / a));
    const g = (u - a * (1 - Math.exp(-u / a))) / n;
    const w = K.dalga[i], k = K.dalgaK[i];
    return g + w * Math.sin(2 * Math.PI * k * u) * u * u * (1 - u) * 6.75;
  }

  function kur(o) {
    const koy = world.koy;
    if (!koy?.jetty) return null;
    G ??= geoKur();
    // Seyir yeri: balık iskelesi (açıksa), yoksa koyun iskelesi; bitiş çizgisi onun önünde.
    const bi = world.piers.find((p) => p._k === "balik_iskelesi");
    const acik = !!bi && isOpen("balik_iskelesi");
    const iskele = acik ? { x: (bi.x0 + bi.x1) / 2, z1: bi.z1, z0: bi.z0, ad: ["Balık İskelesi", "the Fishing Pier"] } : { x: koy.jetty.x, z1: koy.jetty.z1, z0: koy.jetty.z0, ad: ["Balıkçı Koyu iskelesi", "the Fishing Wharf"] };
    const xf = acik ? iskele.x : koy.jetty.x + 90;
    const za = iskele.z1 + 36, r = 30;
    const xw = xf - 120, xe = xf + 120, xs = xw + 20;
    const lap = 2 * (xe - xw) + 2 * Math.PI * r;
    const s0 = xs - xw, Lr = 3 * lap + (xf - xs), Dpost = lap - 50;
    const seritler = [-12, -6, 0, 6, 12];
    // Kazanan ve bitiş süreleri (tohum): kazanan 132–140 sn (~15 m/sn); diğerleri 1,2–9 sn arkada.
    const h = (k) => ((o.tohum >>> (k * 3)) % 997) / 997;
    const sira = [0, 1, 2, 3, 4].sort((a, b) => h(a + 2) - h(b + 2));
    const kazanan = sira[0];
    const bitis = [], dalga = [], dalgaK = [], vBitis = [];
    sira.forEach((ti, k) => { bitis[ti] = 132 + h(1) * 8 + (k === 0 ? 0 : 1.2 + (k - 1) * 2.1 + h(k + 7) * 1.4); });
    for (let i = 0; i < N; i++) {
      // Kazanan ilk turlarda geride kalıp sonda öne geçer (dalga eksi başlar).
      dalga[i] = (i === kazanan ? -0.03 : 0.008 + 0.02 * h(i + 11)) * (i === kazanan || h(i + 13) > 0.4 ? 1 : -1);
      dalgaK[i] = i === kazanan ? 1 : 1 + Math.round(h(i + 17) * 2) / 2;
      const du = 1e-3; vBitis[i] = (Lr * (yarisEgriHam(1, dalga[i], dalgaK[i]) - yarisEgriHam(1 - du, dalga[i], dalgaK[i]))) / (du * bitis[i]);
    }
    const gelis = TEKNELER.map((_, i) => (4 + 1.3 * i) * 60);
    const uzak = TEKNELER.map((_, i) => [xw - 650 - 60 * i, za + 1350 + 50 * i]);
    K = { o, P: { xw, xe, xs, xf, za, zb: za + 2 * r, zc: za + r, r, lap, s0, Lr, Dpost, seritler, vBitis }, kazanan, bitis, dalga, dalgaK, gelis, uzak, donutC: [xf, za + 46], iskele };
    G.donus.position.set(xe, 0.15, za + r); G.donus2.position.set(xw, 0.15, za + r);
    G.bitis.position.set(xf, 0.12, za - 22); G.bitis2.position.set(xf, 0.12, za + 18);
    const kal = [iskele.x, iskele.z1 - 6];
    return { odak: [(xw + xe) / 2, za + r], odakY: 1.5, kalabalik: kal, kiyi: null, yon: Math.atan2(0.3, 1), yerAdi: iskele.ad[EN ? 1 : 0], zaman: null,
      gitD: 210, gitEgim: 0.4, cekimOlcek: 1.1, cekimOlcekH: 1.0, kalabalikArkadan: true };
  }
  function yarisEgriHam(u, w, k) {
    const a = 0.045, n = 1 - a * (1 - Math.exp(-1 / a));
    return (u - a * (1 - Math.exp(-u / a))) / n + w * Math.sin(2 * Math.PI * k * u) * u * u * (1 - u) * 6.75;
  }

  const _o = { x: 0, z: 0, h: 0 };
  function update(o, evre, minute, real, env) {
    if (!G) return;
    if (!o || !K || K.o !== o) { G.group.visible = false; return; }
    const sn = (minute - o.bas) * 60;
    G.group.visible = sn >= 0 && sn < AYRIL + 600;
    if (!G.group.visible) return;
    G.kop.basla();
    for (let i = 0; i < N; i++) {
      const g = G.tekneler[i], p = poz(i, sn, _o);
      g.visible = !!p;
      if (!p) continue;
      // Hızla pruva kalkar (yarışta), dönüşte yatar.
      const yaris = sn > START && sn < START + K.bitis[i] + 20;
      const kalk = yaris ? 0.07 : 0.01;
      g.position.set(p.x, 0.1 + 0.05 * Math.sin(real * 1.4 + i), p.z);
      g.rotation.set(-kalk + 0.015 * Math.sin(real * 1.1 + i), p.h, (yaris ? 0.05 : 0.015) * Math.sin(real * 0.9 + i * 2), "YXZ");
      tekneIzi(G.kop, (s, out) => poz(i, s, out), sn, { boy: BOY, en: BOY * 0.34, hiz0: 9, n: 14, dt: 0.7, guc: 1 });
    }
    G.kop.bitir(env?.light ?? 1);
    // Şamandıralar yalnız toplanmadan kutlamanın sonuna dek.
    const sam = sn > 60 && sn < AYRIL;
    G.donus.visible = G.donus2.visible = G.bitis.visible = G.bitis2.visible = sam;
  }

  /** Video: yarışta öndeki tekne, öncesinde start çizgisi, sonra kazanan. */
  function canli(minute) {
    if (!K) return null;
    const sn = (minute - K.o.bas) * 60;
    if (sn < 0 || sn > (K.o.son - K.o.bas) * 60) return null;
    if (sn < START) return [K.P.xs, 1.5, K.P.za];
    let en = -1, sMax = -1;
    for (let i = 0; i < N; i++) {
      const tau = sn - START, F = K.bitis[i];
      const s = tau < F ? yarisEgri(i, tau / F) : 1 + (tau - F) * 1e-3;
      if (s > sMax) { sMax = s; en = i; }
    }
    if (sn > START + K.bitis[K.kazanan]) en = K.kazanan;
    const p = poz(en, sn, _o);
    return p ? [p.x, 1.5, p.z] : [K.P.xf, 1.5, K.P.za];
  }

  /** Ses: yarışta ve bitişte kalabalık uğultusu. */
  function ses(minute) {
    if (!K) return null;
    const sn = (minute - K.o.bas) * 60;
    return { kalabalik: sn > START - 30 && sn < START + 260 ? 0.8 : sn > 0 && sn < AYRIL ? 0.35 : 0 };
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const sn = (minute - o.bas) * 60, n = S.seyirci, W = TEKNELER[K.kazanan];
    const bitDk = o.bas + (START + K.bitis[K.kazanan]) / 60, ikinci = TEKNELER[[0, 1, 2, 3, 4].sort((a, b) => K.bitis[a] - K.bitis[b])[1]];
    const fark = Math.round(K.bitis[[0, 1, 2, 3, 4].sort((a, b) => K.bitis[a] - K.bitis[b])[1]] - K.bitis[K.kazanan]);
    const yer = K.iskele.ad[EN ? 1 : 0];
    if (EN) {
      const izle = n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} cheered from the pier.` : "";
      if (sn < START) return { kisa: "Lobster boat race today!", uzun: `Five lobster boats are lining up off ${yer} for a race: three laps around two buoys, finish line off the end of the pier. Start at ${saatYaz(o.bas + START / 60)}.` };
      if (sn < START + K.bitis[K.kazanan]) return { kisa: "Lobster boat race under way!", uzun: `At ${saatYaz(o.bas + START / 60)} five lobster boats roared off the line in front of ${yer}: three laps around two buoys, throwing spray all the way.` };
      return { kisa: `No. ${W.no} ${W.ad} won the lobster boat race · ${saatYaz(bitDk)}`, uzun: `At ${saatYaz(o.bas + START / 60)} five lobster boats raced three laps around two buoys in front of ${yer}. No. ${W.no} ${W.ad}, the ${W.renk[1]} boat, crossed the line first at ${saatYaz(bitDk)}, ${fark} ${fark === 1 ? "second" : "seconds"} ahead of No. ${ikinci.no} ${ikinci.ad}.${izle}${sn >= DONUT0 && sn < AYRIL ? ` The winner is spinning circles off the pier.` : ""}` };
    }
    const izle = n ? ` ${n} kişi iskeleden tezahürat yaptı.` : "";
    if (sn < START) return { kisa: "Bugün ıstakoz teknesi yarışı!", uzun: `Beş ıstakoz teknesi ${yer}'nin önünde yarış için diziliyor: iki şamandıranın çevresinde üç tur, bitiş iskelenin ucunda. Start ${saatte(o.bas + START / 60)}.` };
    if (sn < START + K.bitis[K.kazanan]) return { kisa: "Tekne yarışı başladı!", uzun: `Saat ${saatte(o.bas + START / 60)} beş ıstakoz teknesi ${yer}'nin önünde köpük saçarak yarışa çıktı: iki şamandıranın çevresinde üç tur.` };
    return { kisa: `Tekne yarışını ${W.no} numaralı ${W.ad} kazandı · ${saatYaz(bitDk)}`, uzun: `Saat ${saatte(o.bas + START / 60)} beş ıstakoz teknesi ${yer}'nin önünde iki şamandıranın çevresinde üç tur yarıştı. ${W.no} numaralı ${W.renk[0]} ${W.ad} bitişe ilk geldi; ${ikinci.no} numaralı ${ikinci.ad}'yi ${fark} saniye geride bıraktı.${izle}` };
  }

  return {
    kur, update, canli, yazi, ses,
    seyirci: { r0: 1.5, r1: 22, isR: 300, uzak: 2.2, kiyida: true, en: 30, tavirlar: ["tezahurat", "cek", "tezahurat", "goster", "tezahurat", "bak"] },
  };
}
