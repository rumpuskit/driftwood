// Gökyüzü ve gün döngüsü: güneş ve ay, adanın enlemine (New England kıyısı, ~41,3° K) göre takvim gününden ve
// saatten hesaplanır. Gün doğumu/batımı mevsimle değişir; altın saat, alacakaranlık, yıldızlar ve ay evresi.
import * as THREE from "three";
import * as P from "./palette.js";
import { tzOffset } from "../sim.js";

const LAT = 41.3 * (Math.PI / 180);
const LON = -70.1; // derece, doğu (batı eksi)
const rad = Math.PI / 180;

/** Günün saat farkı (saat; ABD Doğu, yaz saatli): öğlenki fark, geçiş gecesinin saatleri güneşi etkilemez. */
const tzCache = new Map();
function TZ(day) {
  let v = tzCache.get(day);
  if (v === undefined) {
    v = tzOffset(day * 86400 + 17 * 3600) / 3600;
    if (tzCache.size > 64) tzCache.clear();
    tzCache.set(day, v);
  }
  return v;
}

/** Güneşin yüksekliği ve yönü (radyan). day: 1970'ten beri gün (yerel), minute: yerel dakika. */
export function sunPosition(day, minute) {
  const jd = day + 2440587.5 + (minute / 60 - TZ(day)) / 24;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = ((gmst * 15 + LON) * rad - ra);
  const el = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(LAT) - Math.sin(LAT) * Math.cos(ha));
  return { el, az };
}

/** Yükseklik ve yönden sahne yönüne: kuzey -z, doğu +x. */
function toDir(el, az, out = new THREE.Vector3()) {
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
}

/** O günün gün doğumu ve batımı (yerel dakika). */
export function sunTimes(day) {
  let rise = null, set = null, prev = sunPosition(day, 0).el;
  for (let m = 2; m <= 1440; m += 2) {
    const el = sunPosition(day, m).el;
    const h = -0.833 * rad;
    if (prev < h && el >= h) rise = m;
    if (prev >= h && el < h) set = m;
    prev = el;
  }
  return { rise, set };
}

/** Ay evresi (0 yeni ay, 0,5 dolunay). */
export function moonPhase(day, minute) {
  const jd = day + 2440587.5 + (minute / 60 - TZ(day)) / 24;
  const p = ((jd - 2451550.1) / 29.530588853) % 1;
  return p < 0 ? p + 1 : p;
}

export function createSky(scene) {
  const uniforms = {
    top: { value: P.SKY.day.top.clone() },
    horizon: { value: P.SKY.day.horizon.clone() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
    glow: { value: new THREE.Color("#fff1d6") },
    night: { value: 0 },
    phase: { value: 0.5 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(15000, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          // Gök kubbesi sonsuz uzakta: yalnızca bakış yönü kullanılır ve hep en arka derinlikte çizilir
          // (yakın bakışta uzak düzlem kısa olsa da gök kırpılıp siyah kalmaz).
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 moonDir; uniform vec3 glow;
        uniform float night; uniform float phase;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 col = mix(horizon, top, pow(h, 0.5));
          float sun = max(dot(vDir, sunDir), 0.0);
          col += glow * (pow(sun, 6.0) * 0.32 + pow(sun, 900.0) * 1.6);
          // Yıldızlar: gece, ufkun üstünde.
          vec3 cell = floor(vDir * 420.0);
          float star = step(0.9965, hash(cell)) * smoothstep(0.02, 0.25, vDir.y) * night;
          col += vec3(star) * (0.6 + 0.4 * hash(cell + 3.1));
          // Ay: evreye göre parlak disk.
          float m = dot(vDir, moonDir);
          float disc = smoothstep(0.99955, 0.99965, m) * (0.25 + 0.75 * (1.0 - abs(phase - 0.5) * 2.0));
          col += vec3(0.95, 0.94, 0.88) * disc * (0.4 + 0.6 * night) + vec3(0.25, 0.28, 0.36) * pow(max(m, 0.0), 80.0) * night * 0.6;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight("#dff1ff", "#c9b99a", 1.4);
  const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
  sun.castShadow = true;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 1.2;
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(P.SKY.day.horizon.clone(), 1600, 6000);

  const c1 = new THREE.Color(), c2 = new THREE.Color();
  const dir = new THREE.Vector3(), mdir = new THREE.Vector3();
  const GOLD = new THREE.Color("#ffb37a"), DAYSUN = new THREE.Color("#fff4e0"), MOON = new THREE.Color("#9fb4ff");
  const DUSK_TOP = new THREE.Color("#4a4f9a"), DUSK_HOR = new THREE.Color("#f39a6b");
  let timesDay = null, times = null;
  return {
    dome, sun, hemi,
    /** Gün ve dakikaya göre gökyüzü ve ışıklar. Döner: aydınlık (0 gece - 1 gündüz) ve güneş yüksekliği. */
    update(day, minute, focus) {
      const { el, az } = sunPosition(day, minute);
      const deg = el / rad;
      // Aydınlık: -12° (deniz alacakaranlığı) ile +8° arası yumuşak geçiş.
      const light = THREE.MathUtils.smoothstep(deg, -10, 8);
      // Altın saat ve alacakaranlık: güneş ufka yakınken.
      const golden = Math.exp(-(((deg - 2) / 6) ** 2));
      const twilight = Math.exp(-(((deg + 4) / 4) ** 2));
      toDir(el, az, dir);
      uniforms.sunDir.value.copy(dir);

      c1.copy(P.SKY.night.top).lerp(P.SKY.day.top, light).lerp(DUSK_TOP, twilight * 0.55).lerp(P.SKY.sunset.top, golden * 0.35 * light);
      c2.copy(P.SKY.night.horizon).lerp(P.SKY.day.horizon, light).lerp(DUSK_HOR, Math.max(golden * 0.8, twilight * 0.6));
      uniforms.top.value.copy(c1);
      uniforms.horizon.value.copy(c2);
      uniforms.glow.value.copy(GOLD).lerp(new THREE.Color("#fff1d6"), THREE.MathUtils.smoothstep(deg, 0, 20)).multiplyScalar(THREE.MathUtils.smoothstep(deg, -4, 2));
      uniforms.night.value = 1 - THREE.MathUtils.smoothstep(deg, -14, -4);
      scene.fog.color.copy(c2);

      // Ay: güneşe göre evre açısı kadar geride, benzer yörüngede.
      const phase = moonPhase(day, minute);
      uniforms.phase.value = phase;
      const mpos = sunPosition(day, minute - phase * 1440 * 1.0 + 0);
      toDir(mpos.el, mpos.az, mdir);
      uniforms.moonDir.value.copy(mdir);
      const moonUp = mpos.el > 0;
      const moonLight = (moonUp ? 0.35 : 0.12) + 0.5 * (1 - Math.abs(phase - 0.5) * 2) * (moonUp ? 1 : 0);

      const useMoon = deg < -4;
      const lightDir = useMoon ? (moonUp ? mdir : mdir.set(-0.4, 0.8, 0.3).normalize()) : dir.clone().setY(Math.max(dir.y, 0.06)).normalize();
      sun.position.copy(focus).addScaledVector(lightDir, 1000);
      sun.target.position.copy(focus);
      if (useMoon) {
        sun.color.copy(MOON);
        sun.intensity = 0.35 + moonLight;
      } else {
        sun.color.copy(DAYSUN).lerp(GOLD, golden * 0.75);
        sun.intensity = 0.25 + 2.5 * THREE.MathUtils.smoothstep(deg, -2, 12);
      }
      hemi.intensity = 0.7 + 0.7 * light;
      hemi.color.set("#dff1ff").lerp(new THREE.Color("#8090cc"), 1 - light).lerp(new THREE.Color("#ffc9a0"), golden * 0.3 * light);
      hemi.groundColor.set("#c9b99a").lerp(new THREE.Color("#3a3f5e"), 1 - light);
      if (timesDay !== day) { timesDay = day; times = sunTimes(day); }
      return { light, sunDeg: deg, times };
    },
  };
}
