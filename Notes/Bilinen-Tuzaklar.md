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

Playwright ile statik export (`frontend/out`) sunuluyor ve WebSocket sahte bir
sınıfla değiştiriliyor; olaylar `window.__emit` ile enjekte ediliyor.

Gerçek soket bağlanırsa `useAIStateConnection` demo durum döngüsünü durduruyor
ve durum sonsuza kadar `idle`'da kalıyor — renk/durum testlerinde soket bu
yüzden bilerek engelleniyor.

Yörünge düğümlerine tıklarken `click(force=True)` gerekiyor: düğümler sürekli
döndüğü için Playwright'ın "element sabit olsun" beklentisi hiç karşılanmıyor.
