// Olay modülleri için ortak izleyici yardımcıları (17 Kasım akşamı; balon, uçurtma, kuş, geyik). olay.js'in genel seyirci
// planı seyirciyi olayın başında toplar ve yere (odak) baktırır; gökyüzündeki ya da yürüyen bir hedefi izleyen, olayın
// ortasında (ör. balon inerken) gelen seyirci için modül kendi görevlilerini (gorev) bu yardımcılarla kurar.
// Her şey (gün, tohum, dünya) işlevidir: aynı gün hep aynı sakinler, aynı yerler.
import * as THREE from "three";
import { kesir } from "./olay-plan.js";
import { roll } from "../sim.js";

const yon = (dx, dz) => Math.atan2(dx, dz);

/** Seyirci yerleri (olay.js seyirciYerleri ile aynı kural): merkez çevresinde yay, yürünebilir, taşıt yolunun dışında,
 *  odağa dönük. kiyida: yay merkezin kendisinin çevresinde (deniz olayı), değilse odağın çevresinde. */
export function yerlerSec(world, traffic, merkez, odak, n, r0, r1, seed, { kiyida = false, yay = 2.6, araliK = 0.85 } = {}) {
  const out = [];
  const a0 = yon(merkez[0] - odak[0], merkez[1] - odak[1]);
  const C = kiyida ? merkez : odak;
  for (let t = 0; out.length < n && t < n * 40; t++) {
    const a = a0 + (kesir("izA", seed, t) - 0.5) * yay, r = r0 + kesir("izR", seed, t) * (r1 - r0);
    const x = C[0] + Math.sin(a) * r, z = C[1] + Math.cos(a) * r;
    if (!world.isWalkable?.(x, z)) continue;
    if (traffic?.locate?.([x, z], 3.6, ["cadde", "sokak", "koy", "giris"])) continue;
    if (out.some((q) => Math.hypot(q.x - x, q.z - z) < araliK)) continue;
    out.push({ x, z, heading: yon(odak[0] - x, odak[1] - z), look: odak });
  }
  return out;
}

/** O saatte dışarıda/evde olup yeri yakın olan sakinler (olay.js planlaYuva ile aynı ölçüler), yakından uzağa.
 *  o: { T (gelme dakikası), odak, isR (iş yerinden çıkılacak yarıçap, 0: çıkılmaz), uzak (çarpan), haric (Set),
 *  disari (iş yeri dışarıda olanlar da çıkar) }. Dönüş [{ i, d }]. */
export function adaylar(people, day, plans, world, { T, odak, isR = 0, uzak = 1, haric = null, disari = false, sure = 12 }) {
  const R = people.residents, out = [];
  const yerOf = (seg) => (seg.ne === "meydan" || seg.ne === "hobi" ? world.placeOf?.(seg.ne === "hobi" ? seg.yer.replace("hobi:", "") : "meydan")?.anchors?.[0] : null);
  plans.forEach((plan, i) => {
    if (haric?.has(i)) return;
    const seg = plan.find((s) => s.bas <= T && s.son > T + sure);
    if (!seg) return;
    const w = people.works[i];
    const isyeri = isR && seg.ne === "is" && (disari || !w?.loc?.outdoor) ? w?.loc?.door ?? w?.loc?.anchor : null;
    if (isyeri && Math.hypot(isyeri[0] - odak[0], isyeri[1] - odak[1]) > isR) return;
    const a = isyeri ?? (seg.ne === "ev" ? people.homes[i]?.door : seg.ne === "meydan" || seg.ne === "hobi" ? yerOf(seg) : null);
    if (!a) return;
    const d = Math.hypot(a[0] - odak[0], a[1] - odak[1]);
    if (seg.ne === "ev" && d > 160 * uzak) return;
    if (d > 340 * uzak) return;
    out.push({ i, d, r: roll(R[i].seed, "izSec" + T, day) % 1000 });
  });
  out.sort((a, b) => a.d / 340 + a.r / 1000 - (b.d / 340 + b.r / 1000));
  return out;
}

/** Görev kayıtları (olay.js araEkle'ye gider): adaylardan yerler kadarı yürüyüp gelir, [T0, T1] arası yerinde kalır.
 *  o: { T0 (en erken varış), dagilim (varışa eklenen 0..dk), kal: [en az, en çok] dk, Tson (en geç ayrılış), modul,
 *  tavirlar, ek (item'a eklenecek alanlar) }. */
export function gorevler(people, day, aday, yerler, { T0, dagilim = 6, kal = [12, 24], Tson = Infinity, modul, tavirlar = ["cek", "bak", "goster", "cek", "konus", "sasir"], ek = {}, tuz = "" }) {
  const R = people.residents, out = [];
  aday.slice(0, yerler.length).forEach(({ i, d }, k) => {
    const commute = Math.max(2, Math.round(d / 1.25 / 60) + 1);
    const t0 = T0 + (roll(R[i].seed, "izVaris" + tuz, day) % (dagilim * 10 + 1)) / 10;
    const t1 = Math.min(Tson, t0 + kal[0] + (roll(R[i].seed, "izKal" + tuz, day) % (kal[1] - kal[0] + 1)));
    if (t1 <= t0 + 2) return;
    const tavir = tavirlar[roll(R[i].seed, "izTavir" + tuz, day) % tavirlar.length];
    out.push({ i, T0: t0, T1: t1, commute, item: { ...yerler[k], tavir, modul, ...ek } });
  });
  return out;
}

/** Bir hedefi (gökyüzünde ya da yerde, hareketli olabilir) izleyen seyircinin duruşu. hedef: [x, y, z] | null (null: it.look
 *  yerdeki noktası). Gövde hedefe döner (yavaş: en çok it.heading ± 1,2 rad), baş yukarı kalkar. */
export function izleDurus(it, t, p, ph, stand, idleGesture, hedef, gy = 0) {
  let h = it.heading, yuk = 0;
  if (hedef) {
    const dx = hedef[0] - it.x, dz = hedef[2] - it.z, d = Math.hypot(dx, dz) || 1;
    let dh = Math.atan2(Math.sin(yon(dx, dz) - it.heading), Math.cos(yon(dx, dz) - it.heading));
    dh = Math.max(-1.2, Math.min(1.2, dh));
    h = it.heading + dh;
    yuk = Math.atan2(hedef[1] - gy - 1.6, d); // hedefin yükseliş açısı
  }
  stand(it.x, it.z, h);
  const bas = -Math.max(-0.25, Math.min(1.05, yuk)); // baş eğimi: eksi = yukarı
  switch (it.tavir) {
    case "cek": // telefonla çekiyor: kol hedefe doğru kalkık
      p.shR = 1.45 + Math.max(0, yuk) * 0.9; p.elR = 0.35; p.shL = 0.5 + Math.max(0, yuk) * 0.6; p.elL = 1.2; p.props = ["telefon"]; p.headPitch = bas * 0.9; break;
    case "goster": { // eliyle gösteriyor (aralıklı)
      const g = Math.max(0, Math.sin(t * 0.7 + ph));
      idleGesture(p, t, ph, false);
      p.shR = 0.4 + (1.2 + Math.max(0, yuk) * 0.8) * g; p.elR = 0.15; p.headPitch = bas; p.headYaw = 0; break;
    }
    case "siper": // eli alnında, güneşe karşı bakıyor
      p.shR = 2.2; p.elR = 2.3; p.abR = 0.2; p.headPitch = bas; break;
    case "sasir":
      p.shL = p.shR = 2.3; p.elL = p.elR = 2.4; p.abL = p.abR = 0.25; p.headPitch = bas * 0.8; break;
    default:
      idleGesture(p, t, ph, it.tavir === "konus");
      p.headPitch = bas; p.headYaw *= 0.3;
  }
  return true;
}

/** Ağaçlar [{ x, z, y (taban), h (boy) }]: Mercanada world.trees; yoksa sahnedeki ağaç grubunun (nature.js, userData.crowns)
 *  gövde örneklerinden (Driftwood). Yalnız olay günü (kur) çağrılır; sonuç önbellekte. */
export function agaclar(world, scene) {
  if (world._olayAgac) return world._olayAgac;
  let out = [];
  if (Array.isArray(world.trees) && world.trees.length) {
    out = world.trees.map((t) => ({ x: t.x, z: t.z, y: world.groundY?.(t.x, t.z) ?? 0, h: t.h ?? 9, tur: t.kind }));
  } else {
    const g = scene?.children?.find((c) => c.userData?.crowns);
    if (g) {
      const m = g.children.filter((c) => c.isInstancedMesh);
      const crowns = new Set(g.userData.crowns);
      const e = [], M = new THREE.Matrix4();
      for (const mesh of m) {
        if (crowns.has(mesh.material)) continue; // taç: aynı noktalar gövdede de var
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, M);
          const a = M.elements;
          // Ölçek y: sütun 1'in uzunluğu = boy / başvuru boyu (nature.js REF 8–11 m); boy ≈ 10 × ölçek.
          const sy = Math.hypot(a[4], a[5], a[6]);
          e.push({ x: a[12], z: a[14], y: a[13], h: 10 * sy });
        }
      }
      out = e;
    }
  }
  return (world._olayAgac = out);
}

/** Ağacın (x, z) noktasındaki taç tepesi (m): sahnedeki ağaç örneklerine yukarıdan ışın; bulunamazsa yedek. */
export function agacTepe(scene, x, z, yedek) {
  const g = scene?.children?.find((c) => c.userData?.crowns);
  if (!g) return yedek;
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0), 0, 400);
  const h = rc.intersectObject(g, true)[0];
  return h && h.point.y > yedek - 8 ? h.point.y : yedek;
}

/** Izgara: (x, z) çevresinde r içindeki ağaçlar (hızlı arama). */
export function agacIzgara(list, hucre = 20) {
  const G = new Map(), k = (x, z) => `${Math.floor(x / hucre)},${Math.floor(z / hucre)}`;
  for (const t of list) { const key = k(t.x, t.z); (G.get(key) ?? G.set(key, []).get(key)).push(t); }
  return {
    yakin(x, z, r) {
      const out = [], n = Math.ceil(r / hucre);
      const cx = Math.floor(x / hucre), cz = Math.floor(z / hucre);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const t of G.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(t.x - x, t.z - z) < r) out.push(t);
      return out;
    },
  };
}

/** Bulunma/yönelme eki yardımcıları (Türkçe pusula yönü): açı (atan2(dx, dz); kuzey -z) → "doğuya" gibi. */
export function pusula(a, dil = "tr") {
  // atan2(dx, dz): 0 = +z (güney), π/2 = +x (doğu), ±π = -z (kuzey), -π/2 = -x (batı).
  const k = Math.round((((a / (Math.PI / 4)) % 8) + 8) % 8);
  const TR = ["güneye", "güneydoğuya", "doğuya", "kuzeydoğuya", "kuzeye", "kuzeybatıya", "batıya", "güneybatıya", "güneye"];
  const EN = ["south", "southeast", "east", "northeast", "north", "northwest", "west", "southwest", "south"];
  return (dil === "tr" ? TR : EN)[k];
}
