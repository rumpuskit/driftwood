// Arazi (yumuşak gölgeli, çimen dokulu), su ve deniz tabanı.
import * as THREE from "three";
import { fbm } from "./noise.js";
import * as P from "./palette.js";
import { grassDetail } from "./textures.js";

const tmp = new THREE.Color();

function terrainColor(world, x, z, h, ny) {
  if (h < -0.2) return tmp.copy(P.WET_SAND).lerp(P.SEABED, Math.min(1, -h / 7));
  const d = world.sdf(x, z);
  const coastal = d > world.margin(x, z) - 30;
  if (coastal && h < 1.15) return tmp.copy(P.SAND);
  if (ny < 0.62) return tmp.copy(P.ROCK);
  const v = fbm(x / 45, z / 45, 21) + 0.5;
  tmp.copy(P.GRASS).lerp(P.GRASS_DARK, Math.min(1, Math.max(0, v * 1.4 - 0.35)));
  if (h > 8) tmp.lerp(P.HILL, Math.min(1, (h - 8) / 20));
  return tmp;
}

export function buildTerrain(world) {
  const pad = 220;
  const { x0, x1, z0, z1 } = world.bounds;
  const area = (x1 - x0 + 2 * pad) * (z1 - z0 + 2 * pad);
  const step = Math.max(4, Math.sqrt(area / 90000));
  const nx = Math.ceil((x1 - x0 + 2 * pad) / step), nz = Math.ceil((z1 - z0 + 2 * pad) / step);
  const count = (nx + 1) * (nz + 1);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = x0 - pad + i * step, z = z0 - pad + j * step;
      pos[k * 3] = x; pos[k * 3 + 1] = world.height(x, z); pos[k * 3 + 2] = z;
    }
  }
  const hAt = (i, j) => pos[(Math.min(nz, Math.max(0, j)) * (nx + 1) + Math.min(nx, Math.max(0, i))) * 3 + 1];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
      // Eğim: komşu yüksekliklerden.
      const gx = hAt(i + 1, j) - hAt(i - 1, j), gz = hAt(i, j + 1) - hAt(i, j - 1);
      const ny = (2 * step) / Math.hypot(gx, gz, 2 * step);
      const c = terrainColor(world, x, z, h, ny);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
    }
  }
  const index = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassDetail(), roughness: 0.97 }));
  mesh.receiveShadow = true;
  return mesh;
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

