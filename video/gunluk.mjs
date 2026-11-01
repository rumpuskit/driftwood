// Günlük video: sitenin herkese açık sakin listesinden ve simülasyondan günün hikâyesini seçer, anlatım
// standardına (video/cikti/ANLATIM-STANDARDI.md) uygun seslendirme ve çekim planını kurar; istenirse sesi ve
// videoyu üretir, açıklamayı panoya kopyalar ve bildirim gönderir.
//
//   node gunluk.mjs [--yuva aksam|ogle|sabah] [--uret] [--onizleme] [--bildir] [--zorla] [--ac] [--hikaye h.json]
//
// --hikaye: günün hikâyesi elle (gerçek olaylardan, sitede doğrulanmış): {"tur", "kanca", "govde": [{ses, yazi?,
// vurus?}], "soru": {ses, yazi?}, "cekim": ["fener", {"sakin": "ad"}, ...], "etiketler": [...], "saat": "19:40",
// "imza2": {ses, yazi?} (kilit sayacının ikinci cümlesi: sıradaki yer yerine başka bir hedef, ör. zeplin),
// "ilk": imza çekimi (varsayılan "ucus")}. İmza ve kapanış yine standarttan gelir. --ac: üretim bitince klasörü Finder'da açar.
//
// Yuva: akşam (21:00 taşınmasından sonra, günün özeti), öğle (bir sakinin hikâyesi ya da istek), sabah
// (09:00 taşınma haberi). Kaç yuvanın üretileceği takipçi sayısına bağlı (SIKLIK); gerekmeyen yuva sessizce
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
import { seslendir } from "./seslendir.mjs";
import { yukle } from "./tiktok.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
process.chdir(HERE);
const catalog = JSON.parse(readFileSync(resolve(HERE, "../data/catalog.json"), "utf8"));
sim.setCatalog(catalog);

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const yuva = opt("--yuva", "aksam");
// Önerilen paylaşma saati: kullanıcı Almanya'da (TR = Almanya + 2 saat, kış saati).
const SAAT = { sabah: "09:30 (TR 11:30)", ogle: "12:30 (TR 14:30)", aksam: "18:30 (TR 20:30)" };
// Takipçi sayısına göre günde kaç video (önce akşam, sonra öğle, sonra sabah).
const SIKLIK = [[0, ["aksam"]], [100, ["ogle", "aksam"]], [1000, ["sabah", "ogle", "aksam"]]];

// --- yardımcılar ---
const BIR = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const ON = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
/** Sayının okunuşu (seslendirme için): 1250 → "bin iki yüz elli". */
export function say(n) {
  if (n === 0) return "sıfır";
  const parts = [];
  const grup = (k) => [k >= 100 ? (Math.floor(k / 100) === 1 ? "yüz" : BIR[Math.floor(k / 100)] + " yüz") : "", ON[Math.floor(k / 10) % 10], BIR[k % 10]].filter(Boolean).join(" ");
  const mil = Math.floor(n / 1e6), bin = Math.floor(n / 1000) % 1000, kalan = n % 1000;
  if (mil) parts.push(grup(mil) + " milyon");
  if (bin) parts.push(bin === 1 ? "bin" : grup(bin) + " bin");
  if (kalan) parts.push(grup(kalan));
  return parts.join(" ");
}
const fmt = (n) => n.toLocaleString("tr-TR");
const kucuk = (t) => t.toLocaleLowerCase("tr");
const HOBI_FIIL = { balik: "balık tutuyor", kitap: "kitap okuyor", satranc: "satranç oynuyor", resim: "resim yapıyor", bisiklet: "bisiklete biniyor", yuzme: "yüzüyor", ucurtma: "uçurtma uçuruyor", gitar: "gitar çalıyor", fotograf: "fotoğraf çekiyor", kosu: "koşuyor", tavla: "tavla oynuyor", yoga: "yoga yapıyor" };
const EVCIL_I = { Kedi: "kedisi", Köpek: "köpeği", Papağan: "papağanı", Kaplumbağa: "kaplumbağası" };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Cümle: ses (okunan) ve yazi (altyazı; yoksa aynısı). vurus: öncesine 0,35 sn sessizlik. Büyük harfle başlar. */
const buyuk = (t) => (t ? t[0].toLocaleUpperCase("tr") + t.slice(1) : t);
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
// --bekle: o yuvanın taşınması (09:00 / 21:00) henüz işlenmediyse çık; zamanlayıcı bir saat sonra yeniden dener.
const TASINMA = { sabah: 9, aksam: 21 };
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

/** Sakinin işi: "ozne bir X." ve ardından durumu. Asıl mesleğinin yeri açık değilse anakarada çalışır. */
function isCumleleri(r, ozne) {
  const dream = sim.dreamJob(r), job = sim.job(r);
  const rank = sim.rank(r, today);
  const unvan = kucuk(dream.kademeler[Math.min(rank, dream.kademeler.length - 1)]);
  if (dream.id === "emekli") return [c(`${ozne} emekli.`), c("Bütün gün adada.", null, true)];
  if (dream.id === "uzaktan") return [c(`${ozne} bir ${unvan}.`), c("Evden çalışıyor.", null, true)];
  if (dream.id === "ogrenci") return [c(`${ozne} bir ${unvan}.`), c("Anakarada okuyor."), c("Her sabah vapura biniyor.", null, true)];
  if (dream.id === "anakara") return [c(`${ozne} anakarada ${unvan}.`), c("Her sabah vapura biniyor.", null, true)];
  if (job.id !== dream.id) {
    const yer = catalog.isyerleri[dream.yer].map((name, k) => [sim.stageOf(`${dream.yer}:${k}`), name]).sort((a, b) => a[0] - b[0])[0][1];
    return [c(`${ozne} bir ${unvan}.`), c(`${yer} henüz yok.`), c("Şimdilik vapurla anakaraya gidiyor.", null, true)];
  }
  return [c(`${ozne} bir ${unvan}.`), c(`İş yeri ${sim.workplace(r).name}.`)];
}

/** Boş ada konuları (sırayla, tekrar etmeden). Her biri: gövde, soru, çekimler. */
const BOS = [
  // İmza zaten sıradaki adımı (5'te meydan bankları) söylüyor: yol haritası ondan sonrasını anlatır.
  { id: "yolharitasi", govde: [c("Onuncu sakinle kahvehane açılıyor.", "10. sakinle kahvehane açılıyor."), c("Yirmincide market.", "20.'de market."), c("Otuzuncuda fırın.", "30.'da fırın.", true)], soru: c("Sizce fırına kaç günde ulaşırız?"), cekim: ["siradaki", "meydan"] },
  { id: "fener", govde: [c("Sekizinci gelen fener bekçisi olacak.", "8. gelen\nfener bekçisi olacak."), c("Kendisine sorulmayacak.", null, true), c("Fener şimdilik kendi kendine yanıyor.")], soru: c("Sizce sekizinci kim olacak?"), cekim: ["fener", "fener2"], saat: "19:40" },
  { id: "vapur", govde: [c("Vapur yirmi dakikada bir yanaşıyor.", "Vapur 20 dakikada bir yanaşıyor."), c("Kimse inmiyor.", null, true), c("Kaptan yine de sekiz dakika bekliyor.", "Kaptan yine de 8 dakika bekliyor.")], soru: c("Sizce ilk vapurdan kim inecek?"), cekim: ["iskele", "iskele2"], saat: "08:20" },
  { id: "meslek", govde: [c("Taşınan herkese bir meslek veriliyor."), c("Otuz altı meslek var.", "36 meslek var."), c("İş yeri yoksa vapurla anakaraya gidiyorsun.", null, true)], soru: c("Sen hangi mesleği seçerdin?"), cekim: ["meydan2", "iskele"] },
  { id: "adres", govde: [c("İlk sakinin adresi belli."), c("Kabuk Sokağı, bir numara, daire bir.", "Kabuk Sokağı No 1, Daire 1"), c("Bina ilk sakinle birlikte yapılacak.", null, true)], soru: c("Sizce bu adres kimin olacak?"), cekim: ["yakamoz", "meydan"] },
  { id: "kahvehane", govde: [c("Kahvehane onuncu sakinle açılıyor.", "Kahvehane 10. sakinle açılıyor."), c("Tavla oynayanlar oraya gidecek."), c("Satranççılar meydana.", null, true)], soru: c("Tavla mı, satranç mı?"), cekim: ["meydan", "meydan2"] },
  { id: "gece", govde: [c("Akşam oldu."), c("Fener yandı."), c("Bakan kimse yok.", null, true)], soru: c("Adanın ilk gecesini kim geçirecek?"), cekim: ["fener", "ucus"], saat: "20:10" },
];

let tur, govde = [], soru, cekim = [], etiketler = [], saat = "16:40", konuId = null, ozelKanca = null, imza2 = null, ilkCekim = "ucus";
if (acilan.length) {
  tur = "acilis";
  const s = acilan.at(-1);
  if (s.acar.includes("zeplin")) {
    // Zeplin bir yer değil: gelişini anlat, gece ışıklı reklam alanıyla çek.
    govde.push(c("Bugün adaya bir zeplin geldi."), c("Her sabah dokuzda geliyor, gece onda dönüyor.", "Her sabah 09:00'da geliyor, 22:00'de dönüyor."),
      c(ZEPLIN_REKLAM.ad ? `Üstünde ${ZEPLIN_REKLAM.ad} yazıyor.` : "Üstünde adamızın adı yazıyor.", null, true));
    saat = "20:00";
  } else govde.push(c(`Bugün ${s.ad} açıldı.`));
  // Bu açılışla anakaradan adaya dönenler: dünkü düzeyde anakarada, bugün adada çalışanlar.
  sim.setTown(durum.zirve);
  const once = new Map(residents.map((r) => [r.slot, sim.job(r).id]));
  sim.setTown(level);
  const donen = residents.filter((r) => once.get(r.slot) === "anakara" && sim.job(r).id !== "anakara");
  if (s.acar.includes("zeplin")) cekim = ["zeplin", "zeplin2"];
  else if (donen.length) govde.push(c(`${say(donen.length)} kişi artık anakaraya gitmiyor.`, `${fmt(donen.length)} kişi artık anakaraya gitmiyor.`, true));
  else if (s.acar.some((k) => catalog.isyerleri[k.split(":")[0]])) govde.push(c("Henüz çalışanı yok."), c("Kapısı yine de açık.", null, true));
  else govde.push(c("Oturan kimse yok."), c("Henüz.", null, true));
  etiketler = donen.filter(named).slice(0, 5).map((r) => r.handle);
  soru = next ? c(`Sizce ${next.ad} ne zaman açılır?`) : c("Ada tamamlandı. Sırada ne olsun?");
  if (!cekim.length) cekim = ["ucus", "meydan"];
} else if (yeniler.length) {
  tur = "yeniler";
  govde.push(c(`Bugün ${say(yeniler.length)} kişi taşındı.`, `Bugün ${fmt(yeniler.length)} kişi taşındı.`));
  const fener = yeniler.find((r) => sim.dreamJob(r).id === "fener_bekcisi");
  const ilk = fener ?? yeniler.find(named) ?? yeniler[0];
  if (fener) govde.push(c("Sekizinci sakin geldi.", "8. sakin geldi."), c("Artık fener bekçisi."), c("Kendisine sorulmadı.", null, true));
  else govde.push(...isCumleleri(ilk, ilk === yeniler[0] ? "İlk gelen" : "Gelenlerden biri"));
  etiketler = yeniler.filter(named).slice(0, 8).map((r) => r.handle);
  soru = c("Yarın kim gelecek?");
  cekim = named(ilk) ? ["iskele", { sakin: ilk.handle }] : ["iskele", "meydan"];
} else if (istekDegisen.length) {
  tur = "istek";
  const r = istekDegisen[0];
  const o = r.overrides;
  if (o.meslek) {
    const j = catalog.meslekler.find((m) => m.id === o.meslek);
    // "Artık bir X." yerine "İsteği işlendi."; ardından durumu (yeri yoksa anakarada).
    govde.push(c(`Bir sakin ${kucuk(j.kademeler[1])} olmak istedi.`), c("İsteği işlendi."), ...isCumleleri(r, "").slice(1));
  } else if (o.evcil) govde.push(c(`Bir sakin ${kucuk(o.evcil)} istedi.`), c(`Artık bir ${EVCIL_I[o.evcil]} var.`, null, true));
  else if (o.hobi) govde.push(c("Bir sakin yeni bir hobi istedi."), c(`Artık boş vaktinde ${HOBI_FIIL[o.hobi]}.`, null, true));
  else govde.push(c("Bir sakin isteğini yazdı."), c("Sitede işlendi.", null, true));
  etiketler = istekDegisen.slice(0, 5).map((r) => r.handle);
  soru = c("Sıradaki istek senin mi?");
  cekim = [{ sakin: r.handle }, "meydan"];
} else if (N > 0) {
  tur = "sakin";
  // Sırayla, daha önce anlatılmamış ve adı görünen bir sakin.
  const r = residents.filter(named).find((x) => !durum.sakinler.includes(x.handle)) ?? residents.filter(named)[0];
  if (r) {
    const t = sim.tenure(r, today);
    govde.push(c("Bugün bir sakine yakından baktık."), ...isCumleleri(r, "Bu sakin"));
    const h = sim.hobby(r), p = sim.pet(r, today);
    govde.push(c(`Boş vaktinde ${HOBI_FIIL[h.id]}.`));
    if (p) govde.push(c(`Bir de ${EVCIL_I[p]} var.`, null, true));
    else if (t > 0) govde.push(c(`${say(t)} gündür adada.`, `${fmt(t)} gündür adada.`, true));
    etiketler = [r.handle];
    soru = c("Komşusu kim, biliyor musun?");
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

// İmza (kilit sayacı) ve kapanış (soru + takip + istek kalıbı).
const imza = N === 0
  ? [c("Bu adada kimse yaşamıyor."), c(`${next.ad} için ${say(need)} kişi lazım.`, `${next.ad} için ${fmt(need)} kişi lazım.`)]
  : [c(`Bu adada ${say(N)} kişi yaşıyor.`, `Bu adada ${fmt(N)} kişi yaşıyor.`), ...(imza2 ? [imza2] : next ? [c(`${next.ad} için ${say(need)} kişi daha lazım.`, `${next.ad} için ${fmt(need)} kişi daha lazım.`)] : [])];
const kapanis = [soru, c("Takip eden adaya taşınıyor."), c("Mesleğini sen seç."), c("Yorumuna yaz: meslek, balıkçı.", "Yorumuna yaz:\nmeslek: balıkçı")];
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
const kanca = ozelKanca ?? { acilis: `Bugün adada yeni bir yer açıldı 🏗️`, yeniler: `Bugün ${fmt(yeniler.length)} kişi Driftwood'ya taşındı 🧳`, istek: "Yorumlardan gelen istek işlendi ✍️", sakin: "Bir sakinin günü 👀", bos: "Bu adada henüz kimse yaşamıyor 🏝️" }[tur];
const aciklama = [
  kanca,
  `${soru.yazi ?? soru.ses} 👇`,
  `Mesleğini sen seç: yorumuna "meslek: balıkçı" gibi yaz.`,
  etiketler.length ? etiketler.map((h) => "@" + h).join(" ") : null,
  "Kendini bul: driftwood.rumpuskit.com",
  "",
  "#driftwood #keşfet #ada #şehirkurma #simülasyon #oyun #fyp",
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
const X = 0.35, bitis = son(cumleler.length - 1) + 1.4;
// Çekim sınırları: grubun ilk cümlesinden 0,15 sn önce; 4 sn'den uzun gruplar ikiye bölünür (ikinci açı).
const kesitler = [];
gruplar.forEach((g, gi) => {
  const t0 = gi === 0 ? 0 : bas(g.ilk) - 0.15;
  const t1 = gi === gruplar.length - 1 ? bitis : bas(gruplar[gi + 1].ilk) - 0.15;
  const parca = g.cekim === "kapanis" || typeof g.cekim === "object" ? 1 : Math.max(1, Math.ceil((t1 - t0) / 4.2));
  for (let k = 0; k < parca; k++) kesitler.push({ ...g, varyant: k + (g.varyantEk ?? 0), t0: t0 + ((t1 - t0) * k) / parca, t1: t0 + ((t1 - t0) * (k + 1)) / parca });
});
const cekimler = kesitler.map((k, i) => {
  const sure = +(k.t1 - k.t0 + (i < kesitler.length - 1 ? X : 0)).toFixed(3);
  return { sure, ...CEKIM(k.cekim, k.varyant, sure, k.arayuz) };
});

/** Çekim kütüphanesi: gerçek adanın sabit ve dinamik açıları (koordinatlar: senaryolar/acilis.mjs notları). */
function CEKIM(ad, v, sure, arayuz) {
  const a = `saat=${saat}&hiz=4`;
  // Sakin: site onu bulup izler (evdeyse evinin içi açılır). Kart gizli: telefon düzeninde altyazının üstüne biner.
  if (typeof ad === "object") return { adres: `${a}&bul=${encodeURIComponent(ad.sakin)}`, serbest: true, isinma: 60, yazilar: [{ metin: "@" + esc(ad.sakin), bas: 0.15, son: sure, yer: "ust" }] };
  const yor = (hedef, r, h, a0, a1, bak = 2) => ({ adres: a, yorunge: { hedef, r, h, a0, a1, bak } });
  const L = {
    ucus: () => ({ adres: a, kamera: v % 2 ? [[0, 160, 150, 380, 0, 0, -40], [sure, 120, 110, 300, 0, 0, -20]] : [[0, -150, 120, 420, 0, 0, 40], [sure, -95, 80, 300, 0, 0, 15]] }),
    // Vapur dakika 0-7 (mod 20) arasında iskelede: 16:40, 19:40 uygun.
    iskele: () => ({ adres: a, kamera: v % 2 ? [[0, -11, 6.5, 236, -22, 4, 184], [sure, -13, 6, 228, -24, 4, 183]] : [[0, -40, 24, 186, 0, 2, 232], [sure, -30, 18, 194, 1, 2, 235]] }),
    iskele2: () => ({ adres: a, kamera: [[0, 30, 14, 250, 0, 3, 240], [sure, 24, 12, 258, 0, 3, 238]] }),
    meydan: () => ({ adres: a, kamera: v % 2 ? [[0, 9, 1.7, -11, 0, 10.5, -25.5], [sure, 5, 2.2, -14, 0, 11, -25.5]] : [[0, 26, 13, 30, 0, 5, -22], [sure, 19, 10, 23, 0, 6, -24]] }),
    meydan2: () => ({ adres: a, kamera: [[0, 9, 1.7, -11, 0, 10.5, -25.5], [sure, 5, 2.2, -14, 0, 11, -25.5]] }),
    fener: () => ({ adres: a, kamera: [[0, 700, 45, 260, 791, 4, 178], [sure, 715, 40, 250, 791, 4, 178]] }),
    fener2: () => ({ adres: a, kamera: [[0, 812, 22, 205, 791, 18, 178], [sure, 806, 24, 210, 791, 19, 178]] }),
    siradaki: () => yor("siradaki", 48, 30, 0.6 + v, 1.1 + v, 2),
    // Zeplin: yanından, gidişine göre dönen kamera (dikey kadraja sığacak uzaklıkta); ikincisi iskeleden bakış.
    zeplin: () => yor("zeplin", 150, -18, 1.1 + 0.3 * v, 1.6 + 0.3 * v, 0),
    zeplin2: () => yor("zeplin-yer", 0, 0, 0, 0, 0),
    yakamoz: () => yor([0, -270], 160, 110, 0.4 + v, 0.75 + v, 0),
    kapanis: () => ({ adres: a, kamera: [[0, 160, 180, 420, 0, 0, -60], [sure, 200, 250, 500, 0, 0, -80]], yazilar: [{ metin: "Takip et,<br>adaya taşın.", alt: `TikTok'ta<br><small>@${TIKTOK}</small>`, bas: 0.2, son: sure, yer: "ust" }] }),
  };
  const shot = (L[ad] ?? L.ucus)();
  // Zeplin henüz açılmadıysa çekimde önizleme olarak gösterilir (?zeplin); metin bunu söylemeli ("150. sakinde").
  if (typeof ad === "string" && ad.startsWith("zeplin") && !sim.isOpen("zeplin")) shot.adres += "&zeplin";
  if (arayuz) shot.arayuz = true;
  return shot;
}

const S = { ...S0, olcek: 2, gecis: X, muzik: "cikti/muzik/ada-1.mp3", fps: 30, w: 1080, h: 1920, cekimler, aciklama };
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
if (!args.includes("--onizleme") && existsSync(resolve(HERE, "../secret/tiktok-dev/token.json"))) {
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
