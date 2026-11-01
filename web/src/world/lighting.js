// Sokak lambalarının ışığı: ayrı bir yüzey (ve dolayısıyla titreşen üst üste binme) yerine, lambaların
// yukarıdan görünen ışık haritası zemin malzemelerinin gölgelendiricisine eklenir. Gece açılır.
import * as THREE from "three";

export function createLampLight(world, spots, materials, { wallMaterials = [] } = {}) {
  const pad = 60;
  const x0 = world.bounds.x0 - pad, z0 = world.bounds.z0 - pad;
  const w = world.bounds.x1 - world.bounds.x0 + 2 * pad, d = world.bounds.z1 - world.bounds.z0 + 2 * pad + 300;
  const scale = Math.min(1, 2048 / Math.max(w, d)); // piksel / metre
  // İki katman: sokak lambaları (gece boyu) ve saha projektörleri (yalnızca akşam, ayrıca yakılır).
  const makeCanvas = () => {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * scale);
    c.height = Math.ceil(d * scale);
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "lighter";
    return [c, g];
  };
  const [canvas, ctx0] = makeCanvas();
  const [fcanvas, fctx] = makeCanvas();
  for (const s of spots) {
    const ctx = s.stadium ? fctx : ctx0;
    // Işık armatürün altına, yola doğru düşer.
    const reach = s.flood ? 34 : s.deco ? 0 : 1.3;
    const ox = Math.sin(s.dir) * reach, oz = Math.cos(s.dir) * reach;
    const px = (s.x + ox - x0) * scale, pz = (s.z + oz - z0) * scale;
    const r = (s.flood ? 62 : s.r ?? (s.deco ? 7 : 11)) * scale;
    const g = ctx.createRadialGradient(px, pz, 0, px, pz, r);
    if (s.flood) {
      // Stadyum ışığı: beyaz, geniş ve düz; dört direğin ışığı sahanın üstünde eşitçe birleşir.
      g.addColorStop(0, "rgba(150,158,170,0.6)");
      g.addColorStop(0.6, "rgba(140,148,160,0.45)");
      g.addColorStop(1, "rgba(120,128,140,0)");
    } else {
      g.addColorStop(0, "rgba(255,206,140,0.95)");
      g.addColorStop(0.45, "rgba(255,190,120,0.45)");
      g.addColorStop(1, "rgba(255,180,110,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, pz, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const toTex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.flipY = false; // tuval satırı 0 = z0
    return t;
  };
  const tex = toTex(canvas), ftex = toTex(fcanvas);

  const uniforms = {
    lampMap: { value: tex },
    lampRect: { value: new THREE.Vector4(x0, z0, w, d) },
    lampNight: { value: 0 },
    floodMap: { value: ftex },
    floodOn: { value: 0 },
    lampFloor: { value: world.flatY },
  };
  const patch = (material, wall) => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLampWorld;")
        .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 lampWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lampWp = instanceMatrix * lampWp;
        #endif
        vLampWorld = (modelMatrix * lampWp).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
        varying vec3 vLampWorld;
        uniform sampler2D lampMap;
        uniform vec4 lampRect;
        uniform float lampNight;
        uniform sampler2D floodMap;
        uniform float floodOn;
        uniform float lampFloor;`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        vec2 lampUv = (vLampWorld.xz - lampRect.xy) / lampRect.zw;
        vec3 lampLight = texture2D(lampMap, lampUv).rgb + texture2D(floodMap, lampUv).rgb * floodOn;
        float lampFall = ${wall ? "clamp(1.0 - (vLampWorld.y - lampFloor) / 7.0, 0.0, 1.0)" : "1.0"};
        totalEmissiveRadiance += lampLight * lampNight * lampFall * diffuseColor.rgb * ${wall ? "0.9" : "1.5"};`);
    };
    material.needsUpdate = true;
  };
  for (const m of materials) patch(m, false);
  for (const m of wallMaterials) patch(m, true);
  return {
    setNight(n) {
      uniforms.lampNight.value = n;
    },
    setStadium(n) {
      uniforms.floodOn.value = n;
    },
  };
}
