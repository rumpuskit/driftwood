// Sıcak hava balonları (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz
// olay-moduller.js). Adanın geniş bir açıklığında (Mercanada tarlalar; Driftwood kasabanın dışındaki çayır) 4–7 renkli
// balon yerde şişirilir (önce yatarak, sonra brülörle doğrulur), sırayla havalanır, rüzgârla adanın üstünden süzülür.
// Biri alçalıp meydanın yakınındaki açık alana (saha / Town Green / park) iner ve orada söner; öbürleri uzaklaşır.
// Kimse yaralanmaz; sakinler kalkışı ve inişi izler (iniş alanı boşaltılır). Görünüm yalnız (dakika, tohum, dünya)
// işlevidir: video günün her saniyesini aynı çizer.
import * as THREE from "three";
import { DIL, ZEPLIN as AD } from "./olay-ayar.js";
import { kesir } from "./olay-plan.js";
import { isHoliday } from "../sim.js";
import { adaylar, gorevler, yerlerSec, izleDurus, agaclar, agacIzgara, pusula } from "./olay-izleyici.js";

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const lerp = THREE.MathUtils.lerp;
const RENK = ["#e63946", "#f4a261", "#f6c90e", "#2a9d8f", "#277da1", "#8e44ad", "#ffffff", "#ff6fb5", "#43aa8b", "#1d3557", "#ff7b00", "#9be564"];
// Zarf profili (m): ağız (y=0) → tepe (y=19), en geniş 8,4 m yarıçap.
const PROFIL = [[1.5, 0], [2.6, 1.2], [4.4, 3], [6.3, 5.2], [7.7, 7.8], [8.4, 10.6], [8.2, 12.8], [7.3, 14.9], [5.7, 16.7], [3.4, 18.2], [1.2, 18.9], [0.01, 19]];
const H = 19, AGIZ = 3.3; // zarf boyu; ağzın sepetin tabanından yüksekliği

/** Binadan ve ağaçtan uzak açık nokta mı (r: bina payı, ra: ağaç payı). */
function acik(world, iz, x, z, r, ra) {
  if (!world.isWalkable?.(x, z)) return false;
  const h = world.height?.(x, z) ?? 1;
  if (h < 0.8 || h > 40) return false;
  for (const b of world.buildings) { const rr = Math.max(b.w ?? 6, b.d ?? 6) / 2 + r; if (Math.abs(b.x - x) < rr && Math.abs(b.z - z) < rr && Math.hypot(b.x - x, b.z - z) < rr) return false; }
  if (iz.yakin(x, z, ra).length) return false;
  for (const p of world.plazas ?? []) if (p.r != null && Math.hypot(p.x - x, p.z - z) < p.r + 6) return false;
  for (const f of world.features ?? []) if ((f.type === "gonder" || f.type === "bandstand" || f.type === "dikilitas" || f.type === "fener") && Math.hypot(f.x - x, f.z - z) < r) return false;
  return true;
}

export function buildBalonOlay({ world, scene, group }) {
  let K = null; // bugünkü kurgu
  let G = null; // görünüm (tembel)
  const v1 = new THREE.Vector3(), q1 = new THREE.Quaternion(), AY = new THREE.Vector3(0, 1, 0);
  const merkez = () => world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];

  /** Kalkış alanı: tarla parselleri (meydana en yakın küme); yoksa kasabanın dışındaki en yakın açık çayır (tarama). */
  function kalkisYeri(iz) {
    const M = merkez();
    const tarlalar = (world.plazas ?? []).filter((p) => p.kind === "tarla" && p.x0 != null);
    if (tarlalar.length) {
      const yakin = [...tarlalar].sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - M[0], (a.z0 + a.z1) / 2 - M[1]) - Math.hypot((b.x0 + b.x1) / 2 - M[0], (b.z0 + b.z1) / 2 - M[1]))[0];
      const kume = tarlalar.filter((p) => Math.abs((p.x0 + p.x1) / 2 - (yakin.x0 + yakin.x1) / 2) < 130 && Math.abs((p.z0 + p.z1) / 2 - (yakin.z0 + yakin.z1) / 2) < 80);
      const x0 = Math.min(...kume.map((p) => p.x0)), x1 = Math.max(...kume.map((p) => p.x1)), z0 = Math.min(...kume.map((p) => p.z0)), z1 = Math.max(...kume.map((p) => p.z1));
      return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, tur: "tarla", w: x1 - x0, d: z1 - z0 };
    }
    for (let r = 220; r <= 1400; r += 40) {
      const n = Math.round((2 * Math.PI * r) / 60);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = M[0] + Math.sin(a) * r, z = M[1] + Math.cos(a) * r;
        if (!acik(world, iz, x, z, 60, 34)) continue;
        // Çevresi de açık (beş balonluk sıra için ±50 m).
        if (![[50, 0], [-50, 0], [0, 50], [0, -50]].every(([dx, dz]) => acik(world, iz, x + dx, z + dz, 30, 18))) continue;
        return { x, z, tur: world.zoneAt?.(x, z) ?? "kir", w: 100, d: 100 };
      }
    }
    return null;
  }

  /** İniş yeri: meydana yakın açık alan; futbol sahası (maç saatinde değilse), Town Green/çayır, park. */
  function inisYeri(o, iz, tIn) {
    const M = merkez();
    const wd = (o.day + 3) % 7, mac = [{ start: 1170, end: 1260 }, ...(wd >= 5 || isHoliday(o.day) ? [{ start: 900, end: 1005 }] : [])];
    const sahaBos = !mac.some((m) => tIn < m.end + 5 && o.son > m.start - 15);
    const alanlar = [];
    if (world.pitch && sahaBos) alanlar.push({ ...world.pitch, tur: "saha" });
    for (const p of world.plazas ?? []) if (["cimen", "park"].includes(p.kind) && p.x0 != null) alanlar.push({ ...p, tur: p.kind });
    for (const a of alanlar) {
      // Futbol sahası: orta yuvarlak (en geniş boşluk; kenarda ışık direkleri ve tribün var).
      if (a.tur === "saha") { const x = (a.x0 + a.x1) / 2, z = (a.z0 + a.z1) / 2; if (acik(world, iz, x, z, 18, 13)) return { x, z, tur: "saha" }; continue; }
      let en = null;
      for (let x = a.x0 + 14; x <= a.x1 - 14; x += 6) for (let z = a.z0 + 14; z <= a.z1 - 14; z += 6) {
        if (!acik(world, iz, x, z, 18, 13)) continue;
        const d = Math.abs(Math.hypot(x - M[0], z - M[1]) - 40); // çimde meydana ~40 m (çardağın, direğin dibinde değil)
        if (!en || d < en.d) en = { x, z, d, tur: a.tur };
      }
      if (en && Math.hypot(en.x - M[0], en.z - M[1]) < 420) return en;
    }
    return null;
  }

  /** Görünüm: balon başına zarf (kendi renkleri), sepet + brülör çerçevesi (ortak geometri), alev; ipler tek çizgi kümesi. */
  function gorunumKur(n, tohum) {
    if (!G) {
      const g = new THREE.Group();
      group.add(g);
      const sepetGeo = new THREE.BoxGeometry(1.3, 1.1, 1.3).translate(0, 0.55, 0);
      const kenarGeo = new THREE.BoxGeometry(1.42, 0.14, 1.42).translate(0, 1.12, 0);
      const brulorGeo = new THREE.BoxGeometry(0.7, 0.35, 0.7).translate(0, 2.55, 0);
      const pilotGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.55, 6).translate(0, 1.35, 0);
      const basGeo = new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.78, 0);
      const hasir = new THREE.MeshStandardMaterial({ color: "#8a5a2b", roughness: 1 });
      const koyu = new THREE.MeshStandardMaterial({ color: "#3a3330", roughness: 0.6, metalness: 0.4 });
      const ten = new THREE.MeshStandardMaterial({ color: "#d9a27c", roughness: 0.9 });
      const ceket = new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.9 });
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 1, 32, 32, 31);
      gr.addColorStop(0, "rgba(255,255,220,1)"); gr.addColorStop(0.35, "rgba(255,170,40,0.9)"); gr.addColorStop(1, "rgba(255,80,0,0)");
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      const alevTex = new THREE.CanvasTexture(c);
      const ipGeo = new THREE.BufferGeometry();
      ipGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(7 * 8 * 3), 3));
      const ipler = new THREE.LineSegments(ipGeo, new THREE.LineBasicMaterial({ color: "#4a3b30" }));
      ipler.frustumCulled = false;
      g.add(ipler);
      const B = [];
      for (let i = 0; i < 7; i++) {
        const kok = new THREE.Group(); // sepet tabanı
        const sepet = new THREE.Group();
        sepet.add(new THREE.Mesh(sepetGeo, hasir), new THREE.Mesh(kenarGeo, koyu), new THREE.Mesh(brulorGeo, koyu));
        const p1 = new THREE.Mesh(pilotGeo, ceket), p2 = new THREE.Mesh(pilotGeo, ceket), b1 = new THREE.Mesh(basGeo, ten), b2 = new THREE.Mesh(basGeo, ten);
        p1.position.x = b1.position.x = -0.3; p2.position.x = b2.position.x = 0.32; p2.position.z = b2.position.z = 0.15;
        sepet.add(p1, p2, b1, b2);
        const mente = new THREE.Group(); // zarfın ağzı (devrilme/doğrulma bu noktada)
        mente.position.y = AGIZ;
        const zarf = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, flatShading: true }));
        mente.add(zarf);
        const alev = new THREE.Sprite(new THREE.SpriteMaterial({ map: alevTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        alev.position.y = 3.1; alev.scale.set(1.4, 2.4, 1);
        kok.add(sepet, mente, alev);
        g.add(kok);
        B.push({ kok, sepet, mente, zarf, alev });
      }
      G = { g, B, ipler, ipGeo };
    }
    // Zarf renkleri bugünün tohumundan: dilimler (gore) iki renk, desen türü (dikey şerit, yatay bant, baklava).
    for (let i = 0; i < 7; i++) {
      const b = G.B[i];
      b.kok.visible = i < n;
      if (i >= n) continue;
      const lat = new THREE.LatheGeometry(PROFIL.map(([r, y]) => new THREE.Vector2(r, y)), 16).toNonIndexed();
      const pos = lat.attributes.position, col = new Float32Array(pos.count * 3);
      const r1 = Math.floor(kesir("balonR1", tohum, i) * RENK.length);
      let r2 = Math.floor(kesir("balonR2", tohum, i) * RENK.length); if (r2 === r1) r2 = (r2 + 3) % RENK.length;
      const c1 = new THREE.Color(RENK[r1]), c2 = new THREE.Color(RENK[r2]), c3 = new THREE.Color(RENK[(r1 + 5) % RENK.length]), koyu = new THREE.Color("#2b2b2b");
      const desen = Math.floor(kesir("balonDesen", tohum, i) * 3);
      for (let t = 0; t < pos.count; t += 3) {
        let ax = 0, ay = 0, az = 0;
        for (let k = 0; k < 3; k++) { ax += pos.getX(t + k); ay += pos.getY(t + k); az += pos.getZ(t + k); }
        ax /= 3; ay /= 3; az /= 3;
        const dilim = Math.floor(((Math.atan2(az, ax) + Math.PI) / (2 * Math.PI)) * 16) % 16, halka = Math.floor(ay / 1.9);
        let c = desen === 0 ? (dilim % 2 ? c1 : c2) : desen === 1 ? (halka >= 4 && halka <= 6 ? c2 : halka === 3 || halka === 7 ? c3 : c1) : ((dilim + halka) % 2 ? c1 : c2);
        if (ay < 1.1) c = koyu; else if (ay > 17.6) c = desen === 2 ? c3 : c1;
        for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
      }
      lat.setAttribute("color", new THREE.BufferAttribute(col, 3));
      lat.computeVertexNormals();
      b.zarf.geometry.dispose();
      b.zarf.geometry = lat;
    }
    G.g.visible = false;
  }

  function kur(o) {
    const iz = agacIzgara(agaclar(world, scene));
    const C = kalkisYeri(iz);
    if (!C) return null;
    const t0 = o.bas * 60, t1 = o.son * 60, D = t1 - t0;
    const T = { sisir: t0 + 0.13 * D, kalk: t0 + 0.22 * D, inis: t0 + 0.72 * D, yer: t0 + 0.84 * D, son: t0 + 0.9 * D, yatti: t0 + 0.97 * D };
    const L = inisYeri(o, iz, T.inis / 60);
    if (!L) return null;
    const M = merkez();
    const n = 4 + (o.tohum % 4);
    // Rüzgâr: kalkıştan inişe (inen balon doğrudan gelir); öbürleri biraz farklı yönlerde (irtifa rüzgârı), daha uzağa.
    let wx = L.x - C.x, wz = L.z - C.z;
    const uz = Math.hypot(wx, wz); wx /= uz; wz /= uz;
    const nx = -wz, nz = wx; // rüzgâra dik
    const gy0 = world.groundY?.(C.x, C.z) ?? 0;
    // Kalkış sırası: rüzgâra dik bir hat (26 m arayla), zarflar rüzgâr yönünde yatar.
    const kenar = Math.min(150, (C.tur === "tarla" ? Math.max(C.w, C.d) : 100) - 20);
    const ara = Math.min(26, kenar / Math.max(1, n - 1));
    const B = [];
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      let sx = C.x + nx * k * ara - wx * 10, sz = C.z + nz * k * ara - wz * 10;
      if (!acik(world, iz, sx, sz, 8, 8)) { sx -= wx * 12; sz -= wz * 12; }
      const gy = world.groundY?.(sx, sz) ?? gy0;
      const kalk = T.kalk + (i === 0 ? 0 : i * 0.016 * D) * (kesir("balonSira", o.tohum, i) * 0.4 + 0.8);
      const irtifa = i === 0 ? 105 : 80 + Math.floor(kesir("balonIrt", o.tohum, i) * 6) * 26;
      const sap = (kesir("balonSap", o.tohum, i) - 0.5) * 0.36; // yön sapması (rad)
      const yol = uz + 650 + kesir("balonYol", o.tohum, i) * 500; // bitişte kalkıştan uzaklık (m)
      const c = Math.cos(sap), s = Math.sin(sap);
      B.push({ i, sx, sz, gy, kalk, irtifa, dx: wx * c - wz * s, dz: wx * s + wz * c, hiz: yol / Math.max(60, t1 - kalk), sisir0: t0 + (0.02 + 0.012 * i) * D, dogrul0: T.sisir + i * 0.008 * D, faz: kesir("balonFaz", o.tohum, i) * 6.28 });
    }
    const Lgy = world.groundY?.(L.x, L.z) ?? 0;
    // Uzaklaşanların varacağı yer deniz mi (metin): bitişteki konumun zemini.
    const son = B.slice(1).map((b) => { const d = b.hiz * (t1 - b.kalk); return [b.sx + b.dx * d, b.sz + b.dz * d]; });
    const denizde = son.filter(([x, z]) => (world.height?.(x, z) ?? 1) < 0).length > son.length / 2;
    // Kamera yönü: rüzgârın üstünden (seyircilerin arkasından), biraz yandan: kalkış sırası enine görünür (sıranın ucundan
    // bakınca yakındaki balon kadrajı dolduruyordu), uçuşta balonlar kasabanın üstüne doğru uzaklaşır.
    const yan = kesir("balonYan", o.tohum) < 0.5 ? 1 : -1;
    const cx = -wx + nx * 0.35 * yan, cz = -wz + nz * 0.35 * yan;
    const odak = [C.x, C.z], kal = [C.x - wx * 40, C.z - wz * 40];
    // Kalkış seyircileri kalkış hattının kasaba tarafında (kamera karşısında); iniş seyircileri iniş yerinin meydan tarafında.
    let lx = M[0] - L.x, lz = M[1] - L.z; const ld = Math.hypot(lx, lz) || 1; lx /= ld; lz /= ld;
    let kalD = 30;
    if (L.tur === "saha") {
      // Sahada seyirciler meydan tarafında, sahanın içinde (saha boşaltılır: tahliye; seyirciler görevli, boşaltılmaz).
      const pt = world.pitch, boyunaX = pt.x1 - pt.x0 >= pt.z1 - pt.z0;
      if (boyunaX) { lx = 0; lz = Math.sign(M[1] - L.z) || 1; } else { lz = 0; lx = Math.sign(M[0] - L.x) || 1; }
      kalD = 21; // sahanın içinde, balondan 21 m (arkadan çekimde kamera 35 m: tribünün arkasına düşmesin)
    }
    K = { o, C, L, Lgy, T, B, n, t0, t1, D, wx, wz, nx, nz, denizde, odak, kal, kal1: [C.x - wx * 40, C.z - wz * 40], kal2: [L.x + lx * kalD, L.z + lz * kalD],
      yonAd: pusula(Math.atan2(wx, wz), DIL), izleyen: [0, 0] };
    K.yer = DIL === "en"
      ? { kalkis: C.tur === "tarla" ? "the farm fields" : `the meadow ${pusula(Math.atan2(C.x - M[0], C.z - M[1]), "en")} of town`, inis: L.tur === "saha" ? AD.saha.ad : L.tur === "cimen" ? AD.yedekSaha.ad : "the park" }
      : { de: C.tur === "tarla" ? "tarlalarda" : "çayırda", inisE: L.tur === "saha" ? AD.saha.e : L.tur === "cimen" ? AD.yedekSaha.e : "parka" };
    gorunumKur(n, o.tohum);
    return { odak, odakY: 10, kalabalik: kal, kiyi: null, yon: Math.atan2(cx - wx * 0.35, cz - wz * 0.35), yerAdi: null, zaman: null,
      gitD: 150, gitEgim: 0.35, gitCanli: true, cekimOlcek: 2.1, cekimOlcekH: 2.4, kalabalikArkadan: true };
  }

  /** Balonun o saniyedeki duruşu: sepet tabanı (x, y, z), zarfın devrikliği (0 dik … 1 yatık), doluluk, brülör. */
  function poz(b, sec, out) {
    const { T } = K;
    out.yatik = 0; out.dolu = 1; out.alev = 0; out.gor = sec >= K.t0 && sec <= K.t1;
    if (sec < b.kalk) {
      // Yerde: soğuk şişirme (yatık zarf dolar), sonra brülörle doğrulur.
      out.x = b.sx; out.z = b.sz; out.y = b.gy;
      out.dolu = 0.18 + 0.82 * ease((sec - b.sisir0) / (b.dogrul0 - b.sisir0));
      out.yatik = 1 - ease((sec - b.dogrul0) / (b.kalk - 30 - b.dogrul0));
      out.alev = sec > b.dogrul0 - 20 ? (((sec * 0.55 + b.faz) % 1) < 0.62 ? 1 : 0) : 0;
      return out;
    }
    const tau = sec - b.kalk;
    if (b.i === 0) {
      // İnen balon: kalkıştan iniş yerine, ortada hafif yay; yükselir, süzülür, alçalır.
      const u = ease(clamp01((sec - b.kalk) / (T.yer - b.kalk)) ** 0.92);
      const yay = Math.sin(u * Math.PI) * 60;
      out.x = lerp(b.sx, K.L.x, u) + K.nx * yay; out.z = lerp(b.sz, K.L.z, u) + K.nz * yay;
      const zemin = world.groundY?.(out.x, out.z) ?? 0;
      const tirmanis = ease(tau / 300);
      let y = lerp(b.gy, b.gy + b.irtifa, tirmanis) + Math.sin(sec * 0.05 + b.faz) * 2;
      if (sec > T.inis) y = lerp(y, K.Lgy, ease((sec - T.inis) / (T.yer - T.inis)) ** 0.8);
      out.y = sec >= T.yer ? K.Lgy : Math.max(zemin, y);
      if (sec >= T.yer) { out.x = K.L.x; out.z = K.L.z; }
      if (sec > T.son) { out.yatik = ease((sec - T.son) / (T.yatti - T.son)); out.dolu = 1 - 0.9 * out.yatik; }
      const burst = ((sec * 0.12 + b.faz) % 1) < (tau < 300 ? 0.45 : sec > T.inis && sec < T.yer ? 0.12 : 0.08);
      out.alev = sec < T.yer && burst ? 1 : 0;
      return out;
    }
    const ramp = 90, s = tau < ramp ? (b.hiz * tau * tau) / (2 * ramp) : b.hiz * (tau - ramp / 2);
    out.x = b.sx + b.dx * s; out.z = b.sz + b.dz * s;
    out.y = lerp(b.gy, b.gy + b.irtifa, ease(tau / 360)) + Math.sin(sec * 0.045 + b.faz) * 2.5;
    out.alev = ((sec * 0.11 + b.faz) % 1) < (tau < 360 ? 0.4 : 0.07) ? 1 : 0;
    return out;
  }

  const P = { x: 0, y: 0, z: 0, yatik: 0, dolu: 1, alev: 0, gor: false };
  const ekseni = new THREE.Vector3();
  function update(o, evre, minute, real) {
    if (!o || !K || K.o !== o) { if (G) G.g.visible = false; if (K && !o) K = null; return; }
    const sec = minute * 60;
    const gor = sec >= K.t0 && sec <= K.t1;
    G.g.visible = gor;
    if (!gor) return;
    const ip = G.ipGeo.attributes.position.array;
    ip.fill(0);
    ekseni.set(K.nx, 0, K.nz); // devrilme ekseni: rüzgâra dik (zarf rüzgâr yönünde yatar)
    for (const b of K.B) {
      const g = G.B[b.i];
      poz(b, sec, P);
      g.kok.position.set(P.x, P.y, P.z);
      g.kok.rotation.set(0, Math.atan2(K.wx, K.wz), 0);
      // Yatık zarf: ağız menteşesinde rüzgâr yönüne devrilir (yerel +z = rüzgâr yönü), yarıçapı doluluk kadar; yerde
      // yatarken ağız, zarfın yarıçapı kadar kalkar (zarf yere gömülmesin).
      const yat = P.yatik, r = 0.25 + 0.75 * P.dolu, ez = 1 - 0.6 * yat * (1 - P.dolu); // ez: yatık zarfın basıklığı
      g.mente.rotation.set(yat * 1.53, 0, 0);
      g.zarf.scale.set(r, 1 - 0.05 * yat, r * ez);
      g.mente.position.y = lerp(AGIZ, 8.1 * r * ez, yat);
      g.mente.position.z = -yat * 2;
      g.alev.visible = P.alev > 0;
      if (g.alev.visible) { const f = 0.85 + 0.15 * Math.sin(real * 23 + b.faz); g.alev.scale.set(1.3 * f, 2.6 * f, 1); }
      // İpler: sepet köşelerinden ağız halkasına (yalnız dikken; yatıkken zarf yerde, ipler gevşek: çizilmez).
      if (yat < 0.15) {
        const c = Math.cos(g.kok.rotation.y), s = Math.sin(g.kok.rotation.y), ay = P.y + g.mente.position.y + 0.3;
        for (let k = 0; k < 4; k++) {
          const ox = (k & 1 ? 0.65 : -0.65), oz = (k & 2 ? 0.65 : -0.65), rx = ox * 2.1 * r, rz = oz * 2.1 * r;
          const j = (b.i * 8 + k * 2) * 3;
          ip[j] = P.x + ox * c + oz * s; ip[j + 1] = P.y + 1.15; ip[j + 2] = P.z - ox * s + oz * c;
          ip[j + 3] = P.x + rx * c + rz * s; ip[j + 4] = ay; ip[j + 5] = P.z - rx * s + rz * c;
        }
      }
    }
    G.ipGeo.attributes.position.needsUpdate = true;
    // Video ve "Olaya git": odak/kalabalık kalkıştan inişe geçer (yerinde değiştirilir; olay.js her karede api'ye kopyalar).
    const iniste = sec >= K.T.inis - 120;
    const [ox, oz] = iniste ? [K.L.x, K.L.z] : [K.C.x, K.C.z], kk = iniste ? K.kal2 : K.kal1;
    K.odak[0] = ox; K.odak[1] = oz; K.kal[0] = kk[0]; K.kal[1] = kk[1];
  }

  /** Hareketli hedef: kalkıştan önce kalkış alanı (şişen zarfların ortası), sonra inen balonun zarfının ortası. */
  function canli(minute) {
    if (!K) return null;
    const sec = minute * 60;
    if (sec < K.t0 || sec > K.t1) return null;
    const b = K.B[0];
    // Yerde: sepet sırasının 6 m önü (rüzgâr üstü), 3 m yükseklik: hedef zarfların içinde kalmasın (video kamerası engel sanıp
    // zarfın dibine giriyordu).
    if (sec < b.kalk - 20) { const x = K.C.x - K.wx * 16, z = K.C.z - K.wz * 16; return [x, (world.groundY?.(x, z) ?? b.gy) + 3, z]; }
    poz(b, sec, P);
    return [P.x, P.y + (P.yatik > 0.5 ? 4 : 11), P.z];
  }

  /** Seyirciler: kalkışı izleyenler (olayın başından kalkışa dek) ve inişi izleyenler (iniş alanının kenarında). */
  function gorev(people, day, S, plans) {
    if (!K) return [];
    const { o, T } = K, haric = new Set(), out = [];
    const hedefK = [K.C.x, K.C.z];
    const a1 = adaylar(people, day, plans, world, { T: o.bas + 4, odak: hedefK, isR: 260, uzak: 2, disari: true, haric });
    const y1 = yerlerSec(world, null, K.kal1, hedefK, Math.min(24, a1.length), 6, 20, o.tohum, { kiyida: true, yay: 2.2 });
    const g1 = gorevler(people, day, a1, y1, { T0: o.bas + 3, dagilim: 8, kal: [16, 26], Tson: T.kalk / 60 + 10, modul: "balon", tavirlar: ["cek", "goster", "bak", "cek", "siper", "konus"], ek: { grup: 1 }, tuz: "b1" });
    g1.forEach((g) => haric.add(g.i));
    const tIn = T.inis / 60;
    const a2 = adaylar(people, day, plans, world, { T: tIn + 2, odak: [K.L.x, K.L.z], isR: 300, uzak: 2, haric });
    const y2 = yerlerSec(world, null, K.kal2, [K.L.x, K.L.z], Math.min(26, a2.length), 3, 12, o.tohum + 7, { kiyida: true, yay: 2.6 });
    // Yer, iniş çemberinin (20 m) dışında kalsın.
    const y2b = y2.filter((q) => Math.hypot(q.x - K.L.x, q.z - K.L.z) > 21);
    const g2 = gorevler(people, day, a2, y2b, { T0: tIn + 1, dagilim: 5, kal: [12, 20], Tson: o.son + 2, modul: "balon", tavirlar: ["cek", "goster", "sasir", "cek", "bak", "konus"], ek: { grup: 2 }, tuz: "b2" });
    K.izleyen = [g1.length, g2.length];
    return [...g1, ...g2];
  }

  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    // Kalkış seyircisi şişen/yükselen balonlara, iniş seyircisi inen balona bakar.
    let h = null;
    if (K) {
      if (it.grup === 2) h = canli(minute);
      else {
        const sec = minute * 60, b = K.B[Math.floor(Math.abs(it.x * 13 + it.z * 7)) % K.n];
        poz(b, sec, P); h = [P.x, P.y + 10, P.z];
      }
    }
    return izleDurus(it, t, p, ph, stand, idleGesture, h, world.groundY?.(it.x, it.z) ?? 0);
  }

  /** İniş alanı boşaltılır (alçalma başlarken içindeki herkes kenara yürür); kalkış hattındakiler de kenara. */
  function tahliye(x, z, minute) {
    if (!K) return null;
    const sec = minute * 60, { T, L } = K;
    const alan = (cx, cz, R, s0, s1) => {
      if (sec < s0 || sec > s1 + 60) return null;
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d > R) return null;
      const a = Math.atan2(dx, dz) || 0, R2 = R + 1.5 + (Math.abs(a * 7.3) % 1.4);
      const e = Math.min(1, (sec - s0) / 60, (s1 + 60 - sec) / 60);
      const rr = d + (R2 - d) * clamp01(e), nx = cx + Math.sin(a) * rr, nz = cz + Math.cos(a) * rr;
      return { x: nx, z: nz, heading: e < 1 ? a : a + Math.PI, yuru: e < 1 ? (Math.abs(rr - d) / 0.72) * Math.PI : 0 };
    };
    if (L.tur === "saha" && sec > T.inis - 180 && sec < K.t1 + 60) {
      // Saha boşaltılır (zeplin inişi gibi): içindeki herkes (antrenman, maç) en yakın uzun kenarın dışına yürür.
      const pt = world.pitch, boyunaX = pt.x1 - pt.x0 >= pt.z1 - pt.z0;
      if (x > pt.x0 && x < pt.x1 && z > pt.z0 && z < pt.z1) {
        const u = boyunaX ? x : z, w = boyunaX ? z : x, w0 = boyunaX ? pt.z0 : pt.x0, w1 = boyunaX ? pt.z1 : pt.x1;
        const w2 = w - w0 < w1 - w ? w0 - 2 - (Math.abs(u * 7.3) % 1.6) : w1 + 2 + (Math.abs(u * 7.3) % 1.6);
        const e = Math.min(1, (sec - (T.inis - 180)) / 60, (K.t1 + 60 - sec) / 60);
        const ww = w + (w2 - w) * clamp01(e), nx = boyunaX ? x : ww, nz = boyunaX ? ww : z;
        const bak = Math.atan2(L.x - nx, L.z - nz);
        return { x: nx, z: nz, heading: e < 1 ? Math.atan2(nx - x, nz - z) || 0 : bak, yuru: e < 1 ? (Math.abs(ww - w) / 0.72) * Math.PI : 0 };
      }
    }
    const q = L.tur === "saha" ? null : alan(L.x, L.z, 18, T.inis - 180, K.t1);
    if (q) return q;
    for (const b of K.B) { const r = alan(b.sx + K.wx * 10, b.sz + K.wz * 10, 14, K.t0, b.kalk + 60); if (r) return r; }
    return null;
  }

  function ses(minute) {
    if (!K) return null;
    const sec = minute * 60;
    return sec > K.T.yer - 60 && sec < K.T.yer + 600 ? { kalabalik: 0.45 } : null;
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const sec = minute * 60, { n, T } = K, kalk = K.B[0].kalk / 60, yer = T.yer / 60, [i1, i2] = K.izleyen;
    if (DIL === "en") {
      const Y = K.yer, izle1 = i1 ? ` ${i1} ${i1 === 1 ? "neighbor" : "neighbors"} came out to watch.` : "";
      const gitti = K.denizde ? `drifted ${K.yonAd} out over the sea` : `drifted on to the ${K.yonAd}`;
      if (sec < K.B[0].kalk) return { kisa: `Hot air balloons on ${Y.kalkis}!`, uzun: `At ${saatYaz(o.bas)} crews began inflating ${n} hot air balloons on ${Y.kalkis}.${izle1}` };
      if (sec < T.inis) return { kisa: `${n} hot air balloons over the island!`, uzun: `At ${saatYaz(kalk)} ${n} hot air balloons lifted off from ${Y.kalkis} and are drifting ${K.yonAd} over the island.${izle1}` };
      if (sec < T.yer) return { kisa: `A balloon is coming down`, uzun: `${n} hot air balloons lifted off from ${Y.kalkis} at ${saatYaz(kalk)}. One of them is descending toward ${Y.inis}.` };
      const izle2 = i2 ? ` ${i2} ${i2 === 1 ? "neighbor" : "neighbors"} gathered at the edge to watch it land.` : "";
      if (minute < o.son) return { kisa: `Balloon landed on ${Y.inis}`, uzun: `${n} hot air balloons lifted off from ${Y.kalkis} at ${saatYaz(kalk)}. One landed on ${Y.inis} at ${saatYaz(yer)}.${izle2} The other ${n - 1} ${gitti}.` };
      return { kisa: `Hot air balloons ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`, uzun: `At ${saatYaz(kalk)} ${n} hot air balloons lifted off from ${Y.kalkis} and drifted over the island. One landed on ${Y.inis} at ${saatYaz(yer)}, and its envelope was laid down on the grass.${izle2} The other ${n - 1} ${gitti}.` };
    }
    const Y = K.yer, izle1 = i1 ? ` ${i1} kişi izlemeye geldi.` : "", izle2 = i2 ? ` ${i2} kişi alanın kenarına toplandı.` : "";
    const gitti = K.denizde ? `denizin üstünden ${K.yonAd} uzaklaştı` : `${K.yonAd} doğru uzaklaştı`;
    if (sec < K.B[0].kalk) return { kisa: `${Y.de.charAt(0).toUpperCase() + Y.de.slice(1)} balonlar şişiriliyor`, uzun: `Saat ${saatte(o.bas)} ${Y.de} ${n} sıcak hava balonu şişirilmeye başladı.${izle1}` };
    if (sec < T.inis) return { kisa: `Gökyüzünde ${n} sıcak hava balonu!`, uzun: `${Y.de.charAt(0).toUpperCase() + Y.de.slice(1)} şişirilen ${n} sıcak hava balonu saat ${saatte(kalk)} havalandı; balonlar adanın üstünden ${K.yonAd} süzülüyor.${izle1}` };
    if (sec < T.yer) return { kisa: `Bir balon ${Y.inisE} iniyor`, uzun: `Saat ${saatte(kalk)} ${Y.de} havalanan ${n} sıcak hava balonundan biri alçalıp ${Y.inisE} iniyor.` };
    if (minute < o.son) return { kisa: `Balon ${Y.inisE} indi`, uzun: `Saat ${saatte(kalk)} ${Y.de} havalanan ${n} sıcak hava balonundan biri saat ${saatte(yer)} ${Y.inisE} indi.${izle2} Öbür ${n - 1} balon ${gitti}.` };
    return { kisa: `Bugün balonlar uçtu · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(kalk)} ${Y.de} ${n} sıcak hava balonu havalandı ve adanın üstünden süzüldü. Biri saat ${saatte(yer)} ${Y.inisE} indi, zarfı söndürülüp yere serildi.${izle2} Öbür ${n - 1} balon ${gitti}.` };
  }

  return {
    kur, update, canli, yazi, gorev, durus, tahliye, ses,
    // Genel seyirci yayı yok (en: 0): seyirciler gorev ile (kalkış ve iniş ayrı saatlerde, gökyüzüne bakarak).
    seyirci: { r0: 20, r1: 30, isR: 0, uzak: 1, en: 0 },
  };
}
