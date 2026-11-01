// 1. video (açılış, sesli): denizden bomboş adaya alçalış → feribot → büyüme montajı (gelişim tablosundan:
// diner, church, school, Ferris wheel; kesmeler kelimelere oturur) → 3.000 sakinli ada → fener (8. sakin) →
// ilk adres (1 Shell Street) → boş Green → "@you" → kapanış.
// Çekim süreleri seslendirmenin cümle/kelime zamanlarından hesaplanır (cikti/01-acilis/ses.json; yoksa önce
// `node seslendir.mjs senaryolar/acilis.mjs`). Metin değişirse çekim-cümle eşlemesi (CEKIMLER) elden geçirilir.
// Noktalar (_probe ile ölçüldü): Town Green (0, 0), Driftwood Diner kapısı (165, 66), kilise (0, -84),
// ilkokul kapısı (-40, -862), dönme dolap (430, -1873), feribot (223, 228), fener (-1222, 1032), 1 Shell Street (-86, -578).
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AD = "01-acilis";
const SESLENDIRME = [
  { ses: "Nobody lives on this island." },                                                    // 0
  { ses: "We need five people for benches on the Green.", yazi: "We need 5 people\nfor benches on the Green." }, // 1
  { ses: "Follow, and you move here." },                                                      // 2
  { ses: "Every new resident opens something.", yazi: "Every new resident\nopens something." }, // 3
  { ses: "A diner. A church. A school. A Ferris wheel.", yazi: "A diner. A church.\nA school. A Ferris wheel." }, // 4
  { ses: "At three thousand, it looks like this.", yazi: "At 3,000,\nit looks like this." }, // 5
  { ses: "The eighth resident becomes the lighthouse keeper.", yazi: "The 8th resident becomes\nthe lighthouse keeper." }, // 6
  { ses: "Nobody asks them." },                                                               // 7
  { ses: "The first address is one Shell Street.", yazi: "The first address:\n1 Shell Street." }, // 8
  { ses: "Who moves in first?" },                                                             // 9
  { ses: "Pick your job." },                                                                  // 10
  { ses: "Comment: job, fisherman.", yazi: "Comment:\njob: fisherman" },                    // 11
];
const ARALAR = { 7: 0.35, 9: 0.2 }; // vuruş öncesi sessizlik ("Nobody asks them.")

const HERE = dirname(fileURLToPath(import.meta.url));
const sesYolu = resolve(HERE, "../cikti", AD, "ses.json");
const ses = existsSync(sesYolu) ? JSON.parse(readFileSync(sesYolu, "utf8")) : null;
const kay = (k) => Object.entries(ARALAR).reduce((a, [j, d]) => a + (Number(j) <= k ? d : 0), 0);
const bas = (k) => (ses ? ses.cumleler[k].bas + kay(k) : k * 2.4);
const son = (k) => (ses ? ses.cumleler[k].son + kay(k) : k * 2.4 + 2);
/** k. cümlenin i. kelimesinin başlangıcı (montaj kesmeleri için). */
const kelime = (k, i) => (ses ? ses.cumleler[k].kelimeler[i][1] + kay(k) : bas(k) + i * 0.4);

const GECIS = 0.35;
const pill = (metin, alt, sure) => [{ metin, ...(alt ? { alt } : {}), bas: -1, son: sure + 1, yer: "ust" }];
const montaj = (n, yer) => pill(`${n.toLocaleString("en-US")} ${n === 1 ? "resident" : "residents"}`, yer, 9);
// Çekim listesi: [başlangıç zamanı, çekim]. Süre bir sonrakinin başlangıcından hesaplanır (geçiş payıyla).
const kesimler = [
  // 0–1: denizden bomboş adaya alçalış (imza). Altında feribot iskelesi ve kumsal.
  [0, { adres: "saat=09:40&hiz=6&nufus=0", kamera: (s) => [[0, 520, 230, 980, 60, 0, -40], [s, 330, 95, 560, 40, 0, -60]],
    yazilar: (s) => pill("Population: 0", null, s) }],
  // 2: yanaşmış feribot, deniz seviyesinden.
  [bas(2) - 0.15, { adres: "saat=08:24&hiz=4&nufus=0", kamera: (s) => [[0, 268, 6, 268, 222, 4, 214], [s, 262, 5.5, 256, 220, 4, 212]] }],
  // 3: montaj başı, 5 sakin: Green'in bankları ve çardak.
  [bas(3) - 0.15, { adres: "saat=10:40&hiz=4&nufus=5", isinma: 40, kamera: (s) => [[0, 46, 26, 58, 0, 2, 0], [s, 36, 22, 50, 0, 2, 0]],
    yazilar: () => montaj(5, "Town Green") }],
  // 4: kelimelere oturan kesmeler: diner, church, school, Ferris wheel (dönme dolap alacakaranlıkta ışıklı).
  [kelime(4, 0) - 0.1, { adres: "saat=11:20&hiz=4&nufus=10", isinma: 40, kamera: (s) => [[0, 192, 10, 24, 164, 5, 72], [s, 184, 9, 30, 164, 5, 72]],
    yazilar: () => montaj(10, "Driftwood Diner") }],
  [kelime(4, 2) - 0.1, { adres: "saat=11:40&hiz=4&nufus=50", isinma: 40, kamera: (s) => [[0, 22, 30, -16, 0, 12, -84], [s, 14, 28, -20, 0, 12, -84]],
    yazilar: () => montaj(50, "The white church") }],
  [kelime(4, 4) - 0.1, { adres: "saat=08:05&hiz=4&nufus=120", isinma: 50, kamera: (s) => [[0, 2, 20, -812, -40, 4, -868], [s, -6, 18, -818, -40, 4, -868]],
    yazilar: () => montaj(120, "Elementary school") }],
  [kelime(4, 6) - 0.1, { adres: "saat=17:50&hiz=4&nufus=250", isinma: 50, kamera: (s) => [[0, 505, 28, -1830, 430, 20, -1873], [s, 498, 26, -1840, 430, 20, -1873]],
    yazilar: () => montaj(250, "The Ferris wheel") }],
  // 5: 3.000 sakinli ada, ikindi güneşi, denizden yüksek uçuş.
  [bas(5) - 0.15, { adres: "saat=15:50&hiz=4&gelisim=3000&nufus=3000", isinma: 90, kamera: (s) => [[0, 400, 150, 430, 0, 0, -180], [s, 320, 125, 360, 0, 0, -180]],
    yazilar: () => montaj(3000, null) }],
  // 6: fener, gün batımı, uzaktan; 7: tepesi yakından (vuruş).
  [bas(6) - 0.15, { adres: "saat=16:30&hiz=4&nufus=8", kamera: (s) => [[0, -1130, 34, 1125, -1222, 12, 1032], [s, -1142, 30, 1112, -1222, 12, 1032]] }],
  [bas(7) - 0.15, { adres: "saat=16:32&hiz=4&nufus=8", kamera: (s) => [[0, -1206, 24, 1052, -1222, 19, 1032], [s, -1210, 25, 1056, -1222, 19, 1032]] }],
  // 8: ilk adres, ilk sakin gelince dikilen cottage (önizleme: nufus=1).
  [bas(8) - 0.15, { adres: "saat=10:20&hiz=4&nufus=1", kamera: (s) => [[0, -52, 13, -556, -86, 4, -578], [s, -58, 11, -566, -86, 4, -578]],
    yazilar: (s) => pill("1 Shell Street", "Shell Point", s) }],
  // 9: boş Green, sabah.
  [bas(9) - 0.15, { adres: "saat=08:50&hiz=2&nufus=0", kamera: (s) => [[0, 32, 7, 36, 0, 4, 0], [s, 26, 6.5, 30, 0, 4, 0]] }],
  // 10: dolu adada bir sakin yakından, adının yerinde "@you".
  [bas(10) - 0.15, { adres: "saat=15:40&hiz=2&gelisim=3000&nufus=3000", isinma: 90,
    takip: { yakin: true, yalniz: true, x: 0, z: 70, ad: "you", uzaklik: 5.2, aci: 0.8, yukseklik: 1.7, bak: 0.75,
      secim: { sac: [2, 4, 7], ust: ["#b8423c", "#d9a441", "#3e8a86", "#d98ca0", "#8fb6d9"], sakal: false, gozluk: false,
        sacRenk: ["#3b2a20", "#5e4128", "#8c5a32"] } } }],
  // 11: kapanış: bomboş ada yüksekten, çağrı.
  [bas(11) - 0.15, { adres: "saat=09:40&hiz=6&nufus=0", kamera: (s) => [[0, 380, 260, 760, 0, 0, -120], [s, 440, 330, 860, 0, 0, -140]],
    yazilar: (s) => [{ metin: "Be the first<br>resident.", alt: "Follow on TikTok<br><small>@driftwoodlive</small>", bas: 0.2, son: s, yer: "ust" }] }],
];
const bitis = son(SESLENDIRME.length - 1) + 1.4;
const cekimler = kesimler.map(([t0, c], i) => {
  const t1 = i < kesimler.length - 1 ? kesimler[i + 1][0] : bitis;
  const sure = +(t1 - Math.max(0, t0) + (i < kesimler.length - 1 ? GECIS : 0)).toFixed(3);
  const { kamera, yazilar, ...rest } = c;
  return { sure, ...rest, ...(kamera ? { kamera: kamera(sure) } : {}), ...(yazilar ? { yazilar: yazilar(sure) } : {}) };
});

export default {
  ad: AD,
  seslendirme: SESLENDIRME,
  aralar: ARALAR,
  muzik: "cikti/muzik/ada-1.mp3",
  fps: 30,
  w: 1080,
  h: 1920,
  gecis: GECIS,
  aciklama: `Nobody lives on this island yet 🏝️
Follow and you move in: your own house, job and day, live on the island.
Who moves in first? 👇 Pick your job: comment "job: fisherman" (or any job).
Find yourself: driftwood.rumpuskit.com

#driftwoodisland #cozygames #simulation #smalltown #islandlife`,
  cekimler,
};
