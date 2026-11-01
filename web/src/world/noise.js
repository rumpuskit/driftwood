// Dünya üretimi için deterministik gürültü. Simülasyon hash'ini kullanır; aynı girdi her cihazda aynı adayı verir.
import { combine, fnv1a } from "../sim.js";

const WORLD_SEED = fnv1a("driftwood-world");

/** (x, y) tam sayı noktasında 0-1 arası değer. */
export function hash2(x, y, salt = 0) {
  return combine(combine(combine(WORLD_SEED, salt), x | 0), y | 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Değer gürültüsü, -0.5..0.5. */
export function valueNoise(x, y, salt = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash2(x0, y0, salt), b = hash2(x0 + 1, y0, salt);
  const c = hash2(x0, y0 + 1, salt), d = hash2(x0 + 1, y0 + 1, salt);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy - 0.5;
}

/** Birkaç katmanlı gürültü, yaklaşık -0.5..0.5. */
export function fbm(x, y, salt = 0, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, salt + i) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Küçük, hızlı, tohumlu rastgele sayı üreteci (yerleşim ayrıntıları için). */
export function rng(seedText) {
  let s = fnv1a(seedText) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
