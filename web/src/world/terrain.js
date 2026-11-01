// Arazi (yumuşak gölgeli, çimen dokulu), su ve deniz tabanı.
import * as THREE from "three";
import { fbm } from "./noise.js";
import * as P from "./palette.js";
import { grassDetail } from "./textures.js";
import { quay } from "./island.js";

const tmp = new THREE.Color();

function terrainColor(world, x, z, h, ny) {
  if (h < -0.2) return tmp.copy(P.WET_SAND).lerp(P.SEABED, Math.min(1, -h / 7));
  const d = world.sdf(x, z);
  const coastal = d > world.margin(x, z) - 30;
  if (coastal && h < 1.0) return tmp.copy(P.SAND); // tesviye omzu (FLAT_Y − 0,12) çimen kalır
  if (ny < 0.62) return tmp.copy(P.ROCK);
  const v = fbm(x / 45, z / 45, 21) + 0.5;
  // Kumullar (dış kıyı): kum, üstünde kumul otu lekeleri.
  if (world.isDune?.(x, z)) {
    const grass = Math.min(1, Math.max(0, (fbm(x / 14, z / 9, 23) + 0.5) * 1.6 - 0.55));
    return tmp.copy(P.SAND).lerp(P.GRASS_DARK, grass * 0.45);
  }
  tmp.copy(P.GRASS).lerp(P.GRASS_DARK, Math.min(1, Math.max(0, v * 1.4 - 0.35)));
  if (h > 8) tmp.lerp(P.HILL, Math.min(1, (h - 8) / 20));
  return tmp;
}

/**
 * Arazi ağı, 64 m'lik karolar hâlinde ve yerel çözünürlükle: yol/meydan tesviyesi olan karolar 4 m, kıyı
 * karoları 8 m, gerisi 16 m (kıyıdan uzak derin deniz 32 m). Ada büyük (6,6 km): tek
 * düzgün ızgara ya çok kaba (yol ve patikaların içinden çim çıkıyordu) ya da telefona ağır olurdu.
 * Farklı çözünürlükteki komşu karolar dikişle birleşir (ince karonun kenarı kaba komşunun kenar doğrusuna oturur).
 * Normaller yükseklik farklarından hesaplanır (karo sınırında aynı adımlı komşular birebir aynı normali verir).
 */
export function buildTerrain(world) {
  const pad = 220, T = 64;
  const { x0, x1, z0, z1 } = world.bounds;
  const X0 = Math.floor((x0 - pad) / T) * T, Z0 = Math.floor((z0 - pad) / T) * T;
  const NX = Math.ceil((x1 + pad - X0) / T), NZ = Math.ceil((z1 + pad - Z0) / T);
  const steps = new Uint8Array(NX * NZ).fill(16);
  const quayTile = new Uint8Array(NX * NZ); // rıhtım karoları kabalaştırılmaz (duvar dibindeki iniş kaplamanın altında kalsın)
  const mark = (x, z, s) => {
    const i = Math.floor((x - X0) / T), j = Math.floor((z - Z0) / T);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return;
    const k = j * NX + i;
    if (s < steps[k]) steps[k] = s;
  };
  // Tesviyeli hücreler (yollar, meydanlar ve çevreleri: layout.js _gradeRoads), 2 m hücrenin dört köşesi.
  for (const key of world.grade?.keys() ?? []) {
    const gx = Math.round(key / 100003), gz = key - gx * 100003;
    for (const dx of [0, 2]) for (const dz of [0, 2]) mark(gx * 2 + dx, gz * 2 + dz, 4);
  }
  for (const p of world.piers) for (const x of [p.x0, p.x1]) for (const z of [p.z0, p.z1]) mark(x, z, 4);
  // Kıyı: 16 m'lik örneklerle 8 m, rıhtım boyunca 4 m (duvarın arkasındaki iniş
  // kaplama şeridinin altında kalır: city.js rihtim). Kıyıdan uzak derin deniz 32 m.
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      let deep = true;
      for (let a = 0; a <= T; a += 16) {
        for (let b = 0; b <= T; b += 16) {
          const x = X0 + i * T + a, z = Z0 + j * T + b;
          const L = -world.sdf(x, z);
          if (L > -40) deep = false;
          if (Math.abs(L) > 30) continue;
          if (quay(x, z) > 0.02) {
            mark(x, z, 4);
            const ti = Math.floor((x - X0) / T), tj = Math.floor((z - Z0) / T);
            if (ti >= 0 && tj >= 0 && ti < NX && tj < NZ) quayTile[tj * NX + ti] = 1;
          } else mark(x, z, 8);
        }
      }
      if (deep && steps[j * NX + i] === 16) steps[j * NX + i] = 32;
    }
  }
  // İnce işaretli karo gerçekten engebeli mi? Kaba ağ ince yüzeyin 6 cm'den fazla üstüne çıkmıyor ve 15 cm'den
  // fazla altına inmiyorsa kaba adım yeter. Üst pay dar: patika yüzeyi tesviyenin yalnız 15,5 cm üstünde
  // (−0,12 + 0,035); 13 cm'lik payla alçak açıdan patikaların içinden çim görünüyordu.
  const hs = (x, z) => world.height(x, z);
  for (let k = 0; k < steps.length; k++) {
    if ((steps[k] !== 4 && steps[k] !== 8) || quayTile[k]) continue;
    const ox = X0 + (k % NX) * T, oz = Z0 + Math.floor(k / NX) * T, n = T / 4;
    const F = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) F[j * (n + 1) + i] = hs(ox + i * 4, oz + j * 4);
    const fits = (c) => {
      const r = c / 4;
      for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
          const ci = Math.min(n - r, Math.floor(i / r) * r), cj = Math.min(n - r, Math.floor(j / r) * r);
          const u = (i - ci) / r, w = (j - cj) / r;
          const a = F[cj * (n + 1) + ci], b = F[cj * (n + 1) + ci + r], c2 = F[(cj + r) * (n + 1) + ci], d = F[(cj + r) * (n + 1) + ci + r];
          // Izgaranın üçgenlemesiyle aynı: a-c-b ve b-c-d.
          const y = u + w <= 1 ? a + (b - a) * u + (c2 - a) * w : d + (c2 - d) * (1 - u) + (b - d) * (1 - w);
          const f = F[j * (n + 1) + i];
          if (y - f > 0.06 || f - y > 0.15) return false;
        }
      }
      return true;
    };
    if (fits(16)) steps[k] = 16;
    else if (steps[k] === 4 && fits(8)) steps[k] = 8;
  }
  const stepAt = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ ? 0 : steps[j * NX + i]);

  // Parçalar: 8 × 8 karo (512 m) bir mesh; görüş dışındaki parçalar çizilmez (sokak seviyesinde çoğu).
  const C = 8, material = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassDetail(), roughness: 0.97 });
  const group = new THREE.Group();
  let tv = 0, tq = 0;
  for (let cj = 0; cj < NZ; cj += C) {
    for (let ci = 0; ci < NX; ci += C) {
      let nv = 0, ni = 0;
      for (let tj = cj; tj < Math.min(NZ, cj + C); tj++) for (let ti = ci; ti < Math.min(NX, ci + C); ti++) {
        const n = T / steps[tj * NX + ti]; nv += (n + 1) * (n + 1); ni += 6 * n * n;
      }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
      const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let v = 0, q = 0;
      for (let tj = cj; tj < Math.min(NZ, cj + C); tj++) {
        for (let ti = ci; ti < Math.min(NX, ci + C); ti++) {
          const s = steps[tj * NX + ti], n = T / s, m = n + 3;
          const ox = X0 + ti * T, oz = Z0 + tj * T;
          // Bir halka fazlasıyla yükseklikler (normaller için).
          const H = new Float32Array(m * m);
          for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) H[j * m + i] = world.height(ox + (i - 1) * s, oz + (j - 1) * s);
          // Dikiş: daha kaba komşuya bakan kenarda, komşunun köşeleri arasındaki köşeler onun kenar doğrusuna
          // oturtulur (T-birleşiminde çatlak kalmaz; komşu kaba olduğuna göre o kenar zaten düz sayılmış).
          const seam = (di, dj, cell) => {
            const c = stepAt(ti + di, tj + dj);
            if (!c || c <= s) return;
            const r = c / s;
            for (let k = 0; k <= n; k++) {
              if (k % r === 0) continue;
              const k0 = k - (k % r), u = (k % r) / r;
              const [i, j] = cell(k), [i0, j0] = cell(k0), [i1, j1] = cell(k0 + r);
              H[(j + 1) * m + i + 1] = H[(j0 + 1) * m + i0 + 1] * (1 - u) + H[(j1 + 1) * m + i1 + 1] * u;
            }
          };
          seam(0, -1, (k) => [k, 0]);
          seam(0, 1, (k) => [k, n]);
          seam(-1, 0, (k) => [0, k]);
          seam(1, 0, (k) => [n, k]);
          const base = v;
          for (let j = 0; j <= n; j++) {
            for (let i = 0; i <= n; i++) {
              const x = ox + i * s, z = oz + j * s, h = H[(j + 1) * m + i + 1];
              const gx = (H[(j + 1) * m + i + 2] - H[(j + 1) * m + i]) / (2 * s), gz = (H[(j + 2) * m + i + 1] - H[j * m + i + 1]) / (2 * s);
              const L = Math.hypot(gx, gz, 1);
              pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
              nor[v * 3] = -gx / L; nor[v * 3 + 1] = 1 / L; nor[v * 3 + 2] = -gz / L;
              const c = terrainColor(world, x, z, h, 1 / L);
              col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
              uv[v * 2] = x / 7; uv[v * 2 + 1] = z / 7;
              v++;
            }
          }
          for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
              const a = base + j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
              index[q++] = a; index[q++] = c; index[q++] = b; index[q++] = b; index[q++] = c; index[q++] = d;
            }
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      group.add(mesh);
      tv += v; tq += q;
    }
  }
  group.material = material; // lamba ışığı (main.js) zemin malzemesini buradan alır
  group.userData.stats = { verts: tv, tris: tq / 3, parca: group.children.length, adim: Object.fromEntries([2, 4, 8, 16, 32].map((a) => [a, steps.filter((s) => s === a).length])) };
  return group;
}

/**
 * Deniz: hafif dalgalar (yalnızca parça gölgelendiricide hesaplanan normal; köşe sayısı artmaz),
 * derinliğe göre renk (sığda turkuaz, derinde koyu mavi) ve kıyıda köpük çizgisi.
 */
export function buildWater(world) {
  const group = new THREE.Group();
  // Derinlik haritası: dünya sınırlarının biraz dışına kadar, 1 piksel ~ 4 m.
  const pad = 400;
  const x0 = world.bounds.x0 - pad, z0 = world.bounds.z0 - pad;
  const w = world.bounds.x1 - world.bounds.x0 + 2 * pad, d = world.bounds.z1 - world.bounds.z0 + 2 * pad;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const h = world.rawHeight(x0 + ((i + 0.5) / N) * w, z0 + ((j + 0.5) / N) * d);
      const depth = Math.max(0, Math.min(1, -h / 12));
      data[(j * N + i) * 4] = Math.round(depth * 255);
      data[(j * N + i) * 4 + 3] = 255;
    }
  }
  const depthTex = new THREE.DataTexture(data, N, N);
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;

  const uniforms = {
    uTime: { value: 0 },
    uDepth: { value: depthTex },
    uRect: { value: new THREE.Vector4(x0, z0, w, d) },
    uShallow: { value: new THREE.Color("#58c9d4") },
    uDeep: { value: new THREE.Color("#1f6f9a") },
  };
  const mat = new THREE.MeshStandardMaterial({ color: P.WATER, transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.08, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWaterWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
      varying vec3 vWaterWorld;
      uniform float uTime; uniform sampler2D uDepth; uniform vec4 uRect; uniform vec3 uShallow; uniform vec3 uDeep;
      // Birkaç yönlü sinüs dalgası: eğimi döndürür (dalga yüksekliği yok, yalnızca ışık oyunu).
      vec2 waveSlope(vec2 p, float t) {
        vec2 s = vec2(0.0);
        vec2 dirs[4]; dirs[0] = normalize(vec2(1.0, 0.35)); dirs[1] = normalize(vec2(-0.6, 1.0)); dirs[2] = normalize(vec2(0.2, -1.0)); dirs[3] = normalize(vec2(-1.0, -0.3));
        float freq[4]; freq[0] = 0.21; freq[1] = 0.33; freq[2] = 0.57; freq[3] = 0.91;
        float amp[4]; amp[0] = 0.10; amp[1] = 0.07; amp[2] = 0.05; amp[3] = 0.03;
        for (int i = 0; i < 4; i++) {
          float ph = dot(dirs[i], p) * freq[i] + t * (0.9 + 0.35 * float(i));
          s += dirs[i] * cos(ph) * amp[i] * freq[i] * 6.0;
        }
        return s;
      }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
      vec2 duv = (vWaterWorld.xz - uRect.xy) / uRect.zw;
      float depth = (duv.x < 0.0 || duv.y < 0.0 || duv.x > 1.0 || duv.y > 1.0) ? 1.0 : texture2D(uDepth, duv).r;
      diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.0, 0.6, depth));
      // Kıyı köpüğü: çok sığ suda, dalga ritmiyle gelip giden açık bant.
      float foamBand = smoothstep(0.055, 0.0, depth) * (0.55 + 0.45 * sin(uTime * 1.4 + vWaterWorld.x * 0.15 + vWaterWorld.z * 0.11));
      float foamNoise = fract(sin(dot(floor(vWaterWorld.xz * 1.6), vec2(12.9898, 78.233))) * 43758.5453);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.98, 0.98), clamp(foamBand * (0.6 + 0.4 * foamNoise), 0.0, 0.85));
      diffuseColor.a *= mix(0.62, 1.0, smoothstep(0.0, 0.25, depth));`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      // Uzakta dalga eğimi söner (uzaktan bakınca çizgilenme olmasın).
      float wfade = smoothstep(700.0, 120.0, length(vWaterWorld - cameraPosition));
      vec2 sl = waveSlope(vWaterWorld.xz, uTime) * wfade;
      vec3 wn = normalize(vec3(-sl.x, 1.0, -sl.y));
      normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`);
  };
  const water = new THREE.Mesh(new THREE.CircleGeometry(14000, 64).rotateX(-Math.PI / 2), mat);
  water.renderOrder = 1;
  water.receiveShadow = true;
  const seabed = new THREE.Mesh(
    new THREE.CircleGeometry(14000, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: P.DEEP_WATER }),
  );
  seabed.position.y = -12.5;
  group.add(seabed, water);
  group.userData.tick = (t) => { uniforms.uTime.value = t; };
  return group;
}

