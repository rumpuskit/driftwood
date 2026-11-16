// Günün olayının sitedeki gerçek bilgisi (16 Kasım 2026): plan, yer adı, seyirci sayısı, gazete metni, evre saatleri.
// Otomatik üretim (social-management mac/ada/uret.sh) gözetimsiz Claude'dan önce çalıştırır, sonucu isteme yazar:
// videodaki sayılar sitedeki olayla birebir aynı olsun.
//   node olay-bilgi.mjs [--olay kaza --olaysaat 08:33] [--port 4186]  → stdout JSON ya da {"olay": null}
// Siteyi derler (vite build) ve kendi önizleme sunucusunu açar (port 4186; üretimin 4189'u ile çakışmaz).
import { chromium } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as sim from "../web/src/sim.js";
import { olayGunu, olayEvre } from "../web/src/world/olay-plan.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const PORT = Number(opt("--port", 4186));
const zorla = opt("--olay", null), zorlaSaat = opt("--olaysaat", null);
sim.setCatalog(JSON.parse(readFileSync(resolve(HERE, "../data/catalog.json"), "utf8")));
const saat = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

// Adanın düzeyi açık veriden (gunluk.mjs ile aynı kaynak).
const { VERI_URL } = await import("../web/src/config.js");
let zirve = 0;
try {
  const r = await fetch(VERI_URL, { headers: { "User-Agent": "Mozilla/5.0 (olay-bilgi)", "Cache-Control": "no-cache" } });
  const d = await r.json();
  zirve = Math.max(d.zirve ?? 0, ...(d.sakinler ?? []).map((s) => (Array.isArray(s) ? s[2] ?? 0 : s.slot ?? 0) + 1));
} catch {}
sim.setTown(zirve || 1);
const now = Date.now() / 1000, day = sim.dayOf(now), dakika = sim.minuteOf(now);
const m = zorlaSaat?.match(/^(\d{1,2}):(\d{2})$/);
const plan = olayGunu(day, sim.isOpen, { zorla, saat: m ? Number(m[1]) * 60 + Number(m[2]) : undefined });
if (!plan) { console.log(JSON.stringify({ olay: null, gun: day })); process.exit(0); }

execFileSync("npx", ["vite", "build"], { cwd: resolve(HERE, "../web"), stdio: "ignore" });
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: resolve(HERE, "../web"), stdio: "ignore", detached: true });
const kapat = () => { try { process.kill(-server.pid); } catch {} };
process.on("exit", kapat);
let sonuc = null;
try {
  for (let k = 0; k < 40; k++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  const q = new URLSearchParams({ saat: saat(Math.min(1439, plan.son + 2)) });
  if (zorla) q.set("olay", zorla);
  if (zorlaSaat) q.set("olaysaat", zorlaSaat);
  await p.goto(`http://localhost:${PORT}/?denetle&${q}`);
  await p.waitForFunction(() => globalThis.__ada?.olay, null, { timeout: 120000 });
  await p.waitForTimeout(1500);
  sonuc = await p.evaluate((son) => {
    const O = globalThis.__ada.olay;
    return { yerAdi: O.yerAdi, seyirci: O.seyirci, odak: O.odak, kiyi: O.kiyi, yazi: O.yazi?.(son + 2) ?? null, plan: O.plan, zaman: O.zaman ?? null };
  }, plan.son);
  await b.close();
} finally { kapat(); }
// Evre saatleri (video çekimlerinde "saat": "olay:<evre>" için).
const evreler = {};
for (let t = plan.bas; t <= plan.son; t += 0.25) {
  const e = olayEvre(plan, t);
  if (e && !evreler[e.ad]) evreler[e.ad] = saat(t);
}
console.log(JSON.stringify({
  olay: plan.tur, ad: plan.ad, en: plan.en, bas: saat(plan.bas), son: saat(plan.son), bitti: dakika >= plan.son,
  evreler, yerAdi: sonuc?.yerAdi ?? null, seyirci: sonuc?.seyirci ?? null, metin: sonuc?.yazi?.uzun ?? null,
  araclar: sonuc?.zaman ? JSON.parse(JSON.stringify(sonuc.zaman, (k, v) => (typeof v === "number" ? saat(v) + (v % 1 ? `:${String(Math.round((v % 1) * 60)).padStart(2, "0")}` : "") : v))) : null,
  sayfaPlani: sonuc?.plan?.tur === plan.tur, gun: day,
}));
process.exit(0);
