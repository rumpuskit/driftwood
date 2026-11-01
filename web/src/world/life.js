// Evdeki gündelik hayat: simülasyon "evde" ya da "uykuda" der, burada evde tam olarak ne yaptığı seçilir.
// Saate ve kişiye göre deterministiktir: aynı anda bakan herkes aynı şeyi görür.
import { roll } from "../sim.js";

export const HOME_LABELS = {
  uyku: "Uyuyor",
  hazirlik: "Hazırlanıyor",
  kahvalti: "Kahvaltı yapıyor",
  yemek_yapma: "Yemek yapıyor",
  aksam_yemegi: "Akşam yemeği yiyor",
  tv: "Televizyon izliyor",
  kitap: "Kitap okuyor",
  telefon: "Telefonda geziniyor",
  dinlenme: "Kanepede dinleniyor",
  temizlik: "Ev topluyor",
  calisma: "Evden çalışıyor",
};

/** seg: simülasyon parçası (ne: "ev" | "uyku"), minute: günün dakikası. */
export function homeActivity(seed, seg, minute, day, hobbyId, homeWork = false) {
  if (seg.ne === "uyku") return "uyku";
  // Evden çalışan: mesai saatinde (öğle arası dışında) masasında; işe başlamadan önce kısa hazırlık.
  if (homeWork && minute >= 540 && minute < 1080 && minute - seg.bas >= 15) return "calisma";
  const since = minute - seg.bas;
  const left = seg.son - minute;
  const r = (tag) => roll(seed, tag, day) % 100;
  if (minute < 720) {
    // Sabah: önce hazırlık, sonra kahvaltı; hafta sonu geç kahvaltı ve ev işi.
    if (since < 20) return "hazirlik";
    if (since < 45 || (left > 60 && since < 70)) return "kahvalti";
    if (left > 90 && r("temizlik") < 40 && minute > 600) return "temizlik";
    return left < 15 ? "hazirlik" : "telefon";
  }
  if (since < 15) return "dinlenme";
  // Akşam yemeği: 18:30-19:30 arası hazırlanır, ardından sofraya oturulur.
  const cookStart = 1080 + (r("yemek") % 30);
  if (minute >= cookStart && minute < cookStart + 45) return "yemek_yapma";
  if (minute >= cookStart + 45 && minute < cookStart + 95) return "aksam_yemegi";
  if (minute < cookStart) return r("ogle") < 50 ? "dinlenme" : "telefon";
  // Gece: televizyon, kitap ya da telefon; yarım saatlik dilimlerle değişir.
  const slot = Math.floor(minute / 30);
  const pick = roll(seed, "gece" + slot, day) % 100;
  if (hobbyId === "kitap" && pick < 50) return "kitap";
  if (pick < 55) return "tv";
  if (pick < 80) return "telefon";
  return "kitap";
}
