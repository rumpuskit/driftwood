// Vapur arızası (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// İskeleye gelen vapurun makinesi durur: bacasından kara duman çıkar, iskelenin açığında durup hafifçe sürüklenir; güvertede
// yolcular bekler, iskeleye kalabalık toplanır. Açıktan bir römorkör gelir, halatı bağlayıp vapuru çeker, sonra yanına geçip
// iskeleye iter. Vapur bir sonraki seferin varış anında yanaşır (sefer 20 dk gecikir; ferry.js VAPUR_OLAY ve gecikme: arızalı
// seferin kalkışı yoktur, iskelede bekleyenler bir sonrakine biner, gelen yolcular yanaşınca iner). Kimse yaralanmaz.
// Her şey (dakika, plan, dünya) işlevidir: video günün her saniyesini aynı çizer.
import * as THREE from "three";
import { DIL } from "./olay-ayar.js";
import { VAPUR_OLAY as V, vapurGecikmesi, vapurOlayGecikme } from "./ferry.js";
import { romorkor, kopukHavuzu, tekneIzi, dumanKur, figurler, ease, clamp01, lerp } from "./olay-tekne.js";

const TUG = 18; // römorkör boyu (m)

export function buildVapurOlay({ world, scene }) {
  const f = world.features.find((x) => x.type === "vapur");
  const pier = world.ferryPier;
  let G = null; // geometriler (ilk olay günü kurulur)
  let K = null; // bugünkü kurgu
  const _p = { x: 0, z: 0, h: 0 }, _q = { x: 0, z: 0, h: 0 }, _r = { x: 0, z: 0, h: 0 }, _s1 = { x: 0, z: 0, h: 0 }, _s2 = { x: 0, z: 0, h: 0 };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

  function geoKur() {
    const group = new THREE.Group();
    group.name = "olay-vapur";
    scene.add(group);
    const tug = romorkor(TUG);
    group.add(tug.mesh);
    // Halat: birim silindir (y ekseni), her kare iki uç arasına yerleştirilir.
    const halat = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#d9cfa8", roughness: 0.9 }));
    group.add(halat);
    const kop = kopukHavuzu(group, 260);
    const duman = dumanKur(group, 24, "#2b2c2f");
    // Güverte yolcuları: vapurun çocuğu (vapurla birlikte döner, sallanır).
    const yolcu = figurler(26, 3);
    yolcu.visible = false;
    world.vapur3d?.add(yolcu);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    const yerler = [];
    // Pruva güvertesi (iskeleye bakan sivri uç, yerel −z), üst güvertenin ön kısmı ve kıç güvertesi; yüzler dışarı/iskeleye.
    for (let i = 0; i < 10; i++) yerler.push([(i % 5 - 2) * 1.5 * (1 - (Math.floor(i / 5)) * 0.3), 3.2, -19.6 - Math.floor(i / 5) * 2.0, Math.PI + (i % 5 - 2) * 0.25]);
    for (let i = 0; i < 9; i++) yerler.push([(i % 3 - 1) * 2.6, 5.93, -16.8 + Math.floor(i / 3) * 2.4, Math.PI + (i % 3 - 1) * 0.4]);
    for (let i = 0; i < 7; i++) yerler.push([(i % 4 - 1.5) * 2.2, 3.2, 19.5 + Math.floor(i / 4) * 2.2, i % 2 ? -Math.PI / 2 : Math.PI / 2]);
    yerler.forEach(([x, y, z, h], i) => { q.setFromAxisAngle(Y, h); yolcu.setMatrixAt(i, m4.compose(pv.set(x, y, z), q, s1)); });
    group.visible = false;
    return { group, tug, halat, kop, duman, yolcu };
  }

  // Vapurun yolu (harbor.js setMinute ile aynı): u = 0 iskelede, 1 açıkta.
  const yol = (u, out) => { out.x = f.x + 26 * u * u; out.z = f.z + 160 * u; out.h = -0.5 * Math.sin(Math.PI * Math.min(1, u * 1.6)); return out; };

  /** Vapurun olay anındaki duruşu (t: olayın başından dk). */
  function vapurPoz(t, out) {
    if (t < V.ariza) return yol(1 - (1 - K.uDur) * (1 - (1 - t / V.ariza) ** 2), out);
    const S = yol(K.uDur, _s1);
    const sx = S.x, sz = S.z, sh = S.h;
    // Sürüklenme: akıntı vapuru birkaç metre doğuya iter, burnu döner (kayık gibi sallanır).
    const w = ease((Math.min(t, V.baglama) - V.ariza) / (V.baglama - V.ariza));
    const dx = sx + 7 * w + 0.4 * Math.sin(t * 0.8), dz = sz + 4 * w, dh = sh - 0.3 * w + 0.025 * Math.sin(t * 0.9);
    if (t < V.baglama) { out.x = dx; out.z = dz; out.h = dh; return out; }
    // Çekme: römorkör halatla iskele önüne (u = uCek) çeker; burun düzelir.
    const P2 = yol(V.uCek, _s2), p2x = P2.x + 3, p2z = P2.z, p2h = 0;
    const dD = V.baglama + 0.001;
    const ddx = sx + 7 + 0.4 * Math.sin(dD * 0.8), ddz = sz + 4, ddh = sh - 0.3 + 0.025 * Math.sin(dD * 0.9);
    if (t < V.cekSon) { const u = ease((t - V.baglama) / (V.cekSon - V.baglama)); out.x = lerp(ddx, p2x, u); out.z = lerp(ddz, p2z, u); out.h = lerp(ddh, p2h, u); return out; }
    if (t < V.cekSon + 1) { out.x = p2x; out.z = p2z; out.h = p2h; return out; }
    // Yanaşma: römorkör yandan iter.
    const u = ease((t - V.cekSon - 1) / (V.yanSon - V.cekSon - 1));
    out.x = lerp(p2x, f.x, u); out.z = lerp(p2z, f.z, u); out.h = lerp(p2h, 0, u);
    return out;
  }
  /** Vapur yerelinden (x, z) dünyaya. */
  const yerel = (P, lx, lz, out) => { const c = Math.cos(P.h), s = Math.sin(P.h); out.x = P.x + lx * c + lz * s; out.z = P.z - lx * s + lz * c; return out; };

  /** Römorkörün duruşu (t dk); görünmüyorsa null. Pruva yerel +z; h: pruvanın yönü. */
  const _v = { x: 0, z: 0, h: 0 }, _w = { x: 0, z: 0, h: 0 };
  function tugPoz(t, out) {
    if (!K || t < V.romorkor || t > V.yanSon + 12) return null;
    const ON = -(26 + 13 + TUG / 2); // çekerken vapurun burnunun önünde (halat 13 m)
    const yan = 5.6 + TUG / 2 + 0.3; // iterken yanında (pruvası bordaya dayalı)
    if (t < V.baglama) {
      // Açıktan gelir (F0 → Q: vapurun doğu yanı), sonra burnun önüne döner.
      vapurPoz(V.baglama, _v);
      const T1 = V.baglama - 2.2;
      if (t < T1) {
        yerel(_v, 30, 10, _w);
        const u = (t - V.romorkor) / (T1 - V.romorkor), e = 1 - (1 - u) ** 1.6; // sona doğru yavaşlar
        const x0 = K.F0[0], z0 = K.F0[1];
        // İkinci dereceden eğri: açıktan dümdüz kuzeye, sonra vapura doğru kıvrılır.
        const cx = _w.x + 40, cz = _w.z + 260;
        const m = 1 - e;
        out.x = m * m * x0 + 2 * m * e * cx + e * e * _w.x; out.z = m * m * z0 + 2 * m * e * cz + e * e * _w.z;
        const tx = 2 * m * (cx - x0) + 2 * e * (_w.x - cx), tz = 2 * m * (cz - z0) + 2 * e * (_w.z - cz);
        out.h = Math.atan2(tx, tz);
        return out;
      }
      // Q'dan burnun önüne yay: vapur çerçevesinde (30, 10) → (18, −40) → (0, ON).
      const u = ease((t - T1) / (V.baglama - T1));
      const m = 1 - u, lx = m * m * 30 + 2 * m * u * 22 + u * u * 0, lz = m * m * 10 + 2 * m * u * (-48) + u * u * ON;
      yerel(_v, lx, lz, out);
      const tlx = 2 * m * (22 - 30) + 2 * u * (0 - 22), tlz = 2 * m * (-48 - 10) + 2 * u * (ON + 48);
      // Teğet yönünde ilerler; son kısımda pruvası kuzeye (vapurun burnu yönüne) döner.
      const ht = _v.h + Math.atan2(tlx, tlz);
      out.h = ht + ((((_v.h + Math.PI - ht) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * ease((u - 0.6) / 0.4);
      return out;
    }
    if (t < V.cekSon) { vapurPoz(t, _v); yerel(_v, 0, ON, out); out.h = _v.h + Math.PI; return out; }
    if (t < V.cekSon + 1) {
      // Halatı bırakır, vapurun doğu yanına geçer (pruvası bordaya döner).
      vapurPoz(t, _v);
      const u = ease(t - V.cekSon), m = 1 - u;
      const lx = m * m * 0 + 2 * m * u * 20 + u * u * yan, lz = m * m * ON + 2 * m * u * (-30) + u * u * (-4);
      yerel(_v, lx, lz, out);
      out.h = _v.h + lerp(Math.PI, -Math.PI / 2 + 2 * Math.PI, u);
      return out;
    }
    if (t < V.yanSon + 2) { vapurPoz(t, _v); yerel(_v, yan, -4, out); out.h = _v.h - Math.PI / 2; return out; }
    // Ayrılış: geri çekilir, döner ve açığa gider.
    vapurPoz(V.yanSon, _v);
    const u = (t - V.yanSon - 2) / 10;
    yerel(_v, yan, -4, _w);
    const hF = Math.atan2(K.F0[0] - _w.x - 12, K.F0[1] - _w.z - 4);
    if (u < 0.15) { const e = ease(u / 0.15); out.x = _w.x + 12 * e; out.z = _w.z + 4 * e; out.h = lerp(-Math.PI / 2, hF, e); return out; }
    const e = (u - 0.15) / 0.85, ee = e * e * (1.5 - 0.5 * e);
    out.x = _w.x + 12 + (K.F0[0] - _w.x - 12) * ee * 0.6; out.z = _w.z + 4 + (K.F0[1] - _w.z - 4) * ee * 0.6;
    out.h = hF;
    return out;
  }

  function gunBasi() { vapurGecikmesi(null); if (world.vapurOlay) world.vapurOlay = null; }

  function kur(o) {
    if (!f || !pier) return null;
    G ??= geoKur();
    const g = vapurOlayGecikme(o);
    vapurGecikmesi(g);
    // Durduğu yer: vapurun iskeleye yakın ucu iskelenin ucundan ~34 m açıkta (Driftwood'da iskele uzun: daha açıkta).
    const uDur = Math.max(0.5, Math.min(0.85, (pier.z1 + 34 + 26 - f.z) / 160));
    K = { o, A: g.A, A2: g.A2, F0: [f.x + 520, f.z + 2100], uDur };
    const S = yol(uDur, { x: 0, z: 0, h: 0 });
    world.vapurOlay = (m) => {
      const t = m - o.bas;
      if (t < 0 || m >= K.A2) return null;
      if (t < V.ariza && 1 - (1 - K.uDur) * (1 - (1 - t / V.ariza) ** 2) >= 0.98) return null; // henüz ufukta (görünmez)
      vapurPoz(t, _p);
      return { x: _p.x, z: _p.z, rot: _p.h, kopru: false };
    };
    const ucZ = pier.z1, mesafe = Math.max(10, Math.round((S.z - 26 - ucZ) / 5) * 5);
    K.mesafe = mesafe;
    const kal = [(pier.x0 + pier.x1) / 2, pier.z1 - 7];
    // Kamera: denizden (güneydoğu), vapur önde, arkada iskele ve kasaba; kalabalık çekimi iskeleden vapura.
    // odak dizisi her karede vapurun o anki yerine güncellenir (update): kalabalık çekimi ve "Olaya git" vapuru izler; seyirci yerleri
    // gün başında (durduğu yer) kurulur.
    K.odak = [S.x + 4, S.z + 2];
    return { odak: K.odak, odakY: 4, kalabalik: kal, kiyi: null, yon: Math.atan2(0.55, 1), yerAdi: DIL === "en" ? "Ferry Landing" : "Vapur İskelesi", zaman: null,
      gitD: 115, gitEgim: 0.36, cekimOlcek: 1.9, cekimOlcekH: 1.5, kalabalikArkadan: true };
  }

  function update(o, evre, minute, real, env) {
    if (!G) return;
    if (!o || !K || K.o !== o) { G.group.visible = false; G.yolcu.visible = false; return; }
    const t = minute - o.bas;
    if (t >= V.ariza) { if (minute >= K.A2) { K.odak[0] = f.x; K.odak[1] = f.z; } else { vapurPoz(t, _p); K.odak[0] = _p.x; K.odak[1] = _p.z; } }
    const vapurVar = t >= 0 && minute < K.A2 + 0.6;
    const tugVar = tugPoz(t, _q);
    G.group.visible = !!(vapurVar || tugVar);
    // Yolcular: vapur görünürken güvertede; yanaştıktan sonra inerler (sayı azalır).
    const inis = clamp01((minute - K.A2) / 0.6);
    G.yolcu.visible = t >= 0 && minute < K.A2 + 0.6;
    G.yolcu.count = Math.round(26 * (1 - inis));
    if (!G.group.visible) return;
    const sec = t * 60;
    G.tug.mesh.visible = !!tugVar;
    if (tugVar) { G.tug.mesh.position.set(_q.x, 0.15 + 0.08 * Math.sin(real * 1.3), _q.z); G.tug.mesh.rotation.set(0.01 * Math.sin(real * 0.9), _q.h, 0.015 * Math.sin(real * 1.1)); }
    // Halat: çekerken römorkörün kıçından vapurun burnuna (hafif sarkık değil, gergin).
    const halatVar = !!tugVar && t >= V.baglama - 0.15 && t < V.cekSon + 0.1;
    G.halat.visible = halatVar;
    if (halatVar) {
      vapurPoz(t, _p);
      yerel(_p, 0, -25.6, _r); v1.set(_r.x, 3.2, _r.z);
      const c = Math.cos(_q.h), s = Math.sin(_q.h), kz = G.tug.kic[2];
      v2.set(_q.x + s * kz, G.tug.kic[1], _q.z + c * kz);
      const d = v2.clone().sub(v1), L = d.length();
      G.halat.position.copy(v1); G.halat.scale.set(1, L, 1);
      G.halat.quaternion.setFromUnitVectors(Y, d.normalize());
    }
    // Köpük: römorkörün izi ve çekerken/iterken pervane çalkantısı; vapurun yaklaşırken izi.
    G.kop.basla();
    if (tugVar) {
      tekneIzi(G.kop, (sn, out) => tugPoz(sn / 60, out), sec, { boy: TUG, en: TUG * 0.38, hiz0: 3.5, n: 12, dt: 1.2 });
      const calis = t >= V.baglama && t < V.yanSon ? 1 : 0;
      if (calis) {
        const c = Math.sin(_q.h), z = Math.cos(_q.h);
        for (let k = 0; k < 4; k++) {
          const d = TUG * 0.5 + 2 + k * 3.2, ph = 0.5 + 0.5 * Math.sin(real * 2.1 + k * 1.7);
          G.kop.leke(_q.x - c * d, _q.z - z * d, 1.8 + k * 0.9, 2.2 + k * 0.6, (0.75 - k * 0.15) * (0.7 + 0.3 * ph), _q.h);
        }
      }
    }
    if (t >= 0 && t < V.ariza + 0.5) tekneIzi(G.kop, (sn, out) => vapurPoz(sn / 60, out), sec, { boy: 50, en: 11, hiz0: 3, n: 8, dt: 1.5, guc: 0.8 });
    G.kop.bitir(env?.light ?? 1);
    // Kara duman: arıza anında bacadan (yerel 0, 12, −3) yoğun, 4 dakikada söner.
    if (vapurVar) {
      vapurPoz(t, _p); yerel(_p, 0, -3, _r);
      G.duman.ciz(_r.x, 12.4, _r.z, sec, (dg) => { const dk = dg / 60 - V.ariza + 0.1; return dk < 0 ? 0 : Math.max(0, 1 - dk / 4) * (dk < 0.3 ? dk / 0.3 : 1); });
    } else G.duman.gizle();
  }

  function canli(minute) {
    if (!K) return null;
    const t = minute - K.o.bas;
    if (t < 0 || t > K.o.son - K.o.bas) return null;
    if (minute >= K.A2) return [f.x, 4, f.z];
    vapurPoz(t, _p);
    return [_p.x, 4, _p.z];
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const t = minute - o.bas, n = S.seyirci, ariza = o.bas + V.ariza, bekle = Math.round(V.baglama - V.ariza);
    if (t < V.ariza) return null; // henüz arıza yok (vapur yaklaşıyor)
    if (DIL === "en") {
      const izle = n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} watched from the pier.` : "";
      const bas = `At ${saatYaz(ariza)} the ferry's engine quit as it came in; black smoke poured from its funnel and it stopped about ${K.mesafe} m off the end of the pier.`;
      if (t < V.romorkor) return { kisa: "The ferry broke down!", uzun: `${bas} Passengers are waiting on deck.` };
      if (t < V.baglama) return { kisa: "A tug is coming for the ferry", uzun: `${bas} A tug is on its way out to it; passengers are waiting on deck.` };
      if (t >= V.cekSon && minute < K.A2) return { kisa: "Tug pushing the ferry to the landing", uzun: `${bas} A tug towed it in and is now pushing it alongside the landing.` };
      if (minute < K.A2) return { kisa: "Tug towing the ferry in", uzun: `${bas} A tug took a line and is towing the ferry to the landing.` };
      return { kisa: `Ferry breakdown ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(ariza)}`, uzun: `${bas} It sat there for ${bekle} minutes until a tug came out, took a line and towed it in; the ferry tied up at ${saatYaz(K.A2)}, 20 minutes late.${izle}` };
    }
    const izle = n ? ` ${n} kişi iskeleden izledi.` : "";
    const bas = `Saat ${saatte(ariza)} iskeleye gelen vapurun makinesi durdu; bacasından kara duman çıktı, vapur iskelenin ${K.mesafe} metre kadar açığında kaldı.`;
    if (t < V.romorkor) return { kisa: "Vapur açıkta arızalandı!", uzun: `${bas} Yolcular güvertede bekliyor.` };
    if (t < V.baglama) return { kisa: "Arızalı vapura römorkör geliyor", uzun: `${bas} Açıktan bir römorkör geliyor; yolcular güvertede bekliyor.` };
    if (t >= V.cekSon && minute < K.A2) return { kisa: "Römorkör vapuru iskeleye yanaştırıyor", uzun: `${bas} Römorkör vapuru halatla çekti, şimdi yandan iterek iskeleye yanaştırıyor.` };
    if (minute < K.A2) return { kisa: "Römorkör vapuru çekiyor", uzun: `${bas} Römorkör halatı bağladı, vapuru iskeleye çekiyor.` };
    return { kisa: `Bugün vapur arızalandı · ${saatYaz(ariza)}`, uzun: `${bas} Vapur ${bekle} dakika açıkta bekledi; bir römorkör gelip halatla çekti ve ${saatte(K.A2)} iskeleye yanaştırdı. Sefer 20 dakika gecikti.${izle}` };
  }

  return {
    kur, update, canli, yazi, gunBasi,
    seyirci: { r0: 2, r1: 24, isR: 300, uzak: 1.6, kiyida: true, en: 30, tavirlar: ["cek", "goster", "bak", "cek", "konus", "sasir"] },
  };
}
