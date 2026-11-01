// Paylaşım: sakin kartı görseli (hikâye boyutu, 1080×1920) ve fotoğraf modu çerçevesi. Sahne görüntüsü
// main.js'teki capture() ile alınır (o karede çizilip hemen kopyalanır); kart 2D tuvalde çizilir.
// Telefonda sistem paylaşım menüsü (dosya + bağlantı), olmayan tarayıcıda PNG indirilir ve bağlantı kopyalanır.
import { TIKTOK } from "./config.js";

const SITE = "driftwood.rumpuskit.com";
const FONT = "Nunito, system-ui, sans-serif";
const C = { ink: "#1f2a3a", soft: "#5b6676", coral: "#e0607a", navy: "#1d3156", paper: "#fbf8f3", line: "#ece5da" };

/** Tuvale yazı: sığmazsa küçültür. */
function fitText(g, text, x, y, max, size, weight = 800, color = C.ink, align = "left") {
  let px = size;
  g.font = `${weight} ${px}px ${FONT}`;
  while (g.measureText(text).width > max && px > 12) { px -= 2; g.font = `${weight} ${px}px ${FONT}`; }
  g.fillStyle = color; g.textAlign = align; g.textBaseline = "alphabetic";
  g.fillText(text, x, y);
  return px;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Görüntüyü hedef kutuya kırparak sığdırır (object-fit: cover). */
function cover(g, img, x, y, w, h) {
  const iw = img.width, ih = img.height, s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** Driftwood amblemi (mercan daire, güneş, dalga): sitedeki simgenin tuval hâli. */
function emblem(g, cx, cy, r) {
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = C.coral; g.fill(); g.clip();
  g.beginPath(); g.arc(cx + r * 0.15, cy - r * 0.12, r * 0.36, 0, Math.PI * 2); g.fillStyle = "#ffd98a"; g.fill();
  for (const [dy, c] of [[0.22, "#ffffff"], [0.5, "#2f9c9a"]]) {
    g.beginPath(); g.moveTo(cx - r, cy + r * dy);
    for (let k = 0; k <= 24; k++) g.lineTo(cx - r + (2 * r * k) / 24, cy + r * dy + Math.sin(k * 0.8 + dy * 5) * r * 0.08);
    g.lineTo(cx + r, cy + r); g.lineTo(cx - r, cy + r); g.closePath(); g.fillStyle = c; g.fill();
  }
  g.restore();
}

/**
 * Sakin kartı. shot: sahne görüntüsü (tuval). info: { handle, letter, color, title, rows: [[başlık, değer]], now, link }.
 * Dönen: 1080×1920 tuval.
 */
export function residentCard(shot, info) {
  const W = 1080, H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
  // Üst: sahne, altı kâğıda doğru solar.
  const SH = 1120;
  if (shot) cover(g, shot, 0, 0, W, SH);
  const fade = g.createLinearGradient(0, SH - 260, 0, SH);
  fade.addColorStop(0, "rgba(251,248,243,0)"); fade.addColorStop(1, C.paper);
  g.fillStyle = fade; g.fillRect(0, SH - 260, W, 260);
  // Üst bant: amblem ve ad.
  roundRect(g, 48, 48, 430, 96, 48); g.fillStyle = "rgba(255,255,255,0.88)"; g.fill();
  emblem(g, 98, 96, 30);
  fitText(g, "Driftwood Island", 144, 113, 320, 46, 900);
  // Kart.
  const top = SH - 150;
  roundRect(g, 48, top, W - 96, 860, 44); g.fillStyle = "#ffffff"; g.fill();
  g.strokeStyle = C.line; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.arc(150, top + 112, 62, 0, Math.PI * 2); g.fillStyle = info.color; g.fill();
  fitText(g, info.letter, 150, top + 136, 100, 68, 900, "#ffffff", "center");
  fitText(g, info.handle, 236, top + 108, W - 330, 62, 900);
  fitText(g, info.title, 238, top + 160, W - 330, 34, 700, C.soft);
  let y = top + 236;
  if (info.now) {
    roundRect(g, 88, y, W - 176, 92, 26); g.fillStyle = "#fde8ec"; g.fill();
    fitText(g, info.now, 120, y + 60, W - 240, 36, 800, C.ink);
    y += 128;
  }
  for (const [k, v] of info.rows) {
    fitText(g, k, 96, y + 40, 220, 30, 700, C.soft);
    fitText(g, v, 330, y + 40, W - 430, 34, 800, C.ink);
    y += 70;
    g.fillStyle = C.line; g.fillRect(96, y - 14, W - 192, 2);
  }
  // Alt: çağrı ve bağlantı.
  roundRect(g, 48, H - 250, W - 96, 190, 40); g.fillStyle = C.coral; g.fill();
  fitText(g, "Move to the island too", W / 2, H - 165, W - 180, 54, 900, "#ffffff", "center");
  fitText(g, `Follow @${TIKTOK} on TikTok`, W / 2, H - 108, W - 180, 34, 800, "#ffe3e9", "center");
  fitText(g, info.link.replace(/^https?:\/\//, ""), W / 2, H - 22, W - 120, 30, 700, C.soft, "center");
  return cv;
}

/** Fotoğraf modu çerçevesi: görüntünün altına ince bant (amblem, tarih ve saat, site). */
export function photoFrame(shot, caption) {
  const W = shot.width, H = shot.height, band = Math.round(Math.max(64, W * 0.055));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H + band;
  const g = cv.getContext("2d");
  g.drawImage(shot, 0, 0);
  g.fillStyle = C.paper; g.fillRect(0, H, W, band);
  emblem(g, band * 0.55, H + band / 2, band * 0.3);
  fitText(g, "Driftwood", band * 1.0, H + band * 0.64, W * 0.4, band * 0.42, 900);
  fitText(g, `${caption} · ${SITE}`, W - band * 0.4, H + band * 0.62, W * 0.55, band * 0.3, 700, C.soft, "right");
  return cv;
}

/** Tuvali paylaşır: sistem menüsü (dosya + metin) ya da indirme + bağlantıyı panoya kopyalama. */
export async function shareCanvas(cv, { name, text, url }) {
  const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
  const file = new File([blob], `${name}.png`, { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: url ? `${text} ${url}` : text });
      return "paylasildi";
    }
  } catch (e) {
    if (e?.name === "AbortError") return "vazgecildi";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  if (url) try { await navigator.clipboard.writeText(url); return "indirildi-kopyalandi"; } catch {}
  return "indirildi";
}
