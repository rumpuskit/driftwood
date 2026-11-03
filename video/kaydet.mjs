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
#hud .links, #hud .waiting, #speed, #card, #navbtns, #minimap, #arama, #floorbar, #loading, #online, #dock { display: none !important; }
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
const starts = S.cekimler.reduce((a, c, k) => (a.push(k ? a[k - 1] + S.cekimler[k - 1].sure - X : 0), a), []);

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
    document.body.append(box);
  }, { yazilar: shot.yazilar, arayuz: shot.arayuz, kart: shot.kart, olcek });
  // Dokular ve ilk kareler otursun, sonra sanal saate geç.
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__manual());
  await page.waitForTimeout(300);
  if (shot.hazirlik) await page.evaluate(shot.hazirlik);
  // Isınma: benzetim birkaç saniye ilerlesin (yürüyüşler, araçlar yerleşsin).
  for (let k = 0; k < (shot.isinma ?? 20); k++) await page.evaluate(() => window.__step(1000 / 30));
  await page.evaluate(({ kamera, takip, yorunge, sure }) => {
    const A = globalThis.__ada;
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
  }, { kamera: shot.kamera, takip: shot.takip, yorunge: shot.yorunge, sure: shot.sure });

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
  await page.close();
}
await browser.close();

if (only == null || joinOnly) {
  // Çekimleri yumuşak geçişlerle birleştir.
  const inputs = parts.flatMap((p) => ["-i", p.path]);
  let chain = "", prev = "[0:v]", offset = 0;
  for (let k = 1; k < parts.length; k++) {
    offset += parts[k - 1].sure - X;
    const lab = k === parts.length - 1 ? "[v]" : `[x${k}]`;
    chain += `${prev}[${k}:v]xfade=transition=fade:duration=${X}:offset=${offset.toFixed(3)}${lab};`;
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
    if (!S.muzik) {
      af += `;[ham]${sik},volume=${kazanc}dB,alimiter=limit=0.84:level=false:attack=2:release=60,aresample=48000[a]`;
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
        + `;[ko][mz]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false:attack=2:release=60[a]`;
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
