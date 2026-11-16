// Ortam sesleri: tamamı tarayıcıda Web Audio ile üretilir (kayıt dosyası yok, telif sorunu yok).
// Dalga, rüzgâr, kalabalık uğultusu, çeşme, kuşlar, cırcır böcekleri, martılar, vapur düdüğü, trafik,
// tribün. Her biri kameranın yakın olduğu yere göre açılıp kısılır; genel seviye bilerek kısıktır.

// Günün olayı (16 Kasım, env.olay = olay.ses()): yağmur, gök gürültüsü, fırtına rüzgârı, sis düdüğü, siren, çarpışma, korna, kalabalık.
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
    this.next = { bird: 0, cricket: 0, gull: 0, horn: 0, cheer: 0, sis: 0, korna: 0 };
    this._loop = loop; this._lp = lp; this._hp = hp; this._bp = bp;
    this._white = white; this._brown = brown;
    this.olayIz = { simsekNo: null, carpisma: null };
    this.enabled = true;
  }

  /** Olay kanalları ilk gerektiğinde kurulur (olay yokken fazladan düğüm çalışmaz). */
  _olayKanal(name) {
    if (this.ch[name]) return;
    const { _loop: loop, _lp: lp, _hp: hp, _bp: bp } = this;
    if (name === "yagmur") this.ch.yagmur = loop(this._white, [hp(450), lp(5200)]);
    else if (name === "yagmurAlt") this.ch.yagmurAlt = loop(this._brown, [lp(700)]);
    else if (name === "kalabalikOlay") this.ch.kalabalikOlay = loop(noiseBuffer(this.ctx, 5, "pink"), [bp(560, 1.1)]);
    else if (name === "siren") {
      // İki tonlu (hi-lo) Avrupa sireni: 440/585 Hz, her ton ~0,65 sn; kare LFO frekansı iki değer arasında atlatır.
      const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = "square"; o2.type = "triangle";
      o.frequency.value = o2.frequency.value = 512;
      lfo.type = "square"; lfo.frequency.value = 0.77; lg.gain.value = 72;
      lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      const f = lp(2600), mix2 = ctx.createGain(), g = ctx.createGain();
      mix2.gain.value = 0.35; g.gain.value = 0;
      o.connect(f); o2.connect(mix2); mix2.connect(f); f.connect(g); g.connect(this.out);
      o.start(); o2.start(); lfo.start();
      this.ch.siren = g;
    }
  }

  /** Gök gürültüsü: uzaklık kadar gecikmeyle (ses hızı, 0,5–3 sn); yakında sert çatırtı, ardından uzun gümbürtü. */
  _gokGurultu(mesafe = 800) {
    const ctx = this.ctx, gec = Math.min(3, Math.max(0.5, mesafe / 343)), t0 = ctx.currentTime + gec;
    const yakin = Math.max(0, 1 - mesafe / 1400), v = 0.35 + 0.65 * Math.max(0, 1 - mesafe / 2200);
    if (yakin > 0.15) {
      const c = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      c.buffer = this._white; f.type = "highpass"; f.frequency.value = 1200;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.5 * yakin * v, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      c.connect(f); f.connect(g); g.connect(this.out);
      c.start(t0, Math.random() * 2); c.stop(t0 + 0.4);
    }
    const r = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), sure = 3.5 + Math.random() * 2.5;
    r.buffer = this._brown; f.type = "lowpass"; f.frequency.value = 260 + 300 * yakin; f.Q.value = 0.9;
    f.frequency.setValueAtTime(f.frequency.value, t0);
    f.frequency.exponentialRampToValueAtTime(120, t0 + sure);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.9 * v, t0 + 0.06 + 0.25 * (1 - yakin));
    // Yuvarlanan gümbürtü: art arda birkaç kabarma.
    let t = t0 + 0.3;
    while (t < t0 + sure - 0.6) {
      const a = (0.25 + 0.6 * Math.random()) * v * (1 - (t - t0) / sure);
      g.gain.setTargetAtTime(a, t, 0.12);
      t += 0.35 + Math.random() * 0.7;
    }
    g.gain.setTargetAtTime(0, t0 + sure - 0.6, 0.35);
    r.connect(f); f.connect(g); g.connect(this.out);
    r.start(t0, Math.random() * 3); r.stop(t0 + sure + 1.5);
  }

  /** Sis düdüğü (diyafon): kalın, ~2,5 sn, sonunda perdesi düşen "hööö-ımm". */
  _sisDudugu(v) {
    const ctx = this.ctx, now = ctx.currentTime, d = 2.6;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.frequency.value = 520; f.Q.value = 1.2;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(v * 0.16, now + 0.35);
    g.gain.setValueAtTime(v * 0.16, now + d - 0.5);
    g.gain.linearRampToValueAtTime(v * 0.1, now + d - 0.2);
    g.gain.linearRampToValueAtTime(0, now + d + 0.3);
    for (const [fr, tip, a] of [[150, "sawtooth", 0.6], [75, "sine", 1], [300, "triangle", 0.18]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = tip;
      o.frequency.setValueAtTime(fr * 0.94, now);
      o.frequency.linearRampToValueAtTime(fr, now + 0.3);
      o.frequency.setValueAtTime(fr, now + d - 0.45);
      o.frequency.exponentialRampToValueAtTime(fr * 0.68, now + d + 0.2);
      og.gain.value = a;
      o.connect(og); og.connect(f);
      o.start(now); o.stop(now + d + 0.4);
    }
    // Sisin içinde yankı: kısa gecikmeli, kısık kopya.
    const yank = ctx.createDelay(1), yg = ctx.createGain();
    yank.delayTime.value = 0.6; yg.gain.value = 0.3;
    f.connect(g); g.connect(this.out); g.connect(yank); yank.connect(yg); yg.connect(this.out);
  }

  /** Araba kornası: iki tonlu kısa bip (bazen iki kez). */
  _korna(v) {
    const ctx = this.ctx, now = ctx.currentTime;
    const fr = 380 + Math.random() * 120, kez = Math.random() < 0.35 ? 2 : 1, d = 0.12 + Math.random() * 0.35;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = 0.7;
    g.gain.value = 0;
    for (let k = 0; k < kez; k++) {
      const t = now + k * (d + 0.09);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.07, t + 0.015);
      g.gain.setValueAtTime(v * 0.07, t + d);
      g.gain.linearRampToValueAtTime(0, t + d + 0.03);
    }
    const son = now + kez * (d + 0.09) + 0.1;
    for (const m of [1, 1.26]) {
      const o = ctx.createOscillator();
      o.type = "square"; o.frequency.value = fr * m;
      o.connect(f); o.start(now); o.stop(son);
    }
    f.connect(g); g.connect(this.out);
  }

  /** Çarpışma: gövde gümbürtüsü, sac ezilmesi, metal sürtünmesi ve dağılan cam. */
  _carpisma(v = 1) {
    const ctx = this.ctx, now = ctx.currentTime;
    const gum = ctx.createOscillator(), gg = ctx.createGain();
    gum.frequency.setValueAtTime(90, now);
    gum.frequency.exponentialRampToValueAtTime(38, now + 0.35);
    gg.gain.setValueAtTime(0.55 * v, now);
    gg.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    gum.connect(gg); gg.connect(this.out); gum.start(now); gum.stop(now + 0.45);
    const gurul = (f0, q, a, d, t = now) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this._white; f.type = "bandpass"; f.frequency.value = f0; f.Q.value = q;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a * v, t + 0.008);
      // Düzensiz sönüş: ezilen sac çatırdar.
      for (let k = 1; k < 7; k++) g.gain.setValueAtTime(a * v * (1 - k / 7) * (0.4 + 0.6 * Math.random()), t + (k * d) / 7);
      g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(f); f.connect(g); g.connect(this.out);
      s.start(t, Math.random() * 3); s.stop(t + d + 0.05);
    };
    gurul(850, 0.9, 0.5, 0.55);
    gurul(2400, 5, 0.18, 0.45, now + 0.05);
    gurul(5200, 1.5, 0.22, 0.25, now + 0.02);
    // Cam kırıkları: dağılan yüksek, kısa çınlamalar.
    const n = 9 + Math.floor(Math.random() * 7);
    for (let k = 0; k < n; k++) {
      const t = now + 0.04 + Math.random() * 0.7, o = ctx.createOscillator(), g = ctx.createGain(), d = 0.04 + Math.random() * 0.12;
      o.type = Math.random() < 0.5 ? "sine" : "triangle";
      o.frequency.value = 2800 + Math.random() * 5200;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06 * v * (1 - (t - now) / 0.9), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + d + 0.02);
    }
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
    // Günün olayı: hava ve kaza sesleri (alan yoksa 0).
    const o = env.olay ?? {};
    const yag = o.yagmur || 0, sis = o.sis || 0, ruz = Math.max(o.ruzgar || 0, yag * 0.6), kal = o.kalabalik || 0;
    m.ch.wind += ruz * (0.16 + 0.1 * (1 - m.prox));
    if (kal > 0) { m.ch.crowd += kal * 0.12; this._olayKanal("kalabalikOlay"); }
    if (this.ch.kalabalikOlay) m.ch.kalabalikOlay = kal * 0.55 * (0.4 + 0.6 * m.prox);
    if (yag > 0) { this._olayKanal("yagmur"); this._olayKanal("yagmurAlt"); }
    if (this.ch.yagmur) { m.ch.yagmur = yag * (0.2 + 0.14 * m.prox); m.ch.yagmurAlt = yag * 0.16; }
    if (yag > 0.2) { m.ch.crowd *= 1 - 0.6 * yag; m.ch.crowd2 *= 1 - 0.6 * yag; m.ch.fountain *= 1 - 0.5 * yag; }
    if ((o.siren || 0) > 0) this._olayKanal("siren");
    if (this.ch.siren) m.ch.siren = (o.siren || 0) * 0.08;
    for (const [name, v] of Object.entries(m.ch)) this._set(name, v, name === "seaWash" ? 0.6 : name === "siren" ? 0.15 : 0.35);
    const iz = this.olayIz;
    if (o.simsekNo != null && iz.simsekNo != null && o.simsekNo > iz.simsekNo) this._gokGurultu(o.simsekMesafe);
    iz.simsekNo = o.simsekNo ?? null;
    if (o.carpisma != null && iz.carpisma != null && o.carpisma > iz.carpisma) this._carpisma(1);
    iz.carpisma = o.carpisma ?? null;
    const { prox, ear } = m;
    const near = (d, r) => Math.max(0, 1 - d / r);
    const now = this.ctx.currentTime;
    if (sis > 0.35 && now > this.next.sis) {
      // Sis düdüğü (fener/vapur): ~40 sn'de bir; ilk duyuluşta hemen değil, birkaç saniye sonra.
      if (this.next.sis) this._sisDudugu(Math.min(1, sis) * (0.5 + 0.5 * (1 - m.prox)));
      this.next.sis = now + (this.next.sis ? 37 + Math.random() * 7 : 3 + Math.random() * 4);
    } else if (sis <= 0.35) this.next.sis = 0;
    const korna = o.korna || 0;
    if (korna > 0 && now > this.next.korna) {
      this._korna(Math.min(1, korna) * (0.4 + 0.6 * m.prox));
      this.next.korna = now + (0.25 + Math.random() * 2.2) / Math.max(0.15, korna);
    }
    const sakin = yag < 0.3; // sağanakta kuşlar ve martılar susar
    if (now > this.next.bird && env.day > 0.5 && sakin) {
      if (env.nature > 0 && Math.random() < 0.7) this._bird(env.nature * env.day * att(ear, 30));
      this.next.bird = now + 1.2 + Math.random() * 3.5;
    }
    if (now > this.next.cricket && env.day < 0.3) {
      if (env.nature > 0) this._cricket(env.nature * (1 - env.day) * att(ear, 30));
      this.next.cricket = now + 0.5 + Math.random() * 0.8;
    }
    if (now > this.next.gull && env.harbor < 220 && env.day > 0.3 && sakin) {
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
