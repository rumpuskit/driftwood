// Zeplin acil inişi (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; ilk olay modülü,
// arayüz olay-moduller.js). Adanın zeplini (yoksa adanın üstünden geçen bir reklam zeplini) bir pervanesi durunca
// rotasından çıkar, alçalır, geniş bir alana (futbol sahası / Town Green) iner, bir süre yerde kalır, pervanesi yeniden
// döner ve havalanıp rotasına (ziyaretçiyse ufka) döner. Kimse yaralanmaz; sakinler alanın kenarına toplanır.
// Her şey (dakika, tohum, dünya) işlevidir: video günün her saniyesini aynı çizer.
import * as THREE from "three";
import { Zeplin } from "./zeplin.js";
import { DIL, ZEPLIN as AD } from "./olay-ayar.js";
import { isHoliday } from "../sim.js";

const lerp = THREE.MathUtils.lerp;
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => Math.max(0, Math.min(1, u));

/** İniş yeri: futbol sahası (maç saatinde değilse: people.js _matchWindows ile aynı kural); yoksa en büyük
 *  çim/park/tarla alanı (ortasındaki çardak/meydandan uzak yarısı). */
function inisYeri(world, o) {
  const wd = (o.day + 3) % 7, mac = [{ start: 1170, end: 1260 }, ...(wd >= 5 || isHoliday(o.day) ? [{ start: 900, end: 1005 }] : [])];
  const sahaBos = !mac.some((m) => o.bas < m.end + 5 && o.son > m.start - 15);
  const engel = (x, z, h, uz, en) => {
    const c = Math.cos(h), s = Math.sin(h);
    for (const b of world.buildings) {
      const dx = b.x - x, dz = b.z - z, u = dx * c + dz * s, v = -dx * s + dz * c, r = Math.max(b.w ?? 6, b.d ?? 6) / 2;
      if (Math.abs(u) < uz / 2 + r && Math.abs(v) < en / 2 + r) return true;
    }
    return false;
  };
  const adaylar = [];
  if (world.pitch && sahaBos) adaylar.push({ x0: world.pitch.x0, x1: world.pitch.x1, z0: world.pitch.z0, z1: world.pitch.z1, saha: true });
  for (const p of world.plazas ?? []) if (["cimen", "park", "tarla", "saha"].includes(p.kind) && p.x0 != null) adaylar.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 });
  const daireler = (world.plazas ?? []).filter((p) => p.r != null);
  adaylar.sort((a, b) => (b.saha ? 1e9 : 0) + (b.x1 - b.x0) * (b.z1 - b.z0) - ((a.saha ? 1e9 : 0) + (a.x1 - a.x0) * (a.z1 - a.z0)));
  for (const a of adaylar) {
    const w = a.x1 - a.x0, d = a.z1 - a.z0, boyunaX = w >= d, uzun = Math.max(w, d), kisa = Math.min(w, d);
    if (uzun < 74 || kisa < 26) continue;
    const cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2, h = boyunaX ? 0 : Math.PI / 2;
    // Ortada çardak/meydan dairesi varsa uzun eksende yarının ortasına kay.
    for (const ofs of [0, uzun / 4, -uzun / 4]) {
      const x = cx + (boyunaX ? ofs : 0), z = cz + (boyunaX ? 0 : ofs);
      if (ofs === 0 && daireler.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 36)) continue;
      if (Math.abs(ofs) > 0 && uzun / 2 - Math.abs(ofs) < 33) continue;
      if (engel(x, z, h, 70, 20)) continue;
      return { x, z, h, saha: !!a.saha };
    }
  }
  return null;
}

export function buildZeplinOlay({ world, scene, zeplin }) {
  let ziyaretci = null; // adanın zeplini yoksa olay günü kurulan yabancı zeplin
  let K = null; // bugünkü kurgu
  const v = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();

  /** Zeplinin olağan konumu (olay yolu devre dışı). */
  function olagan(z, sec, out) {
    const f = z.olayYol; z.olayYol = null;
    const r = z.positionAt(sec, out);
    z.olayYol = f;
    return r;
  }
  /** Gövdenin en alt noktası (gövde merkezine göre, m): tekerlek yere değsin. Görünen mesh köşelerinden (sınır kutusu
   *  ışık parçalarını da sayıp 3 m havada bırakıyordu). */
  function altPay(z) {
    if (z._altPay != null) return z._altPay;
    const g = z.group, pos = g.position.clone(), rot = g.rotation.clone();
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
    let min = 0;
    const q = new THREE.Vector3();
    g.traverse((m) => {
      if (!m.isMesh || !m.visible || m.isSprite) return;
      const a = m.geometry?.attributes?.position;
      if (a) for (let i = 0; i < a.count; i++) { q.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld); if (q.y < min) min = q.y; }
    });
    g.position.copy(pos); g.rotation.copy(rot); g.updateMatrixWorld(true);
    return (z._altPay = -min);
  }

  function kur(o) {
    const yer = inisYeri(world, o);
    if (!yer) return null;
    let z = zeplin, kendi = !!zeplin;
    if (!z) {
      if (!ziyaretci) { ziyaretci = new Zeplin(world, {}); ziyaretci.yalnizOlay = true; scene.add(ziyaretci.group); }
      z = ziyaretci;
    }
    const gy = world.groundY?.(yer.x, yer.z) ?? world.height?.(yer.x, yer.z) ?? 0;
    const t0 = o.bas * 60, t1 = o.son * 60, D = t1 - t0;
    const T = { inis: t0 + 0.18 * D, yer: t0 + 0.3 * D, kalk: t0 + 0.78 * D };
    const ax = Math.cos(yer.h), az = Math.sin(yer.h); // uzun eksen
    const yon = (o.tohum & 1) ? 1 : -1; // hangi uçtan yaklaşır
    const yerY = gy + altPay(z) + 0.05;
    // Yaklaşma: eksen boyunca 170 m geriden 46 m yükseklikte; kalkış ileri doğru.
    const A = new THREE.Vector3(yer.x - ax * yon * 170, gy + 46, yer.z - az * yon * 170);
    const B = new THREE.Vector3(yer.x - ax * yon * 22, gy + 13, yer.z - az * yon * 22);
    const L = new THREE.Vector3(yer.x, yerY, yer.z);
    const C = new THREE.Vector3(yer.x + ax * yon * 40, gy + 34, yer.z + az * yon * 40);
    // Ziyaretçi: açıktan gelir, açığa gider (adanın merkezinden 1,6 km).
    const bb = world.bounds, mx = (bb.x0 + bb.x1) / 2, mz = (bb.z0 + bb.z1) / 2;
    const uzak = (s) => new THREE.Vector3(mx + Math.sin(s) * 1600, gy + 140, mz + Math.cos(s) * 1600);
    const giris = kendi ? null : uzak(((o.tohum >> 2) % 628) / 100), cikis = kendi ? null : uzak(((o.tohum >> 4) % 628) / 100);
    const bez = (a, b, c, d, u, out) => {
      const m = 1 - u;
      return out.set(m * m * m * a.x + 3 * m * m * u * b.x + 3 * m * u * u * c.x + u * u * u * d.x,
        m * m * m * a.y + 3 * m * m * u * b.y + 3 * m * u * u * c.y + u * u * u * d.y,
        m * m * m * a.z + 3 * m * m * u * b.z + 3 * m * u * u * c.z + u * u * u * d.z);
    };
    z.olayYol = (sec, out) => {
      if (sec < t0 || sec > t1) return z.yalnizOlay ? null : undefined;
      if (sec < T.inis) {
        // Rotadan çıkış: olağan konumdan (ziyaretçide açıktan) yaklaşma noktasına alçalarak.
        const s0 = kendi ? olagan(z, t0, p0) : p0.copy(giris);
        if (!s0) return undefined;
        const u = ease((sec - t0) / (T.inis - t0));
        return bez(s0, s0.clone().lerp(A, 0.4).setY(s0.y), A.clone().lerp(s0, 0.3), A, u, out);
      }
      if (sec < T.yer) {
        const u = (sec - T.inis) / (T.yer - T.inis);
        if (u < 0.72) return out.copy(A).lerp(B, ease(u / 0.72));
        // Son 28%: dikine iner (yön korunur), en sonda hafif yaylanma.
        const w = ease((u - 0.72) / 0.28);
        return out.set(lerp(B.x, L.x, w), lerp(B.y, L.y, w), lerp(B.z, L.z, w));
      }
      if (sec < T.kalk) return out.set(L.x, L.y + Math.sin(sec * 0.4) * 0.12, L.z);
      const u = (sec - T.kalk) / (t1 - T.kalk);
      if (u < 0.25) return out.set(L.x, lerp(L.y, gy + 24, ease(u / 0.25)), L.z);
      const s1 = kendi ? olagan(z, t1, p1) : p1.copy(cikis);
      if (!s1) return out.set(L.x, gy + 24, L.z);
      const w = ease((u - 0.25) / 0.75);
      return bez(v.set(L.x, gy + 24, L.z), C, s1.clone().lerp(C, 0.35), s1, w, out);
    };
    // Bir pervane rotadan çıkıştan kalkışın başına dek durur (video: "pervanesi durdu" gerçek).
    K = { o, z, kendi, yer, gy, T, t0, t1 };
    const merkez = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
    // Seyirciler uzun eksene dik yanda, meydana yakın tarafta.
    let nx = -az, nz = ax;
    if ((merkez[0] - yer.x) * nx + (merkez[1] - yer.z) * nz < 0) { nx = -nx; nz = -nz; }
    const kal = [yer.x + nx * 44, yer.z + nz * 44];
    K.saha = yer.saha ? AD.saha : AD.yedekSaha;
    // Kamera yönü: zeplinin geldiği uçtan çapraz (tam yandan uzak kamera tribün/binalara takılıyor, tam eksenden kuyruk
    // görünüyordu; seyircilerin karşı yanından); kadraj 2,6 kat uzak, 1,9 kat yüksek (çatıların üstünden).
    return { odak: [yer.x, yer.z], odakY: 9, kalabalik: kal, kiyi: null, yon: Math.atan2(-ax * yon - nx * 0.8, -az * yon - nz * 0.8), yerAdi: K.saha.ad, zaman: null, gitD: 130, gitEgim: 0.42, cekimOlcek: 2.6, cekimOlcekH: 1.9, kalabalikArkadan: true };
  }

  function update(o, evre, minute, real, env) {
    if (!o || !K || K.o !== o) {
      if (K && !o) { K.z.olayYol = null; K.z.durgunFan = null; K = null; }
      if (ziyaretci && !K) ziyaretci.group.visible = false;
      return;
    }
    const sec = minute * 60;
    K.z.durgunFan = sec >= K.t0 + 60 && sec < K.T.kalk + 20 ? 0 : null;
    if (ziyaretci && K.z === ziyaretci) ziyaretci.updateSec(sec, real, env?.sunDeg != null && env.sunDeg < -2 ? 1 : 0);
  }

  function canli(minute) {
    if (!K) return null;
    const r = K.z.positionAt(minute * 60, new THREE.Vector3());
    return r ? [r.x, r.y, r.z] : null;
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const sec = minute * 60, Z = K.kendi ? AD.kendi : AD.ziyaretci, Y = K.saha;
    const kalis = Math.round((K.T.kalk - K.T.yer) / 60), n = S.seyirci;
    if (DIL === "en") {
      const Ad = Z.ad.charAt(0).toUpperCase() + Z.ad.slice(1);
      const izle = n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} gathered at the edge of the grass to watch.` : "";
      if (sec < K.T.yer) return { kisa: `${Ad} is coming down!`, uzun: `At ${saatYaz(o.bas)} ${Z.ad} lost an engine, turned off its route and began descending toward ${Y.ad}.` };
      if (sec < K.T.kalk) return { kisa: `Blimp down on ${Y.ad}`, uzun: `At ${saatYaz(o.bas)} ${Z.ad} lost an engine and made an emergency landing on ${Y.ad}; nobody was hurt.${izle}` };
      return { kisa: `Blimp landing ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`, uzun: `At ${saatYaz(o.bas)} ${Z.ad} lost an engine and made an emergency landing on ${Y.ad}; nobody was hurt.${izle} It sat on the grass for ${kalis} minutes, got its engine turning again and took off.` };
    }
    const izle = n ? ` ${n} kişi alanın kenarına toplandı.` : "";
    if (sec < K.T.yer) return { kisa: "Zeplin alçalıyor!", uzun: `Saat ${saatte(o.bas)} ${Z.in} bir pervanesi durdu; zeplin rotasından çıkıp ${Y.ustune} alçalıyor.` };
    if (sec < K.T.kalk) return { kisa: `Zeplin ${Y.e} indi`, uzun: `Saat ${saatte(o.bas)} pervanesi duran ${Z.ad} ${Y.e} acil iniş yaptı; kimse yaralanmadı.${izle}` };
    return { kisa: `Bugün zeplin acil iniş yaptı · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(o.bas)} bir pervanesi duran ${Z.ad} ${Y.e} acil iniş yaptı; kimse yaralanmadı.${izle} Zeplin ${kalis} dakika yerde kaldı, pervanesi yeniden döndü ve havalandı.` };
  }

  /** İniş alanı boşaltılır (sahada antrenman yapan futbolcular, çimdekiler): alçalma başlayınca alandaki herkes en
   *  yakın uzun kenara yürür (1 dk), zeplin yerdeyken orada izler, kalkıştan 2 dk sonra yerine döner. */
  const HL = 35, HW = 12, PAY = 3;
  function tahliye(x, z, minute) {
    if (!K) return null;
    const { yer, T, o } = K, t0 = o.bas + 1, t1 = T.kalk / 60 + 2;
    if (minute < t0 || minute > t1 + 1) return null;
    const c = Math.cos(yer.h), s = Math.sin(yer.h), dx = x - yer.x, dz = z - yer.z, u = dx * c + dz * s, w = -dx * s + dz * c;
    if (Math.abs(u) > HL || Math.abs(w) > HW + PAY) return null;
    const w2 = (w >= 0 ? 1 : -1) * (HW + PAY + (Math.abs(u * 7.3) % 1.6)); // kenarda tek sıra değil, hafif dağınık
    const e = Math.min(1, (minute - t0) / 1, (t1 + 1 - minute) / 1);
    const ww = w + (w2 - w) * Math.max(0, Math.min(1, e));
    const nx = yer.x + c * u - s * ww, nz = yer.z + s * u + c * ww;
    const yuru = e < 1 ? Math.abs(ww - w) / 0.72 * Math.PI : 0;
    const bak = e < 1 ? Math.atan2(nx - x, nz - z) || 0 : Math.atan2(yer.x - nx, yer.z - nz);
    return { x: nx, z: nz, heading: e < 1 && minute > t1 ? bak + Math.PI : bak, yuru };
  }

  return {
    kur, update, canli, yazi, tahliye,
    seyirci: { r0: 38, r1: 52, isR: 300, uzak: 1.6, en: 30, tavirlar: ["cek", "goster", "cek", "sasir", "konus", "bak"] },
  };
}
