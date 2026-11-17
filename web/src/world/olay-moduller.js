// Olay modülleri (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"): her yeni olay türü
// kendi dosyasında; olay.js bunları buradan alır. Tür adı olay-plan.js TURLER anahtarıyla aynı; adada çıkıp çıkmayacağı
// olay-ayar.js ADA_TURLERI / IKINCI.turler ile belirlenir (modül kayıtlıysa bile listede değilse olmaz).
//
// Arayüz: kur({ world, scene, group, traffic, zeplin, sky }) bir kez çağrılır (sayfa açılışı) ve şunu döndürür:
//   kur(o) → { odak: [x, z], odakY, kalabalik: [x, z] | null, kiyi: [x, z] | null, yon, yerAdi, zaman,
//            gitD?, gitEgim? ("Olaya git" kamerası), cekimOlcek?, cekimOlcekH? (video: hareketli hedefte kadraj ölçeği),
//            kalabalikArkadan? (video: kalabalık çekimi seyircilerin arkasından olaya doğru) } | null
//            o: plan { tur, ad, en, bas, son, tohum, day, yuva }; null: bugün kurulamadı (olay o gün olmaz).
//            Saf olmalı: aynı (o, dünya) hep aynı sonucu verir (video günün her dakikasını yeniden çizer).
//   update(o | null, evre | null, minute, real, env)  her karede; o: bu türün bugünkü planı (yoksa null → gizle).
//            Görünüm yalnız (minute, o.tohum, dünya) işlevi: Math.random ve kare arası birikim YOK.
//   yazi(o, S, minute, { saatYaz, saatte }) → { kisa, uzun } | null   üst panel/gazete metni (olgular videoya gider:
//            yalnız sitede gerçekten olanı yaz). S: yuva alanları (S.seyirci: gelen seyirci sayısı).
//   seyirci: { r0, r1, isR, uzak, kiyida, en, tavirlar } | null   seyirci yayı (null: kimse toplanmaz).
//   gorev?(people, day, S, plans) → [{ i, T0, T1, item, commute }]  görevli sakinler (item: durus'a gider; item.modul =
//            tür; commute: yürüme dakikası, 0 = araçla gelir/anında).
//   durus?(i, item, minute, t, p, ph, stand, { idleGesture }) → bool  özel duruş (item.modul = tür olan sakinler).
//   vehicles?(vehicles, real, minute, araclar, ses)  olay araçları (vehicles.add; araclar.set(ad, poz) video için).
//   gizle?(x, z, minute) → bool   gerçek trafikten gizlenecek araç.   kapali?(minute) → Set<düğüm> | null.
//   ses?(minute) → { siren, korna, kalabalik, ... }   canli?(minute) → [x, y, z] | null (hareketli hedef: video).
//   tahliye?(x, z, minute) → { x, z, heading, yuru } | null   boşaltılan alan: o anda (x, z)'de duracak sakinin yeni yeri
//            (yuru: yürüme evresi radyan, kenara yürürken; null: alan dışında). Saf işlev; people.js her karede çağırır.
import { buildZeplinOlay } from "./olay-zeplin.js";

export const MODULLER = {
  zeplin: buildZeplinOlay,
};
