// İş yeri ve kamu binalarının içleri: kafe, kahvehane, fırın, market, atölye, ofis (plaza), okul, sağlık merkezi,
// belediye, karakol, muhtarlık, adliye, kütüphane, müze, otel, büfe; cami, itfaiye, garaj, balıkçı kulübesi, ahır,
// vapur iskelesi binası, ambar, tersane. Her türün kendi döşemesi ve çalışma noktaları vardır; o saatte işte olan
// sakinler bu noktalarda çalışır (tezgâhta, masa başında, tahta önünde, raflar arasında...).
// Çok katlı binalarda sağ kenarda bir çekirdek şeridi: merdiven (iki kol, sahanlık), 4 ve daha çok katta ayrıca
// asansör. Eşyalar çekirdeğin dışındaki alana yerleşir.
import * as THREE from "three";
import { roll } from "../sim.js";
import { FLOOR_H } from "./layout.js";
import { doubleStair } from "./stairs.js";
import { buildBusiness } from "./isletme.js";

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
const GOODS = ["#d8433d", "#e8b93a", "#3e8a86", "#2f6fb5", "#8a62d1", "#f28c28", "#7fae45", "#f4f1ea"];

/**
 * İç mekânı kurar. add(w, h, d, lx, ly, lz, color, rot, opts) yerel (bina) koordinatlarında kutu ekler,
 * spot(lx, lz, heading, kind) bir çalışma noktası kaydeder. Döner: çalışma noktaları listesi.
 */
export function buildWorkInterior(b0, f, add0, spot0) {
  // Döşeme bütün katı kaplar; çekirdek (merdiven/asansör) sağ kenarda, eşyalar kalan alanda.
  const katlar = b0.icKat ?? b0.floors;
  const CW = katlar >= 2 && b0.w >= 9 && b0.d >= 7.5 ? 2.7 : 0;
  const floorCol = { cami: "#7a2f3a", itfaiye: "#9aa0a6", garaj: "#8f949a", kulube: "#9c7a58", ahir: "#a08660", liman: "#cfc8bc", ambar: "#a7aaae", tersane: "#9aa0a6", kafe: "#b58a63", kahvehane: "#9c7353", firin: "#d8c6a8", market: "#e6e2da", plaza: "#c9ccd1", okul: "#c79f74", saglik: "#e9edf0", belediye: "#cfc4b6", karakol: "#cfd5dc", muhtarlik: "#c9b79c", adliye: "#a98b6f", kutuphane: "#a98b6f", muze: "#d9d2c6", otel: "#b58a63", atolye: "#bfb3a2", bufe: "#d8c6a8", carsi: "#d8c6a8" }[b0.kind] ?? "#cfc4b6";
  add0(b0.w - 0.3, 0.06, b0.d - 0.3, 0, 0, 0, floorCol, 0, { shadow: false });
  if (CW) core(b0, f, add0, CW, katlar);
  const b = CW ? { ...b0, w: b0.w - CW } : b0;
  const add = CW ? (w, h, d, lx, ...r) => add0(w, h, d, lx - CW / 2, ...r) : add0;
  // Çekirdek şeridi kadar sola kaydırılmış alan (duraklı tur noktaları da: [x, z, bekleme, iş, bakılanX, bakılanZ]).
  const shiftPath = (path) => path?.map(([x, z, d, a, fx, fz]) => [x - CW / 2, z, d, a, fx != null ? fx - CW / 2 : fx, fz]);
  const spot = CW ? (lx, lz, h, t, path) => spot0(lx - CW / 2, lz, h, t, shiftPath(path)) : spot0;
  const hw = b.w / 2, hd = b.d / 2;
  const kind = b.kind;
  const counter = (x, z, w, color = "#8a6a52", top = "#4a4f57") => {
    add(w, 1.0, 0.7, x, 0.06, z, color);
    add(w + 0.05, 0.05, 0.75, x, 1.06, z, top);
  };
  const guests = []; // müşteri/öğrenci oturma yerleri (çalışanlara verilmez)
  const chair = (cx, cz, face, color = "#8a6a52") => {
    // Dört ayaklı, arkalıklı sandalye; face: oturanın baktığı yön (yerel).
    const bx = cx - Math.sin(face) * 0.19, bz = cz - Math.cos(face) * 0.19;
    add(0.42, 0.05, 0.42, cx, 0.45, cz, color, face);
    add(0.42, 0.45, 0.04, bx, 0.5, bz, color, face);
    for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
      const rx = dx * Math.cos(face) + dz * Math.sin(face), rz = -dx * Math.sin(face) + dz * Math.cos(face);
      add(0.03, 0.44, 0.03, cx + rx, 0.01, cz + rz, "#3c4148", 0, { shadow: false });
    }
    guests.push(spot(cx, cz, face, "guest"));
  };
  const table = (x, z, chairs = 2, round = true) => {
    if (round) add(0.8, 0.05, 0.8, x, 0.74, z, "#f4f1ea");
    else add(1.2, 0.05, 0.8, x, 0.74, z, "#a07a58");
    add(0.07, 0.72, 0.07, x, 0.02, z, "#3c4148");
    add(0.4, 0.03, 0.4, x, 0.02, z, "#3c4148", 0, { shadow: false });
    for (let c = 0; c < chairs; c++) {
      const a = (c / chairs) * Math.PI * 2;
      const cx = x + Math.cos(a) * 0.7, cz = z + Math.sin(a) * 0.7;
      chair(cx, cz, Math.atan2(x - cx, z - cz));
    }
  };
  const shelf = (x, z, w, rot = 0, goods = true) => {
    add(w, 1.9, 0.45, x, 0.06, z, "#d9d4ca", rot);
    if (goods) for (let r = 0; r < 4; r++) for (let k = 0; k < Math.floor(w / 0.35); k++) add(0.28, 0.28, 0.3, x - w / 2 + 0.2 + k * 0.35, 0.15 + r * 0.45, z, GOODS[(k * 3 + r * 5 + Math.round(x * 7)) % GOODS.length], rot, { shadow: false });
  };
  const desk = (x, z, rot = 0) => {
    add(1.3, 0.05, 0.7, x, 0.74, z, "#e6e1d6", rot);
    add(0.06, 0.72, 0.06, x - 0.6, 0.02, z, "#3c4148", rot);
    add(0.06, 0.72, 0.06, x + 0.6, 0.02, z, "#3c4148", rot);
    add(0.55, 0.36, 0.03, x, 0.98, z - 0.22, null, rot, { material: new THREE.MeshBasicMaterial({ color: "#7fb0e0", toneMapped: false }), shadow: false });
    add(0.45, 0.05, 0.45, x, 0.47, z + 0.55, "#2f3540", rot);
  };
  const spots = [];
  const S = (x, z, heading, type, path) => spots.push(spot(x, z, heading, type, path));

  // Adlı şubeler (kafe, fırın, market, atölye) ve çarşı zanaatları kendi konseptini kurar (isletme.js).
  // Çekirdek önündeki açık şerit: çekirdeğin ön duvarından sonra sağ kenara kadar kullanılabilir.
  const coreZ = CW ? (katlar >= 4 ? Math.min(hd - 0.8, -hd + 6.3) : -hd + 4.2) : -hd;
  if (buildBusiness({ b, f, katlar, add, spot, S, chair, guests, hw, hd, xr: hw + CW, coreZ })) {
    spots.guests = guests;
    return spots;
  }

  switch (kind) {
    case "kafe": case "kahvehane": case "bufe": case "firin": case "carsi": {
      // Arka duvar boyunca tezgâh; önde masalar. Fırında ekmek rafları ve taş fırın.
      counter(0, -hd + 1.4, b.w - 2.5, kind === "firin" ? "#c9a27a" : "#6b4a35");
      if (kind === "firin") {
        add(2.2, 1.8, 1.2, -hw + 1.6, 0.06, -hd + 0.8, "#b5563f");
        add(1.2, 0.6, 0.05, -hw + 1.6, 0.7, -hd + 1.42, "#2a1a14");
        for (let r = 0; r < 3; r++) add(b.w - 4, 0.05, 0.4, 0.6, 1.2 + r * 0.4, -hd + 0.3, "#8a6a52");
        for (let k = 0; k < 10; k++) add(0.35, 0.18, 0.2, -hw + 3 + k * 0.6, 1.3, -hd + 0.3, "#d9a24a", 0, { shadow: false });
      } else {
        add(0.6, 0.5, 0.45, -hw + 1.8, 1.1, -hd + 1.4, "#3c4148"); // kahve makinesi / semaver
        add(b.w - 3, 0.04, 0.3, 0, 1.9, -hd + 0.25, "#6b4a35");
      }
      const cols = Math.max(1, Math.floor((b.w - 2) / 2.6));
      for (let c = 0; c < cols; c++) for (let r = 0; r < 2; r++) {
        const tx = -hw + 1.6 + c * 2.6, tz = 0.6 + r * 2.4;
        table(tx, tz, kind === "kahvehane" ? 4 : 2);
        if (kind === "kahvehane") {
          // Kahvehane: masalarda açık tavla tahtası ve ince belli çay bardakları.
          add(0.52, 0.04, 0.36, tx, 0.79, tz, "#6b4a35", 0.3 * ((c + r) % 2), { shadow: false });
          add(0.46, 0.012, 0.3, tx, 0.83, tz, "#d9c49a", 0.3 * ((c + r) % 2), { shadow: false });
          for (const dx of [-0.28, 0.28]) add(0.05, 0.08, 0.05, tx + dx, 0.79, tz + 0.25, "#b5532f", 0, { shadow: false });
        }
      }
      if (kind === "kahvehane") add(0.06, 0.62, 1.05, -hw + 0.2, 1.75, -0.5, "#1d1f24"); // duvarda televizyon (maç yayını)
      // Noktalar bu sırayla dolar: iki çalışanlı yerde biri tezgâhta, biri masalarda (garson), üçüncüsü tezgâhta.
      S(-1.2, -hd + 2.2, Math.PI, "counter");
      // Garson: tezgâhtan siparişi alır, masaları yılan gibi dolaşır (her masada durup servis yapar), tezgâha döner.
      const tour = [[1.5, -hd + 2.3, 5, "counter", 1.5, -hd]];
      for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
        const cc = r % 2 ? cols - 1 - c : c, tx = -hw + 1.6 + cc * 2.6, tz = 0.6 + r * 2.4;
        tour.push([tx + 0.72, tz - 0.72, 3.5, "serve", tx, tz]);
      }
      S(0, 1.8, 0, "waiter", tour);
      S(1.5, -hd + 2.2, Math.PI, "counter");
      break;
    }
    case "market": {
      counter(hw - 2.2, hd - 2.2, 1.8, "#f4f1ea");
      for (let r = 0; r < 3; r++) shelf(-1.2, -hd + 2 + r * 3.2, b.w - 6);
      shelf(0, -hd + 0.4, b.w - 1.5);
      S(hw - 2.2, hd - 3.1, 0, "counter");
      // Reyon görevlisi: koridorları sırayla dolaşır, raflarda durup ürün dizer.
      const half = (b.w - 6) / 2, tour = [];
      for (let r = 0; r < 3; r++) {
        const az = -hd + 3.6 + r * 3.2, sz = -hd + 2 + r * 3.2;
        const xs = r % 2 ? [-1.2 + half * 0.5, -1.2 - half * 0.5] : [-1.2 - half * 0.5, -1.2 + half * 0.5];
        for (const x of xs) tour.push([x, az, 5, "shelf", x, sz]);
      }
      S(-1.2, -hd + 3.6, Math.PI / 2, "shelf", tour);
      break;
    }
    case "atolye": {
      for (let k = 0; k < 2; k++) {
        add(2.4, 0.9, 1.0, -hw + 2.5 + k * 4.5, 0.06, -1, "#8a6a52");
        add(0.4, 0.4, 0.4, -hw + 2.2 + k * 4.5, 0.96, -1, "#9a9fa6");
      }
      add(0.6, 0.8, 0.6, hw - 2, 0.06, 1.5, "#6b4a35"); // çömlek çarkı
      shelf(0, -hd + 0.4, b.w - 1.5);
      S(-hw + 2.5, -0.2, Math.PI, "bench");
      S(-hw + 7, -0.2, Math.PI, "bench");
      S(hw - 2, 2.3, Math.PI, "bench");
      break;
    }
    case "plaza": case "belediye": case "karakol": case "muhtarlik": case "adliye": {
      // Açık ofis: masa sıraları, toplantı masası.
      const rows = Math.max(1, Math.floor((b.d - 3) / 2.6)), cols = Math.max(1, Math.floor((b.w - 2) / 2.4));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -hw + 1.6 + c * 2.4, z = -hd + 1.8 + r * 2.6;
          desk(x, z);
          if ((r * cols + c) % 2 === 0) S(x, z + 0.55, Math.PI, "desk");
        }
      }
      if (kind === "belediye" || kind === "karakol" || kind === "adliye") counter(0, hd - 2, Math.min(8, b.w - 4), kind === "karakol" ? "#c9d3df" : "#f4f1ea");
      break;
    }
    case "okul": {
      // Kat: önde boydan boya koridor; arkada iki derslik ve öğretmenler odası (alçak bölmeler, kapılar).
      // Derslikte tahta, öğretmen masası, 4×3 çift kişilik sıra; odada toplantı masası ve dolaplar.
      const corr = 2.0, zc = hd - corr; // koridor duvarı
      const roomW = (b.w - 0.3) / 3;
      const xs = [-hw + 0.15, -hw + 0.15 + roomW, -hw + 0.15 + 2 * roomW, hw - 0.15];
      const wallC = "#efe7d6";
      for (let k = 1; k < 3; k++) add(0.12, 1.05, zc + hd - 0.15, xs[k], 0, (zc - hd + 0.15) / 2, wallC);
      for (let k = 0; k < 3; k++) {
        const cx = (xs[k] + xs[k + 1]) / 2;
        add(roomW / 2 - 0.7, 1.05, 0.12, xs[k] + (roomW / 2 - 0.7) / 2, 0, zc, wallC); // kapının solu
        add(roomW / 2 - 0.7, 1.05, 0.12, xs[k + 1] - (roomW / 2 - 0.7) / 2, 0, zc, wallC); // kapının sağı
        if (k < 2) {
          add(Math.min(4, roomW - 2), 1.2, 0.05, cx, 1.0, -hd + 0.25, "#2f4a3a");
          add(1.2, 0.75, 0.6, cx - roomW / 2 + 1.4, 0.06, -hd + 1.3, "#a07a58");
          for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
            const x = cx - 2.3 + c * 2.3, z = -hd + 3.0 + r * 1.55;
            add(1.1, 0.05, 0.5, x, 0.68, z, "#c9a27a");
            for (const dx of [-0.5, 0.5]) add(0.05, 0.66, 0.45, x + dx, 0.02, z, "#3c4148", 0, { shadow: false });
            for (const dx of [-0.27, 0.27]) chair(x + dx, z + 0.55, Math.PI, "#5a7fa8");
          }
          // Öğretmen: tahtanın iki yanında yazar, sınıfa döner anlatır, sıralar arasında dolaşıp bakar.
          S(cx + 0.4, -hd + 1.3, 0, "board", [
            [cx - 1.4, -hd + 1.3, 7, "board", cx - 1.4, -hd], [cx + 1.4, -hd + 1.3, 6, "board", cx + 1.4, -hd],
            [cx + 0.3, -hd + 2.0, 5, "explain", cx, -hd + 5], [cx + 1.15, -hd + 3.8, 3, "check", cx + 1.15, -hd + 6],
            [cx + 1.15, -hd + 5.3, 3, "check", cx + 1.15, -hd + 8], [cx - 1.15, -hd + 4.5, 3, "check", cx - 1.15, -hd + 7],
          ]);
        } else {
          // Öğretmenler odası: uzun masa, sandalyeler (çalışanlar oturur), dolap.
          add(1.2, 0.05, 3.6, cx, 0.74, -0.8, "#a07a58");
          add(0.08, 0.72, 0.08, cx, 0.02, -2.2, "#3c4148"); add(0.08, 0.72, 0.08, cx, 0.02, 0.6, "#3c4148");
          shelf(cx, -hd + 0.4, roomW - 1, 0, false);
          for (let r = 0; r < 3; r++) for (const s of [-1, 1]) {
            const x = cx + s * 0.95, z = -2.0 + r * 1.2;
            add(0.42, 0.05, 0.42, x, 0.45, z, "#6b4a35");
            S(x, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, "seat");
          }
        }
      }
      // Koridorda nöbetçi öğretmen ve hizmetli: derslik kapılarının önünde durup içeri bakar.
      const doors = [0, 1, 2].map((k) => (xs[k] + xs[k + 1]) / 2);
      S(-hw + 2, hd - 1.0, Math.PI / 2, "walk", doors.map((x) => [x, hd - 1.0, 4, "look", x, -hd]));
      S(hw - 2, hd - 1.0, -Math.PI / 2, "walk", [...doors].reverse().map((x) => [x + 0.8, hd - 1.1, 3, "look", x, hd]));
      // Öğrenci sandalyeleri yalnızca dersliklerde (öğretmenler odasındakiler çalışan yeri).
      break;
    }
    case "saglik": {
      counter(0, hd - 2.2, 4, "#f4f6f8", "#d8dde2");
      for (let k = 0; k < 6; k++) add(0.5, 0.45, 0.5, -hw + 1.5 + k * 0.7, 0.06, hd - 0.8, "#6fa0c8");
      for (let k = 0; k < 2; k++) {
        add(0.8, 0.6, 2.0, -hw + 2 + k * 5, 0.06, -hd + 1.6, "#f4f6f8");
        add(0.05, 2.0, 2.4, -hw + 3.4 + k * 5, 0.06, -hd + 1.6, "#bcd6e6");
      }
      S(0, hd - 3.0, 0, "counter");
      // Hemşire: yatakları sırayla dolaşır (yatak başında durup bakar), danışmaya uğrar.
      S(-hw + 3, -hd + 2.8, Math.PI, "walk", [
        [-hw + 2.9, -hd + 1.6, 7, "check", -hw + 2, -hd + 1.6], [-hw + 7.9, -hd + 1.6, 7, "check", -hw + 7, -hd + 1.6],
        [-1.6, hd - 3.6, 4, "counter", 0, hd - 2.2],
      ]);
      break;
    }
    case "kutuphane": {
      for (let r = 0; r < 2; r++) shelf(-hw / 2, -hd + 0.6 + r * 2.4, b.w / 2 - 1, 0, true);
      for (let k = 0; k < 2; k++) table(hw / 2 - 1 + k * 0, -1 + k * 2.6, 4, false);
      counter(-1, hd - 2, 2.4, "#6b4a35");
      S(-1, hd - 2.8, 0, "counter");
      // Kütüphaneci: rafların önünde kitap yerleştirir, okuma masalarına uğrar.
      S(-hw / 2, -hd + 1.8, Math.PI, "walk", [
        [-hw / 2 - b.w / 8, -hd + 1.6, 6, "shelf", -hw / 2 - b.w / 8, -hd + 0.6], [-hw / 2 + b.w / 8, -hd + 1.6, 6, "shelf", -hw / 2 + b.w / 8, -hd + 0.6],
        [-hw / 2, -hd + 4.0, 5, "shelf", -hw / 2, -hd + 3.0], [hw / 2 - 2, 0.4, 3, "look", hw / 2 - 1, -1],
      ]);
      break;
    }
    case "muze": {
      for (let k = 0; k < 6; k++) {
        const x = -hw + 2.5 + (k % 3) * (b.w - 5) / 2, z = -2 + Math.floor(k / 3) * 4;
        add(0.8, 1.0, 0.8, x, 0.06, z, "#f4f1ea");
        add(0.45, 0.6, 0.45, x, 1.06, z, ["#c9a24a", "#8a5a3a", "#5a7a8a"][k % 3]);
      }
      for (let k = 0; k < 4; k++) add(1.6, 1.1, 0.04, -hw + 3 + k * (b.w - 6) / 3, 1.3, -hd + 0.2, ["#b8625a", "#5a7fa8", "#c9a25a", "#7a6a9a"][k]);
      // Rehber: eserlerin yanında durup anlatır, sırayla dolaşır.
      const ex = [0, 1, 2, 5, 4, 3].map((k) => [-hw + 2.5 + (k % 3) * (b.w - 5) / 2, -2 + Math.floor(k / 3) * 4]);
      S(0, hd - 2, 0, "walk", ex.map(([x, z]) => [x + 1.1, z + 0.9, 7, "explain", x, z]));
      break;
    }
    case "otel": {
      if (f === 0) {
        counter(0, -hd + 1.6, 5, "#6b4a35");
        for (let k = 0; k < 3; k++) add(1.8, 0.42, 0.85, -hw + 2.5 + k * 3.2, 0.06, hd - 1.5, "#8a5a4a");
        S(0, -hd + 2.4, Math.PI, "counter");
      } else {
        const rooms = Math.max(1, Math.floor(b.w / 4.5));
        for (let k = 0; k < rooms; k++) {
          const x = -hw + 2.2 + k * 4.5;
          add(1.6, 0.55, 2.0, x, 0.06, -hd + 1.3, "#f3eee6");
          if (k > 0) add(0.12, 2.9, b.d - 0.4, x - 2.25, 0, 0, "#e9e2d6");
        }
        // Kat görevlisi: oda kapılarının önünde durup odaya bakar (temizlik, kontrol).
        S(-hw + 2, 1, Math.PI / 2, "walk", Array.from({ length: rooms }, (_, k) => [-hw + 2.2 + k * 4.5, 0.9, 6, "check", -hw + 2.2 + k * 4.5, -hd + 1.3]));
      }
      break;
    }
    case "cami": {
      // Harim (tek kat, kubbe altı): kıble arka duvarda. Halıda saf çizgileri, mihrap nişi, sağında minber, solunda
      // kürsü; ortada halka avize; kapı yanlarında ayakkabılıklar.
      for (let r = 0; r < Math.floor((b.d - 4) / 1.2); r++) add(b.w - 1.4, 0.015, 0.06, 0, 0.07, -hd + 2.6 + r * 1.2, "#c9a24a", 0, { shadow: false });
      add(1.8, 2.6, 0.35, 0, 0.06, -hd + 0.3, "#e8dcc4");
      add(1.1, 2.0, 0.2, 0, 0.06, -hd + 0.4, "#2f6a6a");
      add(0.9, 0.6, 0.1, 0, 2.06, -hd + 0.46, "#d4b06a", 0, { shadow: false });
      for (let i = 0; i < 8; i++) add(0.9, 0.22 * (i + 1), 0.3, 2.2, 0.06, -hd + 2.8 - i * 0.3, "#e8dcc4");
      add(0.9, 1.0, 0.9, 2.2, 1.8, -hd + 0.6, "#e8dcc4");
      add(0.12, 0.6, 0.12, 2.2, 2.8, -hd + 0.6, "#d4b06a");
      add(1.0, 1.1, 0.8, -2.4, 0.06, -hd + 1.2, "#8a5a3a");
      add(3, 0.12, 3, 0, 2.7, 0.5, "#d4b06a", 0, { geo: new THREE.TorusGeometry(1.4, 0.05, 6, 32).rotateX(Math.PI / 2), mat: { metalness: 0.6, roughness: 0.3 }, shadow: false });
      for (let k = 0; k < 12; k++) add(0.1, 0.16, 0.1, Math.cos(k * Math.PI / 6) * 1.4, 2.72, 0.5 + Math.sin(k * Math.PI / 6) * 1.4, null, 0, { material: new THREE.MeshBasicMaterial({ color: "#ffe8b0", toneMapped: false }), shadow: false });
      for (const x of [-hw + 1.2, hw - 1.2]) for (let r = 0; r < 3; r++) add(1.6, 0.04, 0.35, x, 0.25 + r * 0.35, hd - 0.6, "#8a6a52");
      S(0, -hd + 1.4, 0, "stand");
      break;
    }
    case "itfaiye": {
      if (f === 0) {
        // Araç bölmeleri: sarı çizgiler; yanda kask ve ceket dolapları, hortum makaraları, iniş direği.
        const bays = Math.max(1, Math.floor((b.w - 4) / 5));
        for (let k = 0; k <= bays; k++) add(0.12, 0.012, b.d - 3, -hw + 1.5 + k * ((b.w - 4) / bays), 0.07, 0.6, "#e8c23a", 0, { shadow: false });
        for (let k = 0; k < 6; k++) {
          const z = -hd + 1.4 + k * 1.1;
          add(0.5, 1.9, 0.9, -hw + 0.45, 0.06, z, "#b8231f");
          add(0.32, 0.25, 0.32, -hw + 0.45, 1.98, z, "#e8c23a", 0, { geo: new THREE.SphereGeometry(0.16, 8, 6) });
        }
        for (let k = 0; k < 2; k++) add(0.7, 0.7, 0.25, -hw + 3 + k * 1.2, 1.2, -hd + 0.4, "#b8231f", 0, { geo: new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12).rotateX(Math.PI / 2) });
        add(0.08, 3.1, 0.08, hw - 1.5, 0.06, -hd + 1.5, "#c9ced4", 0, { mat: { metalness: 0.8, roughness: 0.2 } });
        S(-hw + 1.4, -hd + 2, Math.PI / 2, "shelf");
        S(-hw + 3, -hd + 1.2, Math.PI, "stand");
      } else {
        // Koğuş: ranzalar, mutfak masası, dolaplar; iniş direğinin deliği korkuluklu.
        for (let k = 0; k < 3; k++) {
          const x = -hw + 1.6 + k * 2.4;
          add(1.0, 0.45, 2.0, x, 0.06, -hd + 1.2, "#e9e2d6");
          add(1.0, 0.1, 2.0, x, 1.35, -hd + 1.2, "#e9e2d6");
          add(0.06, 1.5, 0.06, x - 0.47, 0.06, -hd + 0.25, "#3c4148");
        }
        table(hw - 3.5, 1.5, 4, false);
        for (let k = 0; k < 5; k++) add(0.55, 1.9, 0.5, -hw + 0.4, 0.06, 1 + k * 0.6, "#6f7d4a");
        add(0.9, 1.0, 0.06, hw - 1.5, 0.06, -hd + 1.05, "#c9ced4", 0, { mat: { metalness: 0.6, roughness: 0.3 } });
        S(hw - 3.5, 0.8, 0, "seat");
      }
      break;
    }
    case "garaj": {
      // Belediye garajı: çöp kamyonu bölmesi (yağ lekesi, bakım kanalı), tezgâh ve aletler, lastik yığını.
      add(1.2, 0.02, b.d - 4, -1.5, 0.07, 0.5, "#3a3d42", 0, { shadow: false });
      add(2.4, 0.02, 1.6, 2.5, 0.07, 1.5, "#4a4a4a", 0, { shadow: false });
      counter(hw - 1.2, -hd + 2.5, 3, "#6b6f74", "#8a6a52");
      for (let k = 0; k < 6; k++) add(0.06, 0.4, 0.06, hw - 2.4 + k * 0.4, 1.4, -hd + 0.2, "#c9ced4");
      add(3, 1.2, 0.05, hw - 1.5, 1.3, -hd + 0.18, "#c9b79c");
      for (let k = 0; k < 4; k++) add(0.7, 0.25, 0.7, -hw + 0.8, 0.06 + k * 0.25, hd - 1.2, "#1d1d22", 0, { geo: new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12).translate(0, 0.125, 0) });
      // İki direkli araç lifti ve kırmızı takım dolabı.
      for (const dx of [-1.6, 1.6]) {
        add(0.35, 2.6, 0.35, 2.5 + dx, 0.06, -1.5, "#e8c23a");
        add(1.2, 0.1, 0.18, 2.5 + dx * 0.6, 0.5, -1.5, "#3a3d42");
      }
      add(1.4, 1.0, 0.6, -hw + 1, 0.06, -hd + 0.5, "#b8231f");
      for (let r = 0; r < 4; r++) add(1.3, 0.02, 0.02, -hw + 1, 0.3 + r * 0.2, -hd + 0.82, "#c9ced4", 0, { shadow: false });
      S(hw - 1.2, -hd + 3.3, Math.PI, "counter");
      break;
    }
    case "kulube": {
      if (/Fener/.test(b.address ?? "")) {
        // Fener bekçisinin evi: yatak, masa, telsiz, soba, dürbün rafı.
        add(1.0, 0.45, 2.0, -hw + 0.8, 0.06, -hd + 1.2, "#e9e2d6");
        add(1.0, 0.1, 0.6, -hw + 0.8, 0.51, -hd + 0.45, "#f4f1ea");
        table(1.2, 0, 2, false);
        add(0.5, 0.3, 0.35, 1.2, 0.8, -0.2, "#2a2d33");
        add(0.6, 0.8, 0.6, hw - 0.6, 0.06, -hd + 0.6, "#2a2a2e");
        S(1.2, 0.8, Math.PI, "seat");
      } else {
        // Balıkçı kulübesi: ağ yığınları, duvarda şamandıralar, kürekler, masa, küçük soba.
        for (const [x, z, c] of [[-hw + 1.2, -hd + 1, "#4f8a57"], [-hw + 1.4, hd - 1.2, "#3e7a86"]]) add(1.6, 0.5, 1.2, x, 0.06, z, c, 0, { geo: new THREE.SphereGeometry(0.8, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.75) });
        for (let k = 0; k < 5; k++) add(0.32, 0.32, 0.32, -hw + 1 + k * 0.8, 1.6, -hd + 0.2, k % 2 ? "#e8653a" : "#f4f1ea", 0, { geo: new THREE.SphereGeometry(0.16, 8, 6) });
        for (const dx of [0, 0.3]) add(0.08, 2.2, 0.08, hw - 0.4 - dx, 0.06, -hd + 0.3, "#8a6a4a", 0.15);
        table(0.6, 0.4, 2, false);
        add(0.5, 0.7, 0.5, hw - 0.6, 0.06, hd - 0.7, "#2a2a2e");
        S(-hw + 1.2, -hd + 2, 0, "bench");
      }
      break;
    }
    case "ahir": {
      if (f === 0) {
        // Bölmeler (ahşap), yemlik, saman; ortada geçit.
        const stalls = Math.max(2, Math.floor(b.w / 3));
        for (let k = 0; k <= stalls; k++) {
          const x = -hw + 0.3 + k * ((b.w - 0.6) / stalls);
          add(0.1, 1.2, 3.2, x, 0.06, -hd + 1.8, "#8a6a4a");
        }
        add(b.w - 0.6, 0.5, 0.4, 0, 0.06, -hd + 3.3, "#6b4a35");
        for (let k = 0; k < stalls; k++) add(1.6, 0.25, 1.4, -hw + 0.3 + (k + 0.5) * ((b.w - 0.6) / stalls), 0.06, -hd + 1.3, "#d9b866", 0, { shadow: false });
        for (let k = 0; k < 4; k++) add(1.0, 0.5, 0.6, hw - 1 - (k % 2) * 1.1, 0.06 + Math.floor(k / 2) * 0.5, hd - 1, "#d9b866");
        S(0, -hd + 3.9, Math.PI, "stand");
      } else {
        // Samanlık: üst üste balyalar, yaba.
        for (let k = 0; k < 12; k++) add(1.0, 0.5, 0.6, -hw + 1 + (k % 6) * 1.1, 0.06 + Math.floor(k / 6) * 0.5, -hd + 1 + (k % 2) * 0.7, "#d9b866");
        add(0.05, 1.6, 0.05, hw - 1, 0.06, 0, "#8a6a4a", 0.3);
        S(0, 1, Math.PI, "walk");
      }
      break;
    }
    case "liman": {
      if (f === 0) {
        // Vapur iskelesi bekleme salonu: gişe, sıra sıra banklar, sefer panosu, turnike.
        counter(-hw + 2, -hd + 1.2, 3, "#2f5d8a", "#c9ced4");
        add(2.6, 0.9, 0.06, -hw + 2, 1.6, -hd + 0.2, null, 0, { material: new THREE.MeshBasicMaterial({ color: "#1d2a3a", toneMapped: false }), shadow: false });
        for (let r = 0; r < 4; r++) add(2.0, 0.08, 0.04, -hw + 2, 1.75 + r * 0.18, -hd + 0.24, null, 0, { material: new THREE.MeshBasicMaterial({ color: "#f2c230", toneMapped: false }), shadow: false });
        for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) {
          const x = 0.5 + k * 3, z = -0.4 + r * 1.8;
          add(2.4, 0.06, 0.5, x, 0.45, z, "#3e8a86");
          add(2.4, 0.5, 0.06, x, 0.5, z - 0.25, "#3e8a86");
          for (let c = 0; c < 3; c++) guests.push(spot(x - 0.8 + c * 0.8, z, 0, "guest"));
        }
        for (let k = 0; k < 3; k++) add(0.15, 1.0, 0.6, -hw + 1 + k * 1.2, 0.06, hd - 1.3, "#9aa3ad", 0, { mat: { metalness: 0.5, roughness: 0.4 } });
        S(-hw + 2, -hd + 2, Math.PI, "counter");
      } else {
        for (let k = 0; k < 3; k++) desk(-hw + 2 + k * 2.6, -1);
        S(-hw + 2, -0.45, Math.PI, "desk");
      }
      break;
    }
    case "ambar": {
      if (f === 0) {
        // Palet rafları sıra sıra; aralarında forklift koridoru; ön tarafta yükleme alanı.
        const rows = Math.max(1, Math.floor((b.d - 5) / 3));
        for (let r = 0; r < rows; r++) {
          const z = -hd + 1.2 + r * 3;
          for (let lv = 0; lv < 3; lv++) {
            add(b.w - 6, 0.08, 1.0, -1, 0.06 + lv * 1.4 + 1.2, z, "#e8653a", 0, { mat: { metalness: 0.4, roughness: 0.5 } });
            for (let k = 0; k < Math.floor((b.w - 6) / 1.4); k++) add(1.1, 1.0, 0.9, -hw + 2.3 + k * 1.4, 0.06 + lv * 1.4 + (lv ? 0.2 : 0), z, ["#b48a5a", "#c9a27a", "#8a6a52"][(k + r + lv) % 3]);
          }
          for (let k = 0; k <= Math.floor((b.w - 6) / 4); k++) add(0.1, 4.1, 0.1, -hw + 2 + k * 4, 0.06, z - 0.45, "#2f5d8a");
        }
        S(hw - 2, hd - 2, Math.PI, "stand");
      } else {
        for (let k = 0; k < 4; k++) desk(-hw + 2 + k * 2.6, -hd + 2);
        shelf(hw - 1.5, -hd + 0.4, 2.5);
        S(-hw + 2, -hd + 2.55, Math.PI, "desk");
      }
      break;
    }
    case "tersane": {
      if (f === 0) {
        // Kızakta tekne gövdesi (tahta kaplama), çevresinde iskele, tezgâhlar ve kaynak masası.
        const L = Math.min(b.w - 6, 16);
        // Yarım silindir (alt yarı, üstü açık), iki yüzlü: içi de görünür.
        const hull = new THREE.CylinderGeometry(1.6, 1.6, L, 12, 1, false, Math.PI, Math.PI).rotateZ(Math.PI / 2).scale(1, 1.1, 0.75);
        add(L, 2, 3, -1, 2.0, 0, "#a8643a", 0, { geo: hull, mat: { side: THREE.DoubleSide } });
        for (let k = 0; k < 5; k++) add(0.4, 0.3, 2.6, -1 - L / 2 + 1 + k * ((L - 2) / 4), 0.06, 0, "#6b4a35");
        for (const z of [-1.8, 1.8]) {
          for (let k = 0; k < 4; k++) add(0.08, 2.4, 0.08, -1 - L / 2 + k * (L / 3), 0.06, z, "#c9ced4");
          add(L, 0.06, 0.6, -1, 1.6, z, "#8a6a52");
        }
        counter(-hw + 1.5, hd - 1.2, 2.5, "#6b6f74", "#8a6a52");
        S(-1, -2.4, Math.PI, "stand");
        S(-hw + 1.5, hd - 2, 0, "counter");
      } else {
        for (let k = 0; k < 3; k++) desk(-hw + 2 + k * 2.6, -1);
        shelf(hw - 1.5, -hd + 0.4, 3);
        S(-hw + 2, -0.45, Math.PI, "desk");
      }
      break;
    }
    default: {
      for (let k = 0; k < 3; k++) desk(-hw + 2 + k * 2.5, -1);
      S(-hw + 2, -0.45, Math.PI, "desk");
    }
  }
  spots.guests = guests;
  return spots;
}

/**
 * Çekirdek: sağ kenarda merdiven (arkada; iki kol ve yarım kat sahanlığı), 4 ve daha çok katta önünde asansör.
 * Bölme duvarları alçak (kesit görünümünde içerisi görünür); merdivene ve asansöre ana alandan kapı boşluğuyla girilir.
 */
function core(b, f, add, CW, katlar) {
  const hw = b.w / 2, hd = b.d / 2, x0 = hw - CW, sx = hw - CW / 2;
  const lift = katlar >= 4;
  const stairEnd = -hd + 4.2;
  const coreEnd = lift ? Math.min(hd - 0.8, stairEnd + 2.1) : stairEnd;
  const wall = "#e2dccf", stone = "#d9d2c6", metal = { metalness: 0.5, roughness: 0.4 };
  const doorZ = stairEnd - 0.7, liftZ = (stairEnd + coreEnd) / 2;
  // Ana alana bakan bölme (merdiven ve asansör kapılarında boşluk) ve önü kapatan duvar.
  const gaps = [[doorZ, 1.1], ...(lift ? [[liftZ, 1.2]] : [])].sort((p, q) => p[0] - q[0]);
  let z = -hd + 0.15;
  for (const [c, w] of gaps) {
    if (c - w / 2 - z > 0.05) add(0.12, 1.05, c - w / 2 - z, x0, 0, (z + c - w / 2) / 2, wall);
    z = c + w / 2;
  }
  if (coreEnd - z > 0.05) add(0.12, 1.05, coreEnd - z, x0, 0, (z + coreEnd) / 2, wall);
  add(CW - 0.15, 1.05, 0.12, sx - 0.07, 0, coreEnd, wall);
  add(CW - 0.2, 0.02, coreEnd + hd - 0.3, sx, 0.06, (coreEnd - hd) / 2 + 0.15, "#cfc8bc", 0, { shadow: false });
  // Merdiven: ilk kol arkaya doğru yarım kata çıkar, sahanlık, ikinci kol öne doğru üst kata (en üst katta yok).
  doubleStair(add, { xa: sx - 0.62, xb: sx + 0.62, zFront: stairEnd - 0.35, zBack: -hd + 1.3, land: 1.0, H: FLOOR_H, upper: f < katlar - 1 });
  if (lift) {
    // Asansör kuyusu (alçak kesik duvarlar), ana alana bakan çelik kapı ve üstünde kat göstergesi.
    const steel = { metalness: 0.6, roughness: 0.3 };
    for (const zz of [stairEnd + 0.15, coreEnd - 0.15]) add(CW - 0.6, 1.05, 0.1, sx + 0.1, 0, zz, "#9aa3ad", 0, { mat: steel });
    add(0.6, 0.02, coreEnd - stairEnd - 0.4, sx + 0.1, 0.07, liftZ, "#5a5f66", 0, { shadow: false });
    for (const dz of [-0.28, 0.28]) add(0.05, 2.25, 0.55, x0 + 0.08, 0.06, liftZ + dz, "#c9ced4", 0, { mat: { metalness: 0.7, roughness: 0.25 } });
    add(0.12, 0.12, 1.3, x0 + 0.06, 2.3, liftZ, "#9aa3ad", 0, { mat: steel, shadow: false });
    add(0.03, 0.08, 0.3, x0 - 0.02, 2.42, liftZ, null, 0, { material: new THREE.MeshBasicMaterial({ color: "#5fe08a", toneMapped: false }), shadow: false });
    add(0.04, 0.22, 0.1, x0 - 0.03, 1.0, liftZ + 0.75, "#2a2a2e");
  }
  // Çekirdeğin önündeki boş köşe: saksı.
  if (hd - coreEnd > 1.6) {
    add(0.45, 0.4, 0.45, sx, 0.06, coreEnd + 0.9, "#b5653f");
    add(0.7, 0.8, 0.7, sx, 0.85, coreEnd + 0.9, "#5f8f4a", 0, { geo: new THREE.IcosahedronGeometry(0.4, 0) });
  }
}

/** Çalışanın duruşu: nokta türüne göre. */
export function workPose(type, p, t, ph, sitPose, idleGesture, k) {
  switch (type) {
    case "desk":
      sitPose(p, p.y + 0.47, k);
      p.lean = 0.15; p.shL = p.shR = 0.75; p.elL = p.elR = 1.35 + 0.08 * Math.sin(t * 9 + ph); p.headPitch = 0.15;
      break;
    case "counter":
      idleGesture(p, t, ph, false);
      p.shR = 0.8 + 0.25 * Math.sin(t * 2.4 + ph); p.elR = 0.9; p.shL = 0.6; p.elL = 1.0; p.lean = 0.08;
      break;
    case "board": {
      const g = Math.max(0, Math.sin(t * 0.8 + ph));
      p.shR = 1.4 + 0.6 * g; p.elR = 0.3; p.headYaw = 0.5 * Math.sin(t * 0.3 + ph);
      break;
    }
    case "bench":
      p.lean = 0.35; p.shL = p.shR = 1.0; p.elL = p.elR = 0.8 + 0.3 * Math.sin(t * 3 + ph);
      break;
    case "shelf":
      p.shR = 1.5 + 0.4 * Math.sin(t * 1.2 + ph); p.elR = 0.4; p.headPitch = -0.2;
      break;
    case "seat": {
      // Masada oturur: çay içer, kâğıt okur, sohbet eder.
      sitPose(p, p.y + 0.5, k);
      const sip = Math.max(0, Math.sin(t * 0.35 + ph)) ** 10;
      idleGesture(p, t, ph, sip < 0.1);
      p.shR = Math.max(p.shR, 0.5 + 0.9 * sip); p.elR = Math.max(p.elR, 1.2 + 1.0 * sip); p.lean = 0.15;
      break;
    }
    case "stand":
      idleGesture(p, t, ph, true);
      break;
    default:
      idleGesture(p, t, ph, true);
  }
}

export { roll };
