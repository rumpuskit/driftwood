// Ekrandaki paneller: saat ve nüfus, zaman hızı, "Kendini bul" araması, sakin kartı ve ev içi görünümü.
import * as sim from "./sim.js";
import { HOME_LABELS, homeActivity } from "./world/life.js";
import { TIKTOK, TIKTOK_URL, ZEPLIN_REKLAM, nextMove } from "./config.js";
import { svg, BINA_SIMGE, ARAC_SIMGE } from "./icons.js";
import { ETKINLIK } from "./world/etkinlik.js";
import { residentCard, shareCanvas } from "./paylas.js";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const PLACE_NAMES = {
  meydan: "Meydan", iskele: "Balık iskelesi", park: "Park", sahil_yolu: "Sahil yolu", plaj: "Plaj",
  tepe: "Tepe", fener: "Fener", kahvehane: "Kahvehane", pazar: "Pazar", saha: "Futbol sahası",
};
// Buluşma yerinde ne yapıyor (yer anahtarına göre); yanında kimin olduğu ayrıca eklenir.
// Etkinliklerin yeri (etkinlik.js yer anahtarları) kart ve "Bugün" listesinde.
const EXTRA_PLACES = { iskele_vapur: "Vapur iskelesi", kiyi: "Kıyı", kapi: "Kapı önü", market: "Market", firin: "Fırın", cami: "Cami", sahil_yolu: "Sahil yolu", sinema: "Plaj sineması" };
const OUT_LABELS = {
  meydan: "Meydanda", park: "Parkta geziniyor", sahil_yolu: "Sahil yolunda yürüyüşte",
  kahvehane: "Kahvehanede", pazar: "Pazarda alışverişte", saha: "Futbol sahasında",
};

// İş yeri adı olmayan binaların kartta görünen adı.
const BUILDING_NAMES = { cami: "Cami", liman: "Vapur iskelesi", ambar: "Liman ambarı", tersane: "Tersane", kulube: "Balıkçı kulübesi", ahir: "Çiftlik", itfaiye: "İtfaiye istasyonu", garaj: "Belediye garajı", bufe: "Büfe", carsi: "Çarşı dükkânı" };

const fmt = new Intl.NumberFormat("tr-TR");
const $ = (id) => document.getElementById(id);
// Sakinin görünen adı: adını gizlemek isteyenler "Gizli komşu" olarak görünür.
export const at = (r) => (r.hidden ? "Gizli komşu" : "@" + r.handle);

export function createUI({ residents, people, world, dollhouse, stories, traffic, zeplin = null, capture = null, claim = null, follow, setSpeed, flyTo, speed, today, minute, waiting = 0, listError = null, secim = null }) {
  const byHandle = new Map(residents.map((r, i) => [r.handle, i]));
  $("cta").href = TIKTOK_URL;
  // İskelede bekleyenler: takip etmiş, sıradaki taşınmayı bekleyenler. Dokununca iskeleye uçar.
  if (waiting > 0 && world.ferryPier) {
    const btn = $("waiting");
    btn.hidden = false;
    btn.innerHTML = svg("valiz");
    btn.append(`${fmt.format(waiting)} kişi iskelede · taşınma ${nextMove()}`);
    btn.addEventListener("click", () => {
      const P0 = world.ferryPier;
      flyTo(0, P0.top, P0.z0 + 14, 45);
    });
  }
  // Belediye başkanlığı seçimi (açıkken): kalan süre ve önde giden; dokununca belediyeye gider, kart adayları gösterir.
  const belediye = () => Object.values(world.workplaces.belediye ?? []).find(Boolean)?.building;
  if (secim?.durum === "acik") {
    const btn = $("secim");
    const kalan = Math.max(0, secim.bitis - Date.now() / 1000);
    const sure = kalan > 86400 ? `${Math.ceil(kalan / 86400)} gün kaldı` : kalan > 3600 ? `${Math.ceil(kalan / 3600)} saat kaldı` : "son saat";
    const lider = secim.adaylar?.find(([h]) => h);
    btn.hidden = false;
    btn.innerHTML = svg("sandik");
    btn.append(`Başkanlık seçimi · ${sure}` + (lider ? ` · önde @${lider[0]}` : " · aday ol: “adayım” yaz"));
    btn.addEventListener("click", () => { const b = belediye(); if (b) openBuilding(b); });
  }

  // Sıradaki gelişim adımı: kaç sakin daha gelince ne açılacak; çubuk bir önceki adımdan bu yana ilerleme.
  // Dokununca yerine (şantiyeye) uçar.
  const ns = world.nextStage;
  if (ns) {
    const btn = $("next");
    const need = Math.max(1, ns.nufus - residents.length);
    const prev = Math.max(0, ...sim.cat().gelisim.map((g) => g.nufus).filter((n) => n < ns.nufus));
    btn.hidden = false;
    $("next-name").textContent = ns.name;
    $("next-need").textContent = waiting >= need ? `${nextMove()} taşınmasında` : `${fmt.format(need)} sakin daha`;
    // Adımın başında da çubuk görünsün (en az %4).
    $("next-bar").style.width = `${Math.round(Math.min(1, Math.max(0.04, (residents.length - prev) / (ns.nufus - prev))) * 100)}%`;
    if (ns.at) btn.addEventListener("click", () => flyTo(ns.at[0], world.groundY(ns.at[0], ns.at[1]), ns.at[1], 110));
  }
  let selected = null;
  let mode = null; // "sakin" | "bina" | "arac"
  let vehicle = null; // seçili aracın kaydı
  let tab = "simdi";
  for (const btn of document.querySelectorAll("#card-tabs button")) {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      for (const b of document.querySelectorAll("#card-tabs button")) b.classList.toggle("on", b === btn);
      render();
    });
  }

  for (const btn of document.querySelectorAll("#speed button")) {
    btn.classList.toggle("on", Number(btn.dataset.speed) === speed);
    btn.addEventListener("click", () => {
      setSpeed(Number(btn.dataset.speed));
      for (const b of document.querySelectorAll("#speed button")) b.classList.toggle("on", b === btn);
    });
  }

  function placeLabel(i, yer) {
    if (yer === "ev") return "Ev";
    if (yer === "is") return people.works[i].loc.name;
    if (yer.startsWith("mahalle:")) return sim.isOpen(`cay:${yer.slice(8)}`) ? "Mahallesinin çay bahçesi" : "Mahallesi";
    const key = yer.replace("hobi:", "");
    if (key === "iskele" && !world.places.iskele) return "Kıyı"; // balık iskelesi açılana kadar kıyıdan balık tutulur
    if (PLACE_NAMES[key] && !world.places[key]) return "Meydan"; // yeri henüz açılmamış hobi meydanda geçer
    return PLACE_NAMES[key] ?? EXTRA_PLACES[key] ?? yer;
  }

  /** Yolculuğun gerçek varış yeri: "meydan" planı saate göre farklı yerlere dağılır. */
  function destOf(i, seg) {
    if (seg.nereye !== "meydan" && !seg.nereye.startsWith("hobi:")) return seg.nereye;
    const k = people.plans[i].findIndex((q) => q.bas === seg.son);
    return k >= 0 ? people._placeOf(i, k) ?? "meydan" : "meydan";
  }

  function nowText(i) {
    const seg = people.activities[i];
    if (!seg) return "";
    switch (seg.ne) {
      case "uyku":
      case "ev": {
        const act = homeActivity(residents[i].seed, seg, minute(), today(), people.hobbies[i].id, people.homeWork?.[i]);
        return (seg.ne === "ev" ? "Evde · " : "") + HOME_LABELS[act];
      }
      case "is": {
        const j = people.works[i].job;
        if (j === "ogrenci") return "Anakarada, üniversitede";
        if (j === "anakara") return "Anakarada, işte";
        if (j === "zeplin_pilotu") return zeplin?.pose.visible ? "Zeplini uçuruyor" : "Anakarada, zeplin üssünde";
        return `İşte · ${people.works[i].loc.name}`;
      }
      case "yol": {
        const d = destOf(i, seg);
        // Yolculuk varışa yetişecek saatte başlar; o ana kadar evinde bekler (görünmez).
        const leg = people.travelCache[i]?.legs.find((l) => minute() < l.t1);
        if (!people.visible[i] && leg?.kind === "before" && seg.nereden === "ev") return `Evde, birazdan çıkacak → ${placeLabel(i, d)}`;
        if (d === "is" && (people.works[i].wp.kind === "anakara" || people.works[i].wp.kind === "zeplin")) return seg.nereden === "ev" ? "Vapura yetişmeye gidiyor" : "Vapurdan indi, eve dönüyor";
        return `Yolda → ${placeLabel(i, d)}`;
      }
      case "hobi":
      case "meydan": {
        // Günün etkinliği (etkinlik.js): kartta ne yaptığı; sosyal etkinlikte yanında kimin olduğu.
        const act = people.currentAct[i];
        if (act && ETKINLIK[act]) {
          const near = company(i);
          const e = ETKINLIK[act];
          if (!e.sosyal) return e.ad;
          return `${e.ad}, ${near.length === 0 ? "tek başına" : near.length === 1 ? `${at(residents[near[0]])} ile` : act === "kapi_onu" ? "komşularıyla" : "arkadaşlarıyla"}`;
        }
        if (seg.ne === "hobi") return `${people.hobbies[i].ad} · ${placeLabel(i, seg.yer)}`;
        const pl = people.currentPlace[i] ?? "meydan";
        const yer = pl.startsWith("mahalle:") ? (sim.isOpen(`cay:${pl.slice(8)}`) ? "Mahallesinin çay bahçesinde" : "Mahallesinde")
          : OUT_LABELS[pl] ?? "Çarşıda";
        // Yalnız gerçekten yanında biri varsa "arkadaşlarıyla" (12 m içinde dışarıda vakit geçiren sakinler).
        const near = company(i);
        const kim = pl.startsWith("mahalle:") ? "komşularıyla" : "arkadaşlarıyla";
        return `${yer}, ${near.length === 0 ? "tek başına" : near.length === 1 ? `${at(residents[near[0]])} ile` : kim}`;
      }
      default: return seg.ne;
    }
  }

  /** i'nin yakınında (12 m) dışarıda vakit geçiren diğer sakinler. */
  function company(i) {
    const P = people.positions, out = [];
    for (let j = 0; j < residents.length; j++) {
      if (j === i || !people.visible[j] || !["meydan", "hobi"].includes(people.activities[j]?.ne)) continue;
      if (Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 2] - P[i * 3 + 2]) < 12) out.push(j);
    }
    return out;
  }

  function facts(rows) {
    $("card-facts").replaceChildren(...rows.flatMap(([k, v, onClick]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      if (onClick) { dd.classList.add("link"); dd.addEventListener("click", onClick); }
      return [dt, dd];
    }));
  }

  const link = (j) => [at(residents[j]), () => select(j)];

  /** Kişinin kendisi için: yorumla seçtikleri ve henüz seçebilecekleri (istekler sonraki taşınmada işlenir). */
  function senMisin(r, unvan) {
    const o = r.overrides ?? {};
    const secti = [o.meslek && `mesleğini (${unvan})`, o.hobi && "hobini", o.evcil && "evcilini"].filter(Boolean);
    const oneri = [!o.meslek && "“meslek: balıkçı”", !o.hobi && "“hobi: tavla”", !o.evcil && "“evcil: kedi”"].filter(Boolean);
    const bas = secti.length ? `${secti.join(", ").replace(/, ([^,]*)$/, " ve $1")} sen seçtin. ` : "";
    const ne = oneri.length ? `Videomuza ${oneri.join(", ")} ya da “adımı gizle” yaz` : "Değiştirmek için videomuza yeniden yaz (ör. “meslek: polis”) ya da “adımı gizle” yaz";
    return `${bas}${ne}; sonraki taşınmada işlenir.`.replace(/^./, (c) => c.toLocaleUpperCase("tr"));
  }

  function renderPerson() {
    const r = residents[selected];
    const day = today();
    const t = sim.tenure(r, day);
    $("card-handle").textContent = at(r);
    icon(r.hidden ? "?" : r.handle[0].toLocaleUpperCase("tr"), `hsl(${r.seed % 360} 62% 58%)`);
    // İş yerinin adı yalnızca gerçek bir iş yeri varsa (emekli ve evden çalışanlarda yok).
    const wk = people.works[selected];
    // Asıl mesleğinin iş yeri adada henüz yoksa mesleğini anakarada yapar (vapurla gidip gelir).
    const dream = sim.dreamJob(r);
    const dreamTitle = dream.kademeler[Math.min(sim.rank(r, day), dream.kademeler.length - 1)];
    $("card-title").textContent = wk.wp.kind === "ev" ? (wk.job === "emekli" ? "Emekli" : `${sim.title(r, day)} · evinden çalışıyor`)
      : dream.id !== wk.job ? `${dreamTitle} · anakarada, vapurla` : `${sim.title(r, day)} · ${wk.loc.name}`;
    $("card-dream").hidden = dream.id === wk.job;
    if (dream.id !== wk.job) {
      const opens = sim.cat().isyerleri[dream.yer].map((name, k) => [sim.stageOf(`${dream.yer}:${k}`), name]).sort((a, b) => a[0] - b[0])[0];
      $("card-dream").innerHTML = svg("vinc");
      $("card-dream").append(dream.yer === "zeplin" ? `${opens[1]} ${fmt.format(opens[0])}. sakinde gelince uçmaya başlayacak`
        : `${opens[1]} açılınca adada çalışacak (${fmt.format(opens[0])}. sakinde)`);
    }
    $("card-now").textContent = nowText(selected);
    $("card-tabs").hidden = false;
    $("card-traits").replaceChildren();
    const f = follow.get();
    followActions(f?.kind === "sakin" && f.i === selected ? f.view : null, { kind: "sakin", i: selected }, ["goz", "Gözünden bak"]);
    if (!r.hidden && capture) action(["paylas", "Paylaş"], () => shareResident(selected));
    // Kendini bulan için davet: "Bu benim" doğrulamaya (Benim evim) adı dolu götürür; doğrulanmışsa "Evimi döşe".
    if (!r.hidden && claim?.open) action(["ev", claim.me?.() === r.handle ? "Evimi döşe" : "Bu benim"], () => claim.open(r.handle));
    if (tab === "bugun") {
      const homeLabel = (k) => {
        const seg = people.plans[selected][k];
        const act = homeActivity(r.seed, seg, seg.bas + 1, day, people.hobbies[selected].id, people.homeWork?.[selected]);
        return "Evde · " + HOME_LABELS[act].toLocaleLowerCase("tr");
      };
      const placeName = (yer) => placeLabel(selected, yer);
      facts(stories.today(selected, placeName, homeLabel));
      return;
    }
    if (tab === "hikaye") {
      $("card-traits").replaceChildren(...stories.traits(selected).map((x) => {
        const span = document.createElement("span");
        span.textContent = x;
        return span;
      }));
      const rows = [];
      const f = stories.friend[selected];
      if (f >= 0) rows.push(["Can dostu", ...link(f)]);
      const pet = stories.petName(selected);
      if (pet) rows.push(["Evcil", `${pet.kind} · ${pet.name}`]);
      const nb = stories.neighbors(selected).slice(0, 3);
      nb.forEach((j, n) => rows.push([n === 0 ? "Komşular" : "", ...link(j)]));
      const cw = stories.coworkers(selected).slice(0, 3);
      cw.forEach((j, n) => rows.push([n === 0 ? "İş arkadaşları" : "", ...link(j)]));
      for (const e of stories.timeline(selected).slice(0, 8)) rows.push([e.date, e.text]);
      facts(rows);
      return;
    }
    const pet = sim.pet(r, day);
    facts([
      ["Adres", sim.addressText(r.slot)],
      ["Hobi", people.hobbies[selected].ad],
      ["Evcil", pet || "Henüz yok"],
      ["Adada", t === 0 ? "Bugün geldi" : t === 1 ? "Dün geldi" : `${fmt.format(t)} gündür`],
      ["Ulaşım", (people.hasCar[selected] ? "Kendi arabası" : world.vehicles ? "Otobüs ve yürüyüş" : "Yürüyerek (adada henüz araç yok)") + (["anakara", "zeplin"].includes(people.works[selected].wp.kind) ? " · işe vapurla" : "")],
      // İstekler videolarımızın yorumlarından okunur (sunucuda istekler.py; biçim orada).
      ...(!r.hidden ? [["Sen misin?", senMisin(r, dreamTitle)]] : []),
    ]);
  }

  function renderBuilding() {
    $("card-dream").hidden = true; // sakin kartından kalan "açılınca adada çalışacak" satırı binada/araçta görünmesin
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const b = dollhouse.building;
    if (!b.daireler) {
      icon(svg(BINA_SIMGE[b.kind] ?? "bina"), null, true);
      $("card-handle").textContent = dollhouse.workName ?? b.isim ?? (/Fener/.test(b.address ?? "") ? "Fener bekçisinin evi" : BUILDING_NAMES[b.kind] ?? "Dükkân");
      $("card-title").textContent = `${b.address ?? ""} · ${dollhouse.floor + 1}. kat`;
      // Yalnızca şu an bu katta çalışanlar (izinli, yolda ya da evde olanlar listelenmez).
      const rows = [];
      let total = 0;
      for (const [i] of dollhouse.workSpots) {
        total++;
        if (people.activities[i]?.ne !== "is") continue;
        rows.push([sim.title(residents[i], today()), at(residents[i]), () => select(i)]);
      }
      $("card-now").textContent = rows.length ? `Şu an ${rows.length} kişi çalışıyor (bu katın kadrosu ${total})` : total ? `Şu an kimse çalışmıyor (kadro ${total})`
        : b.kind === "muhtarlik" ? "Mahallenin muhtarı yok. İlk isteyen muhtar olur: videomuza “meslek: muhtar” yaz." : "Bu katta çalışan yok";
      if (b.kind === "belediye" && secim) {
        // Seçim: açıkken adaylar ve oyları, bittiyse başkan. Adını gizleyenler "Gizli aday".
        const ad = (h) => (h ? "@" + h : "Gizli aday");
        const sec = secim.durum === "acik"
          ? [["Seçim", "Aday olmak için videomuza “adayım”, oy için “oy: @aday” yaz (yalnız adada oturanlar)"],
             ...(secim.adaylar ?? []).map(([h, n], k) => [k === 0 ? "Adaylar" : "", `${ad(h)} · ${fmt.format(n)} oy`])]
          : [["Başkan", secim.kazanan ? "@" + secim.kazanan : "Gizli komşu"]];
        facts([...sec, ...rows.slice(0, 10)]);
        return;
      }
      facts(rows.slice(0, 12));
      if (rows.length > 12) facts([...rows.slice(0, 12), ["", `ve ${rows.length - 12} kişi daha`]]);
      return;
    }
    icon(svg("ev"), null, true);
    const p = sim.addressParts(b.slot0);
    $("card-handle").textContent = `${sim.sokakName(p.mahalle, p.sokak)} No ${p.bina * 2 + 1}`;
    $("card-title").textContent = `${sim.mahalleName(p.mahalle)}, Driftwood · ${b.floors} katlı apartman`;
    $("card-now").textContent = `${dollhouse.floor + 1}. kat`;
    const rows = [];
    for (let c = 0; c < b.perFloor; c++) {
      const k = dollhouse.floor * b.perFloor + c;
      if (k >= b.daireler) continue;
      const i = people.slotToIndex.get(b.slot0 + k);
      if (i == null) rows.push([`Daire ${k + 1}`, "Boş, yeni sakinini bekliyor"]);
      else rows.push([`Daire ${k + 1}`, `${at(residents[i])} · ${nowText(i)}`, () => select(i)]);
    }
    facts(rows);
  }

  function render() {
    $("floorbar").hidden = !dollhouse.isOpen();
    if (dollhouse.isOpen()) $("floor-label").textContent = `${dollhouse.floor + 1}. kat`;
    pending = [];
    if (mode === "sakin" && selected != null) renderPerson();
    else if (mode === "bina" && dollhouse.isOpen()) renderBuilding();
    else if (mode === "arac" && vehicle) renderVehicle();
    flushActions();
  }

  const KIND_NAMES = { car: "Otomobil", taxi: "Taksi", bus: "Otobüs", ambulans: "Ambulans", itfaiye: "İtfaiye aracı", cop: "Çöp kamyonu", zeplin: "Zeplin" };

  // Kart birkaç karede bir yeniden çizilir; düğmeler değişmediyse yerinde kalır (yoksa basılırken
  // DOM'dan kopar ve dokunuş boşa gider). Yalnızca tıklama işlevleri tazelenir.
  let pending = [];
  function action(label, onClick, primary = false) {
    pending.push({ label, onClick, primary });
  }

  function flushActions() {
    const box = $("card-actions");
    const sig = pending.map((a) => String(a.label) + (a.primary ? "*" : "")).join("|");
    if (box.dataset.sig === sig) {
      [...box.children].forEach((b, n) => { b._onClick = pending[n].onClick; });
      return;
    }
    box.dataset.sig = sig;
    box.replaceChildren(...pending.map((a) => {
      const b = document.createElement("button");
      // Etiket: düz metin ya da [simge, metin].
      if (Array.isArray(a.label)) { b.innerHTML = svg(a.label[0]); b.append(a.label[1]); } else b.textContent = a.label;
      if (a.primary) b.classList.add("primary");
      b._onClick = a.onClick;
      b.addEventListener("click", () => b._onClick());
      return b;
    }));
  }

  function renderVehicle() {
    $("card-dream").hidden = true; // sakin kartından kalan "açılınca adada çalışacak" satırı binada/araçta görünmesin
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const r = vehicle;
    const live = r.key ? traffic.active.get(r.key) : null;
    $("card-handle").textContent = KIND_NAMES[r.kind] ?? "Araç";
    icon(svg(ARAC_SIMGE[r.kind] ?? "araba"), null, true);
    const rows = [];
    if (r.kind === "zeplin") {
      const z = zeplin.pose;
      $("card-title").textContent = "Driftwood Blimp";
      const m = minute();
      $("card-now").textContent = z.visible
        ? { gelis: "Anakaradan adaya geliyor", tur: "Adanın üstünde tur atıyor", donus: "Anakaraya dönüyor" }[z.phase]
        : m < 540 ? "Anakarada, 09:00'da adaya gelecek" : "Anakarada, yarın 09:00'da gelecek";
      if (z.visible) rows.push(["Hız", `${Math.round(z.speed * 3.6)} km/sa`], ["Yükseklik", `${Math.round(z.y)} m`]);
      rows.push(["Uçuş", "Her gün 09:00–22:00"]);
      // Pilotlar: mesleği zeplin pilotu olan sakinler (kartından açılır).
      for (let i = 0; i < residents.length; i++) if (sim.dreamJob(residents[i]).id === "zeplin_pilotu") rows.push(["Pilot", at(residents[i]), () => select(i)]);
      if (ZEPLIN_REKLAM.ad) rows.push(["Reklam", ZEPLIN_REKLAM.ad]);
      facts(rows);
      const f = follow.get();
      if (z.visible) followActions(f?.kind === "zeplin" ? f.view : null, { kind: "zeplin" }, ["kamera", "Yanından izle"]);
      return;
    }
    if (r.kind === "bus") {
      const line = traffic.lines[r.line];
      $("card-title").textContent = `${line.name} · ${r.dep + 1}. sefer`;
      const n = live ? people.busSeat.get(live) ?? 0 : 0;
      $("card-now").textContent = live ? (live.v < 0.3 ? "Durakta / ışıkta bekliyor" : `${Math.round(live.v * 3.6)} km/sa`) : "Seferini tamamladı";
      rows.push(["Yolcu", `${n} kişi`], ["Durak", `${line.stops.length} durak, ${line.headway} dakikada bir`]);
    } else if (r.kind === "car" || r.kind === "taxi") {
      const owner = r.owner != null ? residents[r.owner] : null;
      $("card-title").textContent = r.kind === "taxi" ? "Driftwood Taksi" : owner ? `${at(owner)} adlı sakinin arabası` : "Otomobil";
      const done = r.key && !live; // yolculuk bitti, araç park yerinde
      $("card-now").textContent = r.parked ? "Park halinde" : live ? (live.parked ? "Park etti" : live.v < 0.3 ? "Bekliyor" : `${Math.round(live.v * 3.6)} km/sa`) : done ? (r.kind === "taxi" ? "Yolcusunu bıraktı" : "Park etti") : "Müşteri bekliyor";
      if (owner) rows.push([r.kind === "taxi" ? "Yolcu" : "Sahibi", at(owner), () => select(r.owner)]);
    } else {
      $("card-title").textContent = { ambulans: "Driftwood Hastanesi", itfaiye: "Driftwood İtfaiyesi", cop: "Belediye temizlik işleri" }[r.kind] ?? "";
      $("card-now").textContent = live ? ({ out: "Göreve gidiyor", wait: "Görevde", back: "Dönüyor" }[live.phase] ?? (live.v < 0.3 ? "Konteyner boşaltıyor" : "Toplama turunda")) : "Görevini tamamladı";
    }
    facts(rows);
    const f = follow.get();
    const on = f?.kind === "arac" && f.key === r.key;
    if (live && (!live.parked || on)) followActions(on ? f.view : null, { kind: "arac", key: r.key }, ["kamera", "Arkasından izle"]);
  }

  /** Dokununca takip kendiliğinden başlar; kartta yalnız bakış açısı seçilir (haritadan ya da gözünden). */
  function followActions(view, target, shoulderLabel) {
    if (view === "omuz") action(["harita", "Haritaya dön"], () => { follow.set(target, "harita"); render(); });
    else action(shoulderLabel, () => { follow.set(target, "omuz"); render(); });
  }

  /** Kart başlığındaki yuvarlak simge: harf (sakin) ya da çizgi simge (html: true). */
  function icon(text, color = null, html = false) {
    const el = $("card-icon");
    if (html) el.innerHTML = text; else el.textContent = text;
    el.style.background = color ?? "";
  }

  /** Araca dokununca: yoldaysa takip edilir, park halindeyse ona odaklanılır. */
  function selectVehicle(record) {
    if (!record) return;
    selected = null;
    mode = "arac";
    vehicle = record;
    dollhouse.close();
    const live = record.key ? traffic.active.get(record.key) : null;
    if (record.kind === "zeplin") follow.set({ kind: "zeplin" }, "harita");
    else if (live && !live.parked) follow.set({ kind: "arac", key: record.key }, "harita");
    else {
      follow.set(null);
      const at = record.slot != null ? traffic.slots[record.slot] : live?.route.position(live.s);
      if (at) flyTo(at.x, world.groundY(at.x, at.z), at.z, 45);
    }
    showCard();
  }

  $("gunun").addEventListener("click", () => {
    const th = people.theme;
    if (!th) return;
    const at = th.yer === "cami" ? world.workplaces.cami?.find(Boolean)?.door
      : th.id === "sinema" && people.cinema ? people.cinema.spot : world.placeOf(th.yer).anchors[0];
    if (at) { close(); flyTo(at[0], Math.max(0, world.height(at[0], at[1])), at[1], th.id === "sinema" ? 45 : 90); }
  });

  /** Kısa bildirim. */
  let toastTimer = null;
  function toast(text, ms = 3200) {
    const el = $("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  /** Sakin kartını görsel olarak paylaşır: sahnede kendisi (evdeyse evi), altında kartı. */
  async function shareResident(i) {
    const r = residents[i];
    const day = today();
    // Kadraj: sakin görünüyorsa yakından (masada oturuyorsa tentenin altından, alçak açıyla); görünmüyorsa
    // bulunduğu yer (evdeyse evi, değilse iş yeri/durak çevresi).
    let frame = null;
    const ne = people.activities[i]?.ne;
    if (people.visible[i]) {
      const role = people.roles[i]?.[people.plans[i].findIndex((q) => q === people.activities[i] || (q.bas === people.activities[i]?.bas && q.ne === ne))];
      const table = role?.item?.table;
      frame = { target: [people.positions[i * 3], people.positions[i * 3 + 1] + 1.0, people.positions[i * 3 + 2]], dist: table ? 8 : 12, up: table ? 0.14 : 0.55, inside: !!people.poses[i].indoor };
    } else if (ne === "ev" || ne === "uyku" || (ne === "yol" && people.activities[i].nereden === "ev" && people.travelCache[i]?.legs.find((l) => minute() < l.t1)?.kind === "before")) {
      const b = homeOf(i);
      if (b) frame = { target: [b.x, b.floors * 3.2 * 0.45, b.z], dist: Math.max(b.w, b.d, b.floors * 3.2) * 3.2, up: 0.45 };
    } else {
      const [x, z] = people.focusPoint(i);
      frame = { target: [x, world.groundY(x, z) + 2, z], dist: 45, up: 0.7 };
    }
    const shot = capture(frame);
    const pet = stories.petName(i);
    const t = sim.tenure(r, day);
    const card = residentCard(shot, {
      handle: at(r), letter: r.handle[0].toLocaleUpperCase("tr"), color: `hsl(${r.seed % 360} 62% 58%)`,
      title: $("card-title").textContent, now: nowText(i),
      rows: [
        ["Ev", sim.addressText(r.slot).replace(/, [^,]*Mahallesi, Driftwood$/, "")],
        ["Mahalle", sim.addressText(r.slot).match(/([^,]*Mahallesi)/)?.[1] ?? "Driftwood"],
        ["Hobi", people.hobbies[i].ad],
        ["Evcil", pet ? `${pet.kind} · ${pet.name}` : "Henüz yok"],
        ["Adada", t === 0 ? "Bugün geldi" : t === 1 ? "Dün geldi" : `${fmt.format(t)} gündür`],
      ],
      link: `https://driftwood.rumpuskit.com/?bul=${encodeURIComponent(r.handle)}`,
    });
    const res = await shareCanvas(card, { name: `driftwood-${r.handle}`, text: `Driftwood'da yaşıyorum: ${$("card-title").textContent}.`, url: `https://driftwood.rumpuskit.com/?bul=${encodeURIComponent(r.handle)}` });
    if (res === "indirildi-kopyalandi") toast("Kart indirildi, bağlantı kopyalandı");
    else if (res === "indirildi") toast("Kart indirildi");
  }

  function showCard() {
    $("card").hidden = false;
    document.body.classList.add("kart-acik");
    render();
  }

  function flyToFloor() {
    const { target, front } = dollhouse.focus();
    const dir = front.clone().multiplyScalar(0.72).setY(0.7).normalize();
    const size = Math.max(dollhouse.building.w, dollhouse.building.d);
    flyTo(target.x, target.y, target.z, Math.max(innerWidth < innerHeight ? 34 : 19, size * (innerWidth < innerHeight ? 2.0 : 1.15)), dir);
  }

  function homeOf(i) {
    const slot = residents[i].slot;
    return world.buildings.find((b) => b.daireler && slot >= b.slot0 && slot < b.slot0 + b.daireler);
  }

  /** Sakini seçer; evdeyse evinin içini açar. */
  /** Sakini seçer ve takip eder (takip: false, takipteki kişi bir binaya girip çıkınca yalnız kartı tazelemek için). */
  function select(i, fly = true, takip = true) {
    selected = i;
    mode = "sakin";
    // Evdeyse ya da işteyse iç mekâna uçulur (takip yine sürer, yaklaşma uçuştan gelir); dışarıdaysa takip kamerayı getirir.
    if (takip) follow.set({ kind: "sakin", i }, "harita", { yaklas: false });
    const seg = people.activities[i];
    const atHome = seg && (seg.ne === "ev" || seg.ne === "uyku");
    const home = homeOf(i);
    const workB = seg?.ne === "is" && !people.works[i].loc.outdoor ? people.works[i].loc.building : null;
    if (workB && !["liman", "tersane"].includes(workB.kind)) {
      const floor = sim.roll(residents[i].seed, "kat") % workB.floors;
      if (dollhouse.building !== workB || dollhouse.floor !== floor) dollhouse.open(workB, floor);
      if (fly) flyToFloor();
    } else if (atHome && home) {
      const floor = Math.floor((residents[i].slot - home.slot0) / home.perFloor);
      if (dollhouse.building !== home || dollhouse.floor !== floor) dollhouse.open(home, floor);
      if (fly) flyToFloor();
    } else {
      dollhouse.close();
      if (takip) follow.set({ kind: "sakin", i }, "harita");
      else if (fly) {
        const [x, z] = people.focusPoint(i);
        flyTo(x, world.groundY(x, z), z, innerWidth < innerHeight ? 30 : 18);
      }
    }
    showCard();
  }

  /** Bir binaya dokununca: içini aç (her binanın iç mekânı var: konut, iş yeri, kamu binası). Takip biter. */
  function openBuilding(b) {
    if (!b) return;
    follow.set(null);
    selected = null;
    mode = "bina";
    dollhouse.open(b, dollhouse.building === b ? dollhouse.floor : 0);
    flyToFloor();
    showCard();
  }

  function changeFloor(delta) {
    if (!dollhouse.isOpen()) return;
    dollhouse.setFloor(dollhouse.floor + delta);
    mode = "bina";
    selected = null;
    flyToFloor();
    showCard();
  }

  function find(text) {
    const handle = sim.normalizeHandle(text);
    if (!handle) return;
    const i = byHandle.get(handle);
    if (i == null) {
      selected = null;
      mode = null;
      dollhouse.close();
      $("card").hidden = false;
      $("floorbar").hidden = true;
      $("card-handle").textContent = "@" + handle;
      $("card-title").textContent = "Bu kullanıcı adı henüz adada değil.";
      $("card-now").textContent = `TikTok'ta @${TIKTOK} hesabını takip ettiysen iskelede sıranı bekliyorsun: sıradaki taşınma ${nextMove()}. ` +
        "Etmediysen takip et, sen de taşın. (Bazı hesapları, ör. gizli hesapları, TikTok takipçi listesinde göstermiyor; onlar taşınamıyor.)";
      $("card-facts").replaceChildren();
      $("card-tabs").hidden = true;
      $("card-traits").replaceChildren();
      return;
    }
    select(i);
  }

  function close() {
    selected = null;
    mode = null;
    vehicle = null;
    follow.set(null);
    dollhouse.close();
    $("card").hidden = true;
    document.body.classList.remove("kart-acik");
    $("floorbar").hidden = true;
  }

  $("card-close").addEventListener("click", close);
  $("floor-up").addEventListener("click", () => changeFloor(1));
  $("floor-down").addEventListener("click", () => changeFloor(-1));
  $("floor-exit").addEventListener("click", close);

  return {
    select,
    find,
    toast,
    openBuilding,
    selectVehicle,
    close,
    selected: () => (mode === "sakin" ? selected : null),
    selectedVehicle: () => (mode === "arac" && !$("card").hidden ? vehicle : null),
    tick(unix, minuteNow, day, times) {
      // Gün doğumu/batımı sığarsa (uzun gün adlarında ve telefonda gizlenir; tam metin ipucunda).
      const sunText = times?.rise != null ? ` · ${sim.formatMinute(times.rise)}–${sim.formatMinute(times.set)}` : "";
      const clock = $("clock"), text = `${sim.formatMinute(minuteNow)} · ${DAYS[sim.weekday(day)]}`;
      if (clock.dataset.text !== text + sunText) {
        clock.dataset.text = text + sunText;
        clock.title = text + sunText;
        clock.innerHTML = `${text}<span class="sun">${sunText ? " · " + svg("gunes") + sunText.slice(3) : ""}</span>`;
        clock.classList.remove("dar");
        if (clock.scrollWidth > clock.clientWidth + 1) clock.classList.add("dar");
      }
      // Döküm benzetimden: işte, evde (uyuyanlar dahil) ve dışarıda (yolda, çarşıda, hobisinde).
      let work = 0, home = 0;
      for (const seg of people.activities) {
        if (!seg) continue;
        if (seg.ne === "is") work++;
        else if (seg.ne === "ev" || seg.ne === "uyku") home++;
      }
      const out = residents.length - work - home;
      // Toplam, dar ekranda gizlenir (satır kesilmesin).
      if (!residents.length) {
        $("stats").innerHTML = `<span class="bos"></span>`;
        $("stats").firstChild.textContent = listError === "none" ? "Sakin listesi şu an alınamadı" : waiting ? "Ada ilk sakinlerini bekliyor" : "Ada ilk sakinini bekliyor";
      } else {
        const chip = (ic, n, t, cls = "") => `<span class="chip ${cls}"><b>${svg(ic)}${fmt.format(n)}</b><small>${t}</small></span>`;
        $("stats").innerHTML = chip("sakinler", residents.length, "sakin", "ana") + chip("is", work, "işte") + chip("ev", home, "evde") + chip("yurur", out, "dışarıda");
      }
      // Günün olayı (etkinlik.js): üst panelde tek satır; dokununca kamera olayın yerine gider.
      const th = people.theme, gun = $("gunun");
      gun.hidden = !th || !residents.length;
      if (th) {
        const key = `${th.id}|${th.ad}`;
        if (gun.dataset.key !== key) {
          gun.dataset.key = key;
          const ic = { cuma: "cami", sinema: "kamera", pazar: "sepet", ucurtma: "dag", gunbatimi: "gunes", balik: "balik", temizlik: "dalga", yildiz: "ampul", tavla: "fincan", komsuluk: "mahalle" }[th.id] ?? "gunes";
          gun.innerHTML = svg(ic);
          gun.append(`Bugün: ${th.ad}${th.bas != null ? ` · ${sim.formatMinute(th.bas)}` : ""}`);
          gun.title = gun.textContent;
        }
      }
      if (!$("card").hidden) render();
    },
  };
}
