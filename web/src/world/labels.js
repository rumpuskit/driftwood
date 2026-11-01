// Mahalle ve yer adları: kameraya dönük yazı levhaları.
import * as THREE from "three";

function textSprite(text) {
  const font = 600;
  const px = 44;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${font} ${px}px "Nunito", system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  const h = px + 30;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `${font} ${px}px "Nunito", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "#3b4a63";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  sprite.userData.aspect = w / h;
  return sprite;
}

export function buildLabels(world) {
  const group = new THREE.Group();
  for (const l of world.labels) {
    const sprite = textSprite(l.text);
    sprite.position.set(l.x, Math.max(world.height(l.x, l.z), 1) + l.h, l.z);
    group.add(sprite);
  }
  return group;
}

/**
 * Levhaları ekranda hep aynı boyda tutar; çok yakındayken ve kamera sokak seviyesindeyken (yerden 35 m'den
 * alçak) gizler: aşağıdan bakınca uzaktaki yerlerin adları binaların yanında havada asılı duruyordu.
 */
export function scaleLabels(labels, camera) {
  const low = camera.position.y < 36;
  for (const s of labels.children) {
    const d = camera.position.distanceTo(s.position);
    // Dikey (telefon) ekranda yatay görüş dar: etiketler orantılı küçülür.
    const h = d * 0.035 * Math.min(1, Math.max(0.55, camera.aspect));
    s.scale.set(h * s.userData.aspect, h, 1);
    s.visible = d > 120 && !low;
  }
}
