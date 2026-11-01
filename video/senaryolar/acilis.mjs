// 1. video (açılış, sesli): bomboş ada → iskele → büyüme montajı (gelişim tablosundan, kelimesi kelimesine)
// → fener (8. sakin fener bekçisi) → boş meydan ve iskele → bir sakin yakından → "ilk sakin sen ol".
// Çekim süreleri seslendirmenin kelime zamanlarına göre (cikti/01-acilis-sesli/ses.json); metin değişirse
// süreler de elden geçirilir. Fener (791, 178).
// Kamera noktaları: çarşı meydanı (0, 0), vapur iskelesi z 199-279, Yakamoz Mahallesi (0, -270).

// Seslendirme (anlatım standardı: kâtip tonu, kilit sayacı imzası, sabit istek kalıbı). Sayılar seste yazıyla,
// altyazıda rakamla. Olgular: 5'te meydan bankları, 8. sakin fener bekçisi (kadro), açılış sırası gelişim tablosu.
const SESLENDIRME = [
  { ses: "Bu adada kimse yaşamıyor." },
  { ses: "Meydan bankları için beş kişi lazım.", yazi: "Meydan bankları için\n5 kişi lazım." },
  { ses: "Takip eden adaya taşınıyor." },
  { ses: "Her yeni sakinle bir yer açılıyor.", yazi: "Her yeni sakinle\nbir yer açılıyor." },
  { ses: "Kahvehane, fırın, okul, liman." },
  { ses: "Sekizinci gelen fener bekçisi olacak.", yazi: "8. gelen\nfener bekçisi olacak." },
  { ses: "Kendisine sorulmayacak." },
  { ses: "İlk sakin henüz gelmedi." },
  { ses: "Sizce ilk kim taşınacak?" },
  { ses: "Mesleğini sen seç." },
  { ses: "Yorumuna yaz: meslek, balıkçı.", yazi: "Yorumuna yaz:\nmeslek: balıkçı" },
];

// Büyüme montajı: kamera bütün montaj boyunca tek bir yay üstünde süzülür; geçişler sayılan yerlere denk gelir
// ("kahvehane, fırın, okul, liman").
const STEPS = [
  [5, "Meydan bankları", 2.8],
  [10, "Kahvehane", 1.35],
  [30, "Driftwood Fırını", 1.1],
  [120, "Yakamoz İlkokulu", 0.85],
  [600, "Yük limanı", 1.1],
];
const MONTAJ = STEPS.reduce((a, s) => a + s[2] - 0.35, 0.35);
const arc = (u) => {
  const a = 0.62 + 0.32 * u, r = 360 - 50 * u, h = 250 - 40 * u;
  return [Math.sin(a) * r, h, -90 + Math.cos(a) * r, 0, 0, -110];
};
let montajT = 0;
const montage = STEPS.map(([n, yer, sure]) => {
  const u0 = montajT / MONTAJ, u1 = (montajT + sure) / MONTAJ;
  montajT += sure - 0.35;
  return {
    sure,
    adres: `saat=16:20&hiz=4&nufus=${n}`,
    isinma: n > 500 ? 90 : 40,
    kamera: [[0, ...arc(u0)], [sure, ...arc(u1)]],
    yazilar: [{ metin: `${n.toLocaleString("tr")} sakin`, alt: yer, bas: -1, son: sure + 1, yer: "ust" }],
  };
});

export default {
  ad: "01-acilis-sesli",
  seslendirme: SESLENDIRME,
  aralar: { 6: 0.3 }, // "Kendisine sorulmayacak." vuruşundan önce
  // ElevenLabs Music (30 Eki): hafif akustik gitar + marimba, 92 bpm, sözsüz. Dosya git dışında.
  muzik: "cikti/muzik/ada-1.mp3",
  fps: 30,
  w: 1080,
  h: 1920,
  gecis: 0.35,
  aciklama: `Bu adada kimse yaşamıyor. TikTok'ta takip eden herkes Driftwood'ya taşınıyor: kendi evi, mesleği ve kendi günüyle. Her yeni sakinle adada yeni bir yer açılıyor.
Mesleğini sen seç: yorumuna "meslek: balıkçı" gibi yaz. 🏝️

driftwood.rumpuskit.com

#driftwood #keşfet #ada #şehirkurma #simülasyon #oyun #3d`,
  cekimler: [
    {
      // 0–4,4: denizden bomboş adaya alçalan uçuş (imza: nüfus 0, sıradaki meydan bankları).
      sure: 4.75,
      adres: "saat=09:40&hiz=6",
      kamera: [
        [0, -150, 120, 420, 0, 0, 40],
        [4.75, -70, 62, 250, 0, 0, 10],
      ],
      yazilar: [{ metin: "Nüfus: 0", bas: 0.2, son: 4.75, yer: "ust" }],
    },
    {
      // "Takip eden adaya taşınıyor.": boş vapur iskelesi, vapur yanaşmış.
      sure: 2.2,
      adres: "saat=08:24&hiz=6",
      kamera: [
        [0, -40, 24, 186, 0, 2, 232],
        [2.2, -30, 18, 194, 1, 2, 235],
      ],
    },
    ...montage,
    {
      // "Sekizinci gelen fener bekçisi olacak.": fener, uzaktan.
      sure: 2.9,
      adres: "saat=17:40&hiz=4&nufus=8",
      kamera: [
        [0, 700, 45, 260, 791, 4, 178],
        [2.9, 715, 40, 250, 791, 4, 178],
      ],
    },
    {
      // "Kendisine sorulmayacak.": fenerin tepesi, yakından.
      sure: 2.3,
      adres: "saat=17:42&hiz=4&nufus=8",
      kamera: [
        [0, 812, 22, 205, 791, 18, 178],
        [2.3, 806, 24, 210, 791, 19, 178],
      ],
    },
    {
      // "İlk sakin henüz gelmedi.": bomboş meydan, çeşme ve gönder.
      sure: 2.4,
      adres: "saat=10:45&hiz=2",
      kamera: [
        [0, 26, 13, 30, 0, 5, -22],
        [2.4, 20, 10, 24, 0, 6, -24],
      ],
    },
    {
      // "Sizce ilk kim taşınacak?": iskele binası ve boş iskele, denizden.
      sure: 2.2,
      adres: "saat=08:26&hiz=2",
      kamera: [
        [0, -11, 6.5, 236, -22, 4, 184],
        [2.2, -13, 6, 228, -24, 4, 183],
      ],
    },
    {
      // "Mesleğini sen seç.": bir sakin yakından, adının yerinde "@sen" (dolu adanın bir günü).
      sure: 3.0,
      adres: "saat=17:45&hiz=2&nufus=3200",
      isinma: 90,
      takip: {
        yakin: true, x: 0, z: 30, ad: "sen", uzaklik: 5.2, aci: 0.8, yukseklik: 1.7, bak: 0.75,
        // Saç biçimi uzun, at kuyruğu ya da küt (kahküllü kısa saç uzaktan şapka gibi duruyor); saç kahve tonu
        // (siyah saç yüzle birleşip maske gibi görünüyor), canlı renkli üst, sakal/gözlük yok.
        secim: { sac: [2, 4, 7], ust: ["#b8423c", "#d9a441", "#3e8a86", "#d98ca0", "#8fb6d9"], sakal: false,
          gozluk: false, sacRenk: ["#3b2a20", "#5e4128", "#8c5a32"] },
      },
    },
    {
      // "Yorumuna yaz: meslek, balıkçı.": yeniden bomboş ada, yüksekten; çağrı.
      sure: 3.3,
      adres: "saat=09:40&hiz=6",
      kamera: [
        [0, 160, 180, 420, 0, 0, -60],
        [3.3, 200, 250, 500, 0, 0, -80],
      ],
      yazilar: [{ metin: "İlk sakin<br>sen ol.", alt: "TikTok'ta takip et<br><small>@driftwoodlive</small>", bas: 0.2, son: 3.3, yer: "ust" }],
    },
  ],
};
