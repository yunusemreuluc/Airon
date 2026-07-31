---
tags: [airon, tuzak]
---

# Bilinen Tuzaklar

Bağlı: [[Home]] · [[Arayuz]] · [[Mimari]] · [[Tasarim-Kurallari]]

Her biri gerçek zamana mal oldu. İlgili alana dokunmadan önce oku.

## Bir WebSocket olayı ÜÇ yer ister

1. `backend/models/events.py` → `EventType` listesi
2. Yayınlayan taraf (`core/web_ui.py`)
3. Tüketen taraf (`frontend/hooks/useAIStateConnection.ts`)

Biri atlanırsa olay **sessizce ölür** — `WebUI._emit` Pydantic doğrulama
hatasını debug seviyesinde yutuyor, hiçbir yerde görünmüyor.

`vision_detections` 2026-07-30'da tam olarak böyle kayboldu.

**Testte dikkat:** olayı doğrudan arayüze enjekte etmek bunu YAKALAMAZ, o yol
backend doğrulamasını atlar. Yakalamanın yolu `WSEvent(event="ad", data={})`
kurmayı denemek.

**`energy_state` için DÖRDÜNCÜ yer var:** `useAIStateConnection.ts` içindeki
`VALID_STATES` kümesi. Olay tipi geçerli olsa bile burada listelenmeyen bir
durum değeri sessizce yutulur ve sahne eski hâlinde donar — hata yok, log yok,
sadece "hiçbir şey olmuyor". Yeni durum eklerken `core/web_ui.py` `STATE_MAP`
ile bu kümenin **aynı** kalması şart (2026-07-31, beş tepki çalışması).

## framer-motion opacity'yi satır içi yazar

`opacity-0` Tailwind sınıfı onu **ezemez** — satır içi stil her zaman kazanır.

Açılış animasyonunu dıştaki `motion.div`'e, diğer opacity kontrolünü İÇTEKİ düz
bir div'e koy. İki kütüphane aynı özellik için yarışmamalı.

Uyku modundaki HUD sönmesi bu yüzden hiç çalışmadı; perde onu karartıyordu ve
çalışıyor sanılıyordu.

## Ağır Python import'ları tembel olmalı

`ultralytics` modül seviyesinde torch + matplotlib zincirini çekiyordu:
açılışta **273 MB**, kullanıcı nesne tanımayı hiç çalıştırmasa bile.

Kurulu olup olmadığını `importlib.util.find_spec` ile test et — dosya
sisteminde arar, modülü çalıştırmaz (mikrosaniyeler). Gerçek import ilk
çağrının içinde.

Aynı desen `easyocr` için de geçerli ([[OCR]]).

## Gemini yerine yerel modeli tercih et

Ücretsiz katmanın günlük kotası gerçek bir kısıt — vision-ağır özellikler aynı
gün art arda test edilince 429'a takılıyor.

YOLO-World ([[Nesne-Tanima]]) ve EasyOCR ([[OCR]]) ikisi de yerel çalışıyor ve
kotaya hiç dokunmuyor. Gemini'ye ancak yerel yapamıyorsa uzan.

## useFrame içinde asla bellek ayırma

`THREE.Vector3` / `THREE.Color` nesnelerini ref üzerinden yeniden kullan.
Kare başına bir `new`, bileşen başına saniyede 60 ayırma demek.

Hex dizeleri de her karede `THREE.Color`'a çevrilmemeli — `three/palette.ts`
bunun için önbellek tutuyor.

## Sönümle, asla sıçratma

3D için `THREE.MathUtils.damp`, renkler için üstel lerp. Sıçrayan bir değer
durum değişikliği gibi değil, **hata** gibi okunur.

## Live oturum yapılandırmasına yeni alan eklemek riskli

`LiveConnectConfig`'e model desteklemediği bir alan koyarsan oturum **hiç
kurulamaz** — ve bağlantı döngüsü sonsuza kadar aynı sebeple yeniden dener,
yani Aıron tamamen susar. Sessiz bir kayıp değil, tam bir arıza.

`thinking_config` (muhakeme akışı, 2026-07-31) bu yüzden güvenlik valfiyle
eklendi: `_is_thinking_rejection` hatayı inceleyip yapılandırma reddi mi ağ
sorunu mu ayırıyor, reddiyse `_thinking_supported = False` yapıp hemen yeniden
bağlanıyor.

**Kural:** oturum yapılandırmasına eklenen her yeni alan, reddedilme
ihtimaline karşı kapatılabilir olmalı. Bir arayüz özelliği, sesli asistanın
çalışmasından önce gelmez.

## easyocr kurulumu cv2'yi ezmeye çalışır

`pip install easyocr` bağımlılık olarak `opencv-python-headless` çekiyor ve
mevcut `opencv-python`'un `cv2`'sini üzerine yazmaya çalışıyor. Aıron açıkken
dosya kilitli olduğu için kurulum `WinError 5` ile patlıyor.

Projenin kullandığı cv2 API'leri (`VideoCapture`, `resize`, `flip`, `imencode`,
`IMWRITE_JPEG_QUALITY`) zaten `opencv-python`'da var, headless'a gerek yok:

```
pip install ninja lazy-loader imageio scikit-image
pip install easyocr --no-deps
```

## prettier taze bir klonda hemen patlıyor

`git config core.autocrlf` = **true**, yani git depoda LF saklıyor ama çalışma
kopyasına **CRLF** yazıyor. `frontend/.prettierrc.json`'da `endOfLine`
ayarlanmamış, prettier varsayılanı ise `"lf"`. Sonuç: klonlar klonlamaz
`npm run format:check` yüzlerce dosyada başarısız.

Ölçüm (2026-07-31): HEAD'de bir worktree kurulduğunda prettier **58 dosyaya**
kızıyordu — o worktree taze bir checkout'tan başka bir şey değildi.

**Buradan çıkan asıl ders:** "prettier N dosyaya kızıyor" tek başına *hiçbir
şey* anlatmıyor, çünkü N'in büyük kısmı satır sonu. `git diff` bunu göstermez
(autocrlf normalize eder). Gerçek biçim borcunu görmek için `prettier --write`
çalıştırıp **git diff'e** bak: bu depoda 23 "hatalı" dosyanın gerçek karşılığı
**5 dosya, 13 satır**dı, hepsi satır sarma.

Kalıcı çözümü henüz seçilmedi. İki seçenek: `.prettierrc.json`'a
`"endOfLine": "auto"` (prettier dosyanın mevcut hâlini kabul eder) ya da bir
`.gitattributes` + `* text=auto eol=lf` (çalışma kopyası da LF olur). İlki
daha az müdahaleci, ikincisi satır sonlarını gerçekten tekilleştirir.

---

# Arayüzde dürüstlük

Bir paneli bitmiş göstermek için **asla veri uydurma**.

Arkasında backend olmayan panel, nedenini söyleyen dürüst bir boş durum
gösterir. Ajanlar ve Tarayıcı panelleri tam olarak bunu yapıyor ([[Arayuz]]).

Bir yetenek yoksa **hiç görünmez** — soluk bir satır yok, "N/A" yok, yer tutucu
yok. Telemetri kartında GPU ve sıcaklık bu yüzden hiç yer almıyor.

**Alınmamış bir ölçümü asla iddia etme.**

Bayatlamış bir sonuç bayat görünmeli — Vision paneli tespit çerçevelerini 6
saniye sonra soldurur, çünkü kare altlarında akmaya devam eder.

---

# Bakarak doğrula

Tip kontrolü ve derleme, görüntünün doğruluğu hakkında **hiçbir şey
kanıtlamaz**. Bitti demeden önce gerçeğinin ekran görüntüsünü al.

Bunlar SADECE bakarak yakalandı:

- konuşma yeşili premium değil asitti
- uyuyan çekirdek dinlenen bir cisim değil, siyah bir delikti
- HUD hiç sönmüyordu
- bir tespit etiketi kareden taşıyordu

Ölçülebilen şeyi ölç — kutu koordinatları, kaydırma konumu, eleman geometrisi.
**"Doğru görünüyor", bir sayıdan daha zayıftır.**

## Arayüzü nasıl test ediyoruz

**Tercih edilen yol (2026-07-31): sahte backend, sahte soket değil.** Statik
export'u FastAPI ile **8000 portundan** sun (frontend `ws://localhost:8000/ws`
adresini sabit yazıyor), gerçek bir `@app.websocket("/ws")` aç ve olayları
oradan yayınla. Sayfa gerçek soketle konuştuğu için `VALID_STATES` gibi
arayüz tarafı filtreler de test edilmiş oluyor.

Eski yol — WebSocket'i sahte bir sınıfla değiştirip `window.__emit` ile
enjekte etmek — hâlâ çalışıyor ama **backend tarafını atlıyor**. Pydantic
zarfını, `EventType` listesini ve arayüzün ayrıştırıcısını es geçiyor;
`vision_detections` hatası tam olarak bu yüzden testten kaçmıştı
(bkz. [[Bilinen-Tuzaklar]] § Bir WebSocket olayı ÜÇ yer ister).

**Sayfayı olay tetiklemek için BAŞKA BİR URL'ye götürme.** `page.goto("/emit?…")`
+ `go_back()` WebSocket'i yıkıyor ve uygulama sıfırdan başlıyor: durum `idle`'a
dönüyor, açılış animasyonu baştan oynuyor. Bu fark edilmezse tüm ölçümler
**birbirinin aynı** çıkar ve bu "hiçbir şey değişmiyor" gibi okunur. Tetiği
sayfadan değil, test sürecinden (`urllib`/`requests`) çağır.

Durum değişimi ölçerken `REACT_DAMPING` oturması için ~2 sn bekle; sönümleme
kasıtlı olarak yavaş (bkz. § Sönümle, asla sıçratma).

Yörünge düğümlerine tıklarken `click(force=True)` gerekiyor: düğümler sürekli
döndüğü için Playwright'ın "element sabit olsun" beklentisi hiç karşılanmıyor.

## Rengi ölçerken arka planı dışarıda bırak

Ekran görüntüsünün tamamının ortalamasını almak yanıltıyor: sahne çoğunlukla
siyah, bu yüzden ortalama arka plana kilitleniyor ve gerçek renk farkını
gizliyor.

Beş tepki çalışmasında `memory` ile `thinking` arasındaki Manhattan farkı **13**
ölçüldü — "çok yakın, ayrım yok" demekti. Ekran görüntüsüne bakınca biri
**mor**, diğeri **mavi-gri**, gözle apaçık farklıydılar.

Doğrusu: kırpılan bölgenin **en parlak %15'ini** al (kürenin kendi gövdesi) ve
RGB yerine **ton (hue)** karşılaştır. Aynı ölçüm bu yöntemle 38 derecelik net
bir ayrım verdi. Ayrıca doygunluğa da bak — bir durum diğerlerinden belirgin
soluk kalıyorsa renk bilgi taşımayı bırakır.

Kısacası: sayı gözü doğrulamak için, gözün yerine geçmek için değil.

## Playwright `bounding_box()` CSS `scale`'i görmüyor

Tailwind v4 `hover:scale-*`'ı `transform: scale()` ile DEĞİL, bağımsız `scale`
CSS özelliğiyle uyguluyor. Playwright'ın `locator.bounding_box()`'ı CDP'nin
layout kutusunu döndürüyor ve o kutu bu özelliği içermiyor.

Sonuç: hover büyümesi ekranda çalışırken ölçüm **"1.000, büyümüyor"** dedi
(2026-07-31). Çalışan bir özelliği bozuk sanıp düzeltmeye girişmek üzereydim.

Doğrusu `page.evaluate` içinde **`getBoundingClientRect()`** — o transform'u da
`scale`'i de içeriyor. Teyit için `getComputedStyle(el).scale` de okunabilir;
`transform` bakmak yanıltır, orada `none` yazıyor.

## Kare hızı ölçümü kendi kendini doğrulamalı

Halka tampon üzerinden alınan **ortanca** kare süresi tek başına yalan
söyleyebilir: tampon yalnızca son N kareyi tutar, arada uzun duraklamalar olsa
bile "tipik" kare hızlı görünür.

İlk ölçüm (2026-07-31) **142.9 FPS** dedi. Aynı çıktıda 10 saniyede yalnızca
738 örnek vardı — 143 FPS doğru olsaydı ~1430 kare olmalıydı. İki sayı
birbirini çürütüyordu. Doğru cevap ~70 FPS'ti.

Bu yüzden `FrameProbe` toplam kare sayısı ve geçen süreyi de tutuyor:
`avgFps` (toplam/süre) ile `fps` (ortancadan) ayrışıyorsa ölçüme
güvenilmez. Ölçüm protokolünde ayrıca:

- Tıklamadan **sonra oturma payı** bırak — panel açılış animasyonlarını ölçüme
  katmak "sahne yavaş" demek olur, oysa ölçülen tek seferlik bir geçiş.
- Karşılaştırılan turlar **aynı uzunlukta** olmalı.
- Aynı ölçümü **en az iki kez** al; tek tur arka plan yüküne fazla duyarlı
  (bu depoda iki tur 68.8 ve 77.6 FPS verdi).
- Headless Chromium + SwiftShader ile FPS ölçme: yazılım rasterleştirme, sayı
  anlamsız. Gerçek pencere (pywebview + `gui="edgechromium"`) ya da en azından
  donanım hızlandırmalı bir tarayıcı gerekiyor.
