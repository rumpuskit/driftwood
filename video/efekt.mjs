// Ses efektleri (kayıt dosyası yok, telif yok): videoya karışacak kısa sesler burada sentezlenir ve WAV yazılır.
// (Mercanada'nın efekt.mjs'inden; Driftwood'da araç sireni Amerikan "wail".)
//   siren: hava ikaz sireni: iki rotorlu düz ton, açılışta devir alır, sonda devir düşer, uzaktan gelir (tepesi
//          yumuşak, kısa yankı). vapur: iki uzun feribot düdüğü (kalın, 110/165 Hz).
// Olay sesleri (16 Kasım, günün olayı): siren-arac (Amerikan wail, yaklaşıp geçer), carpisma (gümleme + ezilen sac +
//   cam kırığı), gok (gök gürültüsü: çatırtı + uzun gürleme), yagmur (yağmur yatağı, döngüye uygun), korna (iki kısa korna),
//   su (sıçrama + kabarcık), sisduduk (fenerin sis düdüğü), kalabalik (uğultu, anlaşılmaz konuşma). Hepsi tohumlu (aynı ad + süre → aynı dosya).
// gunluk.mjs hikâyedeki çekim "efekt" alanından kullanır; kaydet.mjs konuşmanın altına karıştırır.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SR = 44100;

function wav(path, samples) {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.89 / peak : 1; // tepe ≈ −1 dBFS; düzey kaydet.mjs'de ayarlanır
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * k)) * 32767), 44 + i * 2);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

/** Basit tek kutuplu alçak geçiren + kısa yankı. */
function yumusat(x, fc, yankiSn = 0.23, yankiK = 0.28) {
  const a = Math.exp((-2 * Math.PI * fc) / SR), out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; out[i] = y; }
  const d = Math.round(yankiSn * SR);
  for (let i = d; i < out.length; i++) out[i] += out[i - d] * yankiK;
  return out;
}

function siren(sure = 12) {
  const n = Math.round(sure * SR), x = new Float32Array(n);
  const up = 2.6, down = 3.5;
  const tonlar = [[415, 1], [622, 0.8]];
  const faz = tonlar.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Devir: açılışta 0,45'ten 1'e, sonda 1'den 0,5'e; hafif dalgalanma (rotor).
    const r = t < up ? 0.45 + 0.55 * Math.sin((t / up) * Math.PI / 2) : t > sure - down ? 1 - 0.5 * ((t - (sure - down)) / down) ** 1.5 : 1;
    const v = 1 + 0.012 * Math.sin(2 * Math.PI * 0.22 * t);
    const g = Math.min(1, t / 1.2) * Math.min(1, (sure - t) / 1.5);
    let s = 0;
    tonlar.forEach(([f, a], k) => {
      faz[k] += (2 * Math.PI * f * r * v) / SR;
      // Testere dalgası benzeri (ilk 6 harmonik).
      for (let h = 1; h <= 6; h++) s += (a / h) * Math.sin(faz[k] * h) * (h % 2 ? 1 : 0.6);
    });
    x[i] = s * g;
  }
  return yumusat(x, 2200);
}

function vapur(sure = 9) {
  const n = Math.round(sure * SR), x = new Float32Array(n);
  const cal = [[0.2, 3.8], [4.6, 8.6]];
  let f1 = 0, f2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const c = cal.find(([a, b]) => t >= a && t < b);
    if (!c) continue;
    const g = Math.min(1, (t - c[0]) / 0.25) * Math.min(1, (c[1] - t) / 0.4);
    f1 += (2 * Math.PI * 110) / SR; f2 += (2 * Math.PI * 165) / SR;
    let s = 0;
    for (let h = 1; h <= 8; h++) s += (Math.sin(f1 * h) + 0.8 * Math.sin(f2 * h)) / h;
    x[i] = s * g;
  }
  return yumusat(x, 700, 0.31, 0.35);
}

// --- olay sesleri ---
/** Tohumlu rastgele (mulberry32): aynı efekt her üretimde aynı. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** RBJ ikinci derece süzgeç (tur: "lp" | "hp" | "bp"), yerinde değil: yeni dizi. */
function suz(x, tur, f, q = 0.707) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, al = Math.sin(w) / (2 * q), cs = Math.cos(w);
  let b0, b1, b2;
  if (tur === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (tur === "hp") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al, y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const gurultu = (n, r) => Float32Array.from({ length: n }, () => r() * 2 - 1);
function kahve(n, r) { // kahverengi gürültü (gürleme için)
  const x = new Float32Array(n); let v = 0;
  for (let i = 0; i < n; i++) { v = (v + (r() * 2 - 1) * 0.02) * 0.998; x[i] = v; }
  return x;
}
const topla = (a, b, k = 1, ofs = 0) => { for (let i = 0; i < b.length && i + ofs < a.length; i++) a[i + ofs] += b[i] * k; return a; };

/** Amerikan "wail" sireni (polis/itfaiye): 700 ↔ 1500 Hz arası ~2,6 sn'lik yavaş süpürme; uzaktan yaklaşır, en yakında
 *  hafif Doppler, uzaklaşır. */
function sirenArac(sure = 6) {
  const n = Math.round(sure * SR), x = new Float32Array(n);
  let faz = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / sure;
    const dop = 1 + 0.03 * Math.tanh((0.65 - u) * 9);
    const sup = 0.5 - 0.5 * Math.cos((2 * Math.PI * (t + 0.4)) / 2.6); // 0→1→0
    const f = (700 + 800 * sup) * dop;
    faz += (2 * Math.PI * f) / SR;
    let s = 0;
    for (let h = 1; h <= 5; h += 2) s += Math.sin(faz * h) / (h * h); // yumuşak kare (elektronik siren)
    const g = Math.min(1, t / 0.08) * Math.min(1, (sure - t) / 0.4) * (0.35 + 0.65 * Math.exp(-(((u - 0.65) / 0.38) ** 2)));
    x[i] = s * g;
  }
  return yumusat(suz(x, "lp", 3600), 3600, 0.17, 0.18);
}

/** Çarpışma: alçak gümleme, ezilen sac (süzülmüş gürültü taneleri) ve dağılan cam (yüksek, tınılı kıvılcımlar). */
function carpisma(sure = 2.6) {
  const n = Math.round(sure * SR), r = rng(7), x = new Float32Array(n);
  // Gümleme: 70 → 38 Hz düşen sinüs, hızlı sönüm.
  let faz = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; faz += (2 * Math.PI * (38 + 32 * Math.exp(-t * 9))) / SR; x[i] += Math.sin(faz) * Math.exp(-t * 6) * 1.4; }
  // Darbe: geniş bant patlama (ilk 60 ms).
  const pat = suz(gurultu(Math.round(0.25 * SR), r), "lp", 2500);
  for (let i = 0; i < pat.length; i++) pat[i] *= Math.exp(-(i / SR) * 28);
  topla(x, pat, 1.6);
  // Sac: 0,6 sn boyunca yoğunluğu azalan, bant geçiren gürültü taneleri (gıcırtı ve ezilme).
  for (let k = 0; k < 40; k++) {
    const bas = Math.round(Math.pow(r(), 1.8) * 0.7 * SR), L = Math.round((0.02 + r() * 0.07) * SR);
    const g = suz(gurultu(L, r), "bp", 500 + r() * 1800, 3 + r() * 5);
    for (let i = 0; i < L; i++) g[i] *= Math.sin((Math.PI * i) / L) * (1 - bas / (0.8 * SR));
    topla(x, g, 0.9, bas);
  }
  // Cam: 3–9 kHz sönümlü tınılar, 0,03–1,2 sn arası saçılan (yere düşen kırıklar).
  for (let k = 0; k < 60; k++) {
    const bas = Math.round((0.03 + Math.pow(r(), 1.4) * 1.2) * SR), f = 3000 + r() * 6000, L = Math.round(0.12 * SR), a = 0.15 + r() * 0.35;
    const g = new Float32Array(L);
    for (let i = 0; i < L; i++) g[i] = Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-(i / SR) * (30 + r() * 30)) * a;
    topla(x, g, k < 15 ? 0.9 : 0.5, bas);
  }
  const t1 = suz(gurultu(Math.round(0.4 * SR), r), "hp", 4000);
  for (let i = 0; i < t1.length; i++) t1[i] *= Math.exp(-(i / SR) * 9) * 0.5;
  topla(x, t1, 1, Math.round(0.02 * SR));
  return yumusat(x, 9000, 0.09, 0.15);
}

/** Gök gürültüsü: yakın çatırtı, ardından yavaş dalgalanan uzun gürleme. */
function gok(sure = 6) {
  const n = Math.round(sure * SR), r = rng(11), x = new Float32Array(n);
  const cat = suz(gurultu(Math.round(0.5 * SR), r), "hp", 600);
  for (let i = 0; i < cat.length; i++) { const t = i / SR; cat[i] *= Math.exp(-t * 7) * (0.6 + 0.4 * Math.sin(t * 180) ** 2); }
  topla(x, cat, 0.9, Math.round(0.05 * SR));
  const gr = suz(suz(kahve(n, r), "lp", 160), "hp", 25);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const zarf = Math.min(1, t / 0.15) * Math.exp(-t / (sure * 0.42)) * (0.7 + 0.3 * Math.sin(t * 5.3) * Math.sin(t * 2.1 + 1));
    x[i] += gr[i] * zarf * 9;
  }
  return yumusat(x, 1800, 0.37, 0.25);
}

/** Yağmur yatağı: yumuşak geniş bant hışırtı + damla tıkırtıları; baş ve son yumuşak (art arda döngüye uygun). */
function yagmur(sure = 8) {
  const n = Math.round(sure * SR), r = rng(5);
  const x = suz(suz(gurultu(n, r), "lp", 5500), "hp", 300);
  for (let i = 0; i < n; i++) x[i] *= 0.35 * (1 + 0.15 * Math.sin((i / SR) * 0.9));
  for (let k = 0; k < sure * 90; k++) {
    const bas = Math.floor(r() * (n - 2000)), f = 1500 + r() * 4500, L = 600;
    for (let i = 0; i < L; i++) x[bas + i] += Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / 90) * (0.2 + r() * 0.4);
  }
  const k = Math.round(0.5 * SR);
  for (let i = 0; i < k; i++) { x[i] *= i / k; x[n - 1 - i] *= i / k; }
  return x;
}

/** Sis düdüğü (fener diyafonu, Driftwood sisi): uzaktan gelen kalın "buuu-uh": 2,4 sn 155 Hz, sonda 105 Hz'e düşen
 *  homurtu; ikinci, daha uzak yankı. */
function sisduduk(sure = 6) {
  const n = Math.round(sure * SR), x = new Float32Array(n);
  let faz = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (t > 3.0) break;
    const f = t < 2.3 ? 155 : 155 - 50 * Math.min(1, (t - 2.3) / 0.35);
    faz += (2 * Math.PI * f) / SR;
    const g = Math.min(1, t / 0.18) * (t < 2.3 ? 1 : Math.max(0, 1 - (t - 2.3) / 0.7));
    let s = 0;
    for (let h = 1; h <= 10; h++) s += Math.sin(faz * h) / (h ** 1.15);
    x[i] = Math.tanh(s * 0.9) * g;
  }
  return yumusat(suz(x, "lp", 900), 900, 0.42, 0.42);
}

/** Korna: iki kısa araba kornası (iki ses, 415 + 520 Hz). */
function korna(sure = 1.4) {
  const n = Math.round(sure * SR), x = new Float32Array(n), cal = [[0.02, 0.32], [0.45, 1.05]];
  let f1 = 0, f2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, c = cal.find(([a, b]) => t >= a && t < b);
    if (!c) continue;
    f1 += (2 * Math.PI * 415) / SR; f2 += (2 * Math.PI * 520) / SR;
    const g = Math.min(1, (t - c[0]) / 0.01) * Math.min(1, (c[1] - t) / 0.02);
    let s = 0;
    for (let h = 1; h <= 9; h += 2) s += (Math.sin(f1 * h) + Math.sin(f2 * h)) / h;
    x[i] = Math.tanh(s * 1.5) * g;
  }
  return yumusat(suz(x, "bp", 900, 0.8), 4000, 0.12, 0.15);
}

/** Su sıçraması: sert çarpma (süzgeci düşen gürültü), ardından kabarcıklar (yükselen kısa sinüsler). */
function su(sure = 2.2) {
  const n = Math.round(sure * SR), r = rng(3), x = new Float32Array(n);
  const g = gurultu(Math.round(0.9 * SR), r);
  let y = 0;
  for (let i = 0; i < g.length; i++) {
    const t = i / SR, fc = 6000 * Math.exp(-t * 4) + 300, a = Math.exp((-2 * Math.PI * fc) / SR);
    y = (1 - a) * g[i] + a * y;
    x[i] += y * Math.min(1, t / 0.008) * Math.exp(-t * 5) * 2.2;
  }
  for (let k = 0; k < 26; k++) {
    const bas = Math.round((0.15 + r() * 1.4) * SR), L = Math.round((0.03 + r() * 0.05) * SR), f0 = 500 + r() * 900;
    let faz = 0;
    for (let i = 0; i < L && bas + i < n; i++) { faz += (2 * Math.PI * f0 * (1 + (i / L) * 1.2)) / SR; x[bas + i] += Math.sin(faz) * Math.sin((Math.PI * i) / L) * 0.25 * (1 - bas / n); }
  }
  return yumusat(x, 7000, 0.11, 0.12);
}

/** Kalabalık uğultusu: ses bandında, hece hızında dalgalanan ~14 "konuşmacı" (anlaşılmaz), alçak geçirgen. */
function kalabalik(sure = 6) {
  const n = Math.round(sure * SR), r = rng(9), x = new Float32Array(n);
  for (let k = 0; k < 14; k++) {
    const f = 350 + r() * 900, hece = 3 + r() * 3, ph = r() * 10, hiz = 0.4 + r() * 0.3, g = suz(gurultu(n, r), "bp", f, 4);
    const g2 = suz(gurultu(n, r), "bp", f * 2.3, 6);
    for (let i = 0; i < n; i++) {
      const t = i / SR, m = Math.max(0, Math.sin(2 * Math.PI * hece * t + ph + Math.sin(t * 1.3 + k) * 2)) ** 2;
      const konus = 0.5 + 0.5 * Math.sin(t * hiz + k * 1.7); // arada susar
      x[i] += (g[i] + g2[i] * 0.5) * m * konus;
    }
  }
  const k = Math.round(0.6 * SR);
  for (let i = 0; i < k; i++) { x[i] *= i / k; x[n - 1 - i] *= i / k; }
  return yumusat(suz(x, "lp", 2600), 2600, 0.19, 0.2);
}

const EFEKT = { siren, vapur, sisduduk, "siren-arac": sirenArac, carpisma, gok, yagmur, korna, su, kalabalik };
/** Konuşmaya göre önerilen düzey (dB; gunluk.mjs varsayılanı, hikâyede "ses" ile değişir). */
export const EFEKT_SES = { siren: -9, vapur: -11, sisduduk: -13, "siren-arac": -14, carpisma: -5, gok: -7, yagmur: -17, korna: -13, su: -11, kalabalik: -19 };
export const EFEKTLER = Object.keys(EFEKT);

/** Efekti (yoksa) yazar ve dosya yolunu döner. */
export function efekt(ad, klasor, sure) {
  if (!EFEKT[ad]) throw new Error(`bilinmeyen efekt: ${ad} (${EFEKTLER.join(", ")})`);
  const yol = `${klasor}/${ad}${sure ? "-" + sure : ""}.wav`;
  if (!existsSync(yol)) wav(yol, EFEKT[ad](sure));
  return yol;
}
