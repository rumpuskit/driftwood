// Günün olayı: sitedeki görünüm, sakinler ve araçlar (16 Kasım 2026, kullanıcı: "yaşayan bir şehir … doğal olaylar,
// kazalar, önemli anlar"). Plan olay-plan.js'te (saf; video/gunluk.mjs de kullanır). Her şey sim dakikasının ve olayın
// tohumunun saf işlevidir: video kaydı (sanal saat, ?saat=) aynı dakikada hep aynı kareyi görür.
// Görsel modüller: hava.js (fırtına, sis, gökkuşağı), deniz.js (yunus, balina); kaza ve yangın burada.
// Kimse yaralanmaz, gerçek bir sakin kazaya karıştırılmaz: kazadaki iki araç adaya gelen yabancı araçlardır; sakinler
// yalnız seyirci ya da görev başındaki polis/itfaiyeci olarak görünür.
//
// Sayfa API'si (?denetle → __ada.olay), video kaydı olay çekimlerini buradan kurar:
//   plan { tur, ad, bas, son, tohum, day } | null · evre(minute) · odak [x, z] (olayın yeri) · odakY (bakış yüksekliği)
//   kalabalik [x, z] (seyircilerin ortası) · arac(ad) → { x, y, z, heading } | null (ad: itfaiye, polis, cekici,
//   ambulans; o an yoldaysa ya da park etmişse) · bina (yangındaki bina) · kiyi [x, z] (deniz olayında seyir yeri)
//   yon: olayı en iyi gösteren bakış yönü (kamera odak + (sin yon, cos yon) · r konumunda durur)
// Günde iki olay (17 Kasım akşamı): sabah (yuva 0) ve öğleden sonra (yuva 1). Bir gün içinde her tür en çok bir kez
// geçtiği için kaza (K), yangın (Y), hava ve deniz kurguları yan yana durur. Yukarıdaki alanlar o dakikanın "etkin"
// olayını gösterir (öğleden sonra olayı başlangıcından 45 dk önce etkin olur: araçlar 30 dk önce yola çıkar);
// api.planlar her iki olayın kendi alanlarını taşır.
import * as THREE from "three";
import { gunOlaylari, olayEvre, kesir } from "./olay-plan.js";
import { isOpen, roll } from "../sim.js";
import { buildHava } from "./hava.js";
import { buildDeniz } from "./deniz.js";
import { idleGesture } from "./people.js";
import { pointAt } from "./traffic.js";
import { MODULLER } from "./olay-moduller.js";

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const yon = (dx, dz) => Math.atan2(dx, dz);

/** Plan ekleme (anma.js anmaPlan'ın genel hâli): T0'da `seg`'e varır, T1'e dek kalır, sonra gününe döner. */
function araEkle(plan, T0, T1, seg, commute) {
  const leave = T0 - commute;
  const out = [];
  let i = 0;
  while (i < plan.length && plan[i].son <= leave) out.push({ ...plan[i++] });
  if (i >= plan.length) return plan;
  let from, start;
  const s0 = plan[i];
  if (s0.ne === "yol") { from = s0.nereden; start = s0.bas; }
  else { from = s0.yer ?? "ev"; start = Math.max(s0.bas, leave); if (s0.bas < start) out.push({ ...s0, son: start }); }
  if (commute > 0) out.push({ bas: start, son: Math.max(T0, start + commute), ne: "yol", nereden: from, nereye: "olay" });
  const b = out.length ? out[out.length - 1].son : start;
  out.push({ ...seg, bas: b, son: Math.max(T1, b + 1) });
  const back = T1 + commute;
  let j = plan.findIndex((s) => s.son > back);
  if (j < 0) j = plan.length - 1;
  const s2 = plan[j];
  const varis = out[out.length - 1].son;
  if (commute <= 0) {
    // Araçla gelen görevli (polis): iş yerine aynı anda döner (araç götürür).
    out.push({ ...s2, bas: varis });
  } else if (s2.ne === "yol") {
    out.push({ bas: varis, son: Math.max(s2.son, varis + commute), ne: "yol", nereden: "olay", nereye: s2.nereye });
  } else {
    const dest = s2.yer ?? "ev";
    out.push({ bas: varis, son: Math.max(back, varis + commute), ne: "yol", nereden: "olay", nereye: dest });
    if (s2.son > out[out.length - 1].son) out.push({ ...s2, bas: out[out.length - 1].son });
  }
  for (let k = j + 1; k < plan.length; k++) out.push({ ...plan[k], bas: Math.max(plan[k].bas, out[out.length - 1].son) });
  for (let k = 1; k < out.length; k++) out[k].bas = out[k - 1].son;
  return out.filter((s, k) => s.son > s.bas || k === out.length - 1);
}

/** Sabit hızlı, başı ve sonu yumuşak araç yolculuğu: [t0, t1] dakikalarında rotanın başından sonuna. */
function yolculuk(route, t0, t1) {
  return { route, t0, t1, len: route.len };
}
function yolculukKonum(y, minute, out) {
  const u = clamp01((minute - y.t0) / (y.t1 - y.t0));
  // Hız profili: %15 hızlanma, %25 yavaşlama (ease-in-out ile s).
  y.route.position(y.len * ease(u), out);
  return u;
}

const BOS_KUME = new Set();

export function buildOlay({ world, scene, sky, params, traffic, zeplin = null }) {
  const group = new THREE.Group();
  scene.add(group);
  const hava = buildHava({ world, scene, sky });
  const deniz = buildDeniz({ world, scene });
  group.add(hava.group, deniz.group);
  // ?olay / ?olaysaat yalnız geliştirme ve video kaydında (17 Kasım QC: yayındaki sitede herkes sahte olay gösterebiliyordu).
  const gelistir = import.meta.env?.DEV || ["denetle", "gelistir", "test"].some((k) => params?.has(k));
  const zorla = (gelistir && params?.get("olay")) || null;
  const zorlaSaat = gelistir ? params?.get("olaysaat")?.match(/^(\d{1,2}):(\d{2})$/) : null;
  const zorlaYuva = gelistir && params?.get("olayyuva") === "1" ? 1 : 0;
  const api = { plan: null, odak: null, odakY: 2, kalabalik: null, bina: null, kiyi: null, yon: 0, araclar: new Map(), hava: hava.durum, yerAdi: null, seyirci: 0 };
  /** Etkin olay yuvası (dakikaya göre). */
  let yuvalar = [];
  const etkin = (m) => (yuvalar[1]?.plan && (!yuvalar[0]?.plan || m >= yuvalar[1].plan.bas - 45) ? yuvalar[1] : yuvalar[0]) ?? null;
  const ALANLAR = ["plan", "odak", "odakY", "kalabalik", "bina", "kiyi", "yon", "yerAdi", "zaman", "seyirci", "itfaiyeci", "gitD", "gitEgim", "cekimOlcek", "cekimOlcekH", "kalabalikArkadan", "gitCanli"];
  function etkinYap(m) {
    const S = etkin(m); // her karede kopyalanır (planla yuvanın seyirci/itfaiyeci sayısını sonradan yazar)
    for (const k of ALANLAR) api[k] = S ? S[k] : k === "odakY" ? 2 : k === "yon" || k === "seyirci" || k === "itfaiyeci" ? 0 : null;
  }
  api.evre = (m) => olayEvre(etkin(m)?.plan ?? null, m);
  api.arac = (ad) => api.araclar.get(ad) ?? null;
  // Deniz olayında canlı hedef: şu an zıplayan/yüzeye çıkan hayvan [x, y, z] ve sürünün ortası (kopya döner).
  api.canli = (m) => { const v = deniz.odak?.(m); return v ? [...v] : null; };
  api.suru = (m) => { const v = deniz.merkez?.(m); return v ? [...v] : null; };
  // Fırtına: şimşek dakikaları (video kesmeleri için) ve gökkuşağı/rüzgâr yönü.
  api.simsekler = (a, b) => { const S = yuvalar.find((y) => y?.plan?.tur === "firtina"); return S ? hava.simsekler?.(S.plan, a, b) ?? [] : []; };
  api.havaBilgi = hava.bilgi;
  const ses = { siren: 0, carpisma: 0, korna: 0, kalabalik: 0 };
  let gun = null;
  let K = null; // kaza kurgusu
  const kaza = buildKazaGorsel(group);
  // Olay modülleri (olay-moduller.js; 17 Kasım akşamı: yeni türler kendi dosyasında, arayüz olay-moduller.js başında).
  const mod = Object.fromEntries(Object.entries(MODULLER).map(([tur, kur]) => [tur, kur({ world, scene, group, traffic, zeplin, sky })]));
  const planOf = (tur) => yuvalar.find((S) => S?.plan?.tur === tur)?.plan ?? null;
  let sonDk = 0;
  api.hedef = (m = sonDk) => mod[etkin(m)?.plan?.tur]?.canli?.(m) ?? null;
  const yanginG = buildYanginGorsel(group);
  let Y = null; // yangın kurgusu

  function gunuKur(day) {
    gun = day;
    const planlar = gunOlaylari(day, isOpen, { zorla, saat: zorlaSaat ? Number(zorlaSaat[1]) * 60 + Number(zorlaSaat[2]) : undefined, yuva: zorlaYuva });
    api.araclar.clear();
    K = null; Y = null;
    kaza.gizle(); yanginG.gizle();
    if (traffic) traffic.kapali = new Set();
    yuvalar = planlar.map((o) => (o ? yuvaKur(o) : null));
    api.planlar = yuvalar.map((S) => (S?.plan ? S : null));
    etkinYap(0);
  }

  /** Bir olayın kurgusu ve alanları (K ve Y burada kurulur; aynı gün aynı tür iki kez olmaz). */
  function yuvaKur(o) {
    const S = { plan: o, odak: null, odakY: 2, kalabalik: null, bina: null, kiyi: null, yon: 0, yerAdi: null, zaman: null, seyirci: 0, itfaiyeci: 0, gitD: null, gitEgim: null, cekimOlcek: null, cekimOlcekH: null, kalabalikArkadan: false, gitCanli: false };
    if (mod[o.tur]) {
      const r = mod[o.tur].kur(o);
      if (!r) { S.plan = null; return S; }
      Object.assign(S, r);
    } else if (o.tur === "yunus" || o.tur === "balina") {
      const y = deniz.yerSec(o);
      if (y) { S.odak = y.deniz; S.kiyi = y.kiyi; S.kalabalik = y.kiyi; S.odakY = 0.5; S.yon = yon(y.kiyi[0] - y.deniz[0], y.kiyi[1] - y.deniz[1]); }
    } else if (o.tur === "kaza" && traffic) {
      K = kazaKur(world, traffic, o);
      if (!K) { S.plan = null; return S; }
      S.odak = K.P; S.odakY = 0.9; S.yon = K.yon; S.kalabalik = K.seyirci.merkez;
      // Araçların saatleri (video: araç takip çekimleri bu aralıklara konur).
      const ar = (V) => V && { yol: [V.gidis.t0, V.gidis.t1], park: [V.gidis.t1, V.donus?.t0 ?? K.son], donus: V.donus ? [V.donus.t0, V.donus.t1] : null };
      S.zaman = { polis: ar(K.polis), ambulans: ar(K.ambulans), cekici: ar(K.cekici), yukleme: K.cekici?.yukle ?? null, Bgider: [K.Bgider.t0, K.Bgider.t1] };
      // Yer adı: en yakın binanın sokağı ("Kabuk Sokağı No 1, …" → "Kabuk Sokağı").
      // Önce sokak/cadde adresi olan en yakın bina (17 Kasım akşamı: en yakın bina yeni bir yapı olunca ad "Yakamoz Camii"den
      // "Çay Bahçesi yanı"na dönüyordu); yoksa en yakın adresli bina.
      const yakin = (suz) => { let enY = null, dmin = Infinity; for (const b of world.buildings) { if (!b.address || !suz(b.address)) continue; const d = Math.hypot(b.x - K.P[0], b.z - K.P[1]); if (d < dmin) { dmin = d; enY = b; } } return dmin < 80 ? enY : null; };
      const enY = yakin((a) => /^\d+\s.*\b(Street|Road|Lane|Avenue|Way)\b/.test(a)) ?? yakin(() => true);
      S.yerAdi = enY?.address?.split(",")[0]?.replace(/^\d+\s+/, "") ?? null; // "10 Main Street" → "Main Street"
      kaza.kur(K, world);
    } else if (o.tur === "yangin" && traffic) {
      Y = yanginKur(world, traffic, o);
      if (!Y) { S.plan = null; return S; }
      S.odak = [Y.b.x, Y.b.z]; S.odakY = Y.H * 0.6; S.yon = Y.yon; S.kalabalik = Y.merkez; S.bina = Y.b;
      S.yerAdi = Y.b.isim ?? Y.b.address?.split(",")[0] ?? null;
      const V = Y.itfaiye;
      S.zaman = { itfaiye: { yol: [V.gidis.t0, V.gidis.t1], park: [V.gidis.t1, V.donus?.t0 ?? Y.son], donus: V.donus ? [V.donus.t0, V.donus.t1] : null } };
      yanginG.kur(Y);
    } else if (o.tur === "firtina" || o.tur === "sis") {
      S.odak = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, -12]; S.odakY = 2; S.kalabalik = null;
    }
    return S;
  }

  /** Seyirci yerleri: odak çevresinde yay, yürünebilir, yolun dışında; odağa dönük. */
  function seyirciYerleri(merkez, odak, n, r0, r1, seed, kiyida = false) {
    const out = [];
    const a0 = yon(merkez[0] - odak[0], merkez[1] - odak[1]);
    // Deniz olayında yay kıyı noktasının kara tarafında (17 Kasım QC: odak açıkta, bütün yerler suya düşüyordu).
    const C = kiyida ? merkez : odak;
    for (let t = 0; out.length < n && t < n * 30; t++) {
      const a = a0 + (kesir("syA", seed, t) - 0.5) * 2.6, r = r0 + kesir("syR", seed, t) * (r1 - r0);
      const x = C[0] + Math.sin(a) * r, z = C[1] + Math.cos(a) * r;
      if (!world.isWalkable?.(x, z)) continue;
      if (traffic?.locate([x, z], 3.6, ["cadde", "sokak", "koy", "giris"])) continue; // taşıt yolunun üstünde durmaz
      if (out.some((q) => Math.hypot(q.x - x, q.z - z) < 0.85)) continue;
      out.push({ x, z, heading: yon(odak[0] - x, odak[1] - z), look: odak });
    }
    return out;
  }

  /** Sakin planları (people.setDay içinden): seyirciler ve görevliler. */
  function planla(people, day) {
    if (day !== gun) gunuKur(day);
    let sonuc = null;
    for (const S of yuvalar) if (S) sonuc = planlaYuva(people, day, S) ?? sonuc;
    return sonuc;
  }
  function planlaYuva(people, day, S) {
    const o = S.plan;
    // Fırtına ve siste seyirci yok (17 Kasım QC: sakinler fırtınada meydana yürüyüp "izliyor"du).
    const M = mod[o.tur];
    if (!o || !S.odak || o.tur === "firtina" || o.tur === "sis" || (M && !M.seyirci)) return null;
    const plans = people.plans;
    const R = people.residents;
    const yerOf = (seg) => (seg.ne === "meydan" || seg.ne === "hobi" ? world.placeOf?.(seg.ne === "hobi" ? seg.yer.replace("hobi:", "") : "meydan")?.anchors?.[0] : null);
    // Görevliler: o saatte iş yerinde (içeride) mesaide olan polisler; araçla gelir, araçla döner (yürüyüş yok).
    const gorev = [];
    if (o.tur === "kaza" && K) {
      const T0 = K.polis.varis + 0.6, T1 = K.polis.ayrilis - 0.4;
      const adaylar = R.map((r, i) => i).filter((i) => people.works[i]?.job === "polis" && plans[i].some((s) => s.ne === "is" && s.bas <= T0 - 5 && s.son >= T1 + 2))
        .sort((a, b) => roll(R[a].seed, "olayGorev" + o.yuva, day) - roll(R[b].seed, "olayGorev" + o.yuva, day)).slice(0, 2);
      adaylar.forEach((i, k) => gorev.push({ i, T0, T1, item: { ...K.polisYer[k], gorevli: "polis" } }));
    }
    if (o.tur === "yangin" && Y) {
      const T0 = Y.itfaiye.varis + 0.5, T1 = Y.itfaiye.ayrilis - 0.3;
      // Önce mesaidekiler, yetmezse evde (ya da uykuda) olan izinli itfaiyeciler çağrılır (17 Kasım QC: sabah vardiyasında
      // itfaiyeci yoktu, hortumlar boş duruyordu). İçeride oldukları için kaybolmaları görünmez; araçla gelirler.
      const sira = { is: 0, ev: 1, uyku: 2 };
      const adaylar = R.map((r, i) => i).map((i) => {
        if (people.works[i]?.job !== "itfaiyeci") return null;
        const s = plans[i].find((x) => x.bas <= T0 - 5 && x.son >= T1 + 2 && x.ne in sira);
        return s ? { i, k: sira[s.ne] } : null;
      }).filter(Boolean)
        .sort((a, b) => a.k - b.k || roll(R[a.i].seed, "olayGorev" + o.yuva, day) - roll(R[b.i].seed, "olayGorev" + o.yuva, day)).slice(0, 3).map((x) => x.i);
      adaylar.forEach((i, k) => gorev.push({ i, T0, T1, item: Y.hortum[k] }));
      S.itfaiyeci = adaylar.length;
    }
    if (M?.gorev) gorev.push(...(M.gorev(people, day, S, plans) ?? []));
    for (const g of gorev) plans[g.i] = araEkle(plans[g.i], g.T0, g.T1, { ne: "olay", yer: "olay", olay: g.item }, g.commute ?? 0);
    // Seyirciler: olay sırasında dışarıda (meydan, hobi) olup yeri olaya yakın olanlar yürüyüp gelir.
    const T = o.bas + 3;
    const secili = new Set(gorev.map((g) => g.i));
    const adaylar = [];
    plans.forEach((plan, i) => {
      if (secili.has(i)) return;
      const seg = plan.find((s) => s.bas <= T && s.son > T + 12);
      if (!seg) return;
      // Dışarıdakiler (meydan, hobi) ve evinde olan komşular (gürültüye cama, kapıya çıkar).
      // Yangında yakın dükkân ve iş yerlerinin çalışanları da dışarı çıkar (17 Kasım QC: çarşıda sabah yangınında seyirci 0'dı).
      // Deniz olayında kıyıya yakın (≤300 m) iş yerlerinden de kıyıya inilir.
      const isR = M ? M.seyirci.isR ?? 0 : o.tur === "yangin" ? 90 : S.kiyi ? 300 : 0;
      const isyeri = isR && seg.ne === "is" && (S.kiyi || !people.works[i]?.loc?.outdoor) ? people.works[i]?.loc?.door ?? people.works[i]?.loc?.anchor : null;
      if (isyeri && Math.hypot(isyeri[0] - S.odak[0], isyeri[1] - S.odak[1]) > isR) return;
      const a = isyeri ?? (seg.ne === "ev" ? people.homes[i]?.door : seg.ne === "meydan" || seg.ne === "hobi" ? yerOf(seg) : null);
      if (!a) return;
      // Deniz olayında (yunus/balina) haber kıyıya yayılır: daha uzaktan gelinir (17 Kasım QC: kıyı meydandan uzak, seyirci 0).
      const uzak = M ? M.seyirci.uzak ?? 1 : S.kiyi ? 2.2 : 1;
      if (seg.ne === "ev" && Math.hypot(a[0] - S.odak[0], a[1] - S.odak[1]) > 160 * uzak) return;
      const d = Math.hypot(a[0] - S.odak[0], a[1] - S.odak[1]);
      if (d > 340 * uzak) return;
      adaylar.push({ i, d, r: roll(R[i].seed, "olaySeyir", day) % 1000 });
    });
    adaylar.sort((a, b) => a.d / 340 + a.r / 1000 - (b.d / 340 + b.r / 1000));
    const merkez = S.kalabalik ?? S.odak;
    const kiyida = M ? !!M.seyirci.kiyida : !!S.kiyi;
    const [r0, r1] = M ? [M.seyirci.r0, M.seyirci.r1] : [kiyida ? 1.5 : o.tur === "kaza" ? 8.5 : o.tur === "yangin" ? 16 : 14, kiyida ? 12 : o.tur === "kaza" ? 15 : o.tur === "yangin" ? 28 : 26];
    const yerler = seyirciYerleri(merkez, S.odak, Math.min(M?.seyirci.en ?? 30, adaylar.length), r0, r1, o.tohum, kiyida);
    S.seyirci = Math.min(adaylar.length, yerler.length);
    adaylar.slice(0, yerler.length).forEach(({ i, d }, k) => {
      const commute = Math.max(3, Math.round(d / 1.25 / 60) + 2);
      const T0 = o.bas + 3 + (roll(R[i].seed, "olayVaris", day) % 9) + commute * 0.2;
      const kal = 10 + (roll(R[i].seed, "olayKal", day) % 16);
      const T1 = Math.min(o.son + 6, T0 + kal);
      const tavirlar = M?.seyirci.tavirlar ?? ["cek", "konus", "goster", "konus", "cek", "bak", "sasir"];
      const tavir = tavirlar[roll(R[i].seed, "olayTavir", day) % tavirlar.length];
      plans[i] = araEkle(plans[i], T0, T1, { ne: "olay", yer: "olay", olay: { ...yerler[k], tavir } }, commute);
    });
    return plans;
  }

  /** Olay yerindeki duruş (people._placeState içinden). */
  function durus(i, it, minute, t, p, ph, stand) {
    if (!it) return false;
    // Modülün kendi duruşu (ör. düğünde halay, el sallama): it.modul = tür.
    if (it.modul && mod[it.modul]?.durus) return mod[it.modul].durus(i, it, minute, t, p, ph, stand, { idleGesture });
    stand(it.x, it.z, it.heading);
    let bak = it.look ? yon(it.look[0] - it.x, it.look[1] - it.z) - it.heading : 0;
    bak = Math.atan2(Math.sin(bak), Math.cos(bak));
    if (it.gorevli === "itfaiyeci") {
      // Hortum tutan: iki el önde, hortumu ateşe doğru kaldırmış; bekleyen: araç yanında.
      if (it.rol === "hortum") { p.shL = p.shR = 1.25; p.elL = 0.5; p.elR = 0.7; p.lean = 0.12; p.headPitch = -0.25; p.kneeL = 0.25; }
      else idleGesture(p, t, ph, true);
      return true;
    }
    if (it.gorevli === "polis") {
      // Polis: biri trafiği yönlendirir (kol kalkık, aralıklı sallama), öbürü tutanak tutar (defter).
      if (it.rol === "trafik") {
        const w = Math.max(0, Math.sin(t * 1.4 + ph));
        p.shR = 1.35; p.elR = 0.15 + 0.5 * w; p.abR = 0.35 * w; p.shL = 0.1; p.elL = 0.2; p.headYaw = 0.3 * Math.sin(t * 0.5 + ph);
      } else {
        p.shL = p.shR = 0.5; p.elL = p.elR = 1.35; p.headPitch = 0.35; p.headYaw = bak * 0.3;
      }
      return true;
    }
    switch (it.tavir) {
      case "cek": // telefonla çekiyor: kol önde, yukarıda
        p.shR = 1.45; p.elR = 0.35; p.shL = 0.5; p.elL = 1.2; p.props = ["telefon"]; p.headYaw = 0; p.headPitch = -0.05; break;
      case "goster": { // eliyle olay yerini gösteriyor (aralıklı)
        const g = Math.max(0, Math.sin(t * 0.7 + ph));
        p.shR = 0.4 + 1.0 * g; p.elR = 0.2; p.headYaw = Math.max(-1, Math.min(1, bak)) * 0.8; idleGesture(p, t, ph, false); break;
      }
      case "sasir": // eller başta
        p.shL = p.shR = 2.3; p.elL = p.elR = 2.4; p.abL = p.abR = 0.25; p.headPitch = -0.08; break;
      default:
        idleGesture(p, t, ph, it.tavir === "konus");
        p.headYaw = p.headYaw * 0.4 + Math.max(-1, Math.min(1, bak)) * 0.6;
    }
    return true;
  }

  /** Sitede gösterilecek metin (üst panel, gazete; Driftwood İngilizce): { kisa, uzun } ya da null. */
  const saatYaz = (m) => { const h = Math.floor(m / 60), mm = String(Math.floor(m % 60)).padStart(2, "0"); return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? "AM" : "PM"}`; };
  api.yazi = (minute) => {
    // Etkin olay henüz başlamadıysa (öğleden sonra olayına 45 dk kala) sabahki olayın haberi sürer.
    let S = etkin(minute);
    if (S?.plan && minute < S.plan.bas && S !== yuvalar[0] && yuvalar[0]?.plan) S = yuvalar[0];
    const o = S?.plan;
    if (!o || minute < o.bas) return null;
    if (mod[o.tur]) return mod[o.tur].yazi(o, S, minute, { saatYaz, saatte: saatYaz }) ?? null;
    const gun = o.yuva ? "this afternoon" : "this morning", gunOrta = o.yuva ? "afternoon" : "morning";
    const bitti = minute >= o.son, yer = S.yerAdi ? `at ${S.yerAdi}` : "at an intersection";
    if (o.tur === "kaza" && K) {
      const kapali = Math.round(K.son - 3 - K.bas);
      if (bitti) return { kisa: `Car crash ${yer} ${gun}`, uzun: `At ${saatYaz(o.bas)} two cars collided ${yer}; nobody was hurt. Police arrived in ${Math.round(K.polis.varis - K.bas)} minutes and the intersection was closed for ${kapali} minutes${S.seyirci ? `; ${S.seyirci} people gathered to watch` : ""}. Both cars were visitors from the mainland.` };
      if (minute < K.polis.varis) return { kisa: `Breaking: car crash ${yer}`, uzun: `At ${saatYaz(o.bas)} two cars collided ${yer}. Police are on the way.` };
      return { kisa: `Crash ${yer} · road closed`, uzun: `Two cars collided ${yer}; nobody was hurt. Police are on scene and the intersection is closed.` };
    }
    if (o.tur === "yangin" && Y) {
      const yerY = S.yerAdi ?? "a shop downtown";
      if (bitti) return { kisa: `Fire at ${yerY} ${gun}`, uzun: `At ${saatYaz(o.bas)} a fire broke out on the top floor of ${yerY}; nobody was hurt. Firefighters arrived in ${Math.round(Y.itfaiye.varis - Y.bas)} minutes and put it out.` };
      return { kisa: `Fire! ${yerY}`, uzun: `Smoke is rising from ${yerY}. Firefighters are on the way.` };
    }
    const T = { firtina: ["Storm! Heavy rain and lightning", `A storm hit ${gun}`, `A thunderstorm swept over the island; the sky went dark and the street lamps came on in the middle of the ${gunOrta}.`],
      sis: ["The island is fogged in", "Thick fog this morning", "Dense sea fog rolled over the island; the foghorn sounded every forty seconds and the lighthouse and street lamps burned until it lifted."],
      balina: ["Whale off the coast!", `A whale visited ${gun}`, `A humpback whale breached again and again just off the shore${S.seyirci ? `; ${S.seyirci} ${S.seyirci === 1 ? "neighbor" : "neighbors"} came down to the water to watch` : ""}.`],
      yunus: ["Dolphins off the coast!", `Dolphins visited ${gun}`, `A pod of dolphins leapt off the shore for half an hour${S.seyirci ? `; ${S.seyirci} people came to watch` : ""}.`] }[o.tur];
    if (!T) return null;
    return { kisa: bitti ? `${T[1]} · ${saatYaz(o.bas)}` : T[0], uzun: `${saatYaz(o.bas)}: ${T[2]}` };
  };

  return {
    group, api, hava, deniz,
    planla, durus,
    /** Gün değişince planı kurar (people.setDay'den önce çağrılır). */
    setDay(day) { if (day !== gun) gunuKur(day); },
    /** Olayın boşalttığı alanda duran sakinin yeri (people.js): { x, z, heading, yuru } ya da null. */
    tahliye(x, z, minute) {
      for (const m of Object.values(mod)) { const q = m.tahliye?.(x, z, minute); if (q) return q; }
      return null;
    },
    /** Olay sırasında gerçek trafikten gizlenecek araçlar (olay yerine girip enkazın içinden geçmesin). */
    gizle(x, z, minute) {
      for (const m of Object.values(mod)) if (m.gizle?.(x, z, minute)) return true;
      if (Y && minute > Y.itfaiye.varis - 0.5 && minute < Y.son && Math.hypot(x - Y.itfaiye.park[0], z - Y.itfaiye.park[1]) < 9) return true;
      if (!K || minute < K.bas - 0.2 || minute > K.son) return false;
      return Math.hypot(x - K.P[0], z - K.P[1]) < 24;
    },
    /** Olay araçları (main.js vehicles.begin/end arasında). */
    vehicles(vehicles, real, minute) {
      api.araclar.clear();
      ses.siren = 0; ses.korna = 0;
      if (Y && minute > Y.bas - 30 && minute < Y.son + 15) {
        const pz = aracPoz(Y.itfaiye, minute, {}, world);
        if (pz) {
          vehicles.add("itfaiye", pz.x, pz.y, pz.z, pz.heading, { flash: pz.donuyor ? null : real, brake: pz.park });
          api.araclar.set("itfaiye", pz);
          if (!pz.park && !pz.donuyor) ses.siren = 1;
        }
      }
      for (const m of Object.values(mod)) m.vehicles?.(vehicles, real, minute, api.araclar, ses);
      if (!K || minute < K.bas - 30 || minute > K.son + 15) return;
      kazaAraclari(K, vehicles, real, minute, world, api.araclar, ses);
    },
    update(day, minute, real, env) {
      etkinYap(minute);
      const o = api.plan, evre = olayEvre(o, minute);
      hava.update(o, evre, minute, real, env);
      deniz.update(o, evre, minute, real, env);
      kaza.update(K, minute, real);
      yanginG.update(minute, real);
      sonDk = minute;
      for (const [tur, m] of Object.entries(mod)) { const p = planOf(tur); m.update(p, p ? olayEvre(p, minute) : null, minute, real, env); }
      if (traffic && K) traffic.kapali = minute >= K.bas && minute < K.son - 3 ? (K.kapaliKume ??= new Set([K.node])) : BOS_KUME;
      // Modülün kapattığı düğümler (ör. düğün konvoyu meydan çevresi): kazayla birleşir.
      if (traffic) for (const m of Object.values(mod)) { const k2 = m.kapali?.(minute); if (k2?.size) traffic.kapali = traffic.kapali?.size ? new Set([...traffic.kapali, ...k2]) : k2; }
      // Çarpışma sesi: olay başladığında bir kez (sayaç artar).
      if (K) ses.carpisma = minute >= K.bas ? 1 : 0;
      // Kalabalık uğultusu (17 Kasım QC: yangının değeri her karede kazanınkiyle eziliyordu).
      ses.kalabalik = Y && minute > Y.bas + 5 && minute < Y.son ? 0.7 : K && minute > K.bas + 4 && minute < K.son ? 0.6 : 0;
      for (const m of Object.values(mod)) { const s2 = m.ses?.(minute); if (s2) for (const k in s2) ses[k] = Math.max(ses[k] ?? 0, s2[k]); }
    },
    /** Ses ortamı (sound.js Ambience.update env.olay). */
    ses() { return { ...hava.durum, ...ses }; },
  };
}

// ---------------------------------------------------------------- kaza

/** Kazanın kurgusu: kavşak, iki araç, polis/çekici/ambulans yolculukları, seyirci ve polis yerleri. */
function kazaKur(world, traffic, o) {
  const net = world.network;
  if (!net) return null;
  const tasit = (e) => e.edge?.road?.carriage > 0;
  // Aday kavşaklar: en az üç taşıt kolu, meydana 60–330 m (meydan çok kalabalık, çok uzak görünmez).
  // Kalabalık bir köşe seçilir: çevresinde (70 m) çok bina, meydana yakın, ışıklı (16 Kasım denetimi: şehrin kenarındaki
  // boş kavşak seçilmişti, seyirci yoktu).
  const binaSay = (p) => world.buildings.reduce((t, b) => t + (Math.hypot(b.x - p[0], b.z - p[1]) < 70 ? 1 : 0), 0);
  const adaylar = net.nodes.filter((n) => n.ends.filter(tasit).length >= 3).map((n) => ({ n, d: Math.hypot(n.p[0], n.p[1] + 12), b: binaSay(n.p) }))
    .filter((a) => a.d > 45 && a.d < 360 && a.b >= 6);
  if (!adaylar.length) return null;
  // Olay yeri gün boyu sabit (17 Kasım akşamı: ada 2000'i geçip yeni mahalle kurulunca sabahki kaza "Koy Sokağı"ndan
  // "Kayık Sokağı"na kaydı; öğle videosu ve site metni ayrıştı). Sıralı ilk-10 + tohum kipi her yeni binada kayıyordu.
  // Artık "rendezvous" seçimi: her uygun kavşağa konumundan ve tohumdan bir puan; en büyük seçilir. Ada büyüdükçe yeni
  // aday eklenirse seçim yalnız yeni aday kazanırsa değişir (≈1/aday sayısı). Uygunluk yukarıda (45–360 m, ≥6 bina).
  const yerPuani = (a) => kesir("kazaYer", o.tohum, Math.round(a.n.p[0]), Math.round(a.n.p[1]));
  const havuz = [...adaylar].sort((a, b) => yerPuani(b) - yerPuani(a));
  const neden = [];
  for (let deneme = 0; deneme < havuz.length; deneme++) {
    const { n } = havuz[deneme];
    const gelen = traffic.lanes.filter((l) => l.to?.id === n.id && l.len > 14);
    // Dik açıyla kesişen iki gelen şerit.
    let cift = null;
    for (let a = 0; a < gelen.length && !cift; a++) for (let b = 0; b < gelen.length && !cift; b++) {
      if (a === b) continue;
      const da = gelen[a].dirEnd, db = gelen[b].dirEnd, c = da[0] * db[0] + da[1] * db[1];
      if (Math.abs(c) < 0.45) cift = [gelen[a], gelen[b]];
    }
    if (!cift) { neden.push(`${n.id}: dik şerit yok (${gelen.length})`); continue; }
    const [LA, LB] = (o.tohum >> 3) % 2 ? cift : [cift[1], cift[0]];
    const a0 = LA.pts[LA.pts.length - 1], b0 = LB.pts[LB.pts.length - 1], dA = LA.dirEnd, dB = LB.dirEnd;
    // Yolların kesişimi: a0 + dA·t = b0 + dB·s.
    const det = dA[0] * -dB[1] - dA[1] * -dB[0];
    if (Math.abs(det) < 1e-3) continue;
    const t = ((b0[0] - a0[0]) * -dB[1] - (b0[1] - a0[1]) * -dB[0]) / det;
    const P = [a0[0] + dA[0] * t, a0[1] + dA[1] * t];
    if (Math.hypot(P[0] - n.p[0], P[1] - n.p[1]) > 16) { neden.push(`${n.id}: kesişim uzak`); continue; }
    // B kavşağın içinde (darbe yan tarafına), A'nın burnu B'nin yanında.
    const sag = dA[0] * dB[1] - dA[1] * dB[0] > 0 ? 1 : -1;
    // Renkler zıt (16 Kasım: iki lacivert araç ayırt edilmiyordu): biri açık (beyaz/gümüş/bej/kırmızı), öbürü koyu.
    const ACIK = [0, 2, 5, 3, 7], KOYU = [1, 4, 8, 9, 6];
    const B = { x: P[0], z: P[1], h: yon(dB[0], dB[1]) - sag * 0.42, renk: KOYU[o.tohum % 5] };
    const A = { x: P[0] - dA[0] * 2.9, z: P[1] - dA[1] * 2.9, h: yon(dA[0], dA[1]) + sag * 0.13, renk: ACIK[(o.tohum >> 5) % 5] };
    // A'nın yanı: çekici B'nin OLMADIĞI tarafa park eder (16 Kasım denetimi: B'nin içine giriyordu).
    let sagA = [dA[1], -dA[0]];
    if (sagA[0] * (B.x - A.x) + sagA[1] * (B.z - A.z) > 0) sagA = [-sagA[0], -sagA[1]];
    const istasyon = (wp) => wp?.door ?? (wp?.building ? [wp.building.x, wp.building.z] : null);
    const karakol = istasyon(world.workplaces?.karakol?.find(Boolean));
    const polisPark = [b0[0] - dB[0] * 9, b0[1] - dB[1] * 9];
    const rota = (a, b) => (a && b ? traffic.route(a, b) : null);
    const varisP = o.bas + 6;
    const polisR = rota(karakol, polisPark) ?? rota([polisPark[0] - dB[0] * 160, polisPark[1] - dB[1] * 160], polisPark);
    if (!polisR) { neden.push(`${n.id}: polis rotası yok`); continue; }
    const sureP = Math.max(1.2, polisR.len / 12 / 60);
    const ayrilisP = o.son - 2.5;
    const polisDon = rota(polisPark, karakol) ?? rota(polisPark, [b0[0] + dB[0] * 120 + dB[1] * 40, b0[1] + dB[1] * 120 - dB[0] * 40]) ?? rota(polisPark, [polisPark[0] - dB[0] * 150, polisPark[1] - dB[1] * 150]);
    const polis = { park: polisPark, h: yon(dB[0], dB[1]), gidis: yolculuk(polisR, varisP - sureP, varisP), donus: polisDon ? yolculuk(polisDon, ayrilisP, ayrilisP + Math.max(1.2, polisDon.len / 12 / 60)) : null, varis: varisP, ayrilis: ayrilisP };
    // Çekici: A'nın yanına, kasası A'nın hizasında park eder; A'yı kasaya alıp götürür.
    const depo = world.depot?.bay ?? null;
    // Çekici A'ya ters yönde (kabini B'den uzakta) yanında durur; kasası A'nın hizasında (16 Kasım: kabin B'ye giriyordu).
    const cekPark = [A.x + sagA[0] * 3.4 - dA[0] * 1.25, A.z + sagA[1] * 3.4 - dA[1] * 1.25];
    const varisC = o.bas + Math.round((o.son - o.bas) * 0.45);
    const cekR = rota(depo, cekPark) ?? rota([cekPark[0] - dA[0] * 180, cekPark[1] - dA[1] * 180], cekPark);
    let cekici = null;
    if (cekR) {
      const sureC = Math.max(1.5, cekR.len / 10 / 60);
      const ayrilisC = o.son - 5;
      const donC = rota(cekPark, depo) ?? rota(cekPark, [cekPark[0] + dA[0] * 200, cekPark[1] + dA[1] * 200]);
      cekici = { park: cekPark, gidis: yolculuk(cekR, varisC - sureC, varisC), donus: donC ? yolculuk(donC, ayrilisC, ayrilisC + Math.max(1.5, donC.len / 10 / 60)) : null,
        varis: varisC, yukle: [varisC + 3, varisC + 6], ayrilis: ayrilisC, h: yon(-dA[0], -dA[1]) };
    }
    // Ambulans (sağlık merkezi açıksa): kontrol için gelir, kimseyi almadan döner.
    let ambulans = null;
    if (world.hospital?.bay) {
      const ambPark = [a0[0] - dA[0] * 11, a0[1] - dA[1] * 11];
      const ambR = rota(world.hospital.bay, ambPark);
      const ambD = rota(ambPark, world.hospital.bay);
      if (ambR) {
        const varisA = o.bas + 8, ayrilisA = o.bas + 21;
        ambulans = { park: ambPark, h: yon(dA[0], dA[1]), gidis: yolculuk(ambR, varisA - Math.max(1.2, ambR.len / 13 / 60), varisA), donus: ambD ? yolculuk(ambD, ayrilisA, ayrilisA + Math.max(1.2, ambD.len / 13 / 60)) : null, varis: varisA, ayrilis: ayrilisA };
      }
    }
    // B, çekici A'yı yüklerken çekilir (kendi çıkış yönünde, yavaşça) ve gider.
    const cikis = traffic.lanes.find((l) => l.from?.id === n.id && l.dirStart[0] * dB[0] + l.dirStart[1] * dB[1] > 0.7);
    const Bgider = { t0: o.son - 9, t1: o.son - 6.5, yol: cikis ?? null };
    // Polislerin yeri: biri polis aracının yanında trafiği yönlendirir, öbürü kazalı araçların yanında.
    const polisYer = [
      { x: polisPark[0] - dB[0] * 4 + dB[1] * 2.2, z: polisPark[1] - dB[1] * 4 - dB[0] * 2.2, heading: yon(-dB[0], -dB[1]), rol: "trafik", look: null },
      // Tutanak tutan: A'nın arkasında, hafif yanda (araçların içinde durmasın; çekici A'nın öbür yanına park eder).
      { x: A.x - dA[0] * 4.3 - sagA[0] * 0.9, z: A.z - dA[1] * 4.3 - sagA[1] * 0.9, heading: yon(dA[0], dA[1]) + 0.25, rol: "tutanak", look: [A.x, A.z] },
    ];
    // Bakış yönü: iki aracın geldiği kolların arasındaki çeyrek (her iki araç önden görünür).
    const v = [dA[0] + dB[0], dA[1] + dB[1]];
    const merkez = [P[0] + v[0] * 6, P[1] + v[1] * 6];
    // Uyarı üçgeni ve dubalar.
    // Üçgen ambulansın arkasında (ambulans a0 − 11·dA'da durur, boyu ~6 m; 17 Kasım QC: üçgen ambulansın içindeydi).
    const ucgen = { x: a0[0] - dA[0] * 16, z: a0[1] - dA[1] * 16, h: yon(dA[0], dA[1]) };
    const dubalar = [];
    for (let k = 0; k < 5; k++) {
      const u = k / 4 - 0.5;
      dubalar.push({ x: P[0] - dB[0] * 6 + dB[1] * u * 6, z: P[1] - dB[1] * 6 - dB[0] * u * 6 });
    }
    return {
      bas: o.bas, son: o.son, tohum: o.tohum, node: n.id, P, A, B, dA, dB, sag, sagA, yon: yon(v[0], v[1]),
      polis, cekici, ambulans, polisPark, cekPark, Bgider, polisYer, ucgen, dubalar, seyirci: { merkez },
    };
  }
  console.warn("olay: kaza yeri bulunamadı", adaylar.length, neden.join("; "));
  return null;
}

/** Kaza araçları: kazalı iki araç (dörtlüler), polis, ambulans, çekici. */
function kazaAraclari(K, vehicles, real, minute, world, araclar, ses) {
  const yer = (x, z) => world.surfaceY(x, z) + 0.06;
  const q = {};
  K.Apoz = K.Bpoz = null;
  if (minute >= K.bas) {
    // A: çekici yükleyene dek yerinde; yüklerken kasaya kalkar; çekiciyle gider.
    const C = K.cekici;
    let ax = K.A.x, az = K.A.z, ay = yer(ax, az), ah = K.A.h, cekPose = null;
    if (C) {
      cekPose = aracPoz(C, minute, q, world) ;
      if (cekPose && minute >= C.yukle[0]) {
        const u = ease((minute - C.yukle[0]) / (C.yukle[1] - C.yukle[0]));
        const s = Math.sin(cekPose.heading), c = Math.cos(cekPose.heading);
        const bx = cekPose.x - s * 1.25, bz = cekPose.z - c * 1.25, by = cekPose.y + 1.22;
        ax += (bx - ax) * u; az += (bz - az) * u; ay += (by - ay) * u + Math.sin(u * Math.PI) * 0.6;
        let dh = cekPose.heading + Math.PI - ah; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); ah += dh * u;
      }
    }
    const aGitti = C?.donus && minute > C.donus.t1;
    K.Apoz = !aGitti && minute <= K.son + 15 ? { x: ax, y: ay, z: az, h: ah } : null;
    if (K.Apoz) vehicles.addCar(ax, ay, az, ah, K.A.renk, { hazard: !C || minute < C.yukle[0] ? real : null, lights: false });
    // B: yerinde, sonra yavaşça çekilip gider.
    const G = K.Bgider;
    if (minute < G.t1 || !G.yol) {
      if (minute < G.t0 || !G.yol) { vehicles.addCar(K.B.x, yer(K.B.x, K.B.z), K.B.z, K.B.h, K.B.renk, { hazard: real, lights: false }); K.Bpoz = { x: K.B.x, y: yer(K.B.x, K.B.z), z: K.B.z, h: K.B.h }; }
      else {
        const u = ease((minute - G.t0) / (G.t1 - G.t0));
        const L = G.yol, sp = Math.min(L.len - 0.1, 45 * u);
        const pts = L.pts, cum = L.cum;
        let k = 1; while (k < cum.length - 1 && cum[k] < sp) k++;
        const f = (sp - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]);
        const x = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, z = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f;
        const bx = K.B.x + (x - K.B.x) * Math.min(1, u * 3), bz = K.B.z + (z - K.B.z) * Math.min(1, u * 3);
        const bh = yon(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        vehicles.addCar(bx, yer(bx, bz), bz, bh, K.B.renk, { hazard: real });
        K.Bpoz = { x: bx, y: yer(bx, bz), z: bz, h: bh };
      }
    }
    if (C && cekPose) {
      vehicles.add("cekici", cekPose.x, cekPose.y, cekPose.z, cekPose.heading, { flash: real, brake: cekPose.park });
      araclar.set("cekici", cekPose);
    }
  }
  for (const [ad, V] of [["polis", K.polis], ["ambulans", K.ambulans]]) {
    if (!V) continue;
    const pz = aracPoz(V, minute, q, world);
    if (!pz) continue;
    vehicles.add(ad, pz.x, pz.y, pz.z, pz.heading, { flash: pz.donuyor ? null : real, brake: pz.park });
    araclar.set(ad, pz);
    if (!pz.park && !pz.donuyor) ses.siren = Math.max(ses.siren, 1);
  }
  if (minute >= K.bas && minute < K.bas + 1.5) ses.korna = 0.8; // çarpışmanın hemen ardından kornalar
  else if (minute >= K.bas && minute < K.son - 3) ses.korna = 0.25; // kuyrukta sabırsızlar
}

/** Bir olay aracının o dakikadaki konumu: gidiş, park, dönüş (yoksa null). Park yeri ve yönü kesin (V.park, V.h):
 *  rota sonu şeride oturur, araç son %15'te park yerine süzülür (16 Kasım: çekici A'nın yanında değil B'nin üstündeydi). */
function aracPoz(V, minute, q, world) {
  const yer = (x, z) => world.surfaceY(x, z) + 0.06;
  if (minute < V.gidis.t0) return null;
  const parkPoz = () => {
    V.gidis.route.position(V.gidis.len, q);
    const [x, z] = V.park ?? [q.x, q.z];
    return { x, z, heading: V.h ?? q.heading };
  };
  const karis = (a, b, u) => {
    let dh = b.heading - a.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, heading: a.heading + dh * u };
  };
  if (minute < V.gidis.t1) {
    const u = yolculukKonum(V.gidis, minute, q);
    let c = { x: q.x, z: q.z, heading: q.heading };
    if (u > 0.85) c = karis(c, parkPoz(), ease((u - 0.85) / 0.15));
    return { x: c.x, y: yer(c.x, c.z), z: c.z, heading: c.heading, park: false };
  }
  if (!V.donus || minute < V.donus.t0) {
    const c = parkPoz();
    return { x: c.x, y: yer(c.x, c.z), z: c.z, heading: c.heading, park: true };
  }
  if (minute < V.donus.t1) {
    const u = yolculukKonum(V.donus, minute, q);
    let c = { x: q.x, z: q.z, heading: q.heading };
    if (u < 0.12) c = karis(parkPoz(), c, ease(u / 0.12));
    return { x: c.x, y: yer(c.x, c.z), z: c.z, heading: c.heading, park: false, donuyor: true };
  }
  return null;
}

/** Kaza yerinin sabit görünümü: cam kırıkları, plastik parçalar, buhar, uyarı üçgeni, dubalar. */
function buildKazaGorsel(group) {
  const g = new THREE.Group();
  g.visible = false;
  group.add(g);
  const kirikGeo = new THREE.BoxGeometry(0.07, 0.015, 0.05);
  const camMat = new THREE.MeshStandardMaterial({ color: "#cfe8f2", roughness: 0.05, metalness: 0.6, emissive: "#6fa8c0", emissiveIntensity: 0.25 });
  const parcaMat = new THREE.MeshStandardMaterial({ color: "#1f2226", roughness: 0.7 });
  const kirik = new THREE.InstancedMesh(kirikGeo, camMat, 120);
  const parca = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.06, 0.24), parcaMat, 14);
  // Tampon parçası ve çökük kaput kapağı.
  const tampon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.14), parcaMat);
  // Buhar: yumuşak beyaz bulutçuklar (sprite).
  const buharTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.5, "rgba(240,240,240,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const buhar = Array.from({ length: 9 }, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: buharTex, transparent: true, depthWrite: false, opacity: 0 })));
  // Uyarı üçgeni (kırmızı çerçeve, ayaklı) ve dubalar.
  const ucgen = new THREE.Group();
  const tri = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 3, 1), new THREE.MeshStandardMaterial({ color: "#e02020", emissive: "#a01010", emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  tri.rotation.z = Math.PI / 2; tri.position.y = 0.36;
  const ayak = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.2), parcaMat);
  ayak.position.y = 0.02;
  ucgen.add(tri, ayak);
  const duba = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.62, 10), new THREE.MeshStandardMaterial({ color: "#ff6a13", roughness: 0.6 }), 8);
  const dubaSerit = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.115, 0.14, 0.1, 10), new THREE.MeshStandardMaterial({ color: "#f4f4f4", emissive: "#bbbbbb", emissiveIntensity: 0.3 }), 8);
  for (const m of [kirik, parca, duba, dubaSerit]) { m.castShadow = false; m.receiveShadow = true; }
  // Hasar (araç modeli traffic.js car: gövde 1,8×0,62×4,3, kaput üstü y≈0,99): A'nın kaputu kalkık ve buruşuk, ön tamponu
  // ezik, farları kırık; B'nin darbe alan yanı göçük, yan camı kırık. Araçların o anki pozunu izler (çekiciye yüklenirken).
  const RENK = ["#e9e9e6", "#2b2d31", "#8d9399", "#b8312f", "#2f4f7a", "#c9c3b5", "#5b6e4f", "#a8a29a", "#1f3b5c", "#7d2b2b"];
  const koyu = new THREE.MeshStandardMaterial({ color: "#26282c", roughness: 0.8 });
  const hasarA = new THREE.Group(), hasarB = new THREE.Group();
  const kaputMat = new THREE.MeshStandardMaterial({ color: "#888", roughness: 0.4, metalness: 0.3 });
  const kaput = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.07, 1.05), kaputMat);
  kaput.position.set(0, 1.08, 1.5); kaput.rotation.set(-0.3, 0.06, 0.05);
  const kaput2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.5), kaputMat);
  kaput2.position.set(0.05, 1.12, 2.0); kaput2.rotation.set(0.42, -0.08, 0);
  const ezik = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.32, 0.4), koyu);
  ezik.position.set(0.1, 0.44, 2.05); ezik.rotation.y = 0.18;
  const farlar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.1), koyu);
  farlar.position.set(0, 0.72, 2.2);
  hasarA.add(kaput, kaput2, ezik, farlar);
  const gocukMat = new THREE.MeshStandardMaterial({ color: "#888", roughness: 0.55, metalness: 0.2 });
  const gocuk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 1.7), gocukMat);
  const camKirik = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.95), new THREE.MeshStandardMaterial({ color: "#15181c", roughness: 0.9 }));
  hasarB.add(gocuk, camKirik);
  group.add(hasarA, hasarB);
  g.add(kirik, parca, tampon, ucgen, duba, dubaSerit, ...buhar);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let kur = null;
  return {
    gizle() { g.visible = hasarA.visible = hasarB.visible = false; kur = null; },
    kur(K, world) {
      kur = { K, world };
      const y0 = (x, z) => world.surfaceY(x, z) + 0.065;
      for (let k = 0; k < kirik.count; k++) {
        const a = kesir("kirikA", K.tohum, k) * Math.PI * 2, r = Math.sqrt(kesir("kirikR", K.tohum, k)) * 3.4;
        const x = K.P[0] + Math.sin(a) * r - K.dA[0] * 0.8, z = K.P[1] + Math.cos(a) * r - K.dA[1] * 0.8;
        Q.setFromAxisAngle(UP, kesir("kirikH", K.tohum, k) * 6.28);
        const s = 0.5 + kesir("kirikS", K.tohum, k);
        kirik.setMatrixAt(k, M.compose(V.set(x, y0(x, z), z), Q, S.set(s, 1, s)));
      }
      for (let k = 0; k < parca.count; k++) {
        const a = kesir("parcaA", K.tohum, k) * Math.PI * 2, r = 0.8 + kesir("parcaR", K.tohum, k) * 4.2;
        const x = K.P[0] + Math.sin(a) * r, z = K.P[1] + Math.cos(a) * r;
        Q.setFromAxisAngle(UP, kesir("parcaH", K.tohum, k) * 6.28);
        const s = 0.5 + kesir("parcaS", K.tohum, k) * 0.9;
        parca.setMatrixAt(k, M.compose(V.set(x, y0(x, z) + 0.02, z), Q, S.set(s, 1, s)));
      }
      kirik.instanceMatrix.needsUpdate = parca.instanceMatrix.needsUpdate = true;
      const tx = K.A.x + Math.sin(K.A.h + 0.5) * 3.4, tz = K.A.z + Math.cos(K.A.h + 0.5) * 3.4;
      tampon.position.set(tx, y0(tx, tz) + 0.08, tz); tampon.rotation.y = K.A.h + 1.2;
      tampon.material = new THREE.MeshStandardMaterial({ color: RENK[K.A.renk % RENK.length], roughness: 0.5 });
      kaputMat.color.set(RENK[K.A.renk % RENK.length]).multiplyScalar(0.85);
      gocukMat.color.set(RENK[K.B.renk % RENK.length]).multiplyScalar(0.55);
      // B'nin darbe alan yanı: A'ya bakan yan (B'nin sağı = (cos h, −sin h)).
      const yanB = Math.cos(K.B.h) * (K.A.x - K.B.x) - Math.sin(K.B.h) * (K.A.z - K.B.z) > 0 ? 1 : -1;
      gocuk.position.set(yanB * 0.89, 0.42, 0.1); camKirik.position.set(yanB * 0.8, 0.95, -0.2);
      ucgen.position.set(K.ucgen.x, y0(K.ucgen.x, K.ucgen.z), K.ucgen.z); ucgen.rotation.y = K.ucgen.h + Math.PI;
      K.dubalar.forEach((d, k) => {
        duba.setMatrixAt(k, M.compose(V.set(d.x, y0(d.x, d.z) + 0.31, d.z), Q.identity(), S.set(1, 1, 1)));
        dubaSerit.setMatrixAt(k, M.compose(V.set(d.x, y0(d.x, d.z) + 0.32, d.z), Q.identity(), S.set(1, 1, 1)));
      });
      duba.count = dubaSerit.count = K.dubalar.length;
      duba.instanceMatrix.needsUpdate = dubaSerit.instanceMatrix.needsUpdate = true;
    },
    update(K, minute, real) {
      if (!kur || !K) { g.visible = hasarA.visible = hasarB.visible = false; return; }
      const poz = (grp, q) => { grp.visible = !!q; if (q) { grp.position.set(q.x, q.y, q.z); grp.rotation.set(0, q.h, 0); } };
      poz(hasarA, minute >= K.bas ? K.Apoz : null); poz(hasarB, minute >= K.bas ? K.Bpoz : null);
      const acik = minute >= K.bas && minute < K.son - 1;
      g.visible = acik;
      if (!acik) return;
      // Dubalar polis gelince (2 dk içinde) konur; üçgen baştan.
      const dubaAcik = minute > K.polis.varis + 1.5;
      duba.visible = dubaSerit.visible = dubaAcik;
      // Buhar: ilk 14 dakikada A'nın kaputundan, giderek azalan.
      const yogun = 1 - clamp01((minute - K.bas) / 14);
      const fx = K.A.x + Math.sin(K.A.h) * 1.9, fz = K.A.z + Math.cos(K.A.h) * 1.9, fy = kur.world.surfaceY(fx, fz) + 1.0;
      const sec = minute * 60;
      buhar.forEach((s, k) => {
        const per = 3.2, u = (((sec + k * (per / buhar.length)) % per) + per) % per / per;
        s.position.set(fx + Math.sin(k * 2.1) * 0.25 * u + 0.35 * u, fy + u * 2.4, fz + Math.cos(k * 1.7) * 0.25 * u);
        const sc = 0.6 + u * 1.8;
        s.scale.set(sc, sc, 1);
        s.material.opacity = yogun * 0.55 * Math.sin(u * Math.PI);
      });
    },
  };
}

// ---------------------------------------------------------------- yangın

/** Yangının kurgusu: çarşıda bir dükkân (konut değil: kimsenin evi yanmaz), itfaiye yolculuğu, itfaiyeci/seyirci yerleri. */
function yanginKur(world, traffic, o) {
  const fs = world.fireStation;
  if (!fs?.bay) return null;
  // Yangın binası gün boyu sabit (kazadaki gibi rendezvous seçimi: çarşıya yeni dükkân eklenince sıralı listede kayıyordu).
  const bs = world.buildings.filter((b) => b.kind === "carsi" && b.w > 5)
    .map((b) => ({ b, d: Math.hypot(b.x, b.z + 12), k: kesir("yanginYer", o.tohum, Math.round(b.x), Math.round(b.z)) }))
    .filter((a) => a.d > 30 && a.d < 380).sort((a, b) => b.k - a.k);
  for (let deneme = 0; deneme < bs.length; deneme++) {
    const { b } = bs[deneme];
    const s = Math.sin(b.rot ?? 0), c = Math.cos(b.rot ?? 0);
    const on = [s, c], yan = [c, -s]; // binanın önü (+z yerel) ve yanı (+x yerel)
    const H = b.floors * 3.2;
    const gy = world.groundY(b.x, b.z);
    // Ateş: üst katın ön penceresi (yerel x biraz yanda), çatıdan duman.
    const ox = (kesir("yanginX", o.tohum) - 0.5) * b.w * 0.5;
    const ates = [b.x + yan[0] * ox + on[0] * (b.d / 2), gy + H - 2.0, b.z + yan[1] * ox + on[1] * (b.d / 2)];
    // İtfaiye binanın önündeki yola, cepheye paralel park eder.
    const park0 = [b.x + on[0] * (b.d / 2 + 9), b.z + on[1] * (b.d / 2 + 9)];
    // Çarşının önü yaya yolu olabilir: itfaiye en yakın taşıt yoluna (≤45 m) park eder, hortum oradan uzanır.
    const loc = traffic.locate(park0, 45, ["cadde", "sokak", "koy"]);
    let park = park0, parkH = (b.rot ?? 0) + Math.PI / 2;
    if (loc) {
      const e = traffic.edges[loc.edge], q = pointAt(e.center, e.cumC, loc.along), q2 = pointAt(e.center, e.cumC, loc.along + 1);
      park = [q.x, q.z]; parkH = yon(q2.x - q.x, q2.z - q.z);
    }
    const R = traffic.route(fs.bay, park);
    if (!R) { console.warn("olay: yangın rotası yok", b.isim); continue; }
    const varis = o.bas + Math.round((o.son - o.bas) * 0.17);
    const sure = Math.max(1.2, R.len / 13 / 60);
    const D = traffic.route(park, fs.bay);
    const ayrilis = o.son - 2;
    const itfaiye = { park, h: parkH, gidis: yolculuk(R, varis - sure, varis), donus: D ? yolculuk(D, ayrilis, ayrilis + Math.max(1.2, D.len / 13 / 60)) : null, varis, ayrilis };
    // İtfaiyeciler: hortumla ateşe, biri merdiven dibinde, biri araçta.
    const hortum = [];
    for (let k = 0; k < 3; k++) {
      const u = (k - 1) * 2.4;
      const x = b.x + on[0] * (b.d / 2 + 4.2) + yan[0] * (ox + u), z = b.z + on[1] * (b.d / 2 + 4.2) + yan[1] * (ox + u);
      hortum.push({ x, z, heading: yon(ates[0] - x, ates[2] - z), look: [ates[0], ates[2]], gorevli: "itfaiyeci", rol: k === 1 ? "bekle" : "hortum" });
    }
    const merkez = [b.x + on[0] * (b.d / 2 + 16), b.z + on[1] * (b.d / 2 + 16)];
    return { bas: o.bas, son: o.son, tohum: o.tohum, b, H, gy, on, yan, ates, itfaiye, hortum, merkez, yon: yon(on[0] + yan[0] * 0.5, on[1] + yan[1] * 0.5) };
  }
  return null;
}

/** Yangın şiddeti (0–1): duman → alev (en yüksek %25) → söndürme (%60'ta biter); is (siyah duman → beyaz). */
function yanginSiddet(Y, minute) {
  const u = (minute - Y.bas) / (Y.son - Y.bas);
  if (u < 0) return { alev: 0, duman: 0, beyaz: 0, su: 0 };
  const alev = u < 0.07 ? 0.15 * (u / 0.07) : u < 0.25 ? 0.15 + 0.85 * ease((u - 0.07) / 0.18) : u < 0.6 ? 1 - ease((u - 0.25) / 0.35) : 0;
  const duman = u < 0.6 ? Math.min(1, 0.35 + alev) : u < 1 ? 0.6 * (1 - ease((u - 0.6) / 0.4)) + 0.08 : Math.max(0, 0.08 * (1 - (u - 1) * 4));
  const beyaz = u < 0.3 ? 0 : clamp01((u - 0.3) / 0.35);
  const su = minute >= Y.itfaiye.varis + 1.5 && u < 0.78 ? 1 : 0;
  return { alev, duman, beyaz, su, u };
}

/** Yangın görünümü: duman sütunu, alevler, su püskürtmesi, is izi. Hepsi dakikanın saf işlevi. */
function buildYanginGorsel(group) {
  const g = new THREE.Group();
  g.visible = false;
  group.add(g);
  const doku = (renk0, renk1) => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 1, 32, 32, 31);
    gr.addColorStop(0, renk0); gr.addColorStop(1, renk1);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  };
  // Duman: ~70 parçacık (Points), yükselip genişler, rüzgârla kayar; renk kara → gri → beyaz.
  const N = 120;
  const dumanGeo = new THREE.BufferGeometry();
  dumanGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  dumanGeo.setAttribute("boy", new THREE.BufferAttribute(new Float32Array(N), 1));
  dumanGeo.setAttribute("saydam", new THREE.BufferAttribute(new Float32Array(N), 1));
  const dumanMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: doku("rgba(255,255,255,1)", "rgba(255,255,255,0)") }, renk: { value: new THREE.Color("#2a2a2a") }, olcek: { value: 600 } },
    vertexShader: `attribute float boy; attribute float saydam; varying float vS; uniform float olcek;
      void main() { vS = saydam; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = boy * olcek / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 renk; varying float vS;
      void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(renk, t.a * vS); }`,
  });
  const duman = new THREE.Points(dumanGeo, dumanMat);
  duman.frustumCulled = false;
  // Alev: toplanmış parlak spritelar (katmanlı, titreşen).
  const alevTex = doku("rgba(255,230,140,1)", "rgba(255,80,0,0)");
  const alevler = Array.from({ length: 14 }, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: alevTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffb347" })));
  // Alev parıltısı: nokta ışığı yerine büyük toplamalı sprite (17 Kasım QC: PointLight sahneye girince bütün aydınlatılan
  // malzemeler yeniden derleniyordu, yangın başında ~200 ms donma; söndükten sonra da her pikselde hesaplanıyordu).
  const parilti = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku("rgba(255,150,60,0.55)", "rgba(255,90,20,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  // Su: hortumdan ateşe yay boyunca akan damlalar (Points, mavi-beyaz).
  const SU = 160;
  const suGeo = new THREE.BufferGeometry();
  suGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SU * 3), 3));
  const su = new THREE.Points(suGeo, new THREE.PointsMaterial({ color: "#dff2ff", size: 0.22, transparent: true, opacity: 0.85, depthWrite: false }));
  su.frustumCulled = false;
  // İs izi: binanın üst kısmını saran yarı saydam koyu kabuk (söndükten sonra gün boyu).
  const is = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#151515", transparent: true, opacity: 0, roughness: 1, depthWrite: false }));
  g.add(duman, ...alevler, parilti, su, is);
  let Y = null;
  return {
    gizle() { g.visible = false; Y = null; },
    kur(y) {
      Y = y;
      is.position.set(y.b.x, y.gy + y.H * 0.72, y.b.z);
      is.rotation.y = y.b.rot ?? 0;
      is.scale.set(y.b.w + 0.25, y.H * 0.56 + 0.3, y.b.d + 0.25);
    },
    update(minute, real) {
      if (!Y || minute < Y.bas) { g.visible = false; return; }
      g.visible = true;
      const S = yanginSiddet(Y, minute), sec = minute * 60;
      // İs: alev büyüdükçe koyulaşır, sonra kalır.
      is.material.opacity = 0.42 * clamp01((minute - Y.bas) / ((Y.son - Y.bas) * 0.4));
      // Söndükten sonra yalnız is kalır: duman/alev/su döngüsü çalışmaz, çizilmez.
      const bitti = S.duman <= 0.001 && S.alev <= 0.001 && !S.su;
      duman.visible = !bitti; parilti.visible = S.alev > 0.02;
      if (bitti) { for (const sp of alevler) sp.visible = false; su.visible = false; return; }
      // Duman parçacıkları: her biri 14 sn'lik ömür; kaynak ateş penceresi ve çatı.
      const pos = dumanGeo.attributes.position.array, boy = dumanGeo.attributes.boy.array, sy = dumanGeo.attributes.saydam.array;
      const [ax, ay, az] = Y.ates;
      for (let i = 0; i < N; i++) {
        const omur = 18, faz = (((sec + i * (omur / N)) % omur) + omur) % omur / omur;
        const r1 = kesir("dmn", Y.tohum, i), r2 = kesir("dmn2", Y.tohum, i);
        const h = faz * (34 + 40 * S.duman);
        pos[i * 3] = ax + (r1 - 0.5) * 2 + h * 0.35 + Math.sin(faz * 6 + i) * 0.6; // rüzgâr +x
        pos[i * 3 + 1] = ay + 0.5 + h;
        pos[i * 3 + 2] = az + (r2 - 0.5) * 2 + Math.cos(faz * 5 + i) * 0.6;
        boy[i] = (3.5 + faz * 22) * (0.7 + S.duman * 0.6);
        sy[i] = S.duman * Math.min(1, faz * 6) * (1 - faz * faz) * (1 - S.beyaz * 0.35);
      }
      dumanGeo.attributes.position.needsUpdate = dumanGeo.attributes.boy.needsUpdate = dumanGeo.attributes.saydam.needsUpdate = true;
      dumanMat.uniforms.renk.value.setRGB(0.13 + 0.62 * S.beyaz, 0.13 + 0.62 * S.beyaz, 0.13 + 0.64 * S.beyaz);
      // Alevler: pencerede ve çatı kenarında, titreşerek.
      alevler.forEach((sp, k) => {
        const yanX = (k % 7 - 3) * 0.55, ust = k >= 7 ? 2.2 : 0;
        const fl = 0.75 + 0.25 * Math.sin(real * (9 + k) + k * 1.7) * Math.sin(real * 5.3 + k);
        const s = S.alev * (1.6 + (k % 3) * 0.5) * fl;
        sp.visible = s > 0.05;
        sp.position.set(ax + Y.yan[0] * yanX + Y.on[0] * 0.3, ay + ust + s * 0.4, az + Y.yan[1] * yanX + Y.on[1] * 0.3);
        sp.scale.set(s, s * 1.5, 1);
      });
      if (parilti.visible) {
        const pr = (7 + 5 * S.alev) * (0.9 + 0.1 * Math.sin(real * 13));
        parilti.position.set(ax + Y.on[0] * 1.5, ay + 0.6, az + Y.on[1] * 1.5);
        parilti.scale.set(pr, pr, 1);
        parilti.material.opacity = Math.min(1, S.alev * 1.2);
      }
      // Su: hortum ucundan ateşe parabol (itfaiyecilerin önünden).
      su.visible = S.su > 0;
      if (su.visible) {
        const p = suGeo.attributes.position.array;
        for (let i = 0; i < SU; i++) {
          const kol = i % 2, n0 = Y.hortum[kol === 0 ? 0 : 2];
          const sx = n0.x + Y.on[0] * -0.6, sz = n0.z + Y.on[1] * -0.6, syy = Y.gy + 1.3;
          const t = (((sec * 1.6 + i / SU * 2) % 1) + 1) % 1;
          const ex = ax + Y.on[0] * 0.5 + (kesir("su", Y.tohum, i) - 0.5) * 1.6, ez = az + Y.on[1] * 0.5, ey = ay + (kesir("su2", Y.tohum, i) - 0.3) * 1.2;
          p[i * 3] = sx + (ex - sx) * t;
          p[i * 3 + 1] = syy + (ey - syy) * t + Math.sin(t * Math.PI) * 4.5;
          p[i * 3 + 2] = sz + (ez - sz) * t;
        }
        suGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
