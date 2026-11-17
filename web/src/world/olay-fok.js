// Fok (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// Mercanada: nadir görülen tek bir Akdeniz foku (Marmara'da gerçekten görülüyor) kıyının açığından yüzüp gelir, başını
// sudan çıkarıp etrafa bakar, kıyıya yakın kayaya çıkar, güneşlenir (muz duruşu, yuvarlanma, etrafa bakma), sonra suya
// kayıp açığa yüzer. Driftwood: bir grup liman foku (benekli, daha küçük) tek tek gelip kıyının önündeki kaya sırtına çıkar.
// Kayalar yalnız olay günü görünür (olay günü değilse hiçbir şey kurulmaz). Sakinler kıyıdan izler.
// Her şey (dakika, o.tohum, dünya) işlevidir: Math.random ve kare arası birikim yok.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DIL, FOK } from "./olay-ayar.js";
import { TAU, ss, mix, hr, kiyiYeri, kiyiAdi, iskeleUzak, vapurUzak, govde, levha, boyaLevha, kure, suAlti, kopukHavuzu } from "./olay-kiyi.js";

// Fok türleri: L boy (m), renkler, benek.
const TURLER = {
  kesis: { L: 2.4, sirt: "#38332f", yan: "#544b44", karin: "#8a8174", leke: "#d6cfbf", benek: 0 },
  liman: { L: 1.6, sirt: "#5f6468", yan: "#8b8e8f", karin: "#c3bfb4", leke: "#c3bfb4", benek: 0.3 },
};
const BOYUN = 0.2, KALCA = 0.8, YO = 0.15; // YO: yatarken gövde ortasının taştan yüksekliği (boya oranı) // baş ve arka yüzgeç eklemleri (boya oranı)

function fokGeo(T) {
  const L = T.L, c = (h) => new THREE.Color(h), SIRT = c(T.sirt), YAN = c(T.yan), KARIN = c(T.karin), LEKE = c(T.leke), BEN = c("#3f4346");
  const boya = (C, sa, s, k) => {
    if (sa > 0.05) C.copy(YAN).lerp(SIRT, ss(0.05, 0.7, sa));
    else C.copy(KARIN).lerp(YAN, ss(-0.6, 0.05, sa));
    if (T.leke !== T.karin && s > 0.42 && s < 0.66 && sa < -0.55) C.copy(LEKE); // keşiş fokunun karın lekesi
    if (T.benek && sa > -0.3 && hr(Math.round(s * 977), k, 5) < T.benek) C.lerp(BEN, 0.7); // liman fokunun benekleri
  };
  // Gövde (boyun → kalça): yatarken basık (wx > wy).
  const pr = (rows) => rows.map(([s, r, wx, wy, yo]) => [s, r * L, wx, wy, yo * L]);
  const g = govde(pr([[0.16, 0.105, 1.0, 0.95, 0.0], [0.24, 0.15, 1.08, 0.92, 0.0], [0.34, 0.172, 1.12, 0.9, 0.0], [0.46, 0.178, 1.14, 0.88, 0.0], [0.58, 0.163, 1.12, 0.88, 0.0], [0.68, 0.13, 1.08, 0.88, 0.005], [0.77, 0.09, 1.04, 0.86, 0.01], [0.84, 0.055, 1.0, 0.85, 0.01]]), L, 12, boya, true, true);
  const yuzgec = (sg) => {
    const f = levha([[0, 0.02], [0.07 * sg, -0.01], [0.16 * sg, -0.05], [0.19 * sg, -0.08], [0.1 * sg, -0.07], [0, -0.05]].map(([x, y]) => [x * L, y * L]), 0.012 * L, (C) => C.copy(YAN));
    f.rotateX(Math.PI / 2).rotateZ(-0.35 * sg).translate(0.1 * L * sg, -0.07 * L, L * (0.5 - 0.32));
    return boyaLevha(f);
  };
  const govdeG = mergeGeometries([g, yuzgec(1), yuzgec(-1)]);
  // Baş: boyundan buruna (pivot boyunda, z = 0).
  const bas = govde(pr([[0.0, 0.03, 1.0, 0.85, -0.012], [0.03, 0.055, 1.0, 0.85, -0.01], [0.065, 0.078, 1.05, 0.95, 0.0], [0.11, 0.095, 1.08, 1.0, 0.006], [0.16, 0.1, 1.04, 0.98, 0.003], [0.21, 0.105, 1.0, 0.95, 0.0]]), L, 10, boya, true, false);
  const z0 = L * (0.5 - BOYUN);
  const basG = mergeGeometries([bas, kure(0.014 * L, 0.058 * L, 0.035 * L, L * (0.5 - 0.075), "#141414"), kure(0.014 * L, -0.058 * L, 0.035 * L, L * (0.5 - 0.075), "#141414"),
    kure(0.008 * L, 0, -0.004 * L, L * (0.5 - 0.004), "#1e1e1e")]).translate(0, 0, -z0);
  // Arka: kalçadan kuyruk ucuna + iki yelpaze yüzgeç (pivot kalçada).
  const arka = govde(pr([[0.8, 0.07, 1.05, 0.85, 0.01], [0.86, 0.045, 1.0, 0.8, 0.01], [0.9, 0.03, 1.0, 0.75, 0.01]]), L, 10, boya, false, true);
  const fan = (sg) => {
    const f = levha([[0, 0], [0.04 * sg, -0.02], [0.075 * sg, -0.1], [0.035 * sg, -0.115], [0.008 * sg, -0.095]].map(([x, y]) => [x * L, y * L]), 0.01 * L, (C) => C.copy(SIRT));
    f.rotateX(Math.PI / 2).translate(0.01 * L * sg, 0.0, L * (0.5 - 0.88));
    return boyaLevha(f);
  };
  const zk = L * (0.5 - KALCA);
  const arkaG = mergeGeometries([arka, fan(1), fan(-1)]).translate(0, 0, -zk);
  return { govde: govdeG, bas: basG, arka: arkaG, zBas: z0, zArka: zk, yari: 0.12 * L };
}

/** Kaya: basık, üstü düzleştirilmiş, ıslak (koyu) bel çizgili. */
function kayaGeo(rx, ry, rz, tohum, renk) {
  const g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute("uv"); g.deleteAttribute("normal");
  const p = g.attributes.position, col = [];
  const A = new THREE.Color(renk), B = new THREE.Color("#2f3a33"), Cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.82 + 0.3 * hr(tohum, Math.round(x * 50 + 1000), Math.round(y * 50 + 1000), Math.round(z * 50 + 1000));
    x *= n; z *= n; y *= 0.9 + 0.2 * n;
    if (y > 0.5) y = 0.5 + (y - 0.5) * 0.25; // düz tepe (fok yatsın)
    p.setXYZ(i, x * rx, y * ry, z * rz);
  }
  const ni = g.index ? g.toNonIndexed() : g, q = ni.attributes.position;
  for (let i = 0; i < q.count; i += 3) {
    const yo = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3 / ry, v = 0.85 + 0.25 * hr(tohum, i, 9);
    Cc.copy(A).multiplyScalar(v).lerp(B, yo < 0.05 ? 0.75 : 0); // su çizgisinin altı ıslak, yosunlu
    for (let k = 0; k < 3; k++) col.push(Cc.r, Cc.g, Cc.b);
  }
  ni.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  ni.computeVertexNormals();
  return ni;
}

export function buildFokOlay({ world, scene, group: olayGrubu }) {
  const AY = FOK ?? { tur: DIL === "en" ? "liman" : "kesis", sayi: DIL === "en" ? 5 : 1 };
  const T = TURLER[AY.tur] ?? TURLER.kesis;
  let G = null; // geometri ve malzemeler (ilk olay gününde kurulur)
  let K = null; // bugünkü kurgu
  const _v = new THREE.Vector3();

  function hazirla() {
    if (G) return G;
    const group = new THREE.Group(); group.name = "olay-fok"; group.visible = false;
    olayGrubu.add(group);
    const geo = fokGeo(T);
    const mat = suAlti(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.05 }));
    const foklar = [];
    for (let j = 0; j < AY.sayi; j++) {
      const kok = new THREE.Group(); kok.rotation.order = "YXZ";
      const g = new THREE.Mesh(geo.govde, mat), bas = new THREE.Group(), arka = new THREE.Group();
      bas.rotation.order = "YXZ";
      bas.position.z = geo.zBas; arka.position.z = geo.zArka;
      bas.add(new THREE.Mesh(geo.bas, mat)); arka.add(new THREE.Mesh(geo.arka, mat));
      kok.add(g, bas, arka);
      const olc = j === 0 ? 1 : 0.86 + 0.18 * hr(7, j); // grupta boylar farklı
      kok.scale.setScalar(olc);
      kok.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      group.add(kok);
      foklar.push({ kok, g, bas, arka, olc });
    }
    const kMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const kaya = new THREE.Mesh(new THREE.BufferGeometry(), kMat);
    kaya.castShadow = kaya.receiveShadow = true;
    group.add(kaya);
    const kopuk = kopukHavuzu(group, { damla: 160, leke: 90, halka: 24 });
    G = { group, geo, foklar, kaya, kopuk };
    return G;
  }

  /** Yer: kıyıdan 9–22 m açıkta 0,7–2,6 m derin, iskeleden/vapur yolundan uzak; gelişi derin sudan. */
  function yerBul(o) {
    let R = null;
    const yer = kiyiYeri(world, o, {
      tuz: 1, kaynak: ["sahil_yolu", "kasaba", "iskele"],
      deniz: (W, e2, e1) => {
        for (const d of [12, 15, 10, 18, 22]) {
          const x = W[0] + e2[0] * d, z = W[1] + e2[1] * d, h = world.height(x, z);
          if (h > -0.7 || h < -4.5) continue;
          let ok = true;
          for (const la of [-6, 0, 6]) for (const ge of [-2, 0, 3]) {
            const px = x + e1[0] * la + e2[0] * ge, pz = z + e1[1] * la + e2[1] * ge;
            if (world.height(px, pz) > -0.4 || iskeleUzak(world, px, pz) < 9 || vapurUzak(world, px, pz) < 40) ok = false;
          }
          if (!ok) continue;
          if (world.height(W[0] + e2[0] * 70, W[1] + e2[1] * 70) > -3) continue; // geliş yolu derin
          R = { x, z, d }; return true;
        }
        return false;
      },
    });
    return yer && R ? { ...yer, R } : null;
  }

  function kur(o) {
    const yer = yerBul(o);
    if (!yer) return null;
    hazirla();
    const { e1, e2, R, K: kiyi } = yer, t = o.tohum | 0, Ts = (o.son - o.bas) * 60, n = AY.sayi;
    const yaw0 = Math.atan2(e1[0], e1[1]) + (hr(t, 3) - 0.5) * 0.6; // kayalar kıyıya koşut
    // Kayalar: ana kaya (Mercanada tek fok) ya da iki sırt (Driftwood grubu) + küçük kayalar.
    const parca = [], yerler = [];
    const ekleKaya = (la, ge, rx, ry, rz, ust, ad) => {
      const c = Math.cos(yaw0), s = Math.sin(yaw0);
      const x = R.x + e1[0] * la + e2[0] * ge, z = R.z + e1[1] * la + e2[1] * ge;
      ry = Math.max(ry, (ust - world.height(x, z) + 0.4) / 1.5); // taban deniz dibine değsin (rıhtım önü derin)
      const g = kayaGeo(rx, ry, rz, t + parca.length * 13, n > 1 ? "#7f7b74" : "#b5ab99");
      const y0 = ust - ry * 0.6; // düz tepe (~0,6·ry) suyun ust m üstünde
      g.rotateY(yaw0).translate(x, y0, z);
      parca.push(g);
      if (ad) yerler.push({ x, z, y: ust, yaw: yaw0, rx });
      return [x, z, c, s];
    };
    if (n === 1) {
      ekleKaya(0, 0, T.L * 0.62, 1.3, 0.9, 0.55, true);
      ekleKaya(-T.L * 1.4, 1.2, 0.9, 1.2, 0.8, 0.25, false);
      ekleKaya(T.L * 1.2, -0.8, 0.7, 1.0, 0.6, 0.15, false);
    } else {
      ekleKaya(-2.6, 0, 4.4, 1.5, 2.2, 0.45, false);
      ekleKaya(2.9, 0.9, 3.8, 1.4, 2.0, 0.38, false);
      ekleKaya(-7.2, 1.6, 1.0, 1.1, 0.8, 0.12, false);
      ekleKaya(6.8, -0.6, 0.8, 1.0, 0.7, 0.1, false);
      // Fok yerleri sırtların üstünde (yan yana, farklı yönlerde).
      const ys = [[-4.2, -0.1, 0.45, 0.25], [-1.3, 0.35, 0.45, -0.3], [1.5, 0.7, 0.38, 2.9], [4.2, 1.1, 0.38, 0.15], [-2.8, -0.9, 0.45, 3.4]];
      for (const [la, ge, ust, dy] of ys.slice(0, n)) yerler.push({ x: R.x + e1[0] * la + e2[0] * ge, z: R.z + e1[1] * la + e2[1] * ge, y: ust, yaw: yaw0 + dy, rx: 1 });
    }
    G.kaya.geometry.dispose();
    G.kaya.geometry = mergeGeometries(parca);
    for (const g of parca) g.dispose();
    // Her fokun takvimi (saniye, olay başından): geliş, kayaya çıkış, ayrılış.
    const F = [];
    for (let j = 0; j < n; j++) {
      const Y = yerler[j];
      // Kayaya hangi yandan çıkar: denize bakan yan (yerin e2 yönünde 1,4 m).
      const kenar = [Y.x + e2[0] * (2.0 + 0.2 * j) + e1[0] * (hr(t, 20, j) - 0.5) * 1.5, Y.z + e2[1] * (2.0 + 0.2 * j) + e1[1] * (hr(t, 20, j) - 0.5) * 1.5];
      const yan = (hr(t, 21, j) - 0.5) * 2;
      const uzak = [R.x + e2[0] * (85 + 15 * hr(t, 22, j)) + e1[0] * yan * 50, R.z + e2[1] * (85 + 15 * hr(t, 22, j)) + e1[1] * yan * 50];
      const git = [R.x + e2[0] * 95 - e1[0] * yan * 60, R.z + e2[1] * 95 - e1[1] * yan * 60];
      const cik = n === 1 ? Ts * 0.15 : Ts * (0.1 + 0.22 * (j / Math.max(1, n - 1))) + 20 * hr(t, 23, j);
      const ayr = n === 1 ? Ts * 0.85 : Ts * (0.74 + 0.13 * hr(t, 24, j));
      F.push({ Y, kenar, uzak, git, gel: Math.max(30, cik - 330 - 60 * hr(t, 25, j)), cik, ayr, son: Math.min(Ts - 10, ayr + 240) });
    }
    K = { o, yer, F, Ts, t, ad: kiyiAdi(world, yer, DIL), kayada: 0 };
    const odak = n === 1 ? [yerler[0].x, yerler[0].z] : [R.x, R.z];
    // Kamera kıyıdan, biraz çapraz (kıyı ve kayalar birlikte).
    const yon = Math.atan2(kiyi[0] - odak[0], kiyi[1] - odak[1]) + ((t >> 3) & 1 ? 0.2 : -0.2);
    return { odak, odakY: 0.7, kalabalik: kiyi, kiyi, yon, yerAdi: K.ad.ad, zaman: null, gitD: n === 1 ? 42 : 55, gitEgim: 0.3, cekimOlcek: n === 1 ? 0.8 : 1 };
  }

  // --- fok durumu ---
  const D = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, basK: 0, basY: 0, arkaK: 0, suda: true, gorunur: false };
  /** Fok j'nin t (sn) anındaki pozu D'ye. */
  function durum(j, ts) {
    const f = K.F[j], Y = f.Y, Lb = T.L * G.foklar[j].olc;
    D.roll = 0; D.basY = 0; D.arkaK = 0; D.gorunur = ts >= f.gel && ts <= f.son;
    const yuzey = (tt, faz) => {
      // Yüzeye çıkma döngüsü: 24 sn'de bir ~8 sn yüzeyde (başı dışarıda), arada dalık.
      const per = 24, k = Math.floor((tt + faz) / per), tau = tt + faz - k * per, r = hr(K.t, 30 + j, k);
      const ac = ss(0, 1.2, tau) * (1 - ss(7.5, 9, tau));
      return { ac, dik: r < 0.3 ? ac * ss(1.5, 3, tau) * (1 - ss(6, 7.5, tau)) : 0, k, tau }; // dik: başını dikip bakma
    };
    if (ts < f.cik) {
      // Geliş: açıktan kayanın deniz yanına; son 60 sn yüzeyde.
      const u = ss(f.gel, f.cik - 20, ts), hx = f.uzak[0] + (f.kenar[0] - f.uzak[0]) * u, hz = f.uzak[1] + (f.kenar[1] - f.uzak[1]) * u;
      const yz = yuzey(ts, j * 7), son = ss(f.cik - 70, f.cik - 40, ts), ac = Math.max(yz.ac, son);
      D.x = hx; D.z = hz; D.yaw = Math.atan2(f.kenar[0] - f.uzak[0], f.kenar[1] - f.uzak[1]) + 0.25 * Math.sin(ts * 0.05 + j);
      D.y = mix(-1.3, -0.1 * Lb, ac); D.pitch = -0.32 * ac - yz.dik * 1.0 * (1 - son); D.basK = 0.25 * ac; D.suda = true;
      D.y += yz.dik * (1 - son) * 0.45 * Lb;
      return D;
    }
    if (ts < f.ayr) {
      // Kayaya çıkış (55 sn) ve güneşlenme.
      const c = (ts - f.cik) / 55;
      if (c < 1) {
        const tir = ss(0.15, 0.85, c), bob = Math.abs(Math.sin(c * Math.PI * 7)) * 0.07 * Lb * (c > 0.15 && c < 0.85 ? 1 : 0);
        D.x = mix(f.kenar[0], Y.x, tir); D.z = mix(f.kenar[1], Y.z, tir);
        D.y = mix(-0.1 * Lb, Y.y + YO * Lb, ss(0.05, 0.75, c)) + bob;
        const yon = Math.atan2(Y.x - f.kenar[0], Y.z - f.kenar[1]);
        let dy = Y.yaw - yon; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        D.yaw = yon + dy * ss(0.7, 1, c);
        D.pitch = -0.35 * Math.sin(Math.PI * ss(0.1, 0.8, c)); D.basK = 0.35 * (1 - ss(0.8, 1, c)); D.suda = c < 0.3;
        return D;
      }
      D.x = Y.x; D.z = Y.z; D.y = Y.y + YO * Lb; D.yaw = Y.yaw; D.pitch = 0; D.suda = false;
      // Davranış dilimleri (32 sn): dinlenme, muz duruşu, etrafa bakma, yan yatma.
      const tt = ts - f.cik - 55, k = Math.floor(tt / 32), tau = tt - k * 32, r = hr(K.t, 40 + j, k);
      const env = ss(0, 3, tau) * (1 - ss(26, 30, tau));
      D.basK = -0.12; // başını taşa yaslar
      if (r < 0.32) { D.basK = 0.55 * env - 0.12 * (1 - env); D.arkaK = 0.6 * env; } // muz
      else if (r < 0.55) { D.basK = 0.32 * env - 0.12 * (1 - env); D.basY = 0.7 * env * Math.sin(tau * 0.45 + j); }
      else if (r < 0.7) { D.roll = (j % 2 ? -1 : 1) * 1.15 * env; D.basK = 0.2 * env; }
      D.y += 0.004 * Lb * Math.sin(ts * 1.3 + j); // nefes
      return D;
    }
    // Ayrılış: 12 sn'de suya kayar, sonra açığa yüzer (yüzeye çıka çıka).
    const c = (ts - f.ayr) / 12;
    if (c < 1) {
      D.x = mix(Y.x, f.kenar[0], ss(0, 1, c)); D.z = mix(Y.z, f.kenar[1], ss(0, 1, c));
      D.y = mix(Y.y + YO * Lb, -0.6, ss(0.25, 1, c));
      const yon = Math.atan2(f.kenar[0] - Y.x, f.kenar[1] - Y.z);
      let dy = yon - Y.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      D.yaw = Y.yaw + dy * ss(0, 0.35, c); D.pitch = 0.3 * ss(0.3, 0.7, c); D.basK = 0; D.suda = c > 0.6;
      return D;
    }
    const u = ss(f.ayr + 12, f.son, ts), hx = f.kenar[0] + (f.git[0] - f.kenar[0]) * u, hz = f.kenar[1] + (f.git[1] - f.kenar[1]) * u;
    const yz = yuzey(ts, j * 5 + 11), ac = yz.ac * (1 - ss(f.son - 40, f.son - 10, ts));
    D.x = hx; D.z = hz; D.yaw = Math.atan2(f.git[0] - f.kenar[0], f.git[1] - f.kenar[1]); D.y = mix(-1.4, -0.1 * Lb, ac); D.pitch = -0.3 * ac; D.basK = 0.25 * ac; D.suda = true;
    return D;
  }

  function update(o, evre, minute, real, env) {
    if (!o || !K || K.o !== o || !evre || evre.ad === "sonra") {
      if (G) G.group.visible = false;
      if (!o && K) K = null;
      // Kayalar olay günü bütün gün yerinde (olaydan önce ve sonra da), foklar yalnız olayda.
      if (o && K && K.o === o && G) { G.group.visible = true; for (const f of G.foklar) f.kok.visible = false; G.kopuk.bas(); G.kopuk.bitir(); }
      return;
    }
    G.group.visible = true;
    const ts = (minute - o.bas) * 60, kp = G.kopuk;
    kp.bas(env?.light ?? 1);
    let kayada = 0;
    for (let j = 0; j < G.foklar.length; j++) {
      const F = G.foklar[j], f = K.F[j], d = durum(j, ts);
      F.kok.visible = d.gorunur && d.y > -1.25;
      if (!F.kok.visible) continue;
      F.kok.position.set(d.x, d.y, d.z);
      F.kok.rotation.set(d.pitch, d.yaw, d.roll);
      F.bas.rotation.set(-d.basK, d.basY, 0);
      F.arka.rotation.x = d.arkaK + (d.suda ? 0.25 * Math.sin(ts * 3 + j) : 0);
      if (!d.suda && ts > f.cik + 30) kayada++;
      // Suda yüzeydeyken başın çevresinde halka ve arkada iz.
      if (d.suda && d.y > -0.5) {
        const al = ss(-0.5, -0.15, d.y);
        const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), L = T.L * F.olc;
        kp.ekle("leke", d.x - fx * L * 0.4, 0.04, d.z - fz * L * 0.4, 0.45 * L, 1, 0.9 * L, 0.35 * al, d.yaw);
        kp.ekle("halka", d.x + fx * L * 0.35, 0.05, d.z + fz * L * 0.35, 0.35 * L + 0.1 * Math.sin(ts * 2 + j), 1, 0.35 * L, 0.4 * al);
      }
      // Kayaya çıkışta ve suya girişte sıçrama.
      const L = T.L * F.olc;
      kp.sicrama(f.kenar[0], f.kenar[1], 0.5, ts - (f.cik + 6), K.t + j * 17 + 1, L * 0.6);
      kp.sicrama(f.kenar[0], f.kenar[1], 1.1, ts - (f.ayr + 8), K.t + j * 17 + 2, L * 0.7);
    }
    K.kayada = kayada;
    kp.bitir();
  }

  function canli(minute) {
    if (!K) return null;
    const ts = (minute - K.o.bas) * 60;
    if (K.F.length > 1) {
      // Grup: sabit hedef, kaya sırtlarının ortası (foklar tek tek gelip gider; kamera çekim içinde sıçramasın).
      return [K.yer.R.x, 0.8, K.yer.R.z];
    }
    const d = durum(0, ts);
    return [d.x, Math.max(0.4, d.y + 0.35), d.z];
  }

  /** O dakikada kayadaki fok sayısı (metin için; görüntüyle aynı takvim). */
  const kayadakiler = (ts) => K.F.filter((f) => ts > f.cik + 30 && ts < f.ayr).length;

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K || K.o !== o) return null;
    const ts = (minute - o.bas) * 60, n = S.seyirci, A = K.ad, ilk = Math.min(...K.F.map((f) => f.cik)), sonAyr = Math.max(...K.F.map((f) => f.ayr));
    const kalis = Math.round((K.F[0].ayr - K.F[0].cik) / 60), nk = kayadakiler(ts), enCok = K.F.length;
    if (DIL === "en") {
      const izle = n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} came down to the water to watch.` : "";
      if (ts < ilk + 30) return { kisa: "Seals off the waterfront!", uzun: `At ${saatYaz(o.bas)} a harbor seal's head popped up off ${A.ad}; more seals are swimming toward the rocks near the shore.` };
      if (ts < sonAyr) return { kisa: `${nk || "Harbor"} seal${nk === 1 ? "" : "s"} on the rocks`, uzun: `Harbor seals hauled out on the rocks off ${A.ad} at ${saatYaz(o.bas + ilk / 60)} and are basking in the ${o.yuva ? "afternoon" : "morning"} light; ${nk === 1 ? "one is" : `${nk} are`} on the rocks right now.${izle}` };
      return { kisa: `Seals on the rocks ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`, uzun: `A group of ${enCok} harbor seals hauled out on the rocks off ${A.ad}, basked for about ${kalis} minutes and slipped back into the sea one by one.${izle}` };
    }
    const izle = n ? ` ${n} kişi kıyıya inip izledi.` : "";
    if (ts < ilk + 30) return { kisa: "Kıyıda bir Akdeniz foku!", uzun: `Saat ${saatte(o.bas)} ${A.in} açığında nadir görülen bir Akdeniz foku belirdi; başını sudan çıkarıp kıyıdaki kayalara doğru yüzüyor.` };
    if (ts < sonAyr) return { kisa: "Akdeniz foku kayada güneşleniyor", uzun: `${A.in} açığında görünen Akdeniz foku saat ${saatte(o.bas + ilk / 60)} kıyıya yakın kayaya çıktı ve güneşleniyor.${n ? ` ${n} kişi kıyıdan izliyor.` : ""}` };
    return { kisa: `Bugün Akdeniz foku geldi · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(o.bas)} ${A.in} açığında nadir görülen bir Akdeniz foku belirdi, kıyıya yakın kayaya çıkıp ${kalis} dakika güneşlendi, sonra suya kayıp açığa yüzdü.${izle}` };
  }

  return {
    kur, update, canli, yazi,
    seyirci: { r0: 2, r1: 13, isR: 300, uzak: 2.2, kiyida: true, en: 30, tavirlar: ["cek", "goster", "cek", "bak", "konus", "sasir", "cek"] },
  };
}
