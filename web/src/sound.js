// Ortam sesleri: tamamı tarayıcıda Web Audio ile üretilir (kayıt dosyası yok, telif sorunu yok).
// Dalga, rüzgâr, kalabalık uğultusu, çeşme, kuşlar, cırcır böcekleri, martılar, vapur düdüğü, trafik,
// tribün. Her biri kameranın yakın olduğu yere göre açılıp kısılır; genel seviye bilerek kısıktır.

function noiseBuffer(ctx, seconds, color = "white") {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "pink") {
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    } else if (color === "brown") {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    } else d[i] = w * 0.5;
  }
  return buf;
}

export class Ambience {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.master = 0.35;
  }

  /** Kullanıcı dokunuşuyla başlatılır (tarayıcılar sesi ancak böyle açar). */
  start() {
    if (this.ctx) {
      this.ctx.resume();
      this.enabled = true;
      return;
    }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.out = ctx.createGain();
    this.out.gain.value = this.master;
    // Yumuşak sıkıştırıcı: kalabalık, trafik ve tek seferlik sesler üst üste binince tepe yapmasın.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3;
    comp.attack.value = 0.02; comp.release.value = 0.3;
    this.out.connect(comp);
    comp.connect(ctx.destination);
    const loop = (buf, filters, gain0 = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      let node = src;
      for (const f of filters) { node.connect(f); node = f; }
      const g = ctx.createGain();
      g.gain.value = gain0;
      node.connect(g);
      g.connect(this.out);
      src.start();
      return g;
    };
    const lp = (f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = "lowpass"; b.frequency.value = f; b.Q.value = q; return b; };
    const hp = (f) => { const b = ctx.createBiquadFilter(); b.type = "highpass"; b.frequency.value = f; return b; };
    const bp = (f, q) => { const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = f; b.Q.value = q; return b; };
    const pink = noiseBuffer(ctx, 6, "pink"), brown = noiseBuffer(ctx, 6, "brown"), white = noiseBuffer(ctx, 4, "white");
    this.ch = {
      sea: loop(brown, [lp(520)]),
      seaWash: loop(pink, [hp(900), lp(3200)]),
      wind: loop(pink, [bp(420, 0.6)]),
      crowd: loop(pink, [bp(700, 1.4)]),
      crowd2: loop(pink, [bp(1500, 2.2)]),
      fountain: loop(white, [hp(1800), lp(7000)]),
      traffic: loop(brown, [lp(260)]),
    };
    this.next = { bird: 0, cricket: 0, gull: 0, horn: 0, cheer: 0 };
    this.enabled = true;
  }

  stop() {
    this.enabled = false;
    this.ctx?.suspend();
  }

  _set(name, v, t = 0.4) {
    const g = this.ch[name];
    if (g) g.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, t);
  }

  /** Kısa sentez sesleri. */
  _bird(vol) {
    const ctx = this.ctx, now = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < notes; k++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t0 = now + k * (0.09 + Math.random() * 0.06);
      const f0 = 2600 + Math.random() * 1800;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.7), t0 + 0.07);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol * 0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g); g.connect(this.out);
      o.start(t0); o.stop(t0 + 0.1);
    }
  }

  _cricket(vol) {
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), am = ctx.createOscillator(), amg = ctx.createGain();
    o.frequency.value = 4300 + Math.random() * 500;
    am.frequency.value = 28;
    amg.gain.value = vol * 0.012;
    am.connect(amg); amg.connect(g.gain);
    g.gain.value = 0;
    o.connect(g); g.connect(this.out);
    o.start(now); am.start(now);
    o.stop(now + 0.35); am.stop(now + 0.35);
  }

  _gull(vol) {
    const ctx = this.ctx, now = ctx.currentTime;
    for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth";
      const t0 = now + k * 0.32;
      o.frequency.setValueAtTime(1500, t0);
      o.frequency.exponentialRampToValueAtTime(900, t0 + 0.25);
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 3;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol * 0.03, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(f); f.connect(g); g.connect(this.out);
      o.start(t0); o.stop(t0 + 0.3);
    }
  }

  _horn(vol) {
    const ctx = this.ctx, now = ctx.currentTime;
    for (const [f, d] of [[110, 2.4], [165, 2.4]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lpf = ctx.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = f;
      lpf.type = "lowpass"; lpf.frequency.value = 600;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol * 0.06, now + 0.25);
      g.gain.setValueAtTime(vol * 0.06, now + d - 0.4);
      g.gain.linearRampToValueAtTime(0, now + d);
      o.connect(lpf); lpf.connect(g); g.connect(this.out);
      o.start(now); o.stop(now + d);
    }
  }

  _cheer(vol) {
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 2.5, "pink");
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol * 0.18, now + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(now);
  }

  /**
   * Her karede (seyrek) çağrılır. env: {dist (kamera-hedef), coast (hedefin kıyıya uzaklığı), people
   * (hedef çevresindeki insanlar, yakın olan ağır basar), fountain, harbor, nature (ağaçlık), traffic
   * (yakın araçlar, ağırlıklı), day (0-1), match (yakında canlı maç), minute}.
   */
  update(env) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const m = mixLevels(env, t);
    for (const [name, v] of Object.entries(m.ch)) this._set(name, v, name === "seaWash" ? 0.6 : 0.35);
    const { prox, ear } = m;
    const near = (d, r) => Math.max(0, 1 - d / r);
    const now = this.ctx.currentTime;
    if (now > this.next.bird && env.day > 0.5) {
      if (env.nature > 0 && Math.random() < 0.7) this._bird(env.nature * env.day * att(ear, 30));
      this.next.bird = now + 1.2 + Math.random() * 3.5;
    }
    if (now > this.next.cricket && env.day < 0.3) {
      if (env.nature > 0) this._cricket(env.nature * (1 - env.day) * att(ear, 30));
      this.next.cricket = now + 0.5 + Math.random() * 0.8;
    }
    if (now > this.next.gull && env.harbor < 220 && env.day > 0.3) {
      this._gull(att(Math.hypot(env.harbor, ear), 60));
      this.next.gull = now + 6 + Math.random() * 14;
    }
    // Vapur düdüğü: her yarım saatte bir, limana yakınsan.
    const slot = Math.floor(env.minute / 30);
    if (slot !== this.next.horn && env.minute % 30 < 0.6 && env.harbor < 600) {
      this.next.horn = slot;
      this._horn(near(env.harbor, 600) * (0.4 + 0.6 * prox));
    }
    if (env.match && now > this.next.cheer) {
      this._cheer(att(Math.hypot(env.match, ear), 50));
      this.next.cheer = now + 8 + Math.random() * 25;
    }
  }
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** Ters uzaklık yasası (ref metreye kadar tam ses): uzaklık iki katına çıkınca ses yarıya iner. */
const att = (d, ref) => ref / Math.max(ref, d);

/**
 * Sürekli seslerin düzeyleri (0-1). Kulak kameradadır: yakınlık logaritmik ölçülür (12 m sokak düzeyi = 1,
 * 600 m ada görünümü = 0), çünkü kulak sesi oranla duyar; 300 m'den 150 m'ye inmek, 24 m'den 12 m'ye inmek
 * kadar fark eder. Yerel kaynaklar (kalabalık, trafik, çeşme, kıyıya vuran dalga) kameraya uzaklıkla
 * ters orantılı söner; deniz ve rüzgâr her yükseklikte duyulan zemin sesidir (yükseldikçe rüzgâr artar).
 * Toplam bir bütçeyi aşarsa hepsi orantılı kısılır: yakına inmek sesi açar ama gürültüye boğmaz.
 */
export function mixLevels(env, t = 0) {
  const dist = Math.max(4, env.dist);
  const prox = clamp01((Math.log(600) - Math.log(dist)) / (Math.log(600) - Math.log(12)));
  const ear = dist * 0.75; // hedef yere yakın, kamera eğik: kulağın sahneye ortalama uzaklığı
  const ch = {};
  // Kalabalık doyar: 6 yakın kişiden sonra artış yavaşlar (pazar yeri ile meydan arasında fark kalır).
  const crowd = (1 - Math.exp(-env.people / 6)) * att(ear, 14);
  ch.crowd = crowd * 0.42;
  ch.crowd2 = crowd * 0.13 * (0.6 + 0.4 * Math.sin(t * 3.1));
  ch.traffic = (1 - Math.exp(-env.traffic / 3)) * att(ear, 20) * 0.32;
  ch.fountain = att(Math.hypot(env.fountain, ear), 9) * 0.2;
  const sea = att(Math.hypot(env.coast, ear * 0.6), 45);
  ch.sea = (0.07 + 0.05 * (1 - prox) + 0.42 * sea) * (0.85 + 0.15 * Math.sin(t * 0.8));
  ch.seaWash = att(Math.hypot(env.coast, ear), 22) * 0.28 * Math.max(0, Math.sin(t * 0.9)) ** 2;
  ch.wind = 0.03 + 0.08 * (1 - prox) ** 1.5;
  const total = Object.values(ch).reduce((a, b) => a + b, 0);
  const budget = 0.75;
  if (total > budget) for (const k in ch) ch[k] *= budget / total;
  return { ch, prox, ear };
}
