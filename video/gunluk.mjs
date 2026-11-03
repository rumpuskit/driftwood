// Günlük video: sitenin herkese açık sakin listesinden ve simülasyondan günün hikâyesini seçer, anlatım
// standardına (video/cikti/ANLATIM-STANDARDI.md) uygun seslendirme ve çekim planını kurar; istenirse sesi ve
// videoyu üretir, açıklamayı panoya kopyalar ve bildirim gönderir.
//
//   node gunluk.mjs [--yuva ogle|aksam|sabah] [--uret] [--onizleme] [--bildir] [--zorla] [--ac] [--taslaksiz] [--hikaye h.json]
//
// --hikaye: günün hikâyesi elle (gerçek olaylardan, sitede doğrulanmış): {"tur", "kanca", "govde": [{ses, yazi?,
// vurus?}], "soru": {ses, yazi?}, "cekim": ["fener", {"sakin": "ad"}, ...], "etiketler": [...], ("saat" artık yok sayılır: ada saati üretim anı),
// "imza2": {ses, yazi?} (kilit sayacının ikinci cümlesi: sıradaki yer yerine başka bir hedef, ör. zeplin),
// "ilk": imza çekimi (varsayılan "ucus")}. İmza ve kapanış yine standarttan gelir. --ac: üretim bitince klasörü Finder'da açar.
//
// Yuva (ET): öğle (12:30 PM, 09:00 taşınmasından sonra günün özeti), akşam (7:00 PM; bir sakinin hikâyesi ya da
// istek), sabah (9:30 AM taşınma haberi). Kaç yuvanın üretileceği takipçi sayısına bağlı (SIKLIK); gerekmeyen yuva sessizce
// atlanır (--zorla ile yine üretilir). Uydurma olay yok: her cümle simülasyondan ya da listeden gelir ve sitede
// doğrulanır. Kullanıcı adları seste okunmaz; ekranda ve açıklamada yazılır.
// Çıktı: cikti/gunluk/<tarih>-<yuva>/ (senaryo.json, ses, video, ACIKLAMA.txt); durum: cikti/gunluk/durum.json.
// TikTok bağlıysa (tiktok.mjs) video ayrıca hesabın gelen kutusuna taslak olarak gönderilir.
// Seslendirme için ELEVENLABS_API_KEY gerekir (gunluk.sh verir).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as sim from "../web/src/sim.js";
import { VERI_URL, TIKTOK, ZEPLIN_REKLAM } from "../web/src/config.js";
import { ferryOut, nextArrival } from "../web/src/world/ferry.js";
import { seslendir } from "./seslendir.mjs";
import { yukle } from "./tiktok.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
process.chdir(HERE);
const catalog = JSON.parse(readFileSync(resolve(HERE, "../data/catalog.json"), "utf8"));
sim.setCatalog(catalog);

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const yuva = opt("--yuva", "ogle");
// Paylaşma saati: ada ET'de, kullanıcı Almanya'da (ABD/AB yaz saati geçiş haftalarında Almanya bir saat erken).
const SAAT = { sabah: "15:30 DE (9:30 AM ET)", ogle: "18:30 DE (12:30 PM ET)", aksam: "01:00 DE (7:00 PM ET), Studio'da zamanla" };
// Takipçi sayısına göre günde kaç video (önce öğle, sonra akşam, sonra sabah).
const SIKLIK = [[0, ["ogle"]], [100, ["ogle", "aksam"]], [1000, ["sabah", "ogle", "aksam"]]];

// --- yardımcılar ---
const BIR = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const ON = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** Sayının okunuşu (seslendirme için, Amerikan: "and" yok): 1250 → "one thousand two hundred fifty". */
export function say(n) {
  if (n === 0) return "zero";
  const grup = (k) => {
    const out = [];
    if (k >= 100) out.push(BIR[Math.floor(k / 100)] + " hundred");
    const r = k % 100;
    if (r >= 20) out.push(ON[Math.floor(r / 10)] + (r % 10 ? "-" + BIR[r % 10] : ""));
    else if (r) out.push(BIR[r]);
    return out.join(" ");
  };
  const parts = [], mil = Math.floor(n / 1e6), bin = Math.floor(n / 1000) % 1000, kalan = n % 1000;
  if (mil) parts.push(grup(mil) + " million");
  if (bin) parts.push(grup(bin) + " thousand");
  if (kalan) parts.push(grup(kalan));
  return parts.join(" ");
}
const fmt = (n) => n.toLocaleString("en-US");
const kucuk = (t) => t.toLowerCase();
const a = (w) => (/^[aeiou]/i.test(w) ? "an " : "a ") + w;
/** Yer adı cümle içinde: "The white church" → "the white church", "Driftwood Diner" → aynen, "Fishing Wharf" → "the Fishing Wharf". */
const the = (name) => (/^the /i.test(name) ? "the " + name.slice(4) : /^Driftwood /.test(name) ? name : "the " + name);
const kisi = (n) => (n === 1 ? "person" : "people");
const HOBI_ING = { balik: "fishing", kitap: "reading", satranc: "playing chess", resim: "painting", bisiklet: "biking", yuzme: "swimming", ucurtma: "flying kites", gitar: "playing guitar", fotograf: "taking photos", kosu: "running", cornhole: "playing cornhole", yoga: "doing yoga", mangal: "grilling" };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Cümle: ses (okunan) ve yazi (altyazı; yoksa aynısı). vurus: öncesine 0,35 sn sessizlik. Büyük harfle başlar. */
const buyuk = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const c = (ses, yazi = null, vurus = false) => ({ ses: buyuk(ses), ...(yazi ? { yazi: buyuk(yazi) } : {}), ...(vurus ? { vurus } : {}) });

// --- veri --- (--veri dosya.json: deneme için sitedeki biçimde bir liste; --durum: ayrı durum dosyası)
let data;
if (opt("--veri")) data = JSON.parse(readFileSync(opt("--veri"), "utf8"));
else {
  const res = await fetch(VERI_URL, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`sakin listesi alınamadı: HTTP ${res.status}`);
  data = await res.json();
}
const residents = data.sakinler.map(([handle, seed, slot, arrived_day, overrides]) => ({
  handle, seed, slot, arrived_day, ...(overrides ? { overrides } : {}),
}));
const N = residents.length;
const takipci = data.takipci ?? 0;
const now = Date.now() / 1000;
const today = sim.dayOf(now);
const tarih = new Date(today * 86400000).toISOString().slice(0, 10); // ada günü (ET)

const yuvalar = SIKLIK.filter(([n]) => takipci >= n).at(-1)[1];
if (!yuvalar.includes(yuva) && !args.includes("--zorla")) {
  console.log(`${yuva}: bugün gerekmiyor (takipçi ${takipci}; yuvalar: ${yuvalar.join(", ")})`);
  process.exit(0);
}

const durumYolu = resolve(opt("--durum", "cikti/gunluk/durum.json"));
const durum = { zirve: 0, istekler: {}, konular: [], sakinler: [], ...(existsSync(durumYolu) ? JSON.parse(readFileSync(durumYolu, "utf8")) : {}) };
// --bekle: o yuvanın dayandığı taşınma (ET 09:00 / 15:00) henüz işlenmediyse çık.
const TASINMA = { sabah: 9, ogle: 9, aksam: 15 };
if (args.includes("--bekle") && TASINMA[yuva] != null && (data.son_aktarim ?? 0) < sim.unixOf(today, TASINMA[yuva] * 60) && N > 0) {
  console.log(`${yuva}: ${TASINMA[yuva]}:00 taşınması henüz işlenmedi, sonra yeniden denenecek`);
  process.exit(0);
}
if (args.includes("--uret") && !args.includes("--onizleme") && !args.includes("--zorla") && durum.son?.tarih === tarih && durum.son?.yuva === yuva) {
  console.log(`${tarih} ${yuva}: zaten üretildi (${durum.son.video})`);
  process.exit(0);
}
const level = Math.max(data.zirve ?? 0, residents.reduce((m, r) => Math.max(m, r.slot + 1), 0));
sim.setTown(level);
const stages = catalog.gelisim;
const next = stages.find((s) => s.nufus > level);
const need = next ? Math.max(1, next.nufus - N) : 0;

// --- hikâye seçimi ---
const named = (r) => r.handle != null; // adını gizleyenler adlarıyla anılmaz
const yeniler = residents.filter((r) => r.arrived_day === today).sort((a, b) => a.slot - b.slot);
// Bugün açılanlar: dünkü düzeyden (bugünden önce gelenler) bugünkü düzeye geçerken açılan adımlar.
const dunku = residents.filter((r) => r.arrived_day < today).reduce((m, r) => Math.max(m, r.slot + 1), 0);
const acilan = stages.filter((s) => s.nufus > dunku && s.nufus <= level);
const istekDegisen = residents.filter((r) => named(r) && r.overrides && JSON.stringify(r.overrides) !== JSON.stringify(durum.istekler?.[r.handle] ?? null));

/** Sakinin işi: "[özne] is a X." ve ardından durumu. Asıl mesleğinin yeri açık değilse anakarada çalışır. */
function isCumleleri(r, ozne) {
  const dream = sim.dreamJob(r), job = sim.job(r);
  const rank = sim.rank(r, today);
  const unvan = kucuk(dream.kademeler[Math.min(rank, dream.kademeler.length - 1)]);
  if (dream.id === "emekli") return [c(`${ozne} is retired.`), c("On the island all day.", null, true)];
  if (dream.id === "uzaktan") return [c(`${ozne} is ${a(unvan)}.`), c("Works from home.", null, true)];
  if (dream.id === "ogrenci") return [c(`${ozne} is ${a(unvan)}.`), c("Studies on the mainland."), c("Takes the ferry every morning.", null, true)];
  if (dream.id === "anakara") return [c(`${ozne} works on the mainland.`), c("Takes the ferry every morning.", null, true)];
  if (job.id !== dream.id) {
    const yer = catalog.isyerleri[dream.yer].map((name, k) => [sim.stageOf(`${dream.yer}:${k}`), name]).sort((x, y) => x[0] - y[0])[0][1];
    return [c(`${ozne} is ${a(unvan)}.`), c(`${buyuk(the(yer))} isn't open yet.`), c("For now, it's the ferry to the mainland.", null, true)];
  }
  return [c(`${ozne} is ${a(unvan)}.`), c(`Works at ${the(sim.workplace(r).name)}.`)];
}

/** Boş ada konuları (sırayla, tekrar etmeden). Her biri: gövde, soru, çekimler. Hepsi koddan doğrulanmış olgular. */
const BOS = [
  // İmza zaten sıradaki adımı (5'te Green'in bankları) söylüyor: yol haritası ondan sonrasını anlatır.
  { id: "yolharitasi", govde: [c("The tenth resident opens the diner.", "10th resident: the diner."), c("The twentieth, the general store.", "20th: the general store."), c("The thirtieth, the bakery.", "30th: the bakery.", true)], soru: c("How many days until the bakery?"), cekim: ["siradaki", "meydan"] },
  { id: "fener", govde: [c("The eighth person to move in becomes the lighthouse keeper.", "The 8th person to move in\nbecomes the lighthouse keeper."), c("Nobody will ask them.", null, true), c("For now, the light runs itself.")], soru: c("Who will be number eight?"), cekim: ["fener", "fener2"], saat: "17:30" },
  { id: "vapur", govde: [c("The ferry comes every twenty minutes.", "The ferry comes every 20 minutes."), c("Nobody gets off.", null, true), c("The captain waits eight minutes anyway.", "The captain waits 8 minutes anyway.")], soru: c("Who gets off the first ferry?"), cekim: ["iskele", "iskele2"], saat: "08:20" },
  { id: "meslek", govde: [c("Everyone who moves in gets a job."), c("You can pick yours in the comments."), c("No workplace yet? You take the ferry to the mainland.", null, true)], soru: c("Which job would you pick?"), cekim: ["meydan2", "iskele"] },
  { id: "adres", govde: [c("The first address is already set."), c("One Shell Street.", "1 Shell Street,\nShell Point"), c("The house goes up when the first person moves in.", null, true)], soru: c("Whose address will it be?"), cekim: ["ilkev", "meydan"] },
  { id: "diner", govde: [c("The diner opens with the tenth resident.", "The diner opens\nwith the 10th resident."), c("The tenth resident is also the cook.", "The 10th resident\nis also the cook."), c("Nobody asked them either.", null, true)], soru: c("Pancakes or eggs?"), cekim: ["meydan", "meydan2"] },
  { id: "gece", govde: [c("Evening on the island."), c("The lighthouse is on."), c("Nobody is watching.", null, true)], soru: c("Who spends the first night here?"), cekim: ["fener", "ucus"], saat: "18:30" },
];

let tur, govde = [], soru, cekim = [], etiketler = [], saat = "16:40", konuId = null, ozelKanca = null, imza2 = null, ilkCekim = "ucus";
if (acilan.length) {
  tur = "acilis";
  const s = acilan.at(-1);
  if (s.acar.includes("zeplin")) {
    // Zeplin bir yer değil: gelişini anlat, gece ışıklı reklam alanıyla çek.
    govde.push(c("A blimp arrived on the island today."), c("It comes at nine every morning and leaves at ten at night.", "It comes at 9 AM\nand leaves at 10 PM."),
      c(ZEPLIN_REKLAM.ad ? `It says ${ZEPLIN_REKLAM.ad} on the side.` : "It says Driftwood on the side.", null, true));
    saat = "20:00";
  } else govde.push(c(`${the(s.ad)} opened today.`));
  // Bu açılışla anakaradan adaya dönenler: dünkü düzeyde anakarada, bugün adada çalışanlar.
  sim.setTown(durum.zirve);
  const once = new Map(residents.map((r) => [r.slot, sim.job(r).id]));
  sim.setTown(level);
  const donen = residents.filter((r) => once.get(r.slot) === "anakara" && sim.job(r).id !== "anakara");
  if (s.acar.includes("zeplin")) cekim = ["zeplin", "zeplin2"];
  else if (donen.length) govde.push(c(`${say(donen.length)} ${kisi(donen.length)} no longer ${donen.length === 1 ? "commutes" : "commute"} to the mainland.`, `${fmt(donen.length)} ${kisi(donen.length)} no longer ${donen.length === 1 ? "commutes" : "commute"}\nto the mainland.`, true));
  else if (s.acar.some((k) => catalog.isyerleri[k.split(":")[0]])) govde.push(c("No staff yet."), c("The door is open anyway.", null, true));
  else govde.push(c("Nobody uses it."), c("Yet.", null, true));
  etiketler = donen.filter(named).slice(0, 5).map((r) => r.handle);
  soru = next ? c(`When do you think ${the(next.ad)} opens?`) : c("The island is complete. What should come next?");
  if (!cekim.length) cekim = ["ucus", "meydan"];
} else if (yeniler.length) {
  tur = "yeniler";
  govde.push(c(`${say(yeniler.length)} ${kisi(yeniler.length)} moved in today.`, `${fmt(yeniler.length)} ${kisi(yeniler.length)} moved in today.`));
  const fener = yeniler.find((r) => sim.dreamJob(r).id === "fener_bekcisi");
  const ilk = fener ?? yeniler.find(named) ?? yeniler[0];
  if (fener) govde.push(c("Our eighth resident arrived.", "Our 8th resident arrived."), c("Now the lighthouse keeper."), c("Nobody asked.", null, true));
  else govde.push(...isCumleleri(ilk, ilk === yeniler[0] ? "The first one" : "One of them"));
  etiketler = yeniler.filter(named).slice(0, 8).map((r) => r.handle);
  soru = c("Who moves in tomorrow?");
  cekim = named(ilk) ? ["iskele", { sakin: ilk.handle }] : ["iskele", "meydan"];
} else if (istekDegisen.length) {
  tur = "istek";
  const r = istekDegisen[0];
  const o = r.overrides;
  if (o.meslek) {
    const j = catalog.meslekler.find((m) => m.id === o.meslek);
    // "Now a X." yerine "Request granted."; ardından durumu (yeri yoksa anakarada).
    govde.push(c(`A resident asked to be ${a(kucuk(j.kademeler[1]))}.`), c("Request granted."), ...isCumleleri(r, "This resident").slice(1));
  } else if (o.evcil) govde.push(c(`A resident asked for ${a(kucuk(o.evcil))}.`), c("Now they have one.", null, true));
  else if (o.hobi) govde.push(c("A resident asked for a new hobby."), c(`Now they spend their free time ${HOBI_ING[o.hobi]}.`, null, true));
  else govde.push(c("A resident sent a request."), c("It's on the site now.", null, true));
  etiketler = istekDegisen.slice(0, 5).map((r) => r.handle);
  soru = c("Is the next request yours?");
  cekim = [{ sakin: r.handle }, "meydan"];
} else if (N > 0) {
  tur = "sakin";
  // Sırayla, daha önce anlatılmamış ve adı görünen bir sakin.
  const r = residents.filter(named).find((x) => !durum.sakinler.includes(x.handle)) ?? residents.filter(named)[0];
  if (r) {
    const t = sim.tenure(r, today);
    govde.push(c("Today we followed one resident."), ...isCumleleri(r, "This resident"));
    const h = sim.hobby(r), p = sim.pet(r, today);
    govde.push(c(`Free time: ${HOBI_ING[h.id]}.`));
    if (p) govde.push(c(`There's also ${a(kucuk(p))}.`, null, true));
    else if (t > 0) govde.push(c(`On the island for ${say(t)} ${t === 1 ? "day" : "days"}.`, `On the island for ${fmt(t)} ${t === 1 ? "day" : "days"}.`, true));
    etiketler = [r.handle];
    soru = c("Do you know who their neighbor is?");
    cekim = [{ sakin: r.handle }, { sakin: r.handle }];
  }
}
if (opt("--hikaye")) {
  // Elle yazılmış hikâye (seçimin yerine geçer).
  const h = JSON.parse(readFileSync(opt("--hikaye"), "utf8"));
  const cc = (x) => c(x.ses, x.yazi ?? null, !!x.vurus);
  tur = h.tur ?? "ozel"; govde = h.govde.map(cc); soru = cc(h.soru); cekim = h.cekim; etiketler = h.etiketler ?? [];
  saat = h.saat ?? saat; ozelKanca = h.kanca ?? null;
  imza2 = h.imza2 ? cc(h.imza2) : null; ilkCekim = h.ilk ?? ilkCekim;
}
if (!tur || !govde.length) {
  tur = "bos";
  const konu = BOS.find((k) => !durum.konular.includes(k.id)) ?? BOS[durum.konular.length % BOS.length];
  konuId = konu.id;
  govde = konu.govde; soru = konu.soru; cekim = konu.cekim; saat = konu.saat ?? saat;
}

// Ada saati = videonun üretildiği andaki gerçek ada saati (ET). Yayın saatine ya da güzel ışığa göre SEÇİLMEZ
// (kullanıcı kararı, 2 Kasım 2026: öğle videosu 18:40'ta çekilmişti). Hikâyedeki "saat" yok sayılır; yalnız
// kullanıcı açıkça isterse --saat HH:MM.
const istenenSaat = saat;
saat = opt("--saat") ?? new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
if (!opt("--saat") && istenenSaat !== saat) console.log(`ada saati ${saat} (ET, şimdi); "${istenenSaat}" kullanılmadı`);
// Feribot iskele çekiminde iskelede olsun (kullanıcı, 3 Kasım: "vapur yokken vapur çekilmeye çalışılıyor"): ada saatinde
// feribot açıktaysa iskele çekimleri bir sonraki yanaşmanın 1 dk sonrasına (en çok ~17 dk ileri) alınır; diğerleri şimdi.
const dakika = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const saatYaz = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const vapurSaati = ferryOut(dakika(saat)) === 0 && ferryOut(dakika(saat) + 1) === 0 ? saat : saatYaz(nextArrival(dakika(saat)) + 1);
if (vapurSaati !== saat) console.log(`ferry not docked at ${saat}: pier shots at ${vapurSaati}`);

// İmza (kilit sayacı) ve kapanış (soru + takip + istek kalıbı).
const yer = next ? the(next.ad) : "";
const imza = N === 0
  ? [c("Nobody lives on this island."), c(`We need ${say(need)} ${kisi(need)} for ${yer}.`, `We need ${fmt(need)} ${kisi(need)}\nfor ${yer}.`)]
  : [c(N === 1 ? "One person lives on this island." : `${say(N)} people live on this island.`, `${fmt(N)} ${kisi(N)} ${N === 1 ? "lives" : "live"} on this island.`),
     ...(imza2 ? [imza2] : next ? [c(`We need ${say(need)} more for ${yer}.`, `We need ${fmt(need)} more\nfor ${yer}.`)] : [])];
const kapanis = [soru, c("Follow, and you move to the island."), c("Pick your job."), c("Comment: job, fisherman.", "Comment:\njob: fisherman")];
const cumleler = [...imza, ...govde, ...kapanis];
const gruplar = [
  { cekim: ilkCekim, arayuz: true, ilk: 0, son: imza.length - 1 },
  ...splitGovde(govde.length, cekim).map(([a, b, ck]) => ({ cekim: ck, ilk: imza.length + a, son: imza.length + b })),
  // Kapanış üç çekim: soru (konunun son açısı), "takip eden adaya taşınıyor" (iskele), istek kalıbı (yazılı son kare).
  { cekim: typeof cekim.at(-1) === "object" ? "meydan" : cekim.at(-1), varyantEk: 1, ilk: imza.length + govde.length, son: imza.length + govde.length },
  { cekim: "iskele", ilk: imza.length + govde.length + 1, son: imza.length + govde.length + 1 },
  { cekim: "kapanis", ilk: imza.length + govde.length + 2, son: cumleler.length - 1 },
];
function splitGovde(n, ck) {
  // Gövde cümleleri çekimlere sırayla bölünür (en az bir cümle).
  const k = Math.min(ck.length, n), out = [];
  for (let i = 0; i < k; i++) out.push([Math.floor((i * n) / k), Math.floor(((i + 1) * n) / k) - 1, ck[i]]);
  return out;
}

const ad = `gunluk/${tarih}-${yuva}`;
const out = resolve("cikti", ad);
mkdirSync(out, { recursive: true });
const aralar = Object.fromEntries(cumleler.map((x, k) => [k, x.vurus ? 0.35 : 0]).filter(([, d]) => d));
const S0 = { ad, seslendirme: cumleler.map(({ ses, yazi }) => ({ ses, ...(yazi ? { yazi } : {}) })), aralar };

console.log(`${tarih} ${yuva} · ${tur}${konuId ? ` (${konuId})` : ""} · nüfus ${N}, takipçi ${takipci}`);
for (const x of cumleler) console.log("   " + x.ses + (x.vurus ? "   [vuruş]" : ""));

// --- açıklama (etkileşim: kanca + soru + istek kalıbı + etiketler) ---
const kanca = ozelKanca ?? { acilis: "Something new opened on the island today 🏗️", yeniler: `${fmt(yeniler.length)} new ${yeniler.length === 1 ? "neighbor" : "neighbors"} on Driftwood Island today 🧳`, istek: "A comment request came true ✍️", sakin: "A day in the life of a resident 👀", bos: "Nobody lives on this island yet 🏝️" }[tur];
const aciklama = [
  kanca,
  `${(soru.yazi ?? soru.ses).replace(/\n/g, " ")} 👇`,
  `Follow and you move in. Pick your job: comment "job: fisherman" (or any job).`,
  etiketler.length ? etiketler.map((h) => "@" + h).join(" ") : null,
  "Find yourself: driftwood.rumpuskit.com",
  "",
  "#driftwoodisland #cozygames #simulation #smalltown #islandlife",
].filter((x) => x != null).join("\n");
writeFileSync(`${out}/ACIKLAMA.txt`, aciklama + "\n");
writeFileSync(`${out}/malzeme.json`, JSON.stringify({ tarih, yuva, tur, konuId, nufus: N, takipci, level, sıradaki: next?.ad, need, yeniler: yeniler.map((r) => r.handle), etiketler }, null, 2));

if (!args.includes("--uret")) {
  writeFileSync(`${out}/senaryo-taslak.json`, JSON.stringify({ ...S0, gruplar }, null, 2));
  console.log(`taslak: ${out} (üretmek için --uret)`);
  process.exit(0);
}

// --- ses ve çekim süreleri ---
const ses = await seslendir(S0);
const kay = (k) => Object.entries(aralar).reduce((a, [j, d]) => a + (Number(j) <= k ? d : 0), 0);
const bas = (k) => ses.cumleler[k].bas + kay(k), son = (k) => ses.cumleler[k].son + kay(k);
// Kurgu (3 Kasım 2026, kullanıcı: "art arda aynı sahne, heyecan/vuruculuk yok"): geçiş kısa (neredeyse kesme),
// her çekim en çok PARCA sn (uzun grup bölünür), aynı yerin her kullanımı başka açı (yer başına sayaç, bkz. canlandir),
// kamera her çekimde belirgin hareket eder (itme/çekme + yay). Sakin izleme en çok 4,2 sn, kalanı meydan.
const X = 0.12, bitis = son(cumleler.length - 1) + 1.2, PARCA = 2.6;
const kesitler = [];
gruplar.forEach((g, gi) => {
  const t0 = gi === 0 ? 0 : bas(g.ilk) - 0.15;
  const t1 = gi === gruplar.length - 1 ? bitis : bas(gruplar[gi + 1].ilk) - 0.15;
  const sakin = typeof g.cekim === "object";
  const parca = g.cekim === "kapanis" ? 1 : Math.max(1, Math.ceil((t1 - t0) / (sakin ? 4.2 : PARCA)));
  for (let k = 0; k < parca; k++) kesitler.push({ ...g, cekim: sakin && k > 0 ? "meydan" : g.cekim, t0: t0 + ((t1 - t0) * k) / parca, t1: t0 + ((t1 - t0) * (k + 1)) / parca });
});
const kullanim = {};
const cekimler = kesitler.map((k, i) => {
  const sure = +(k.t1 - k.t0 + (i < kesitler.length - 1 ? X : 0)).toFixed(3);
  const anahtar = typeof k.cekim === "object" ? "sakin:" + k.cekim.sakin : k.cekim;
  const v = (kullanim[anahtar] = (kullanim[anahtar] ?? -1) + 1);
  const shot = CEKIM(k.cekim, v, sure, k.arayuz);
  return { sure, ...(k.cekim === "kapanis" ? shot : canlandir(shot, v)) };
});
// Art arda iki çekim aynı kalmasın (aynı adres + yörünge): olursa ikincisi döndürülür (güvenlik ağı).
for (let i = 1; i < cekimler.length; i++) {
  const ayni = (a, b) => a.adres === b.adres && JSON.stringify(a.kamera ?? a.yorunge ?? null) === JSON.stringify(b.kamera ?? b.yorunge ?? null);
  if (ayni(cekimler[i - 1], cekimler[i]) && !cekimler[i].serbest) canlandir(cekimler[i], 3);
}

/** Aynı yerin v. kullanımı başka kadraj: DUZEN[v] = [açı (rad, hedef çevresinde), uzaklık çarpanı] (geniş → yakın →
 *  daha geniş …; art arda aynı yer bile belirgin farklı görünür). Çekim içinde de hareket: çift v'de sona doğru içeri
 *  itilir, tekte dışarı çekilir. Yörüngede yay en az 0,5 rad, r1 bitiş uzaklığı (kaydet.mjs uygular). */
function canlandir(shot, v) {
  const DUZEN = [[0, 1], [0.6, 0.55], [-0.6, 1.45], [1.1, 0.75], [-1.1, 1.25], [1.6, 0.6], [-1.6, 1.1]];
  const [aci, olc] = DUZEN[v % DUZEN.length], m = v % 2 ? 1.12 : 0.82;
  if (shot.kamera) {
    const [, kx0, ky0, kz0, bx0, by0, bz0] = shot.kamera[0];
    const yakin = Math.hypot(kx0 - bx0, ky0 - by0, kz0 - bz0) < 25; // sokak düzeyi: binaya girmesin
    const th = aci * (yakin ? 0.6 : 1), o = yakin ? Math.min(1.2, Math.max(0.8, olc)) : olc;
    const c = Math.cos(th), s = Math.sin(th), n = shot.kamera.length;
    shot.kamera = shot.kamera.map(([t, kx, ky, kz, bx, by, bz], i) => {
      const k = o * (i === n - 1 ? m : 1), dx = kx - bx, dz = kz - bz;
      return [t, bx + (dx * c - dz * s) * k, by + (ky - by) * k, bz + (dx * s + dz * c) * k, bx, by, bz];
    });
  } else if (shot.yorunge && shot.yorunge.hedef !== "zeplin-yer") {
    const y = shot.yorunge, yay = Math.max(Math.abs(y.a1 - y.a0), 0.5) * (Math.sign(y.a1 - y.a0) || 1);
    const o = y.r < 50 ? Math.max(0.85, olc) : olc; // yakın yörünge daha da yaklaşmaz (çardağa, direğe, bacaya girdi, 3 Kasım)
    y.a0 += aci; y.a1 = y.a0 + yay; y.r = +(y.r * o).toFixed(2); y.h = +(y.h * o).toFixed(2);
    if (y.hedef !== "zeplin") y.r1 = +(y.r * m).toFixed(2);
  }
  return shot;
}

/** Çekim kütüphanesi: gerçek adanın sabit ve dinamik açıları (koordinatlar: senaryolar/acilis.mjs notları). */
function CEKIM(ad, v, sure, arayuz) {
  const a = `saat=${typeof ad === "string" && ad.startsWith("iskele") ? vapurSaati : saat}&hiz=4`;
  // Sakin: site onu bulup izler (evdeyse evinin içi açılır). Kart gizli: telefon düzeninde altyazının üstüne biner.
  if (typeof ad === "object") return { adres: `${a}&bul=${encodeURIComponent(ad.sakin)}`, serbest: true, isinma: 60, yazilar: [{ metin: "@" + esc(ad.sakin), bas: 0.15, son: sure, yer: "ust" }] };
  const yor = (hedef, r, h, a0, a1, bak = 2) => ({ adres: a, yorunge: { hedef, r, h, a0, a1, bak } });
  // Hepsi yörünge çekimi (hedef sitede hesaplanır; ada değişse de kadraj doğru kalır). a: 0 = kamera denizden (+z) bakar.
  const L = {
    ucus: () => yor([60, -80], 520, 230, -0.45 + 0.9 * (v % 2), -0.25 + 0.9 * (v % 2), 0),
    // Feribot dakika 0-7 (mod 20) arasında iskelede: 16:40, 08:20 uygun.
    iskele: () => (v % 2 ? yor("iskele", 30, 6, 2.5, 2.75, 2) : yor("iskele", 75, 28, 0.5, 0.8, 2)),
    iskele2: () => yor("iskele", 45, 14, -0.8, -0.55, 3),
    // Çardağın yarıçapı ~6 m: yakın çekim 24 m dışından.
    meydan: () => (v % 2 ? yor("meydan", 24, 4, 2.3, 2.6, 3) : yor("meydan", 46, 20, 0.3, 0.6, 2)),
    meydan2: () => yor("meydan", 24, 4, 2.3 + v, 2.6 + v, 3),
    kilise: () => yor("kilise", 44, 16, 0.2, 0.5, 9),
    fener: () => yor("fener", 80, 34, 0.6 + v, 0.9 + v, 14),
    fener2: () => yor("fener", 28, 20, 2.0, 2.3, 20),
    ilkev: () => yor("ilkev", 38, 20, 0.4 + v, 0.75 + v, 3),
    siradaki: () => yor("siradaki", 70, 40, 0.6 + v, 1.1 + v, 2),
    // Zeplin: yanından, gidişine göre dönen kamera (dikey kadraja sığacak uzaklıkta); ikincisi iskeleden bakış.
    zeplin: () => yor("zeplin", 150, -18, 1.1 + 0.3 * v, 1.6 + 0.3 * v, 0),
    zeplin2: () => yor("zeplin-yer", 0, 0, 0, 0, 0),
    kapanis: () => ({ ...yor([60, -80], 640, 320, -0.1, 0.1, 0), yazilar: [{ metin: "Follow,<br>move to the island.", alt: `on TikTok<br><small>@${TIKTOK}</small>`, bas: 0.2, son: sure, yer: "ust" }] }),
  };
  const shot = (L[ad] ?? L.ucus)();
  // Zeplin henüz açılmadıysa çekimde önizleme olarak gösterilir (?zeplin); metin bunu söylemeli ("150. sakinde").
  if (typeof ad === "string" && ad.startsWith("zeplin") && !sim.isOpen("zeplin")) shot.adres += "&zeplin";
  if (arayuz) shot.arayuz = true;
  return shot;
}

const MUZIK = "cikti/muzik/ada-1.mp3"; // müzik yoksa sessiz (anlatım standardı 7)
const S = { ...S0, olcek: 2, gecis: X, ...(existsSync(MUZIK) ? { muzik: MUZIK } : {}), fps: 30, w: 1080, h: 1920, cekimler, aciklama };
writeFileSync(`${out}/senaryo.json`, JSON.stringify(S, null, 2));

// --- çizim: site derlenir, yerel önizleme sunucusu açılır, kaydet.mjs çalışır ---
const PORT = 4189;
execFileSync("npx", ["vite", "build"], { cwd: resolve(HERE, "../web"), stdio: "ignore" });
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: resolve(HERE, "../web"), stdio: "ignore", detached: true });
try {
  await new Promise((ok) => setTimeout(ok, 3000));
  execFileSync("node", ["kaydet.mjs", `${out}/senaryo.json`, ...(args.includes("--onizleme") ? ["--onizleme"] : [])], { stdio: "inherit", env: { ...process.env, SITE: `http://localhost:${PORT}/` } });
} finally {
  try { process.kill(-server.pid); } catch {}
}
const video = `${out}/${ad.split("/").pop()}${args.includes("--onizleme") ? "-onizleme" : ""}.mp4`;

// Durum: bir sonraki çalıştırmada "bugün ne değişti" buna göre bulunur.
if (!args.includes("--onizleme")) {
  durum.zirve = level;
  durum.istekler = Object.fromEntries(residents.filter((r) => named(r) && r.overrides).map((r) => [r.handle, r.overrides]));
  if (konuId) durum.konular = [...new Set([...durum.konular, konuId])];
  if (tur === "sakin") durum.sakinler = [...new Set([...durum.sakinler, ...etiketler])].slice(-500);
  durum.son = { tarih, yuva, tur, video };
  writeFileSync(durumYolu, JSON.stringify(durum, null, 2));
}

// TikTok bağlıysa (node tiktok.mjs baglan) video gelen kutusuna taslak olarak gider; olmazsa dosyadan yüklenir.
let taslak = null;
// --taslaksiz: TikTok'a yükleme (Mac'teki otomatik üretim videoyu sosyal sistemin takvimine verir, taslağı o gönderir).
if (!args.includes("--onizleme") && !args.includes("--taslaksiz") && existsSync(resolve(HERE, "../secret/tiktok-dev/token.json"))) {
  try {
    taslak = await yukle(video);
    console.log("TikTok taslağı:", taslak.publish_id);
  } catch (e) {
    console.log("TikTok'a yüklenemedi:", e.message);
  }
}

if (args.includes("--bildir")) {
  // Açıklama panoya; bildirim paylaşma saatini söyler.
  try { execFileSync("pbcopy", { input: aciklama }); } catch {}
  const msg = taslak
    ? `Video TikTok gelen kutunda (taslak). Açıklama panoda. Paylaşım: ${SAAT[yuva]}`
    : `Video hazır (${tur}), dosyadan yükle. Açıklama panoda. Paylaşım: ${SAAT[yuva]}`;
  try { execFileSync("osascript", ["-e", `display notification ${JSON.stringify(msg)} with title "Driftwood" subtitle ${JSON.stringify(video.split("/").pop())}`]); } catch {}
}
console.log("video:", video);
if (args.includes("--ac")) try { execFileSync("open", [out]); } catch {}
