---
tags: [airon, arayuz]
---

# Arayüz — frontend/ (Next.js + Three.js)

Bağlı: [[Home]] · [[Mimari]] · [[Kurulum-ve-Baslatma]] · [[Nesne-Tanima]] · [[OCR]] · [[Izleme-ve-Brifing]] · [[Bellek-ve-Config]]

3D sahne + üzerinde yüzen cam paneller. Tasarım kuralları `CLAUDE.md` içinde;
kalan işler `Docs/AIRON_UI_ROADMAP.md`. Bu not **ne yapıldığını ve neden öyle
yapıldığını** özetliyor.

## Yerleşim

| Konum | Ne var |
|---|---|
| Sol kenar | Modül rayı (`Sidebar.tsx`) — Hafıza/Otomasyon/Ajanlar/Tarayıcı + ayarlar |
| Sol üst | AIRON imzası + canlı durum (`BrandBadge.tsx`) |
| Sol, rayın yanı | Açılan modül paneli (`LeftPanel.tsx`) |
| Sol alt | Zaman çizelgesi şeridi (`Timeline.tsx`) |
| Sağ üst | Telemetri şeridi + tepsi düğmesi (aynı satır) |
| Sağ | Vision paneli, altında düğüm odak kartı |
| Sağ alt | Sohbet dock'u (`AssistantDock.tsx`) |
| Orta | 3D sahne (`three/Scene.tsx`) |

Sağ taraf **tek bir flex kolon** (`AppShell.tsx`). Önceden her panel kendini
`absolute right-7` ile konumlandırıyordu ve üst üste biniyorlardı.

## Veri akışı

Tek WebSocket (`useAIStateConnection.ts`) her şeyi taşıyor. Backend'den gelen
olaylar `backend/models/events.py` içindeki `EventType` listesinde tanımlı.

> **Tuzak:** yeni bir olay eklerken üç yeri birden yapmak gerekiyor — `EventType`
> listesi, yayınlayan taraf, ve arayüzdeki `switch`. Biri atlanırsa olay
> **sessizce düşer**: `WebUI._emit` Pydantic doğrulama hatasını yutuyor.
> 2026-07-30'da `vision_detections` tam olarak böyle kaybolmuştu.

## Açılış sahnelemesi — "Ateşleme"

Kullanıcı isteğiyle (2026-07-31) yeniden tasarlandı. Önceki sürüm siyah ekranda
AIRON yazısı ve **dolan bir ilerleme çubuğuydu** — bu bir yükleme ekranı dili ve
`CLAUDE.md § PROJECT`'in "gösterge paneli DEĞİLDİR" maddesiyle çelişiyordu.
Sonrasındaki 3D kuruluş zaten iyiydi; sorun ondan öncesiydi.

Yeni akış tek bir fikir üzerine kurulu: **çekirdek ateşleniyor.**

| Zaman | Ne olur | Nerede |
|---|---|---|
| 0 – 0.3 sn | Karanlıkta tek bir ışık noktası | `BootOverlay.tsx` |
| 0.3 – 0.8 sn | Nokta yanlara **enerji hattı** olarak açılır | " |
| 0.6 – 1.2 sn | AIRON ışıktan **çözülür** (bulanıklık dağılır, harf aralığı toplanır) | " |
| 1.05 sn | Gerçek bağlantı durumu ("Bağlanıyor" / "Sistem hazır") | " |
| 1.2 – 2.7 sn | **İsim durur** | " |
| 2.5 – 3.5 sn | **Korona** — ısı yayan parçacıklar | `three/EnergyTendrils.tsx` |
| 2.7 – 3.8 sn | Karanlık **merkezden delinir**; isim aynı anda çözülerek gider | `BootOverlay.tsx` |
| 3.4 sn | Enerji çekirdeği (top) | `three/EnergyCore.tsx` |
| 4.0 sn + | Yörünge düğümleri (sırayla) | `three/OrbitNodes.tsx` |
| 4.2 sn | Bağlantı ağı | `three/NodeConnections.tsx` |
| 4.6 sn | Elektrik arkları | `three/ElectricArcs.tsx` |
| 5.0 sn + | HUD panelleri (0.12 sn aralıkla) | `AppShell.tsx` |

**Sıralama bilinçli** (kullanıcı isteği, 2026-07-31 ikinci tur): önce ısı yayan
korona, sonra top. Korona perde delinirken belirmeye başlıyor, yani açılan
delikten ilk görünen şey o oluyor; çekirdek arkasından geliyor.

Korona 2026-07-31'e kadar **hiç açılış animasyonu taşımıyordu** — ilk kareden
itibaren tam güçteydi ve perde kalkınca hazır bir bulut olarak "patlıyordu".

### İsmin çıkışı ayrı

Delik tam merkezden açılıyor ve isim de merkezde duruyor; maskeye bırakılsaydı
isim ~300 ms'de **kesilip** yok olurdu — perde 1.1 sn boyunca açılsa bile
izleyicinin baktığı şey aniden gidiyordu.

Bu yüzden isim kendi çıkış variant'ına sahip (`WORD_VARIANTS.pierced`): geldiği
gibi gidiyor — bulanıklaşarak ve harf aralığı açılarak, yani ışığa geri
çözülüyor. `AnimatePresence` çıkış etiketini çocuklara yaydığı için `pierced`
adı üstteki perdeyle eşleşiyor; bu yüzden çocukların `variants` kullanması
şart (satır içi `initial`/`animate` propları yayılımı almıyor).

Durum satırı `conversationStore.connected`den geliyor, yani **gerçek**; sahte
bir yüzde göstergesi değil (bkz. [[Bilinen-Tuzaklar]] § Arayüzde dürüstlük).

### Maske tuzağı

Delinme `mask-image: radial-gradient(... transparent var(--hole), #000
calc(var(--hole) + 18%))` ile yapılıyor; `--hole` framer-motion variant'ından
animasyonlanıyor (satır içi nesnede hesaplanmış anahtar olarak yazılınca
TypeScript framer-motion'ın hedef tipine oturtamıyor — variant'lar kabul ediyor).

**`--hole` sıfırdan değil `-25%`ten başlıyor.** Sıfır verilirse gradyan
`transparent 0% → siyah 18%` olur ve merkezde **kalıcı bir yumuşak delik** kalır;
sahne daha ilk kareden görünür. İlk denemede tam olarak bu oldu, ölçerek
yakalandı: `--hole` zamanlaması doğruydu ama %0'ın kendisi şeffaflık üretiyordu.

### Sahnelemenin dışında kalanlar (düzeltildi)

Zaman çizelgesi ve sohbet dock'u eskiden ilk kareden itibaren tam görünürdü —
logo daha çıkmadan ekranda duruyorlardı. Artık sıraya dahiller.

Dikkat: bu iki panel alt kenara yapışık (`bottom-7`) ve `y` animasyonu bir
**transform** yaratıyor; transform "containing block" kurduğu için içindeki
mutlak konumlu kartlar sahnenin altına değil sarmalayıcının tepesine hizalanır.
Bu yüzden `fadeOnlyVariants` ile **yalnızca opacity** üzerinden beliriyorlar.

### Hareket azaltılmışsa

Ateşleme, hat, delinme — hiçbiri yok. Statik AIRON yazısı 400 ms görünüp
kayboluyor. Doğrulandı: `prefers-reduced-motion: reduce` ile hiçbir hareket
çalışmıyor.

## Vision paneli

Canlı kamera + [[Nesne-Tanima]] + [[OCR]]. `webcam_frame` olayı ~8 FPS base64
JPEG taşıyor (yıllardır yayınlanıyordu, arayüzde tüketen yoktu).

**Görünürlük:** her zaman durmuyor — kamera açıkken **veya** sahnedeki "Görme"
düğümüne tıklanınca geliyor. Kapalı kamerayla sürekli duran siyah 16:9 kutu sağ
kolonun yarısını hiçbir şey söylemeden yiyordu. "Görme" düğümüne tıklanınca
genel odak kartı yerine bu panel açılıyor (`NodeFocusCard` o düğümü bilerek
atlıyor).

**Çerçeveler:** nesne ve metin kutuları aynı normalize `[x1,y1,x2,y2]`
sözleşmesini paylaşıyor, tek bileşen ikisini de çiziyor. Panel her zaman **en son
çalışan işin** sonucunu gösteriyor (`mode: 'objects' | 'text'`) — ikisi üst üste
çizilince kare okunmaz hâle geliyordu.

**Tazelik:** tarama tek kare üzerinde yapılıyor ama görüntü akmaya devam ediyor,
yani çerçeveler çizildikleri andan itibaren gerçeklikten uzaklaşıyor. Kareyi
dondurmak kamerayı bozuk gösterirdi; çözüm çerçevelerin 6 saniyede solması.

## Alt zaman çizelgesi

Araç çağrıları + `debug` logları tek kronolojik akışta. `task_started` /
`task_finished` olayları `events.py`'de tanımlıydı ama **hiçbir yerden
yayınlanmıyordu**; 2026-07-30'da `main.py._execute_tool` içine bağlandı.

Varsayılan **kapalı** — alt kenarda tek satırlık şerit, son olayı gösteriyor.
Sürekli açık duran bir log paneli sahnenin alt üçte birini yutardı.

Biten görev **kendi satırını güncelliyor**, yeni satır açmıyor. Şeridin "son
olay"ı bu yüzden dizinin sonu değil, `lastTouchedId` ile takip ediliyor.

### Muhakeme (2026-07-31)

Akışta üçüncü bir tür var: `reasoning` — modelin düşünme adımları. İtalik ve
beyin ikonuyla gösteriliyor, başlık satırı taşımıyor (her satırın üstüne
"Muhakeme" yazmak akışı ikiye katlardı; ayrımı ikon taşıyor).

Sonuç, görev satırlarıyla birlikte **nedensel bir iz** oluşturuyor:

```
🧠  Kullanıcı hava durumunu sordu, konum hafızada İstanbul.
✓   get_weather — İstanbul 24°, açık
🧠  Sonuç geldi; kısa bir cümleyle özetleyeceğim.
```

Veri `LiveConnectConfig.thinking_config` ile isteniyor ve `model_turn.parts`
içinde `thought=True` bayraklı parçalar olarak geliyor — normal metinle aynı
listede, bayrakla ayrışıyorlar. **Sohbete yazılmıyor:** sohbet Aıron'un
söyledikleri için, muhakeme ne söyleyeceğine nasıl karar verdiği.

Düşünceler transcript gibi parça parça akıyor. `_flush_reasoning` cümle
sınırında yayınlıyor: her parçayı tek tek yayınlamak akışı yarım kelimelerle
doldurur, `turn_complete`'e kadar biriktirmek ise muhakemeyi cevaptan SONRA
gösterirdi — oysa değeri cevaptan önce görünmesinde.

Modelin bu ayarı gerçekten desteklediği **canlı oturumda doğrulanmadı**
(bkz. `Docs/YAPILACAKLAR.md` #13).

## Uyku modu

Çekirdeğe tıklamak Aıron'u uyutuyor: ortam kararıyor, HUD çekiliyor, ağ soluk
iskelete düşüyor, çekirdek yavaş nefes almaya devam ediyor. Her yere tıklamak
uyandırıyor.

**Uygulama kapanmıyor, uyuyor** — çekirdek ekrandaki en büyük tıklama hedefi,
yanlışlıkla tıklamanın bedeli "oturumu kaybetmek" olmamalı.

Perde düz siyah değil, **merkezi açık** radyal gradyan; tam opak olsa uygulama
çökmüş gibi görünürdü.

## Sol panel modülleri

- **Hafıza** — `memory.json`'ı doğrudan okuyor (`backend/api/memory.py`), yani
  ses döngüsü kapalıyken de çalışıyor. Salt okunur: silme Aıron'a söylenerek
  yapılıyor, çünkü `delete_memory` iki adımlı onay istiyor ([[Bellek-ve-Config]]).
- **Otomasyon** — aktif izlemeler ses döngüsünün belleğinde
  ([[Izleme-ve-Brifing]]), bu yüzden `commands.read_provider` üzerinden okunuyor.
- **Ajanlar / Tarayıcı** — bağlanacak veri yok, dürüst boş durum gösteriyorlar.

## Durum renkleri

Çekirdek konuşurken **turkuaz-yeşile** dönüyor (`three/palette.ts`,
`PLASMA_TEAL`). Beş ton karşılaştırıldıktan sonra seçildi; yeşilin en soğuk ucu
olduğu için buz mavisiyle aynı sıcaklıkta kalıyor ve `idle → speaking` geçişi
renk kavgası değil, aynı ailenin içinde bir kayma gibi okunuyor.

Palet **tek kaynak**: çekirdek, korona ve elektrik arkları hepsi oradan
besleniyor — ayrı yazılsalardı biri geride kalır ve yeşil çekirdeğin etrafında
mavi bir korona dönerdi.

### Beş tepki

Başlıkta tarih YOK bilerek: koddaki altı yorum `§ Beş tepki` diye atıf yapıyor,
başlığa ek koymak o atıfları kırar.

2026-07-31. Tasarım kuralı çekirdeğin beş şeye tepki vermesini istiyordu;
gerçekte **üçü** çalışıyordu. Her araç çağrısı `THINKING` yayınlıyordu, yani Aıron'un ekranı ele
geçirmesiyle hava durumuna bakması sahnede birebir aynı görünüyordu. `VISION`
ise `STATE_MAP`'te duruyor ama `main.py` hiç göndermiyordu — **ölü bir daldı**.

| Durum | Etiket | Renk | Hareket |
|---|---|---|---|
| `listening` / `speaking` | Dinliyor / Konuşuyor | buz mavisi / turkuaz-yeşil | nabız hızlanır, çekirdek büyür |
| `thinking` | Düşünüyor | buz mavisi, kısık | yavaş, sakin yüzey |
| `vision` | Görüyor | buz mavisi, parlak | türbülanslı yüzey |
| `automation` | **Uyguluyor** | kehribar (`SOLAR_AMBER`) | dönüş **2.4×**, yüzey pürüzsüz, hafif küçülme |
| `memory` | **Hatırlıyor** | mor (`DEEP_VIOLET`) | dönüş **0.4×**, derin nefes, dalgalı yüzey |

Kehribar seçildi çünkü kullanılmayan tek aile oydu — ama asıl gerekçe anlamsal:
kehribar her arayüzde "dikkat, makine hareket ediyor" demek. Aıron fareyi ele
aldığı an bunun **anında** fark edilmesi gerekiyor; bu dekorasyon değil uyarı.
Kırmızıya kaçılmadı, kırmızı "hata" der.

Renk tek başına yetmiyor: hız da bilgi taşıyor. Otomasyon sahnenin en hareketli
hâli, hafıza en durgunu. Göz ucuyla bakıldığında ya da renk körlüğünde ayrımı
taşıyan şey bu.

**Hangi araç hangi durumu tetikliyor:** `core/web_ui.py` → `state_for_tool`.
Ayrım okuma/yazma: `get_calendar_events` düşünme, `add_calendar_event`
otomasyon. Liste **beyaz liste** — adı geçmeyen araç `thinking`e düşüyor, yani
yeni bir araç eklenip yazılmazsa davranış bugünküne eşit olur, sessizce yanlış
bir durum göstermez. Kapsamlı eşleme zorunlu tutulsaydı araç eklemenin maliyeti
beşinci bir dosya olurdu.

**Ölçüm** (kaydırılmış çekirdek pikselleri, en parlak %15): otomasyon 33° ton,
hafıza 257°, geri kalan her şey 161-219° arasında. Hafızanın en yakın komşusuna
uzaklığı 38°. İlk denemede kenar rengi `#ece4ff` idi ve doygunluk %15'e
düşüyordu — fresnel kenarı parlak piksellere hâkim olduğu için mor durum
sahnenin en soluk hâli oluyordu. Kenar mora boyanınca %22'ye çıktı.

## Sol ray

Sadece ikon, hover olmadıkça etiket yok. Aktiflik göstergesi rayın **sol
kenarında** kayan ince bir hat (`layoutId` ile modüller arasında akıyor).

**Hover büyümesi (2026-07-31):** düğme `1.08` ölçekleniyor — 40 px'de ~3 px,
hissedilen ama ölçülmesi zor. `active:scale-95` de eklendi: büyüme varsa
basmanın da karşılığı olmalı, yoksa düğme hover'da canlı, tıklamada ölü.

Bunun için `RailButton`'ın yapısı değişti: **aktiflik hattı ve etiket balonu
artık butonun DIŞINDA**, saran kutuda. İkisi de içeride kalsaydı ölçekle
birlikte büyürlerdi — `layoutId` ile animasyonlu hat, ölçeklenmiş bir kutuda
ölçüldüğü için modül değişiminde yanlış konuma akardı; etiketteki 11 px yazı
da oynardı. Doğrulandı: hover'da buton 40 → 43.2 px, etiket `scale: none` ve
11 px, hat 2×20 sabit.

**Bilinen çakışma:** ilk düğmenin etiketi `BrandBadge` ile 19×9 px örtüşüyor
(`Docs/YAPILACAKLAR.md` #19).

## Telemetri şeridi

Tepsi düğmesinin yanında tek satır: **CPU · RAM · Disk · Pil · İnternet · Saat**
(286×38 px, yatay taşma yok).

İnternet **gerçek**: backend 1.1.1.1:53'e TCP bağlanıp süreyi ölçüyor
(`backend/api/system.py` → `_probe_internet`). `psutil.net_io_counters`
kullanılmadı — o yalnızca arayüzden kaç bayt geçtiğini söyler, kablo takılı ama
internet yokken de artar, yani "bağlı" demek için yanlış ölçüt.

Detaylar:

- Sonda **asenkron** (`asyncio.open_connection`). Bloklayan bir soket, 1.5 sn
  boyunca olay döngüsünü ve onunla birlikte tüm WebSocket yayınlarını dondururdu.
- **15 sn önbellek** — kart 3 sn'de bir sorguluyor, her sorguya bir TCP el
  sıkışması bindirmek gereksiz.
- Gecikme **en az 1 ms** gösteriliyor. Ölçüm bir kez 0'a yuvarladı; "0ms"
  ekranda "kusursuz bağlantı" diye okunurdu, oysa hiçbir el sıkışması 0 sürmez.
- **Uyarı:** bu sayı "1.1.1.1'e bağlanma süresi", internet kalitesinin tamamı
  değil. Şeffaf vekil/güvenlik duvarı olan ağlarda SYN'i o cihaz yanıtlar ve
  süre gerçekte olduğundan iyi görünür. Ulaşılabilirlik için doğru, hız testi
  için değil.
- Çevrimdışıyken alan **gizlenmiyor**, üstü çizili ikon + "yok" gösteriliyor.
  GPU/sıcaklıktan farkı bu: onları ölçemiyoruz, bunu ölçebiliyoruz ve cevap
  "hayır" — bu bir eksiklik değil, bilgi.

Saat dakika başına **hizalı** uyanıyor (`setInterval(1000)` değil): gösterilen
değer dakikada bir değişiyor, saniyede bir render etmek 59 boş render demekti.
Sahne 60 FPS hedefliyor, aynı ana iş parçacığında boş render biriktirilmez.

## Kare hızı — ölçüldü

`three/FrameProbe.tsx` kalıcı bir sonda: kare başına tek `Float32Array` yazması,
ayırma yok. `window.__aironFps()` ile okunuyor, `window.__aironFpsReset()` ile
sıfırlanıyor.

**Ölçüm (2026-07-31, gerçek WebView2 penceresi, 1540×844 @ 1.25 DPR, 144 Hz):**

| | En yoğun¹ | Sade (yalnızca sahne) |
|---|---|---|
| Gerçek ortalama FPS | **68.8** / **77.6** | 74.5 / 76.7 |
| Kare süresi p50 | 14.3 / 12.8 ms | 13.0 / 12.9 ms |
| p95 | 18.8 / 15.9 ms | 16.3 / 16.5 ms |
| En kötü kare | 32.2 / 24.3 ms | 23.3 / 26.1 ms |
| 16.7 ms bütçesini aşan | %15.6 / %2.9 | %3.4 / %4.4 |

¹ vision durumu + 8 FPS webcam karesi + 8 tespit çerçevesi + tüm paneller açık.
İki bağımsız tur, ikisi de kendi içinde tutarlı (ortalama ≈ ortancadan türetilen).

**Sonuç: 60 FPS hedefi tutuyor** — en yoğun hâlde bile ~69-78 FPS, ortanca kare
14 ms civarı, bütçe 16.7 ms. Ama pay sanıldığı kadar geniş değil: ekran 144 Hz
(6.94 ms) ve sahne onu yakalayamıyor, kareler iki vsync aralığına oturuyor.
Yani gerçek iş süresi 7-14 ms arasında bir yerde; vsync kuantalaması yüzünden
daha kesin söylenemez.

## Küçük parçalar

- **Ses dalga formu** — veri tarayıcıdan değil backend'den (`mic_level`, ~12 FPS).
  `getUserMedia` ile ikinci bir mikrofon akışı açmak pyaudio ile yarışırdı;
  seviye Aıron'un gerçekten duyduğu ham PCM'den hesaplanıyor.
- **Telemetri** — CPU/RAM/Disk/Pil. GPU ve sıcaklık **yok**: Windows'ta psutil
  ikisini de güvenilir vermiyor, uydurmak yerine hiç gösterilmiyor.
- **Think.mp3** — durum bazlı döngü (tek atış değil), %35 seste.
- **Tepsiye al** — ayarlar panelinden çıkarıldı, sağ üstte sabit kontrol.
- **İkon** — `make_icon.py` prosedürel üretiyor; 16px ve 256px için **ayrı
  çizim** (tek görseli küçültmek 16px'te lapa üretiyordu).

## Doğrulama notu

Arayüz Playwright ile test ediliyor. Tercih edilen düzenek: statik export'u
8000 portundan sunan **sahte bir backend** ve gerçek bir WebSocket — böylece
Pydantic zarfı ve arayüzün ayrıştırıcısı da yolun içinde kalıyor. Soketi sahte
bir sınıfla değiştirip olay enjekte etmek backend'i atlıyor.

Ayrıntı ve tuzakları için [[Bilinen-Tuzaklar]] § Arayüzü nasıl test ediyoruz.
