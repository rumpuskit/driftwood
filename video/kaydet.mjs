// Senaryodan dikey video üretir: her çekim için siteyi açar, zamanı sanal saate bağlar, kareleri tek tek
// ilerletip ekran görüntüsünü ffmpeg'e verir; sonunda çekimleri geçişlerle birleştirir.
//
//   cd web && npm run build && npx vite preview --port 4183      (ayrı terminalde)
//   cd video && node kaydet.mjs senaryolar/acilis.mjs [--onizleme] [--cekim 2] [--birlestir]
//
// Senaryo: { ad, fps, w, h, gecis, seslendirme?, aralar?, muzik?, cekimler: [{ sure, adres, kamera, yazilar, takip, arayuz, hazirlik }] }
//   seslendirme: seslendir.mjs'e bak (ses + cümle cümle altyazı). aralar: { cümle sırası: sn } o cümleden önce
//   eklenecek sessizlik (vuruş cümlesi öncesi 0,3–0,5 sn; anlatım standardı). Ses değiştiyse:
//   ELEVENLABS_API_KEY=... ile çalıştır (yoksa kayıtlı ses kullanılır). muzik: arka plan müziği dosyası
//   (video/ klasörüne göre), konuşmanın 14 dB altına ayarlanır.
//   adres:   sitenin sorgu parametreleri (ör. "saat=08:10&hiz=20&nufus=3200")
//   kamera:  [[t, kx, ky, kz, bx, by, bz], ...] kamera konumu ve bakılan nokta (çekim başından saniye)
//   takip:   { yakin: true, secim, yalniz } yürüyen bir sakini yakından izler (kamera yerine); secim görünüş
//            koşulları (kel değil vb.)
//   yazilar: [{ metin, alt?, bas, son, yer: "ust" | "orta" | "alt" }]
//   arayuz:  true ise sitenin üst bilgisi görünür (diğer paneller hep gizli); kart: true ise sakin kartı da
//   yorunge: { hedef: "siradaki" | "iskele" | "fener" | "meydan" | "kilise" | "ilkev" | [x, z], r, h, a0, a1, bak } hedefin
//            çevresinde a0'dan a1'e (radyan) dönen kamera; hedef sitede o anda hesaplanır (ör. sıradaki şantiye).
//            "zeplin": uçan zeplinin yanında, gidiş yönüne göre a açısında (h zeplinin altı/üstü); "zeplin-yer":
//            vapur iskelesinden (önü açık) zeplini izleyen sabit kamera.
//   serbest: true ise kamerayı site yönetir (ör. adres "bul=kullanici": sakini bulup izler, evdeyse içini açar)
//   hareket: { tur, hedef, a, D, H|Hb, ... } yeni kamera dili (HAREKET işlevinin başındaki açıklama); fov: derece;
//   sarsinti: 0–1 el kamerası (SARMA); gecis: { tur: kesme|solma|kaydir|flas|yakinlas, sure } bu çekime giriş geçişi
//   (yoksa senaryonun "gecis" süresiyle solma); aracAni: { ad, oto } olay aracının yol saatini sayfadan denetle/düzelt;
//   anAni: { tur: "simsek" | "sicrama", t } fırtınada şimşek / balinada sıçrama çekimin t. saniyesine düşsün (sanal saat
//   ileri sarılır).
// efektler (senaryo): [{ dosya, bas (genel zaman, sn), ses?: dB }] konuşmanın altına karışan ses efektleri (efekt.mjs);
//   varsayılan düzey konuşmanın ~11 dB altı, sınırlayıcıdan geçer.
// Senaryo dosyası .mjs (default export) ya da .json olabilir (gunluk.mjs JSON yazar). olcek: 2 ise sayfa
// yarı boyutta, iki kat piksel yoğunluğuyla çizilir: arayüz (kart, üst bilgi) videoda okunur boyutta görünür.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { seslendir } from "./seslendir.mjs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const preview = args.includes("--onizleme");
const only = args.includes("--cekim") ? Number(args[args.indexOf("--cekim") + 1]) : null;
const joinOnly = args.includes("--birlestir"); // çekimleri yeniden çizmeden yalnızca birleştir
const base = process.env.SITE ?? "http://localhost:4183/";
const S = file.endsWith(".json") ? JSON.parse(readFileSync(file, "utf8")) : (await import(resolve(file))).default;
const olcek = S.olcek ?? 1;
const fps = preview ? 15 : S.fps ?? 30;
const scale = preview ? 0.5 : 1;
const W = Math.round((S.w ?? 1080) * scale), H = Math.round((S.h ?? 1920) * scale);
const out = resolve("cikti", S.ad);
mkdirSync(out, { recursive: true });

// Sayfa açılmadan önce: performance.now ve requestAnimationFrame sanal saate bağlanır.
const CLOCK = `(() => {
  const realNow = performance.now.bind(performance), realRAF = window.requestAnimationFrame.bind(window);
  let manual = false, vt = 0, q = [];
  performance.now = () => (manual ? vt : realNow());
  window.requestAnimationFrame = (cb) => (manual ? (q.push(cb), q.length) : realRAF(cb));
  window.__manual = () => { vt = realNow(); manual = true; };
  window.__step = (ms) => { vt += ms; const c = q; q = []; for (const f of c) f(vt); return c.length; };
})();`;

const CSS = `
#hud .links, #hud .waiting, #speed, #card, #navbtns, #minimap, #arama, #floorbar, #loading, #online,
#dock, #sayfa, #foto-bar, #foto-onizleme, #yerler, #toast { display: none !important; }
body:not(.arayuz) #hud { display: none !important; }
body.arayuz #sol { transform: scale(calc(2.1 * var(--k))); transform-origin: top left; top: calc(150px * var(--k)) !important; left: calc(60px * var(--k)) !important; }
body.kart #card { display: block !important; }
/* Yazı katmanı her zaman 1080×1920 düzeninde; olcek 2'de sayfa yarı boyutta olduğu için küçültülür. */
#kayit { position: fixed; left: 0; top: 0; width: 1080px; height: 1920px; transform: scale(var(--k)); transform-origin: 0 0;
  pointer-events: none; font-family: Nunito, system-ui, sans-serif; z-index: 20; }
#kayit .yazi { position: absolute; left: 50%; transform: translate(-50%, 0); width: 860px; text-align: center; transition: none; }
#kayit .yazi.ust { top: 300px; }
#kayit .yazi.orta { top: 760px; }
#kayit .yazi.alt { top: 1180px; }
#kayit .kutu { display: inline-block; background: rgba(18, 26, 44, 0.74); color: #fff; border-radius: 28px; padding: 20px 34px 24px;
  font-weight: 800; font-size: 66px; line-height: 1.15; letter-spacing: -0.5px; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
#kayit .alt-yazi { display: inline-block; margin-top: 18px; background: #e0607a; color: #fff; border-radius: 20px; padding: 12px 26px 15px;
  font-weight: 800; font-size: 46px; line-height: 1.2; }
#kayit .alt-yazi small { font-size: 36px; font-weight: 700; opacity: 0.95; }
#kayit .altyazi { position: absolute; left: 50%; top: 1215px; transform: translateX(-50%); width: 900px; text-align: center;
  color: #fff; font-weight: 900; font-size: 64px; line-height: 1.18; letter-spacing: -0.3px; white-space: pre-line; text-wrap: balance;
  -webkit-text-stroke: 12px #000; paint-order: stroke fill; text-shadow: 0 4px 14px rgba(0,0,0,.35); }
`;

function ffmpeg(args) {
  const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => p.on("close", (c) => (c === 0 ? ok() : fail(new Error("ffmpeg " + c)))));
  return { p, done };
}

// Seslendirme: cümle zamanları (eklenen aralarla kaydırılmış) ve çekimlerin genel zaman çizelgesindeki başlangıcı.
const X = S.gecis ?? 0.35;
const ses = S.seslendirme ? await seslendir(S) : null;
const aralar = S.aralar ?? {};
const cues = (ses?.cumleler ?? []).map((c, k) => {
  const kay = Object.entries(aralar).reduce((a, [j, d]) => a + (Number(j) <= k ? d : 0), 0);
  return { yazi: c.yazi, bas: c.bas + kay, son: c.son + kay };
});
// Geçiş: her çekimin "gecis" alanı ONA giriş geçişidir ({tur, sure}); yoksa senaryonun solması (eski senaryolar).
// Önceki çekim bu süre kadar uzundur (gunluk.mjs ekler): çekim k genel zamanda tam kendi kesitinin başında başlar.
const gecisOf = (k) => S.cekimler[k].gecis ?? { tur: "solma", sure: X };
const starts = S.cekimler.reduce((a, c, k) => (a.push(k ? a[k - 1] + S.cekimler[k - 1].sure - gecisOf(k).sure : 0), a), []);
// xfade karşılıkları. kesme: geçiş süresinin ortasında sert kesme. kaydir: yatay bulanık kayma (whip).
// flas: beyaz parlama (şimşek, çarpma). yakinlas: içe doğru yakınlaşma.
const XFADE = { kesme: "custom:expr='if(gt(P,0.5),A,B)'", solma: "fade", kaydir: "hblur", "kaydir-sag": "hblur", flas: "fadewhite", yakinlas: "zoomin" };

// --- Hareket dili (16 Kasım 2026, kullanıcı: "sürekli bir yerlere yaklaşan çekimler yerine daha karışık, dikkat çekici") ---
// Senaryodaki çekimde hareket: { tur, hedef, a, D, H, bak?, yon?, fov?, aciSabit?, arac? }. Sayfada her karede kamerayı
// kurar. hedef: [x, y, z] | [x, z] | "meydan" | "iskele" | "fener" | "kilise" | "ilkev" | "siradaki" | "isyeri:<tür>:<n>" | "zeplin" | "olay" |
// "olay-kalabalik" | "olay-hava" | "olay-arac:<ad>". a: hedeften kameraya yatay açı (iş yeri ve olayda binanın/olayın
// önüne göre), D: yatay uzaklık, H: kameranın hedef zeminine göre yüksekliği (temel kadraj; her hareket kendi ölçüsünü
// bundan türetir). yon: ±1 (yan kayma, dönüş, whip yönü; vertigo'da -1 = içeri). Türler:
//   vinc (alçaktan yükselip aşağı bakar) · yanKay (yana kayma, paralaks) · alcak (yerden 0,9 m, yukarı bakar, ileri) ·
//   tele (150–400 m'den dar açı, haber görüntüsü) · el (sokak düzeyi, yürür; sarsıntı kaydet'te) · whip (ilk 0,3 sn hızlı
//   dönüşle hedefe oturur) · vertigo (uzaklaşırken daralan açı: konu aynı boy, arka plan büyür) · drone (alçak, hızlı uçuş
//   çatıların üstünden hedefe) · yorunge (hedef çevresinde yay) · takip / yanTakip (olay aracını arkadan-yandan / yandan).
// Güvenlik: açı engelsizce aranır (bina içi, ağaç, duvar: hedeften kameraya ışın), sokak düzeyinde her karede engelin
// önüne gelinir, drone çatıların 3 m üstünden geçer. Uyarılar globalThis.__uyarilar'a (kaydet çekim sonunda yazar).
function HAREKET({ h, sure, olayBek }) {
  const A = globalThis.__ada, W = A.world, O = A.olay;
  const uyar = (m) => (globalThis.__uyarilar ??= []).push(m);
  A.controls.custom = { rotate() {}, zoom() {} };
  const s = h.yon ?? 1, R = Math.PI / 180;
  const kl = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, u) => a + (b - a) * u;
  const ease = (u) => u * u * (3 - 2 * u), ease3 = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const yerY = (x, z) => Math.max(0, W.groundY(x, z));
  const icinde = (b, px, pz, m) => {
    const c = Math.cos(b.rot ?? 0), sn = Math.sin(b.rot ?? 0), lx = (px - b.x) * c - (pz - b.z) * sn, lz = (px - b.x) * sn + (pz - b.z) * c;
    return Math.abs(lx) < b.w / 2 + m && Math.abs(lz) < b.d / 2 + m;
  };
  const binaUstu = (b) => yerY(b.x, b.z) + (b.floors ?? 1) * 3.2 + 3.5;
  const binada = (p, m = 0.8) => W.buildings.some((b) => icinde(b, p[0], p[2], m) && p[1] < binaUstu(b));
  const tepe = (x, z, m = 4) => { let t = yerY(x, z); for (const b of W.buildings) if (icinde(b, x, z, m)) t = Math.max(t, binaUstu(b)); return t; };
  if (olayBek) {
    const p = O?.plan;
    if (!p) uyar(`olay bekleniyordu (${olayBek}) ama sayfada bugün olay yok: yedek hedef`);
    else if (p.tur !== olayBek) uyar(`sayfadaki olay "${p.tur}", beklenen "${olayBek}"`);
  }
  // --- hedef ---
  const isyeriBul = (hd) => {
    const [, k, i] = hd.split(":"), l = W.workplaces?.[k], w = l?.[Number(i)] ?? l?.find(Boolean);
    if (w) return w;
    const bs = W.buildings.filter((b) => b.kind === k), b = bs[Number(i)] ?? bs[0];
    if (!b) return null;
    const o = (b.d ?? 10) / 2 + 3;
    return { building: b, door: [b.x + o * Math.sin(b.rot ?? 0), b.z + o * Math.cos(b.rot ?? 0)] };
  };
  // Driftwood: Town Green [0, 0], iskele ortası (feribot yanında), kilise, ilk ev (yorunge kütüphanesiyle aynı noktalar).
  const MEYDAN = [0, 0], PX = (W.ferryPier.x0 + W.ferryPier.x1) / 2;
  const nokta = (xz, yk) => [xz[0], yerY(xz[0], xz[1]) + yk, xz[1]];
  let Tn = null, oneri = null, pay = 1.2, hareketli = null, yOfs = h.bak ?? 0, tur = h.tur, dMin = 0, tam = false, dTaban = 0;
  const hd = h.hedef;
  if (Array.isArray(hd)) Tn = hd.length === 3 ? [...hd] : nokta(hd, h.bak ?? 2);
  else if (hd === "meydan") Tn = nokta(MEYDAN, h.bak ?? 2);
  else if (hd === "iskele") Tn = nokta([PX, W.ferryPier.z0 + 45], h.bak ?? 2);
  else if (hd === "fener") Tn = nokta([W.fener.x, W.fener.z], h.bak ?? 4);
  else if (hd === "kilise") Tn = nokta([0, -84], h.bak ?? 9);
  else if (hd === "ilkev") { const ev = W.homeOf?.(0); Tn = nokta(ev ? [ev.bx, ev.bz] : MEYDAN, h.bak ?? 3); }
  else if (hd === "siradaki") Tn = nokta(W.nextStage?.at ?? MEYDAN, h.bak ?? 2);
  else if (hd?.startsWith?.("isyeri:")) {
    const w = isyeriBul(hd);
    if (w) {
      Tn = nokta(w.door, h.bak ?? 3);
      if (w.building) { oneri = Math.atan2(w.door[0] - w.building.x, w.door[1] - w.building.z); dMin = (h.aciSabit ? 1.7 : 1.2) * Math.max(w.building.w, w.building.d); } // 1,7: eski yörüngeyle aynı (elle kadraj)
    }
    else { uyar(`${hd} bulunamadı: meydan`); Tn = nokta(MEYDAN, 2); }
  } else if (hd === "zeplin") {
    hareketli = () => (A.zeplin?.pose?.visible ? A.zeplin.pose : null);
  } else if (hd?.startsWith?.("olay")) {
    const arac = hd.startsWith("olay-arac:") ? hd.slice(10) : null;
    const odak = O?.plan ? O.odak : null;
    const havaOlay = O?.plan?.tur === "sis" || O?.plan?.tur === "firtina";
    if (havaOlay && hd === "olay-yakin") {
      // Fırtına/sis yakın (Driftwood): iskelenin üstünde, göz hizasında denize doğru yürüyen bakış; feribot sağda, iskele
      // sise/yağmura karışır (çardak yakın çekimi geniş çekimle aynı yeri gösteriyordu).
      Tn = nokta([PX, W.ferryPier.z0 + 40], 2); oneri = Math.PI; yOfs = 0; h = { ...h, goz: 3.3 };
    } else if (havaOlay && hd === "olay-kalabalik") {
      // Seyirci yok: Town Green'e karşı yandan (kuzeyden), alçak ve geniş; geniş olay çekimi güneyden. (Denenenler: ilk evin
      // sokağı: karşı evler kamerayı evin dibine itti; kilise 50. sakinde açılıyor; iskeleden kasaba: boş çimen.)
      Tn = nokta(odak ?? MEYDAN, 3); oneri = Math.PI + 0.4; yOfs = 0; dTaban = 30; pay = 8; h = { ...h, D: 40, H: 7 };
    } else if (hd === "olay-hava" && O?.plan?.tur === "sis") {
      // Sis (Driftwood): denizden limana ve iskeleye bakış; feribot ve kıyı sisin içinden seçilir (açık denize bakış
      // düz griydi).
      // Kamera iskelenin doğusunda denizde (feribot iskelenin doğu yanına yanaşır: kamera ile iskele arasında).
      Tn = nokta([PX + 6, W.ferryPier.z0 + 64], 3); oneri = 0.95; yOfs = 0;
    } else if (hd === "olay-hava" && (!odak || O.plan.tur === "firtina")) {
      // Fırtına: iskele başından denize ve gökyüzüne geniş bakış.
      Tn = [PX, 16, W.ferryPier.z1 + 140]; oneri = Math.PI; yOfs = 0;
    } else if (odak && hd === "olay-kalabalik" && O.kalabalik && O.seyirci !== 0) {
      // Seyirciler (tepki çekimi): kamera olay tarafında, kalabalığın yüzlerine bakar (işaret eden, bakan sakinler).
      const k = O.kalabalik;
      Tn = nokta(k, 1.5);
      oneri = Math.atan2(odak[0] - k[0], odak[1] - k[1]);
      dMin = Math.max(8, Math.hypot(k[0] - odak[0], k[1] - odak[1]) * 0.7); tam = true; // kamera tam bu uzaklıkta
    } else if (odak) {
      Tn = nokta(odak, hd === "olay-hava" ? 10 : O.odakY ?? 2);
      // Deniz olayında kamera kıyıdan bakar; diğerlerinde olayın önü (yon).
      oneri = O.kiyi ? Math.atan2(O.kiyi[0] - odak[0], O.kiyi[1] - odak[1]) : typeof O.yon === "number" ? O.yon : null;
      // Yanan bina: hedef binanın içinde; ışın denetimi binanın kendisini engel saymaz, kamera cepheden uzak durur.
      if (O.bina) { const yari = Math.max(O.bina.w ?? 8, O.bina.d ?? 8) / 2; pay = yari + 2; dMin = Math.max(dMin, yari + 14); dTaban = yari + 18; } // dikey kadraj dar: cepheden ~18 m
    } else { uyar(`olay hedefi yok (${hd}${O?.plan ? `, ${O.plan.tur}` : ", bugün olay yok"}): meydan`); Tn = nokta(MEYDAN, 2); }
    // Deniz olayı (yunus/balina): hedef sürünün merkezi (O.suru, hareketli); yakın çekimde başta su üstünde olan
    // hayvanın yeri (O.canli, sabit nokta: sıçrama orada olur).
    const deniz = O?.plan && (O.plan.tur === "yunus" || O.plan.tur === "balina") && !(hd === "olay-kalabalik" && O.seyirci !== 0) && hd !== "olay-hava";
    if (deniz && hd === "olay-kalabalik") {
      // Seyirci yok (Driftwood 26 sakin, 16 Kasım: kıyı boştu): kıyıdan seyirci gözüyle, telefon yüksekliği, dar açı.
      uyar("kıyıda seyirci yok: kalabalık yerine kıyıdan seyirci gözüyle çekildi");
      tur = "el"; tam = true; dMin = Math.hypot(O.kiyi[0] - odak[0], O.kiyi[1] - odak[1]) * 0.92; h = { ...h, fov: h.fov ?? 24, goz: 1.6 };
    }
    if (deniz) {
      const c0 = hd === "olay-yakin" && typeof O.canli === "function" ? O.canli() : null;
      const xyz = (v) => (v ? { x: v[0], y: v[1], z: v[2], heading: 0 } : null);
      if (c0) Tn = [c0[0], c0[1] + 0.5, c0[2]];
      else if (typeof O.suru === "function" && O.suru()) { hareketli = () => xyz(O.suru()); yOfs = 0.5; }
    }
    if (arac) {
      hareketli = () => O?.arac?.(arac) ?? null;
      yOfs = h.bak ?? 1.2;
      if (!hareketli()) {
        uyar(`araç "${arac}" bu anda yok (saat/evre yanlış olabilir): olay odağına el kamerası`);
        hareketli = null; if (tur === "takip" || tur === "yanTakip") tur = "el";
      }
    }
  }
  // Fırtına/sis odağı Town Green'in çardağı (yarıçap ~7 m): yakından dikey kadrajı doldurup "içerideymiş" gibi görünüyordu;
  // çardağın kendisi engel sayılmasın (sokak düzeyinde kamera ona yapışıyordu).
  if ((hd === "olay" || hd === "olay-tele") && (O?.plan?.tur === "sis" || O?.plan?.tur === "firtina")) {
    pay = Math.max(pay, 8); dTaban = Math.max(dTaban, 26); // dikey kadrajda çardak (14 m) ~30 m'den okunur
  }
  if (hareketli) {
    const p = hareketli();
    if (!p) { uyar(`${hd} görünmüyor: meydan`); hareketli = null; Tn = nokta(MEYDAN, 2); if (tur === "takip" || tur === "yanTakip") tur = "el"; }
    else Tn = [p.x, (p.y ?? yerY(p.x, p.z)) + yOfs, p.z];
  }
  if (!Tn) { uyar(`hedef çözülemedi (${JSON.stringify(hd)}): meydan`); Tn = nokta(MEYDAN, 2); }
  // --- temel kadraj ve hareketler ---
  const gyT = () => yerY(Tn[0], Tn[2]);
  // Hb: bakılan noktaya göre yükseklik (anahtar kareden dönüştürülen kadraj).
  const D = Math.max(3, dMin, h.D ?? 30), H = h.H ?? (h.Hb != null ? Tn[1] + h.Hb - gyT() : 10), egim = Math.max(0.03, H / D);
  // Hedeften a açısında, d uzakta, yan kadar yana, hh yükseklikte nokta (yerden: kamera zeminine göre).
  const at = (a, d0, hh, yan = 0, yerden = false) => {
    const d = Math.max(d0, dTaban), sx = Math.sin(a), cz = Math.cos(a), x = Tn[0] + sx * d + cz * yan, z = Tn[2] + cz * d - sx * yan, gy = yerY(x, z);
    return [x, Math.max(gy + 0.6, (yerden ? gy : gyT()) + hh), z];
  };
  const T = () => Tn;
  let yk = 1; // tele: yükseklik çarpanı (açı aramasında)
  const M = {
    vinc: () => {
      const d0 = kl(D * 0.45, 7, 22), h1 = kl(Math.max(D, 20) * 0.75, 15, 38), d1 = Math.max(d0 * 1.5, h1 * 1.1);
      return { e: ease3, cam: (a, u) => at(a + s * 0.18 * u, lerp(d0, d1, u), lerp(1.8, h1, u)), bak: (a, u) => [Tn[0], Tn[1] + (1 - u) * 1.5, Tn[2]] };
    },
    yanKay: () => {
      // Elle kadrajda (aciSabit) o kadrajdan küçük yana kayma (uzaklığın %8'i).
      const d = tam || h.aciSabit ? D : kl(D * 0.75, 8, 70), hh = tam ? 1.9 : h.aciSabit ? H : kl(d * egim, 2.2, 30), L = h.aciSabit ? d * 0.08 : kl(d * 0.42, 3, 26);
      const yan = (a, k) => { const y = s * k * (2 * a - 1); return y; };
      return { e: (r) => 0.8 * r + 0.2 * ease(r), cam: (a, u) => at(a, d, hh, yan(u, L)),
        bak: (a, u) => { const y = yan(u, L * 0.45); return [Tn[0] + Math.cos(a) * y, Tn[1], Tn[2] - Math.sin(a) * y]; } };
    },
    alcak: () => {
      // Üç çeyrek açıdan (a + 0,35), yerden 0,9 m; bakış konunun orta yüksekliğine (gökyüzü ve çatı çizgisi kadrajda).
      // Olay/araç gibi alçak konuda bakış konunun hemen üstüne (yoksa konu altyazı bandına iner).
      const d0 = kl(D * 0.75, 8, 30), yb = typeof hd === "string" && hd.startsWith("olay") ? 1.6 : kl(d0 * 0.3, 3, 8);
      return { e: ease, cam: (a, u) => at(a + s * (0.35 + 0.12 * u), lerp(d0, d0 * 0.78, u), 0.9, 0, true), bak: () => [Tn[0], Math.max(Tn[1], gyT() + yb), Tn[2]] };
    },
    tele: () => {
      const f0 = h.fov ?? 16, Ds = kl(Math.hypot(D, H), 20, 90), d = kl((Ds * Math.tan(20 * R)) / Math.tan((f0 / 2) * R), 150, 400), hh = kl(d * 0.32, 45, 120); // yapraklar ışın denetiminde saydam: dik açıyla ağaçların ve çatıların üstünden (16 Kasım: 0,22'de ağaç kadrajı kapattı)
      return { e: (r) => r, uzak: true, yukler: [1, 1.8, 2.6], cam: (a, u) => at(a + s * 0.05 * u, d, hh * yk),
        bak: (a, u) => { const y = s * Ds * 0.05 * (2 * u - 1); return [Tn[0] + Math.cos(a) * y, Tn[1], Tn[2] - Math.sin(a) * y]; }, fov: (u) => f0 * (1 - 0.07 * u) };
    },
    el: () => {
      // Elle kadrajda (aciSabit) kamera o kadrajda kalır, yalnız hafif ilerler; değilse sokak düzeyinde yürür.
      if (h.aciSabit) return { e: (r) => r, cam: (a, u) => at(a + s * 0.04 * u, D * (1 - 0.07 * u), H * (1 - 0.05 * u), s * 0.3 * Math.sin(u * Math.PI)), bak: T };
      const d0 = tam ? D : kl(D * 0.45, 5, 26), gz = h.goz ?? 1.65; // goz: göz yüksekliği (olay-yakin 2,4: telefon havada)
      return { e: (r) => r, cam: (a, u) => at(a + s * 0.08 * u, lerp(d0, d0 * (tam ? 0.95 : 0.86), u), gz, s * 0.6 * Math.sin(u * Math.PI), true),
        bak: () => [Tn[0], Math.max(Tn[1], gyT() + 1.4), Tn[2]] };
    },
    whip: () => {
      const d = h.aciSabit ? D : kl(D * 0.6, 6, 40), hh = h.aciSabit ? H : kl(d * egim, 1.7, 25), Y0 = s * 1.35, a3 = h.aciSabit ? 0 : s * 0.25;
      // w: 0,28 sn'de hedefe dönüp %6 aşar, sonra sönümlü oturur.
      const w = (t) => (t < 0.28 ? 1.06 * (1 - (1 - t / 0.28) ** 3) : 1 + 0.06 * Math.exp(-(t - 0.28) * 9) * Math.cos((t - 0.28) * 16));
      return { e: ease, cam: (a, u) => at(a + a3, d * (1 - 0.06 * u), hh),
        bak: (a, u, t, c) => {
          const y = Y0 * (1 - w(t)), dx = Tn[0] - c[0], dz = Tn[2] - c[2], cs = Math.cos(y), sn = Math.sin(y);
          return [c[0] + dx * cs + dz * sn, Tn[1], c[2] - dx * sn + dz * cs];
        } };
    },
    vertigo: () => {
      const d0 = kl(D * 0.5, 8, 30), d1 = d0 * 2.1, f0 = h.fov ?? 46, k = d0 * Math.tan((f0 / 2) * R);
      const dd = (u) => (s > 0 ? lerp(d0, d1, u) : lerp(d1, d0, u));
      return { e: ease3, cam: (a, u) => { const d = dd(u); return at(a, d, kl(d * egim, 1.6, 40)); }, bak: T, fov: (u) => (2 * Math.atan(k / dd(u))) / R };
    },
    yorunge: () => ({ e: ease, cam: (a, u) => at(a + s * 0.75 * u, D * (1 - 0.12 * u), H * (1 - 0.12 * u)), bak: T }),
    itme: () => ({ e: ease, cam: (a, u) => at(a + s * 0.1 * u, D * (1 - 0.2 * u), H * (1 - 0.2 * u)), bak: T }),
    drone: () => {
      const L = kl(sure * 70, 120, 220), dE = kl(D * 0.5, 18, 40), hE = kl(dE * egim, 8, 20);
      const yol = [[L, s * L * 0.12, 24], [L * 0.6, s * L * 0.05, 17], [L * 0.3, 0, 12], [dE, 0, hE]];
      let P = null;
      const cr = (p0, p1, p2, p3, t) => p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t));
      const kur = (a) => {
        const K = yol.map(([d, y, hh]) => { const p = at(a, d, 0, y); return [p[0], gyT() + hh, p[2]]; });
        const Q = [K[0].map((v, j) => 2 * v - K[1][j]), ...K, K[3].map((v, j) => 2 * v - K[2][j])], N = 90;
        P = [];
        for (let i = 0; i <= N; i++) { const g = (i / N) * 3, k = Math.min(2, Math.floor(g)); P.push(cr(Q[k], Q[k + 1], Q[k + 2], Q[k + 3], g - k)); }
        // Yükseklik tabanı: çatıların 3 m üstü, yerden 8 m (son %12'de 4 m); genişletilip yumuşatılır (kamera binadan
        // önce tırmanır, sonra iner).
        const taban = P.map((p, i) => Math.max(tepe(p[0], p[2], 8) + 5, yerY(p[0], p[2]) + (i > N * 0.88 ? 4 : 8)));
        const gen = taban.map((_, i) => Math.max(...taban.slice(Math.max(0, i - 6), i + 7)));
        const yum = gen.map((_, i) => { const w = gen.slice(Math.max(0, i - 4), i + 5); return w.reduce((x, y) => x + y, 0) / w.length; });
        P.forEach((p, i) => { p[1] = Math.max(p[1], yum[i], taban[i]); });
        // Işın denetimi (çatı biçimi, kule, ağaç gövdesi): parça engelliyse o bölge 4 m yükselir (en çok 4 tur).
        for (let tur = 0; tur < 4 && A.engel; tur++) {
          let ek = P.map(() => 0), var_ = false;
          for (let i = 0; i < N; i += 2) {
            const p = P[i], q = P[Math.min(N, i + 2)], L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
            const yakinSon = i > N * 0.9; // son kısım hedefe iner: hedefin kendisi engel sayılmaz
            if (!yakinSon && A.engel(p[0], p[1], p[2], q[0], q[1], q[2]) < L) { for (let j = Math.max(0, i - 6); j <= Math.min(N, i + 8); j++) ek[j] = 4; var_ = true; }
          }
          if (!var_) break;
          P.forEach((p, i) => { p[1] += ek[i]; });
        }
      };
      const ornek = (u) => { const g = kl(u, 0, 1) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(g)), f = g - i; return P[i].map((v, j) => v + (P[i + 1][j] - v) * f); };
      return { kur, uzak: true, e: (r) => 0.55 * r + 0.45 * (1 - (1 - r) ** 2), cam: (a, u) => ornek(u),
        bak: (a, u) => { const ileri = ornek(Math.min(1, u + 0.2)); ileri[1] -= 6; const w = ease(kl((u - 0.1) / 0.55, 0, 1)); return ileri.map((v, j) => lerp(v, Tn[j], w)); } };
    },
    takip: () => ({ arac: true }),
    yanTakip: () => ({ arac: true }),
  };
  if (!M[tur]) { uyar(`bilinmeyen hareket "${tur}": yorunge`); tur = "yorunge"; }
  if ((tur === "takip" || tur === "yanTakip") && !hareketli) { uyar(`${tur} yalnız olay aracında ("olay-arac:<ad>"): el`); tur = "el"; }
  const m = M[tur]();
  // --- engelsiz açı ---
  // Ağaç tacı: sitenin engel ışını tacı görmez (malzeme saydam işaretli); world.trees'ten silindir yaklaşığı.
  const agacta = (b, c) => {
    const L = Math.hypot(c[0] - b[0], c[2] - b[2]), n = Math.max(2, Math.ceil(L / 2));
    const x0 = Math.min(b[0], c[0]) - 8, x1 = Math.max(b[0], c[0]) + 8, z0 = Math.min(b[2], c[2]) - 8, z1 = Math.max(b[2], c[2]) + 8;
    const ag = (W.trees ?? []).filter((t) => t.x > x0 && t.x < x1 && t.z > z0 && t.z < z1);
    for (let i = 1; i < n; i++) {
      const u = i / n, x = b[0] + (c[0] - b[0]) * u, y = b[1] + (c[1] - b[1]) * u, z = b[2] + (c[2] - b[2]) * u;
      for (const t of ag) { const gy = yerY(t.x, t.z); if (y > gy + t.h * 0.4 && y < gy + t.h && Math.hypot(x - t.x, z - t.z) < t.h * 0.3) return true; }
    }
    return false;
  };
  const temizMi = (c) => {
    if (binada(c)) return false;
    if (!A.engel) return true;
    const L = Math.hypot(c[0] - Tn[0], c[1] - Tn[1], c[2] - Tn[2]) || 1, k = Math.min(m.uzak ? Math.max(pay, 4) : pay, L * 0.5) / L;
    const b = Tn.map((v, j) => v + (c[j] - v) * k);
    if (A.engel(b[0], b[1], b[2], c[0], c[1], c[2]) < L * (1 - k) - 0.4 || agacta(b, c)) return false;
    if (m.uzak) return true;
    // Ön plan: kadrajın kenarlarına ve alt kısmına giden ışınlar kameranın 3,5 m yakınında bir şeye çarpmasın
    // (meydanda heykel/havuz kenarı, ağaç gövdesi kadrajın yarısını kapatıyordu).
    const fx = (Tn[0] - c[0]) / L, fz = (Tn[2] - c[2]) / L, rl = Math.hypot(fx, fz) || 1, rx = -fz / rl, rz = fx / rl;
    const w = L * Math.tan(((A.camera.fov ?? 40) * Math.PI) / 360) * A.camera.aspect, hgt = L * Math.tan(((A.camera.fov ?? 40) * Math.PI) / 360);
    // Driftwood: ince direkler (sokak lambası) kadrajın ortasına giriyordu (16 Kasım): ızgara sık, orta sütunda 5 m.
    const IZ = [];
    for (const x of [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45]) for (const y of [-0.4, -0.15, 0.2]) IZ.push([x, y]);
    return IZ.every(([x, y]) => {
      const p = [Tn[0] + rx * w * x, Tn[1] + hgt * y, Tn[2] + rz * w * x];
      return A.engel(c[0], c[1], c[2], p[0], p[1], p[2]) > (Math.abs(x) < 0.2 ? 5 : 3.5);
    });
  };
  let a = (oneri ?? 0) + (h.a ?? (oneri == null ? 0.6 : 0));
  if (!m.arac && !(hareketli && tur === "tele")) {
    // Hareketli hedefte (park etmiş çekici, zeplin) arama hedefin şu anki yerine göre.
    if (m.kur) m.kur(a);
    else if (!h.aciSabit) {
      // Açı (ve tele'de yükseklik) adayları sırayla; ilk tam temiz olan seçilir, yoksa en çok örneği temiz olan.
      const OFS = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, Math.PI];
      let en = null;
      ara: for (const y of m.yukler ?? [1]) for (const d of OFS) {
        yk = y;
        const n = [0, 0.5, 1].filter((u) => temizMi(m.cam(a + d, u, u * sure))).length;
        if (!en || n > en.n) en = { n, d, y };
        if (n === 3) break ara;
      }
      a += en.d; yk = en.y;
      if (en.n < 2) uyar(`${tur}: engelsiz açı bulunamadı (kamera engelin önüne alınır)`);
    }
  }
  // --- her kare ---
  const st = {};
  const sokak = !m.uzak; // sokak düzeyi: engelin önüne gel
  // Karede hata olursa (araç kayboldu vb.) site döngüsü durmasın: kamera son yerinde kalır, bir kez UYARI.
  const kare = (dt) => { try { adim(dt); } catch (e) { if (!st.hata) { st.hata = 1; uyar(`hareket karesi: ${e.message}`); } } };
  const adim = (dt) => {
    const t = globalThis.__shotT ?? 0, r = Math.min(1, t / sure), u = (m.e ?? ease)(r);
    if (hareketli) {
      const p = hareketli();
      if (p) {
        const y = (p.y ?? yerY(p.x, p.z)) + yOfs, hdg = p.heading ?? 0;
        if (st.x == null) Object.assign(st, { x: p.x, y, z: p.z, hd: hdg });
        const kp = 1 - Math.exp(-dt * 7), kh = 1 - Math.exp(-dt * 2.5);
        st.x += (p.x - st.x) * kp; st.y += (y - st.y) * kp; st.z += (p.z - st.z) * kp;
        st.hd += Math.atan2(Math.sin(hdg - st.hd), Math.cos(hdg - st.hd)) * kh;
      }
      if (st.x != null) Tn = [st.x, st.y, st.z];
    }
    let c, b;
    if (m.arac) {
      const fx = Math.sin(st.hd), fz = Math.cos(st.hd), gy = yerY(st.x, st.z);
      if (tur === "takip") {
        // Arkadan-yandan, araç kadrajın ortasında (altyazı bandının üstünde), az önü boş.
        const ang = st.hd + Math.PI + s * 0.5, d = lerp(11, 13.5, ease(r));
        c = [st.x + Math.sin(ang) * d, gy + 4.2, st.z + Math.cos(ang) * d];
        b = [st.x + fx * 2, st.y - 0.6, st.z + fz * 2];
      } else {
        const ang = st.hd + s * Math.PI / 2, d = lerp(12.5, 11, ease(r));
        c = [st.x + Math.sin(ang) * d + fx * 1.5, gy + 3, st.z + Math.cos(ang) * d + fz * 1.5];
        b = [st.x + fx * 2, st.y - 0.4, st.z + fz * 2];
      }
      c[1] = Math.max(c[1], yerY(c[0], c[2]) + 0.8);
    } else if (hareketli && tur === "tele") {
      // Hareketli hedefte (zeplin) tele kamera yerinde durur, yalnız döner.
      st.c0 ??= m.cam(a, 0, 0);
      c = st.c0; b = [...Tn];
    } else {
      c = m.cam(a, u, t); b = m.bak(a, u, t, c);
    }
    if (sokak && A.engel) {
      // Hedef ile kamera arasında opak engel (ağaç, direk, tente, duvar): kamera engelin önüne gelir; geri çekilme yavaş.
      const L = Math.hypot(c[0] - Tn[0], c[1] - Tn[1], c[2] - Tn[2]) || 1, k0 = Math.min(pay, L * 0.5) / L;
      const o = Tn.map((v, j) => v + (c[j] - v) * k0), L2 = L * (1 - k0);
      const e = A.engel(o[0], o[1], o[2], c[0], c[1], c[2]);
      // Yalnız kameranın dibindeki engel (kamera ağacın/direğin arkasında ya da içinde): uzaktaki direk, korkuluk
      // kadrajın parçası (iskelede kamera her direkte ileri sıçrıyordu).
      const hk = e < L2 && L2 - e < 6 ? Math.max(2.5, e - 0.6) / L2 : 1;
      st.k = st.k == null ? hk : hk < st.k ? hk : st.k + (hk - st.k) * (1 - Math.exp(-dt * 1.5));
      if (st.k < 1) c = o.map((v, j) => v + (c[j] - v) * st.k);
    }
    A.camera.position.set(c[0], c[1], c[2]);
    A.controls.target.set(b[0], b[1], b[2]);
    A.camera.lookAt(A.controls.target);
    const f = m.fov ? m.fov(u) : h.fov ?? 40;
    if (Math.abs(A.camera.fov - f) > 1e-3) { A.camera.fov = f; A.camera.updateProjectionMatrix(); }
  };
  globalThis.__yonetmen = kare;
}

// El kamerası sarsıntısı (sarsinti 0–1: deterministik gürültü, çekim zamanının işlevi; yaw/pitch/roll + hafif sallanma),
// görüş açısı (eski çekimlerde fov) ve hızlı dönüşte yatay hareket bulanıklığı (whip): mevcut __yonetmen'in üstüne.
function SARMA({ fov, sarsinti, tohum, bulanik }) {
  const A = globalThis.__ada, base = globalThis.__yonetmen;
  if (fov) { A.camera.fov = fov; A.camera.updateProjectionMatrix(); }
  if (!base) return; // serbest çekim: kamerayı site yönetir
  const F = [[0.31, 0.7], [0.83, 0.45], [1.7, 0.25], [3.1, 0.12]];
  const gur = (t, k) => { let v = 0; for (const [f, a] of F) v += a * Math.sin(2 * Math.PI * f * t * (1 + 0.13 * k) + tohum * 1.7 + k * 2.3 + f * 3); return v / 1.52; };
  let tuval = null, bul = null;
  if (bulanik) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0");
    svg.innerHTML = '<filter id="__hb" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0 0" edgeMode="duplicate"/></filter>';
    document.body.append(svg);
    bul = svg.querySelector("feGaussianBlur");
    tuval = [...document.querySelectorAll("canvas")].sort((p, q) => q.width * q.height - p.width * p.height)[0];
  }
  const st = {};
  globalThis.__yonetmen = (dt, x) => {
    base(dt, x);
    const c = A.camera.position, T = A.controls.target, t = globalThis.__shotT ?? 0;
    let fx = T.x - c.x, fy = T.y - c.y, fz = T.z - c.z;
    const L = Math.hypot(fx, fy, fz) || 1;
    if (sarsinti > 0) {
      const rl = Math.hypot(fx, fz) || 1, rx = -fz / rl, rz = fx / rl; // sağ (yatay)
      const k = sarsinti * Math.min(1.2, A.camera.fov / 40);
      const yaw = gur(t, 0) * 0.016 * k, pitch = gur(t, 1) * 0.012 * k, roll = gur(t, 2) * 0.02 * sarsinti;
      T.x += rx * L * yaw; T.z += rz * L * yaw; T.y += L * pitch;
      c.x += rx * 0.05 * sarsinti * gur(t, 3); c.z += rz * 0.05 * sarsinti * gur(t, 3); c.y += 0.04 * sarsinti * gur(t, 4);
      A.camera.up.set(rx * Math.sin(roll), Math.cos(roll), rz * Math.sin(roll));
      A.camera.lookAt(T);
      fx = T.x - c.x; fy = T.y - c.y; fz = T.z - c.z;
    }
    if (bul && tuval) {
      // Ekrandaki yatay kayma: yeni bakış yönünün önceki sağ eksenine izdüşümü (dik bakışta da doğru). Yalnız hızlı
      // dönüşte (whip: kare başına ekranın ~%5'inden fazla) bulanık; yavaş kaydırma/drone net kalır.
      const Lf = Math.hypot(fx, fy, fz) || 1, f = [fx / Lf, fy / Lf, fz / Lf];
      const d = st.r && dt > 0 ? Math.abs(f[0] * st.r[0] + f[2] * st.r[2]) : 0;
      const rl = Math.hypot(f[0], f[2]) || 1;
      st.r = [-f[2] / rl, 0, f[0] / rl];
      const yatayFov = 2 * Math.atan(Math.tan((A.camera.fov * Math.PI) / 360) * A.camera.aspect);
      const kay = (d / yatayFov) * innerWidth * (1 / 30 / Math.max(dt, 1e-3)); // 30 kare/sn'ye göre (önizleme 15)
      const px = Math.min(18, Math.max(0, kay - 25) * 0.35);
      const v = px > 1 ? `${px.toFixed(1)} 0` : null;
      if (v !== st.v) { st.v = v; if (v) bul.setAttribute("stdDeviation", v); tuval.style.filter = v ? "url(#__hb)" : ""; }
    }
  };
}


const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const parts = [];
for (const [ci, shot] of S.cekimler.entries()) {
  const path = `${out}/cekim${ci + 1}.mp4`;
  parts.push({ path, sure: shot.sure });
  if (joinOnly || (only != null && only !== ci + 1)) continue;
  const page = await browser.newPage({ viewport: { width: (S.w ?? 1080) / olcek, height: (S.h ?? 1920) / olcek }, deviceScaleFactor: scale * olcek });
  page.on("pageerror", (e) => console.log("  sayfa hatası:", e.message));
  await page.addInitScript(CLOCK);
  await page.goto(`${base}?denetle&${shot.adres}`);
  await page.waitForFunction(() => globalThis.__ada?.ui, null, { timeout: 120000 });
  if (shot.aracAni) {
    // Olay aracı takibi: aracın yolda olduğu aralık sayfadan (__ada.olay.zaman[ad].yol, dakika). Otomatik saatte çekim
    // varıştan ~20 sn önceye alınır (sayfa o saatle yeniden açılır); elle saatte yalnız denetlenir.
    await page.waitForFunction(() => globalThis.__ada?.olay?.plan !== undefined && (globalThis.__ada.olay.plan === null || globalThis.__ada.olay.odak), null, { timeout: 15000 }).catch(() => {});
    const z = await page.evaluate((ad) => globalThis.__ada.olay?.zaman?.[ad] ?? null, shot.aracAni.ad);
    const m0 = (() => { const q = /saat=(\d+):(\d+)(?::(\d+))?/.exec(shot.adres); return q ? +q[1] * 60 + +q[2] + (+q[3] || 0) / 60 : null; })();
    const yaz = (m) => { const sn = Math.round(m * 60); return `${String(Math.floor(sn / 3600)).padStart(2, "0")}:${String(Math.floor(sn / 60) % 60).padStart(2, "0")}:${String(sn % 60).padStart(2, "0")}`; };
    if (!z?.yol) console.log(`  UYARI çekim ${ci + 1}: "${shot.aracAni.ad}" aracının yol saati sayfada yok (olay ya da araç yok)`);
    else if (shot.aracAni.oto) {
      // Çekici: kazalı aracı kasaya aldığı an (yukleme); diğerleri olay yerine varmadan ~20 sn önce.
      const yk = shot.aracAni.ad === "cekici" ? await page.evaluate(() => globalThis.__ada.olay?.zaman?.yukleme ?? null) : null;
      // ofs: bölünen çekimin sonraki parçası, grubun başından geçen süre kadar ileride (gunluk.mjs parcaSaati).
      const [t0, t1] = yk ?? z.yol, m = (yk ? t0 + 0.1 : t1 - t0 > 0.45 ? t1 - 0.35 : t0 + 0.05) + (shot.aracAni.ofs ?? 0);
      if (m0 == null || Math.abs(m - m0) > 0.02) {
        shot.adres = shot.adres.replace(/saat=[^&]*/, "saat=" + yaz(m));
        console.log(`  çekim ${ci + 1}: ${shot.aracAni.ad} ${yaz(t0)}–${yaz(t1)} ${yk ? "yüklüyor" : "yolda"} → çekim saati ${yaz(m)}`);
        await page.goto(`${base}?denetle&${shot.adres}`);
        await page.waitForFunction(() => globalThis.__ada?.ui, null, { timeout: 120000 });
      }
    } else if (m0 != null && (m0 < z.yol[0] || m0 > z.yol[1]) && !(z.park && m0 >= z.park[0] && m0 <= z.park[1]))
      console.log(`  UYARI çekim ${ci + 1}: ${shot.aracAni.ad} ${yaz(m0)}'te yolda değil (yol ${yaz(z.yol[0])}–${yaz(z.yol[1])}${z.donus ? `, dönüş ${yaz(z.donus[0])}–${yaz(z.donus[1])}` : ""})`);
  }
  await page.addStyleTag({ content: CSS + (S.css ?? "") });
  await page.evaluate(async ({ yazilar, arayuz, kart, olcek }) => {
    await document.fonts.ready;
    document.documentElement.style.setProperty("--k", String(1 / olcek));
    if (arayuz) document.body.classList.add("arayuz");
    if (kart) document.body.classList.add("kart");
    const box = document.createElement("div");
    box.id = "kayit";
    for (const y of yazilar ?? []) {
      const d = document.createElement("div");
      d.className = `yazi ${y.yer ?? "ust"}`;
      d.innerHTML = `<div class="kutu">${y.metin}</div>${y.alt ? `<br><div class="alt-yazi">${y.alt}</div>` : ""}`;
      d.style.opacity = 0;
      box.append(d);
    }
    const sub = document.createElement("div");
    sub.className = "altyazi";
    box.append(sub);
    // Altyazı bandı (top 1215 px, en çok iki satır): sitenin ad etiketleri bu banda konmaz (nametags.js).
    globalThis.__altyaziBandi = [1195 / 1920, 1400 / 1920];
    document.body.append(box);
  }, { yazilar: shot.yazilar, arayuz: shot.arayuz, kart: shot.kart, olcek });
  // Dokular ve ilk kareler otursun, sonra sanal saate geç.
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__manual());
  await page.waitForTimeout(300);
  if (shot.hazirlik) await page.evaluate(shot.hazirlik);
  // Isınma: benzetim birkaç saniye ilerlesin (yürüyüşler, araçlar yerleşsin).
  for (let k = 0; k < (shot.isinma ?? 20); k++) await page.evaluate(() => window.__step(1000 / 30));
  const santiyeGoster = shot.yorunge?.hedef === "siradaki" || shot.hareket?.hedef === "siradaki" || /[?&]taslak=/.test(shot.adres ?? "");
  if (shot.anAni) {
    // Olay anı (Driftwood): fırtınada sıradaki şimşek ("simsek"), balinada sıradaki sıçrama ("sicrama") çekimin t.
    // saniyesine düşsün. Sayfanın gerçek sim anı ölçülür (yüklenme süresi × hız belirsiz), sanal saat tek adımda o andan
    // ~1 sn önceye sarılır, 1 sn normal adımla oturur (sim her şeyi dakikanın saf işlevi olarak çizer).
    const r = await page.evaluate(async ({ tur, t, hiz }) => {
      const A = globalThis.__ada, O = A.olay;
      if (!O?.plan) return { yok: "bugün olay yok" };
      globalThis.__yonetmen = (dt, u) => { globalThis.__unix = u; };
      window.__step(1000 / 30);
      const dk = () => {
        const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
          .formatToParts(new Date(globalThis.__unix * 1000)).map((x) => [x.type, x.value]));
        return +p.hour * 60 + +p.minute + (+p.second + (globalThis.__unix % 1)) / 60;
      };
      const m = dk(), m0 = m + ((t + 1.2) * hiz) / 60; // en az 1,2 sn ileride (oturma payı)
      let s = null;
      if (tur === "simsek") {
        if (O.plan.tur !== "firtina" || !O.simsekler) return { yok: "fırtına yok", m };
        s = O.simsekler(m0, m0 + 4)[0] ?? null;
      } else if (tur === "sicrama") {
        if (typeof O.canli !== "function") return { yok: "deniz olayı yok", m };
        // Balina 46 sn'lik döngüde sıçrar: suyun 1 m üstüne çıktığı ilk an (0,05 sn adım, en çok 3 dk).
        let once = (O.canli(m0) ?? [0, 9])[1];
        for (let x = m0 + 1 / 1200; x < m0 + 3; x += 1 / 1200) {
          const y = (O.canli(x) ?? [0, 0])[1];
          if (once < 1 && y >= 1) { s = x; break; }
          once = y;
        }
      }
      if (s == null) { globalThis.__yonetmen = undefined; return { yok: `${tur}: ${m.toFixed(2)} sonrasında bulunamadı`, m }; }
      const ileri = ((s - m) * 60) / hiz - t - 1;
      if (ileri > 0) window.__step(ileri * 1000);
      for (let k = 0; k < 30; k++) window.__step(1000 / 30);
      globalThis.__yonetmen = undefined;
      return { m, s, son: dk() };
    }, { tur: shot.anAni.tur, t: shot.anAni.t, hiz: Number(/hiz=([\d.]+)/.exec(shot.adres)?.[1] ?? 1) });
    const yaz = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m) % 60).padStart(2, "0")}:${((m % 1) * 60).toFixed(1).padStart(4, "0")}`;
    if (r.yok) console.log(`  UYARI çekim ${ci + 1}: olay anı hizalanamadı (${r.yok})`);
    else console.log(`  çekim ${ci + 1}: ${shot.anAni.tur} ${yaz(r.s)} → çekimin ${shot.anAni.t} sn'sine (sayfa ${yaz(r.m)} → ${yaz(r.son)})`);
  }
  // Hareket kurulamazsa (sayfa API'si eksik vb.) çekim düşmez: Town Green'in geniş açısına yavaş yörünge (UYARI).
  if (shot.hareket) await page.evaluate(HAREKET, { h: shot.hareket, sure: shot.sure, olayBek: shot.olayBek ?? null }).catch(async (e) => {
    console.log(`  UYARI çekim ${ci + 1}: hareket kurulamadı (${e.message.split("\n")[0]}): meydan yörüngesi`);
    await page.evaluate(HAREKET, { h: { tur: "yorunge", hedef: "meydan", a: 0.45, D: 46, H: 20 }, sure: shot.sure, olayBek: null });
  });
  else await page.evaluate(({ kamera, takip, yorunge, sure, sakinYorunge }) => {
    const A = globalThis.__ada;
    if (!kamera && !takip && !yorunge && sakinYorunge) {
      // Sakin çekimi (bul=@ad, 6 Kasım): site sakini bulup izler; sakin dışarıdaysa kamera onun çevresinde yavaşça
      // döner ve biraz yaklaşır (bankta oturan sakinde görüntü donuk kalıyordu, sakin kadrajın kenarındaydı). Evde/
      // işteyse (iç mekân) kamerayı site yönetir.
      const P = A.people, ease = (u) => u * u * (3 - 2 * u), st = {};
      globalThis.__isaretsiz = true; // seçim iğnesi ad etiketinin önüne binmesin
      globalThis.__yonetmen = (dt) => {
        const i = A.follower?.target?.i;
        const u0 = ease(Math.min(1, (globalThis.__shotT ?? 0) / sure));
        // Görünmeyen sakin: vapurda/araçta ya da iç mekânı açılmayan bir binanın içinde (7 Kasım: iş yerinde oturan
        // sakinde yörünge kamerası binanın duvarına girdi, karede yalnız halka ve düz yüzey vardı).
        const binada = (px, pz) => A.world.buildings.some((b) => {
          const c = Math.cos(b.rot), sn = Math.sin(b.rot), lx = (px - b.x) * c - (pz - b.z) * sn, lz = (px - b.x) * sn + (pz - b.z) * c;
          return Math.abs(lx) < b.w / 2 - 0.2 && Math.abs(lz) < b.d / 2 - 0.2;
        });
        const tasitta = i != null && !P.poses[i].indoor && (!P.visible[i] || P.poses[i].inVehicle || binada(P.positions[i * 3], P.positions[i * 3 + 2]));
        if (i != null && (P.poses[i].indoor || tasitta)) {
          // İç mekân (evin/iş yerinin içi açık, kamerayı site koyar): o kadraj hedef çevresinde hafifçe döner ve
          // yaklaşır (6 Kasım: avukatın ofisi 1,2 sn kıpırdamadan duruyordu).
          // Taban: girişteki site kadrajı (hedefe göre kamera farkı); hedef, sakinin odak noktası kaydıkça (vapur gider)
          // onunla birlikte kayar.
          const c = A.camera.position, t = A.controls.target, [fx, fz] = P.focusPoint?.(i) ?? [t.x, t.z];
          if (!st.ic || st.ic.tasitta !== tasitta) {
            st.ic = { ox: c.x - t.x, oy: c.y - t.y, oz: c.z - t.z, tx: t.x, ty: t.y, tz: t.z, fx0: fx, fz0: fz, fx, fz, tasitta };
            if (tasitta) {
              globalThis.__sakinYok = true;
              // Vapurda/araçta (görünmüyor): site kamerayı vapurun çatısına yapıştırıyordu (6 Kasım, Driftwood).
              // Taşıtın tamamı görünsün: en az 36 m uzak, 14 m yüksek.
              const d = Math.hypot(st.ic.ox, st.ic.oz) || 1, D = Math.max(36, d);
              Object.assign(st.ic, { ox: (st.ic.ox / d) * D, oz: (st.ic.oz / d) * D, oy: Math.max(14, st.ic.oy) });
            }
          }
          const b = st.ic, kf = 1 - Math.exp(-dt * 4);
          b.fx += (fx - b.fx) * kf; b.fz += (fz - b.fz) * kf;
          const tx = b.tx + b.fx - b.fx0, tz = b.tz + b.fz - b.fz0;
          // Hafif dönüş; yaklaşma yok: yakında başka sakinlerin ad etiketleri açılıp seçilinin üstüne biniyor.
          const aa = (sakinYorunge.yon ?? 1) * 0.26 * u0;
          A.camera.position.set(tx + b.ox * Math.cos(aa) + b.oz * Math.sin(aa), b.ty + b.oy, tz - b.ox * Math.sin(aa) + b.oz * Math.cos(aa));
          A.controls.target.set(tx, b.ty, tz);
          A.camera.lookAt(A.controls.target);
          st.a = null;
          return;
        }
        st.ic = null;
        if (i == null) { st.a = null; return; }
        const x = P.positions[i * 3], y = P.positions[i * 3 + 1], z = P.positions[i * 3 + 2];
        if (st.a == null) {
          const dx = A.camera.position.x - x, dz = A.camera.position.z - z;
          Object.assign(st, { a: Math.atan2(dx, dz), D: Math.min(11, Math.max(7, Math.hypot(dx, dz))),
            H: Math.min(4.5, Math.max(2.6, A.camera.position.y - y)), x, y, z, yon: sakinYorunge.yon ?? 1 });
          // Engelsiz açı ara (tente, şemsiye, ağaç, duvar): önce sitenin açısı, sonra çevresi; alçakta (tentenin altı) da
          // dene. Bulunamazsa her karede kamera engelin önüne yaklaşır (aşağıda).
          if (A.engel) {
            const ac = (da, H) => { const aa = st.a + da; return [x + Math.sin(aa) * st.D, y + H, z + Math.cos(aa) * st.D]; };
            const temiz = (da, H) => { const c = ac(da, H), L = Math.hypot(c[0] - x, c[1] - y - 1.1, c[2] - z); return A.engel(x, y + 1.1, z, ...c) >= L; };
            ara: for (const H of [st.H, 1.7]) for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.1, -2.1, 2.7, -2.7, Math.PI]) {
              if (temiz(da, H) && temiz(da + st.yon * 0.55, H)) { st.a += da; st.H = H; break ara; }
            }
          }
        }
        // Hareketli sakin (bisiklet, koşu; 7 Kasım: bisikletlide kamera geride kalıp kişiyi kesiyor, direk giriyordu):
        // hız > 2 m/sn ise kamera gidiş yönünün arkasından-yanından, daha uzak ve yüksekten, sıkı izler.
        const vx = dt > 0 ? (x - (st.px ?? x)) / dt : 0, vz = dt > 0 ? (z - (st.pz ?? z)) / dt : 0;
        st.px = x; st.pz = z;
        const kv = 1 - Math.exp(-dt * 3);
        st.vx = (st.vx ?? 0) + (vx - (st.vx ?? 0)) * kv; st.vz = (st.vz ?? 0) + (vz - (st.vz ?? 0)) * kv;
        const hiz = Math.hypot(st.vx, st.vz), hareketli = hiz > 2;
        const kp = 1 - Math.exp(-dt * (hareketli ? 14 : 6));
        st.x += (x - st.x) * kp; st.y += (y - st.y) * kp; st.z += (z - st.z) * kp;
        const u = ease(Math.min(1, (globalThis.__shotT ?? 0) / sure));
        if (hareketli) {
          const hedefA = Math.atan2(-st.vx, -st.vz) + st.yon * 0.7;
          let fa = hedefA - st.a; fa = Math.atan2(Math.sin(fa), Math.cos(fa));
          st.a += fa * (1 - Math.exp(-dt * 2.5));
          st.D += (12 - st.D) * kv; st.H += (5 - st.H) * kv;
        }
        const a = st.a + (hareketli ? 0 : st.yon * 0.55 * u), m = 1 - 0.18 * u;
        // Kamera ile sakin arasında opak engel (tente, ağaç gövdesi, direk, duvar) varsa kamera engelin önüne gelir;
        // geri çekilmesi yavaş (titremesin).
        const hx = st.x, hy = st.y + 1.1, hz = st.z, cx = st.x + Math.sin(a) * st.D * m, cy = st.y + st.H * m, cz = st.z + Math.cos(a) * st.D * m;
        const L = Math.hypot(cx - hx, cy - hy, cz - hz), e = A.engel ? A.engel(hx, hy, hz, cx, cy, cz) : Infinity;
        const hedefK = e < L ? Math.max(2.5, e - 0.6) / L : 1;
        st.k = st.k == null ? hedefK : hedefK < st.k ? hedefK : st.k + (hedefK - st.k) * (1 - Math.exp(-dt * 1.5));
        A.camera.position.set(hx + (cx - hx) * st.k, hy + (cy - hy) * st.k, hz + (cz - hz) * st.k);
        A.controls.target.set(st.x, st.y + 1.1, st.z);
        A.camera.lookAt(A.controls.target);
      };
      return;
    }
    if (!kamera && !takip && !yorunge) {
      globalThis.__yonetmen = null; // kamerayı site yönetir (bul=, uçuş, takip)
      return;
    }
    A.controls.custom = { rotate() {}, zoom() {} };
    if (yorunge && (yorunge.hedef === "zeplin" || yorunge.hedef === "zeplin-yer")) {
      const Z = A.zeplin?.pose, ease = (u) => u * u * (3 - 2 * u), st = {};
      globalThis.__yonetmen = (dt) => {
        if (!Z?.visible) return;
        // Hedef yumuşak izlenir (zeplinin salınımı kamerayı titretmesin).
        const k = st.x == null ? 1 : 1 - Math.exp(-dt * 6);
        for (const c of ["x", "y", "z", "heading"]) st[c] = st[c] == null ? Z[c] : st[c] + (Z[c] - st[c]) * k;
        if (yorunge.hedef === "zeplin-yer") {
          const pz = A.world.ferryPier.z0 + 30, px = (A.world.ferryPier.x0 + A.world.ferryPier.x1) / 2 + 2;
          A.camera.position.set(px, A.world.groundY(px, pz) + 3, pz);
        } else {
          const u = ease(Math.min(1, (globalThis.__shotT ?? 0) / sure));
          const a = st.heading + yorunge.a0 + (yorunge.a1 - yorunge.a0) * u;
          A.camera.position.set(st.x + Math.sin(a) * yorunge.r, st.y + yorunge.h, st.z + Math.cos(a) * yorunge.r);
        }
        A.controls.target.set(st.x, st.y + (yorunge.bak ?? 0), st.z);
        A.camera.lookAt(A.controls.target);
      };
      return;
    }
    if (yorunge) {
      const W = A.world, h = yorunge.hedef;
      const px = (W.ferryPier.x0 + W.ferryPier.x1) / 2;
      const ev = h === "ilkev" ? W.homeOf(0) : null;
      const at = h === "siradaki" ? W.nextStage?.at : h === "iskele" ? [px, W.ferryPier.z0 + 45] : h === "fener" ? [W.fener.x, W.fener.z]
        : h === "meydan" ? [0, 0] : h === "kilise" ? [0, -84] : ev ? [ev.bx, ev.bz] : h;
      const [x, z] = at ?? [0, 0];
      const gy = Math.max(0, W.groundY(x, z));
      const ease = (u) => u * u * (3 - 2 * u);
      globalThis.__yonetmen = () => {
        const u = ease(Math.min(1, (globalThis.__shotT ?? 0) / sure));
        const a = yorunge.a0 + (yorunge.a1 - yorunge.a0) * u;
        const m = 1 + ((yorunge.r1 ?? yorunge.r) / yorunge.r - 1) * u; // r1: bitiş uzaklığı (itme/çekme)
        A.camera.position.set(x + Math.sin(a) * yorunge.r * m, gy + yorunge.h * m, z + Math.cos(a) * yorunge.r * m);
        A.controls.target.set(x, gy + (yorunge.bak ?? 2), z);
        A.camera.lookAt(A.controls.target);
      };
      return;
    }
    if (takip?.yakin) {
      // Yürüyen bir sakini önden-yandan, yakından izler; etiketi ("@sen") ve işareti görünür.
      const P = A.people;
      // secim: görünüşe göre aday (ör. kel, sakallı, üniformalı ya da gri saçlı olmasın; sac: saç biçimleri,
      // ust: üst giysi renkleri). Video karakteri izleyiciyi temsil ediyor: göze hoş görünmeli.
      const s = takip.secim, hex = (c) => "#" + c.getHexString();
      const uygun = (c) => !s || ((!s.sac || s.sac.includes(c.style)) && (!s.ust || s.ust.includes(hex(c.top)))
        && (s.sakal == null || c.beard === s.sakal)
        && (s.gozluk == null || c.glasses === s.gozluk) && !c.uniform && (!s.sacRenk || s.sacRenk.includes(hex(c.hairColor))));
      let best = -1, bd = Infinity;
      for (let i = 0; i < P.n; i++) {
        if (!P.visible[i] || !P.poses[i].moving || P.poses[i].inVehicle || P.poses[i].indoor || P.poses[i].dog) continue;
        if (!uygun(P.colors[i])) continue;
        const d = Math.hypot(P.positions[i * 3] - (takip.x ?? 0), P.positions[i * 3 + 2] - (takip.z ?? 0));
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return;
      if (takip.ad) A.residents[best].handle = takip.ad;
      globalThis.__etiket = best; // etiketi hep önde ve vurgulu (işaret yok)
      globalThis.__yalnizEtiket = !!takip.yalniz; // yalniz: başka sakinlerin etiketleri gizli
      const i = best, st = {};
      globalThis.__yonetmen = (dt) => {
        const x = P.positions[i * 3], y = P.positions[i * 3 + 1], z = P.positions[i * 3 + 2];
        const h = P.poses[i].heading ?? 0;
        if (st.h == null) Object.assign(st, { h, x, y, z });
        let dh = h - st.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const k = 1 - Math.exp(-dt * 2.2), kp = 1 - Math.exp(-dt * 8);
        st.h += dh * k; st.x += (x - st.x) * kp; st.y += (y - st.y) * kp; st.z += (z - st.z) * kp;
        const a = st.h + (takip.aci ?? 0.75), D = takip.uzaklik ?? 6;
        A.camera.position.set(st.x + Math.sin(a) * D, st.y + (takip.yukseklik ?? 2.4), st.z + Math.cos(a) * D);
        A.controls.target.set(st.x, st.y + (takip.bak ?? 1.2), st.z);
        A.camera.lookAt(A.controls.target);
      };
      return;
    }
    const keys = kamera;
    const ease = (u) => u * u * (3 - 2 * u);
    globalThis.__yonetmen = () => {
      const t = globalThis.__shotT ?? 0;
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
      const u = b[0] > a[0] ? ease(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])))) : 0;
      const L = (j) => a[j] + (b[j] - a[j]) * u;
      A.controls.target.set(L(4), L(5), L(6));
      A.camera.position.set(L(1), L(2), L(3));
      A.camera.lookAt(A.controls.target);
    };
  }, { kamera: shot.kamera, takip: shot.takip, yorunge: shot.yorunge, sure: shot.sure, sakinYorunge: shot.sakinYorunge });
  // Görüş açısı (fov, varsayılan 40°), el kamerası sarsıntısı ve hızlı dönüşte yatay hareket bulanıklığı: her çekimin
  // kamera kurgusunun (eski ya da hareket) üstüne sarılır. Serbest (site yönetir) çekimde yalnız fov.
  await page.evaluate(SARMA, { fov: shot.hareket ? null : shot.fov ?? null, sarsinti: shot.sarsinti ?? 0, tohum: ci + 1, bulanik: shot.bulaniksiz ? 0 : 1 });
  // Sıradaki yerin şantiye kutusu (yarı saydam taslak) yakın çekimlerde kadraja giriyordu (7 Kasım: bayrak kamerası
  // Lodos Kahvesi kutusunu gösterdi): sıradaki yeri göstermeyen çekimde kamera kutuya 70 m'den yakınsa gizli.
  if (!santiyeGoster) await page.evaluate(() => {
    const A = globalThis.__ada, g = A.scene.getObjectByName("santiye"), at = A.world.nextStage?.at;
    if (!g || !at) return;
    const d0 = globalThis.__yonetmen;
    globalThis.__yonetmen = (dt, u) => {
      d0?.(dt, u);
      g.visible = Math.hypot(A.camera.position.x - at[0], A.camera.position.z - at[1]) > 70;
    };
  });

  const frames = Math.round(shot.sure * fps);
  const enc = ffmpeg(["-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", preview ? "veryfast" : "slow", "-crf", preview ? "26" : "16", "-pix_fmt", "yuv420p", "-r", String(fps), path]);
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    await page.evaluate(({ t, dt, yazilar, g, cues }) => {
      globalThis.__shotT = t;
      // Altyazı: genel zamana göre (çekim geçişlerinde iki çekimde de aynı yazı); cümle bitince 0,2 sn kalır.
      const c = cues.find((c) => g >= c.bas - 0.05 && g < c.son + 0.2);
      const sub = document.querySelector("#kayit .altyazi");
      if (sub.textContent !== (c?.yazi ?? "")) {
        sub.textContent = c?.yazi ?? "";
        // En fazla iki satır (standart): sığmazsa yazı küçülür.
        let fs = 64;
        sub.style.fontSize = fs + "px";
        while (fs > 40 && sub.offsetHeight > fs * 1.18 * 2 + 6) sub.style.fontSize = (fs -= 4) + "px";
      }
      // Yazılar: 0,3 sn'de belirir ve kaybolur.
      document.querySelectorAll("#kayit .yazi").forEach((d, k) => {
        const y = yazilar[k];
        const o = Math.max(0, Math.min(1, (t - y.bas) / 0.3, (y.son - t) / 0.3));
        d.style.opacity = o;
        d.style.transform = `translate(-50%, ${(1 - o) * 24}px)`;
      });
      window.__step(dt * 1000);
    }, { t, dt: 1 / fps, yazilar: shot.yazilar ?? [], g: starts[ci] + t, cues });
    const buf = await page.screenshot({ type: "jpeg", quality: 93 });
    if (!enc.p.stdin.write(buf)) await new Promise((r) => enc.p.stdin.once("drain", r));
    if (f % fps === 0) process.stdout.write(`\r  çekim ${ci + 1}: ${f}/${frames} kare (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
  }
  enc.p.stdin.end();
  await enc.done;
  console.log(`\r  çekim ${ci + 1}: ${frames} kare → ${path}`);
  for (const m of await page.evaluate(() => globalThis.__uyarilar ?? [])) console.log(`  UYARI çekim ${ci + 1}: ${m}`);
  // Sakin o an adada görünmüyorsa (vapurda/anakarada) bunu söyle: kare sakini göstermez, çekim değiştirilmeli.
  if (shot.sakinYorunge && (await page.evaluate(() => globalThis.__sakinYok === true)))
    console.log(`  UYARI çekim ${ci + 1}: sakin şu an adada görünmüyor (vapurda/anakarada ya da iç mekânı açılmayan bir binada); karede sakin yok. Bu çekimi başka yerle değiştir.`);
  await page.close();
}
await browser.close();

if (only == null || joinOnly) {
  // Çekimleri yumuşak geçişlerle birleştir.
  const inputs = parts.flatMap((p) => ["-i", p.path]);
  let chain = "", prev = "[0:v]", offset = 0;
  for (let k = 1; k < parts.length; k++) {
    const g = gecisOf(k);
    offset += parts[k - 1].sure - g.sure;
    const lab = k === parts.length - 1 ? "[v]" : `[x${k}]`;
    chain += `${prev}[${k}:v]xfade=transition=${XFADE[g.tur] ?? "fade"}:duration=${g.sure}:offset=${offset.toFixed(3)}${lab};`;
    prev = lab;
  }
  const final = `${out}/${S.ad.split("/").pop()}${preview ? "-onizleme" : ""}.mp4`;
  let audio = {};
  if (ses) {
    // Ses: cümle öncesi aralar sessizlikle eklenir, video boyunca uzatılır, −14 LUFS / ≤ −1 dBTP'ye getirilir.
    const raw = `${out}/ses.mp3`;
    const cuts = Object.entries(aralar).map(([k, d]) => {
      const c = ses.cumleler[Number(k)], prev = ses.cumleler[Number(k) - 1];
      return [prev ? (prev.son + c.bas) / 2 : 0, d];
    }).sort((a, b) => a[0] - b[0]);
    let af = "", segs = [], from = 0;
    cuts.forEach(([at, d], k) => {
      af += `[${parts.length}:a]atrim=${from}:${at},asetpts=PTS-STARTPTS[s${k}];aevalsrc=0:d=${d}:s=44100:c=mono[z${k}];`;
      segs.push(`[s${k}]`, `[z${k}]`);
      from = at;
    });
    af += `[${parts.length}:a]atrim=${from},asetpts=PTS-STARTPTS[s${cuts.length}];`;
    segs.push(`[s${cuts.length}]`);
    af += `${segs.join("")}concat=n=${segs.length}:v=0:a=1,aformat=channel_layouts=mono,apad[ham]`;
    // Konuşmanın tepe/ortalama farkı büyük: yalnız loudnorm −15'te kalıyor. Önce hafif sıkıştırma, sonra
    // ölçülen farka göre kazanç ve tepe sınırlayıcı (gerçek tepe ≈ −1,4 dBTP).
    const olc = async (af) => {
      const p = spawn("ffmpeg", ["-hide_banner", "-nostats", "-i", raw, "-af", `${af}ebur128`, "-f", "null", "-"]);
      let log = "";
      p.stderr.on("data", (d) => (log += d));
      await new Promise((ok) => p.on("close", ok));
      return Number([...log.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].at(-1)[1]);
    };
    const sik = `volume=${(-14 - (await olc(""))).toFixed(2)}dB,acompressor=threshold=-18dB:ratio=3:attack=5:release=80`;
    const kazanc = (-14 - (await olc(sik + ",")) + 0.3).toFixed(2);
    const input = ["-i", raw];
    const ef = S.efektler ?? [];
    const son = ef.length ? "[on]" : "[a]";
    if (!S.muzik) {
      af += `;[ham]${sik},volume=${kazanc}dB,alimiter=limit=0.84:level=false:attack=2:release=60,aresample=48000,aformat=channel_layouts=stereo${son}`;
    } else {
      // Müzik konuşmanın 14 dB altında (−28 LUFS; standart 12–15 dB), yumuşak giriş ve çıkışla; sonra ortak sınırlayıcı.
      const total = starts.at(-1) + S.cekimler.at(-1).sure;
      const muzik = resolve(S.muzik);
      const p = spawn("ffmpeg", ["-hide_banner", "-nostats", "-i", muzik, "-af", "ebur128", "-f", "null", "-"]);
      let log = "";
      p.stderr.on("data", (d) => (log += d));
      await new Promise((ok) => p.on("close", ok));
      const mI = Number([...log.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].at(-1)[1]);
      input.push("-stream_loop", "-1", "-i", muzik); // video müzikten uzunsa müzik döner
      af += `;[ham]${sik},volume=${kazanc}dB,aresample=48000,aformat=channel_layouts=stereo[ko]`
        + `;[${parts.length + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${(-28 - mI).toFixed(2)}dB,apad,atrim=0:${total.toFixed(3)},`
        + `afade=t=in:d=0.6,afade=t=out:st=${(total - 1.8).toFixed(3)}:d=1.8[mz]`
        + `;[ko][mz]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false:attack=2:release=60${son}`;
    }
    if (ef.length) {
      // Efektler (10 Kasım: siren, vapur düdüğü): genel zamandaki yerine gecikmeyle, konuşmanın altında; son sınırlayıcı.
      const ilk = parts.length + 1 + (S.muzik ? 1 : 0);
      ef.forEach((e, k) => {
        input.push("-i", resolve(e.dosya));
        const ms = Math.round(e.bas * 1000);
        af += `;[${ilk + k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${e.ses ?? -11}dB,adelay=${ms}|${ms},apad[ef${k}]`;
      });
      af += `;[on]${ef.map((_, k) => `[ef${k}]`).join("")}amix=inputs=${ef.length + 1}:normalize=0:duration=first,alimiter=limit=0.84:level=false:attack=2:release=60[a]`;
    }
    audio = { input, filter: ";" + af, map: ["-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-shortest"] };
  }
  const enc = ffmpeg([...inputs, ...(audio.input ?? []), "-filter_complex", chain.replace(/;$/, "") + (audio.filter ?? ""), "-map", "[v]", ...(audio.map ?? []),
    "-c:v", "libx264", "-preset", "slow", "-crf", preview ? "24" : "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", final]);
  enc.p.stdin.end();
  await enc.done;
  writeFileSync(`${out}/ACIKLAMA.txt`, S.aciklama ?? "");
  console.log("bitti:", final);
}
