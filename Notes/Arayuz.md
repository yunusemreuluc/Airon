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
`CLAUDE.md § PROJE`'nin "gösterge paneli DEĞİLDİR" maddesiyle çelişiyordu.
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

Arayüz Playwright ile test ediliyor: statik export sunulup WebSocket sahte bir
sınıfla değiştiriliyor, olaylar `window.__emit` ile enjekte ediliyor. Gerçek
soket bağlanırsa demo durum döngüsü duruyor ve durum `idle`'da kalıyor — bu
yüzden renk/durum testlerinde soket bilerek engelleniyor.
