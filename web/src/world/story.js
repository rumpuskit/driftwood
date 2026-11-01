// Sakinlerin hikâyeleri: kişilik özellikleri, ilişkiler (en yakın arkadaş, komşular, iş arkadaşları),
// adaya gelişten bugüne olaylar ve günün akışı. Hepsi simülasyondan ve tohumdan türetilir; aynı kişiye
// bakan herkes aynı hikâyeyi okur.
import { ETKINLIK } from "./etkinlik.js";
import { prefOf } from "../tercih.js";
import * as sim from "../sim.js";

const PET_NAMES = {
  Kedi: ["Pamuk", "Tarçın", "Duman", "Minnoş", "Zeytin", "Fıstık", "Boncuk", "Şeker"],
  Köpek: ["Karabaş", "Çomar", "Paşa", "Lokum", "Kömür", "Badem", "Rüzgar", "Max"],
  Papağan: ["Cıvıl", "Yeşil", "Maviş", "Tüylü"],
  Kaplumbağa: ["Ağır Abi", "Kabuk", "Sabır", "Taş"],
};

const HOBBY_TRAIT = {
  balik: "Sabırlı", kitap: "Kitap kurdu", satranc: "Stratejist", resim: "Sanatçı ruhlu", bisiklet: "Sporcu",
  yuzme: "Deniz âşığı", ucurtma: "Çocuk ruhlu", gitar: "Müzik sever", fotograf: "Meraklı gözlemci", kosu: "Sporcu",
  tavla: "Rekabetçi", yoga: "Huzur arayan",
};
const JOB_TRAIT = {
  doktor: "Yardımsever", hemsire: "Şefkatli", ogretmen: "Sabırlı anlatıcı", yazilimci: "Teknoloji meraklısı",
  tasarimci: "Estetik düşkünü", avukat: "Hazırcevap", mimar: "Planlı", barista: "Güler yüzlü", garson: "Güler yüzlü",
  asci: "Gurme", firinci: "Erkenci", balikci: "Erkenci", cankurtaran: "Cesur", rehber: "Sohbet sever",
  fener_bekcisi: "Yalnızlığı sever", bahcivan: "Doğa sever", zeytinci: "Toprağa bağlı", kutuphaneci: "Kitap kurdu",
  seramikci: "Elleri hünerli", marangoz: "Elleri hünerli", ressam: "Sanatçı ruhlu", muhasebeci: "Titiz", memur: "Düzenli",
  liman_iscisi: "Çalışkan", gemi_ustasi: "Usta işi sever", kasiyer: "Dakik", resepsiyonist: "Nazik",
  anakara: "Vapur müdavimi", ogrenci: "Hevesli", uzaktan: "Bağımsız", emekli: "Hayat tecrübeli",
};
const EXTRA_TRAITS = ["Esprili", "Sosyal kelebek", "Sakin", "Nostaljik", "Meraklı", "Dakik", "Hayalperest", "Cömert", "Çay tiryakisi", "Kahve tiryakisi"];

const fmtDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" });
const dateOf = (day) => fmtDate.format(new Date(day * 86400000));

export class Stories {
  constructor(people) {
    this.people = people;
    const res = people.residents;
    // En yakın arkadaş: aynı hobiyi paylaşanlar sıra numarasına göre ikişer eşleşir (karşılıklı).
    this.friend = new Int32Array(res.length).fill(-1);
    const byHobby = new Map();
    res.forEach((r, i) => {
      const h = people.hobbies[i].id;
      if (!byHobby.has(h)) byHobby.set(h, []);
      byHobby.get(h).push(i);
    });
    for (const list of byHobby.values()) {
      list.sort((a, b) => res[a].slot - res[b].slot);
      for (let k = 0; k + 1 < list.length; k += 2) {
        this.friend[list[k]] = list[k + 1];
        this.friend[list[k + 1]] = list[k];
      }
    }
    // İş arkadaşları: aynı iş yeri.
    this.workmates = new Map();
    res.forEach((r, i) => {
      // Evde olanların (emekli, evden çalışan) ve anakaraya gidenlerin ortak iş yeri yok.
      if (["ev", "anakara", "zeplin"].includes(people.works[i].wp.kind)) return;
      const key = people.works[i].wp.kind + ":" + people.works[i].wp.index;
      if (!this.workmates.has(key)) this.workmates.set(key, []);
      this.workmates.get(key).push(i);
    });
  }

  traits(i) {
    const p = this.people;
    const r = p.residents[i];
    const out = [];
    const add = (t) => { if (t && !out.includes(t)) out.push(t); };
    add(HOBBY_TRAIT[p.hobbies[i].id]);
    add(JOB_TRAIT[p.works[i].job]);
    const day = p.day;
    if (sim.pet(r, day)) add("Hayvansever");
    const plan = p.plans?.[i];
    if (plan) {
      // Erkenci: sabah erken uyanan (gece vardiyasından dönenler sayılmaz).
      const wake = plan[0]?.ne === "uyku" ? plan[0].son : 420;
      if (wake < 390) add("Erkenci");
      if (plan[0]?.ne === "is") add("Gece kuşu");
      const sleep = plan.findLast((s) => s.ne === "uyku")?.bas ?? 1380;
      if (sleep > 1400) add("Gece kuşu");
    }
    add(EXTRA_TRAITS[sim.roll(r.seed, "huy") % EXTRA_TRAITS.length]);
    return out.slice(0, 4);
  }

  petName(i) {
    const r = this.people.residents[i];
    const kind = sim.pet(r, this.people.day);
    if (!kind) return null;
    const names = PET_NAMES[kind] ?? ["Dostum"];
    // Doğrulanmış sakin evcilinin adını seçebilir (tercih.js).
    return { kind, name: prefOf(r.handle)?.evcil_ad ?? names[sim.roll(r.seed, "evcilAd") % names.length] };
  }

  neighbors(i) {
    const p = this.people;
    const slot = p.residents[i].slot;
    const per = sim.cap("daire_per_bina");
    const base = slot - (slot % per);
    const out = [];
    for (let s = base; s < base + per; s++) {
      const j = p.slotToIndex.get(s);
      if (j != null && j !== i) out.push(j);
    }
    return out;
  }

  coworkers(i) {
    const p = this.people;
    const key = p.works[i].wp.kind + ":" + p.works[i].wp.index;
    return (this.workmates.get(key) ?? []).filter((j) => j !== i);
  }

  /** Adaya gelişten bugüne olaylar (en yeniden eskiye). */
  timeline(i) {
    const p = this.people;
    const r = p.residents[i];
    const today = p.day;
    const events = [];
    events.push({ day: r.arrived_day, text: "Sabahın ilk vapuruyla adaya geldi, " + sim.addressText(r.slot).split(",").slice(0, 2).join(",") + " adresine yerleşti." });
    const job = sim.job(r);
    const startText = { emekli: "Emekliliğinin tadını adada çıkarmaya başladı.", uzaktan: "Evinin bir köşesini çalışma odası yaptı; işini adadan sürdürüyor.", anakara: "Her sabah vapurla anakaradaki işine gidip gelmeye başladı.", ogrenci: "Üniversiteye her sabah vapurla gidip gelmeye başladı." }[job.id] ?? `İşe başladı: ${p.works[i].loc.name}.`;
    events.push({ day: r.arrived_day + 1, text: startText });
    // Terfiler: kıdem eşikleri (emeklilerde yok).
    for (let day = r.arrived_day + 1; !job.calismaz && day <= today; day++) {
      const before = sim.rank(r, day - 1), now = sim.rank(r, day);
      if (now > before) events.push({ day, text: `Terfi etti: artık ${job.kademeler[Math.min(now, job.kademeler.length - 1)]}.` });
    }
    const pet = this.petName(i);
    if (pet) {
      const adopt = r.arrived_day + 5 + (sim.roll(r.seed, "evcil_gun") % 25);
      if (adopt <= today) events.push({ day: adopt, text: `Yeni bir dostu oldu: ${pet.kind.toLocaleLowerCase("tr")} ${pet.name}.` });
    }
    const f = this.friend[i];
    if (f >= 0) {
      const met = Math.max(r.arrived_day, p.residents[f].arrived_day) + 1 + (sim.roll(r.seed ^ p.residents[f].seed, "tanisma") % 9);
      if (met <= today) events.push({ day: met, text: `${p.hobbies[i].ad} sırasında @${p.residents[f].handle} ile tanıştı; o günden beri en yakın arkadaşı.` });
    }
    const first = r.arrived_day + 2 + (sim.roll(r.seed, "ilkHobi") % 5);
    if (first <= today) events.push({ day: first, text: `Adadaki ilk "${p.hobbies[i].ad.toLocaleLowerCase("tr")}" gününü yaşadı.` });
    return events.filter((e) => e.day <= today).sort((a, b) => b.day - a.day).map((e) => ({ ...e, date: dateOf(e.day) }));
  }

  /** Günün akışı: plan parçaları insan diliyle. */
  today(i, placeLabel, homeLabel) {
    const p = this.people;
    const plan = p.plans[i];
    const out = [];
    const f = this.friend[i];
    plan.forEach((seg, k) => {
      const at = sim.formatMinute(seg.bas);
      if (seg.ne === "uyku") { if (k > 0) out.push([at, "Uyudu"]); return; }
      if (seg.ne === "ev") { out.push([at, homeLabel(k)]); return; }
      if (seg.ne === "yol") {
        const trip = p.tripStore?.[i]?.get(k) ?? p._trip(i, seg, k);
        const how = { araba: "arabasıyla", otobus: "otobüsle", taksi: "taksiyle", yaya: "yürüyerek" }[trip?.mode];
        // Dışarı çıkışta gidilen gerçek yer (etkinliğin yeri), plandaki genel "meydan" değil.
        const to = seg.nereye === "meydan" || seg.nereye.startsWith("hobi:") ? p._placeOf(i, k + 1) ?? seg.nereye : seg.nereye;
        out.push([at, how ? `${placeLabel(to)} · ${how}` : `${placeLabel(to)} yolunda`]);
        return;
      }
      if (seg.ne === "is") { out.push([at, `İşte · ${p.works[i].loc.name}`]); return; }
      const withFriend = f >= 0 && p.plans[f]?.some((q) => q.yer === seg.yer && q.bas < seg.son && q.son > seg.bas) ? ` (@${p.residents[f].handle} ile)` : "";
      const act = p.acts?.[i]?.get(k);
      if (act && ETKINLIK[act]) out.push([at, `${ETKINLIK[act].ad}${withFriend}`]);
      else if (seg.ne === "hobi") out.push([at, `${p.hobbies[i].ad} · ${placeLabel(seg.yer)}${withFriend}`]);
      else if (seg.ne === "meydan") out.push([at, `Dışarıda · ${placeLabel(p._placeOf(i, k) ?? "meydan")}${withFriend}`]);
    });
    return out;
  }
}
