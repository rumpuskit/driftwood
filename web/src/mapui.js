// Harita ve gezinme: mini harita (dokununca oraya gider), yer paneli, arama (kullanıcı adı ya da yer,
// yazarken öneri), yakınlaştırma ve pusula.
import { svg, YER_SIMGE } from "./icons.js";
import { at } from "./ui.js";

const $ = (id) => document.getElementById(id);
// Arama için: büyük/küçük harf ve Türkçe karakter farkı gözetilmez.
const fold = (t) => t.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) => "cgiosu"["çğıöşü".indexOf(c)]).trim();

export function createMapUI({ world, camera, controls, flyTo, ui, residents, zeplin = null }) {
  const { x0, x1, z0, z1 } = world.bounds;
  const pad = 140;
  const wx0 = x0 - pad, wz0 = z0 - pad, ww = x1 - x0 + 2 * pad, wd = z1 - z0 + 2 * pad + 160;

  // Taban harita: kara, kumsal, yollar, binalar (bir kez çizilir).
  const base = document.createElement("canvas");
  const S = Math.min(1, 900 / Math.max(ww, wd)); // piksel / metre
  base.width = Math.ceil(ww * S);
  base.height = Math.ceil(wd * S);
  const b = base.getContext("2d");
  b.fillStyle = "#7cc3d6";
  b.fillRect(0, 0, base.width, base.height);
  const step = 4 / S;
  for (let z = wz0; z < wz0 + wd; z += step) {
    for (let x = wx0; x < wx0 + ww; x += step) {
      const h = world.rawHeight(x, z);
      if (h <= 0.1) continue;
      b.fillStyle = h < 1.15 && world.sdf(x, z) > world.margin(x, z) - 32 ? "#ead7a6" : h > 9 ? "#8db36b" : "#a5cf86";
      b.fillRect((x - wx0) * S, (z - wz0) * S, step * S + 0.6, step * S + 0.6);
    }
  }
  b.lineCap = "round";
  b.lineJoin = "round";
  for (const road of world.roads) {
    b.strokeStyle = road.carriage > 0 ? "#ffffff" : road.type === "patika" ? "#c9a878" : "#f4ead8";
    b.lineWidth = Math.max(1, road.width * S * (road.carriage > 0 ? 1.4 : 1));
    b.beginPath();
    road.points.forEach(([x, z], i) => (i ? b.lineTo : b.moveTo).call(b, (x - wx0) * S, (z - wz0) * S));
    b.stroke();
  }
  b.fillStyle = "#c98f7a";
  for (const bd of world.buildings) {
    b.save();
    b.translate((bd.x - wx0) * S, (bd.z - wz0) * S);
    b.rotate(-bd.rot);
    b.fillRect((-bd.w / 2) * S, (-bd.d / 2) * S, bd.w * S, bd.d * S);
    b.restore();
  }

  const canvas = $("minimap-canvas");
  const ctx = canvas.getContext("2d");
  const toWorld = (px, pz) => {
    const r = canvas.getBoundingClientRect();
    const view = fit();
    return [view.x + ((px - r.left) / r.width) * view.w, view.z + ((pz - r.top) / r.height) * view.h];
  };
  // Haritada gösterilen alan: tüm ada (canvas oranına göre).
  function fit() {
    const ar = canvas.width / canvas.height;
    let w = ww, h = wd;
    if (w / h > ar) h = w / ar; else w = h * ar;
    return { x: wx0 + ww / 2 - w / 2, z: wz0 + wd / 2 - h / 2, w, h };
  }

  function draw() {
    const dpr = Math.min(2, devicePixelRatio);
    const r = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(r.width * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    const view = fit();
    const k = canvas.width / view.w;
    ctx.fillStyle = "#7cc3d6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, (wx0 - view.x) * k, (wz0 - view.z) * k, ww * k, wd * k);
    // Zeplin (uçuştaysa): gidiş yönüne dönük küçük zeplin.
    if (zeplin?.pose.visible) {
      const zp = zeplin.pose, zx = (zp.x - view.x) * k, zz = (zp.z - view.z) * k;
      ctx.save();
      ctx.translate(zx, zz);
      ctx.rotate(Math.atan2(Math.cos(zp.heading), Math.sin(zp.heading)));
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 3 * dpr;
      ctx.fillStyle = "#f6f4ef";
      ctx.beginPath(); ctx.ellipse(0, 0, 9 * dpr, 3.6 * dpr, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1d3156"; ctx.fillRect(-4.5 * dpr, -1.2 * dpr, 8 * dpr, 2.4 * dpr);
      ctx.fillStyle = "#e9667f";
      ctx.beginPath(); ctx.moveTo(-7 * dpr, 0); ctx.lineTo(-11 * dpr, -4 * dpr); ctx.lineTo(-11 * dpr, 4 * dpr); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Kameranın baktığı yer ve yönü (Google Haritalar gibi): yakınlaşmadan bağımsız sabit boyutlu nokta ve
    // bakış yönünde solan ışın.
    const t = controls.target;
    const px = (t.x - view.x) * k, pz = (t.z - view.z) * k;
    const dir = Math.atan2(t.x - camera.position.x, t.z - camera.position.z);
    // Haritada +x sağ, +z aşağı: açı ekranda atan2(dz, dx).
    const a = Math.atan2(Math.cos(dir), Math.sin(dir));
    const R = 36 * dpr, half = 0.5;
    const beam = ctx.createRadialGradient(px, pz, 0, px, pz, R);
    beam.addColorStop(0, "rgba(224,96,122,0.8)");
    beam.addColorStop(0.55, "rgba(224,96,122,0.35)");
    beam.addColorStop(1, "rgba(224,96,122,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.arc(px, pz, R, a - half, a + half);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, pz, 6.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 4 * dpr;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(px, pz, 4.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "#e0607a";
    ctx.fill();
  }

  canvas.addEventListener("click", (e) => {
    const [x, z] = toWorld(e.clientX, e.clientY);
    flyTo(x, Math.max(0, world.height(x, z)), z, Math.max(120, camera.position.distanceTo(controls.target)));
  });
  $("minimap-toggle").addEventListener("click", () => $("minimap").classList.toggle("open"));

  // Yerler (yalnızca adada açılmış olanlar): panelde simgeli düğmeler, aramada öneri.
  const prom = world.promenade, park = world.plazas.find((q) => q.kind === "park"), tarla = world.workplaces.tarla?.find(Boolean);
  const places = [
    ["Meydan", 0, 0, 90],
    ["İskele", 0, world.coastPoint(0, 60, 0, 1)[1] + 10, 110],
    prom && ["Sahil", ...prom[Math.floor(prom.length / 2)], 90],
    park && ["Park", (park.x0 + park.x1) / 2, (park.z0 + park.z1) / 2, 120],
    ["Plaj", ...world.places.plaj.anchors[4], 110],
    ["Tepe", ...world.places.tepe.anchors[0], 120],
    ["Fener", world.fener.x, world.fener.z, 90],
    tarla && ["Tarlalar", ...tarla.anchor, 160],
    ...world.labels.filter((l) => /Mahallesi$/.test(l.text)).map((l) => [l.text.replace(" Mahallesi", ""), l.x, l.z, 220]),
    // Zeplin: yeri sabit değil; dokununca kartı açılır ve uçuştaysa izlenir.
    zeplin && ["Zeplin", 0, 0, 0, () => ui.selectVehicle({ kind: "zeplin" })],
  ].filter(Boolean);
  const icon = (name) => svg(YER_SIMGE[name] ?? "mahalle");
  const go = ([, x, z, d, act]) => {
    if (act) return act();
    ui.close();
    flyTo(x, Math.max(0, world.height(x, z)), z, d);
  };
  const panel = $("yerler"), panelBtn = $("yerler-btn");
  const showPanel = (open) => {
    panel.hidden = !open;
    panelBtn.setAttribute("aria-expanded", String(open));
    if (open) hideSuggest();
  };
  $("yerler-grid").replaceChildren(...places.map((pl) => {
    const btn = document.createElement("button");
    btn.innerHTML = `<span class="ic"></span><span></span>`;
    btn.firstChild.innerHTML = icon(pl[0]);
    btn.lastChild.textContent = pl[0];
    btn.addEventListener("click", () => { showPanel(false); go(pl); });
    return btn;
  }));
  panelBtn.addEventListener("click", () => showPanel(panel.hidden));
  // Haritaya dokununca açık panel ve öneriler kapanır.
  $("scene").addEventListener("pointerdown", () => { showPanel(false); hideSuggest(); });

  // Arama: yazarken yerler ve sakinler önerilir (ok tuşları ve Enter ile seçilir).
  const input = $("search-input"), list = $("oneriler");
  const placeKeys = places.map((pl) => [fold(pl[0]), pl]);
  let items = [], cursor = -1;
  function hideSuggest() {
    list.hidden = true;
    items = [];
    cursor = -1;
  }
  function suggest() {
    const q = fold(input.value.replace(/^@/, ""));
    if (!q) return hideSuggest();
    items = placeKeys.filter(([k]) => k.includes(q)).slice(0, 4).map(([, pl]) => ({ kind: "yer", pl }));
    for (let i = 0; i < residents.length && items.length < 8; i++) {
      const r = residents[i];
      if (!r.hidden && r.handle.startsWith(q)) items.push({ kind: "sakin", i });
    }
    cursor = -1;
    list.replaceChildren(...items.map((it, n) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      const ic = document.createElement("span"), name = document.createElement("span"), note = document.createElement("small");
      if (it.kind === "yer") { ic.innerHTML = icon(it.pl[0]); name.textContent = it.pl[0]; note.textContent = "yer"; }
      else { ic.innerHTML = svg("kisi"); name.textContent = at(residents[it.i]); note.textContent = "sakin"; }
      li.append(ic, name, note);
      li.addEventListener("pointerdown", (e) => { e.preventDefault(); choose(n); });
      return li;
    }));
    list.hidden = items.length === 0;
    if (items.length) showPanel(false);
  }
  function choose(n) {
    const it = items[n];
    hideSuggest();
    input.blur();
    if (!it) return;
    input.value = it.kind === "yer" ? it.pl[0] : "@" + residents[it.i].handle;
    if (it.kind === "yer") go(it.pl);
    else ui.select(it.i);
  }
  input.addEventListener("input", suggest);
  input.addEventListener("blur", () => setTimeout(hideSuggest, 150));
  input.addEventListener("keydown", (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      cursor = (cursor + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      [...list.children].forEach((li, n) => li.setAttribute("aria-selected", String(n === cursor)));
    } else if (e.key === "Escape") hideSuggest();
  });
  $("search").addEventListener("submit", (e) => {
    e.preventDefault();
    if (cursor >= 0) return choose(cursor);
    const q = fold(input.value.replace(/^@/, ""));
    const place = placeKeys.find(([k]) => k === q);
    hideSuggest();
    input.blur();
    if (place) return go(place[1]);
    ui.find(input.value);
  });

  // Yakınlaştırma ve pusula.
  const zoom = (f) => {
    const off = camera.position.clone().sub(controls.target).multiplyScalar(f);
    const len = off.length();
    if (len < controls.minDistance || len > controls.maxDistance) return;
    flyTo(controls.target.x, controls.target.y, controls.target.z, len, off);
  };
  $("zoom-in").addEventListener("click", () => zoom(0.6));
  $("zoom-out").addEventListener("click", () => zoom(1.6));
  $("compass").addEventListener("click", () => {
    const off = camera.position.clone().sub(controls.target);
    const flat = Math.hypot(off.x, off.z);
    off.set(0, off.y, flat); // kuzey yukarıda: kamera güneyden bakar
    flyTo(controls.target.x, controls.target.y, controls.target.z, off.length(), off);
  });

  let last = 0;
  return {
    update(now) {
      const needle = $("compass-needle");
      const dir = Math.atan2(controls.target.x - camera.position.x, controls.target.z - camera.position.z);
      needle.style.transform = `rotate(${Math.PI - dir}rad)`;
      if (now - last < 0.12) return;
      last = now;
      if (canvas.offsetWidth > 0) draw();
    },
  };
}
