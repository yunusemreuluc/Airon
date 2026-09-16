---
tags: [airon, mobil, android]
---

# Aıron Mobil — telefondaki Aıron (Android)

Bağlı: [[Home]] · [[Uzaktan-Erisim]] · [[Mimari]]

2026-09-15, kullanıcı isteği: *"Siri gibi konuşabilecektim; annemi ara deyince
arayacaktı, şuraya WhatsApp'tan mesaj at, PC'de şu an durumum ne."*

Web arayüzü ([[Uzaktan-Erisim]] § Telefon arayüzü) bunu karşılamıyordu: arama,
rehber, SMS ve WhatsApp'a dokunmak yalnızca yerel uygulamaya açık. Bu yüzden ayrı
bir Kotlin uygulaması.

**Kod:** `C:\Users\yunus\Projects\airon-mobile` — bilerek OneDrive DIŞINDA (Gradle
derleme klasörleri senkronla çakışır). Kendi git deposu.

## Mimari

```
Telefon (Aıron APK)
 ├─ Gemini Live — ham WebSocket, PC'dekiyle AYNI model ve ses (Charon)
 ├─ Telefon araçları — arama, WhatsApp/SMS, uygulama/alarm/fener, ses/medya/DND,
 │                      bildirimler, pil/bağlantı
 └─ Masaüstü köprüsü — Tailscale → tailscale serve → PC /api/remote/{ask,desktop,note}
```

**İki beyin, tek kişilik.** Kullanıcı kararı: "telefon ayrı o ayrı olsun ama bir
olsun." Telefon Gemini'ye kendi bağlanıyor — PC kapalıyken bile arama ve mesaj
çalışıyor. PC'ye yalnızca PC soruları gidiyor. Sistem promptunun ilk bölümü
kullanıcının kendi yazdığı metin, değiştirilmeden (`live/SystemPrompt.kt`).

## Araçlar (kullanıcının verdiği adlarla)

| Araç | Uygulama | Not |
|---|---|---|
| `call_contact` | `ContactTools` → `ACTION_CALL` | Türkçe ek soyma (aşağıda) |
| `send_message` | WhatsApp intent + `WhatsAppSendService` / `SmsManager` | Varsayılan WhatsApp, otomatik gönderim |
| `control_device` | uygulama aç, `AlarmClock`, `CameraManager.setTorchMode` | |
| `manage_device_audio` | `AudioManager`, medya tuşları, DND | DND ayrı özel izin |
| `get_recent_notifications` | `AironNotificationListener` | Bellekte, diske yazılmıyor |
| `get_device_health` | `BatteryManager`, `ConnectivityManager` | Boşalma süresi tahmini uydurulmuyor |
| `query_desktop_airon` | PC `/api/remote/ask` | PC cevabı bekleyip metin döner (≤90 sn) |
| `send_desktop_command` | PC `/api/remote/desktop` | Beyaz liste: lock, sleep, medya, pano. Kapatma YOK |
| `save_quick_note` | telefon `notes.json` + PC `/api/remote/note` | Önce telefona yazılıyor |

## Doğrulananlar ve tuzaklar

- **Live protokolü PC'den gerçek anahtarla ölçüldü** (sonra Kotlin'e yazıldı):
  sunucu çerçeveleri BINARY (içi JSON), ilk mesaj `setupComplete`, ses
  `inlineData` audio/pcm;rate=24000, mikrofon `realtimeInput.audio` kabul.
- **Astra çapraz incelemesi (12 bulgu, hepsi doğrulanıp düzeltildi).** En ağırları
  yanlış kişiye işlem: kısmi eşleşmeyle "Annemi" → "Annemin Doktoru", "Ali" →
  "Halil"; aynı adlı iki numaranın teke indirilmesi; WhatsApp göndericinin alıcıyı
  doğrulamaması ve metin kutusu okunamayınca kontrolü atlaması. Diğerleri: kapanmış
  oturumun geç geri çağrıları, çoklu araçta boşta zamanlayıcısı, yankı kapısında
  `write()` blokajı, söz kesilince eski parçanın tekrar çalması, arka planda
  sessizce engellenen ekran açılışının "aranıyor" diye raporlanması, geçersiz PC
  adresinde çökme, PC `/ask`'te geç cevabın yanlış soruya gitmesi, aynı saniyedeki
  iki notun ezilmesi.
- **Eşleştirme kuralı (`ContactMatcher`, 13 JVM birim testi):** doğrudan işlem
  yalnızca TAM ad ya da TAM kelime eşleşmesinde ve tek adayda. Kısmi eşleşme tek
  aday olsa bile `Weak` → model sorar, onaylanınca `contact_id` ile tekrar çağırır.
  Aynı ad + farklı numara ayrı aday. İyelikten türeyen hâl ("annem" → "anne")
  yalnız tam ad eşleşmesinde kullanılıyor — kelime eşleşmesinde "Ayşe Anne"ye çıkıyordu.
- **WhatsApp otomatik gönderim üç şartlı:** silahlı (12 sn, tek kullanım), sohbet
  başlığı hazırlanan kişinin adı/numarası, mesaj kutusu okunabilir ve metin aynı.
  Biri tutmazsa gönderilmiyor ve araç bunu "gönderilmedi" diye dönüyor — "gönderildi"
  yalnızca servis gerçekten tıkladıysa.
- **PC `/ask` sıralaması:** bekleyen, kendi "Siz: <soru>" satırı görülene kadar
  silahsız; ancak ondan sonraki ilk "Aıron:" satırı cevap sayılıyor.
- **Model kişi adını EKİYLE gönderiyor:** "Annemi ara" → `name="Annemi"`. Araç
  açıklaması yalın hâli istese de güvenilmiyor; `ContactMatcher.queryVariants`
  hâl eklerini ve iyeliği soyarak deniyor ("annemi" → "annem" → "anne").
- **Yankı:** telefonda hoparlör mikrofona çok yakın. PC'deki kararın aynısı —
  Aıron konuşurken, `write()` sürerken ve 500 ms kuyrukta mikrofon karesi gönderilmiyor.
- **Sürüm seçimi:** 2026-09'da güncel olanlar AGP 9.4 / Gradle 9.7 / Kotlin 2.4 /
  SDK 37 ama AGP 9 yapı değişiklikleri getirdi; bilinen uyumlu set seçildi:
  AGP 8.7.3, Gradle 8.11.1, Kotlin 2.1.0, compileSdk/targetSdk 35, minSdk 29.
- **Yeni cmdline-tools (23.0) paket yolunda `;` değil `/` istiyor:**
  `sdkmanager "platforms/android-35"`. `;` ile "Package not found" diyor.
- Release APK R8 ile 2.3 MB (debug 55 MB — `material-icons-extended`).

## Derleme ve kurulum

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.101-hotspot"
cd /c/Users/yunus/Projects/airon-mobile && ./gradlew assembleRelease
/c/Users/yunus/Android/Sdk/platform-tools/adb.exe install -r app/build/outputs/apk/release/app-release.apk
```

`secrets.properties` (git dışı) Gemini anahtarını ve PC adresini ilk açılış
varsayılanı olarak derlemeye koyuyor; uygulama Ayarlar'ından değişir.

## 2026-09-16 — gerçek cihaz (Redmi Note 12 Pro, Android 12)

- **Kurulum kablosuz adb ile Tailscale IP'si üzerinden** (`adb pair <telefonun-tailscale-ip>:<port>`).
  Xiaomi `pm grant`'e izin vermiyor (USB hata ayıklama güvenlik ayarı yok);
  bildirim/DND/overlay adb ile verildi, çalışma zamanı izinleri kullanıcı verdi.
- **YouTube:** `MEDIA_PLAY_FROM_SEARCH` filtresi ilan ediliyor ama sorguyu yok sayıyor.
  Çalışan: `youtube.com/results?search_query=` ve `watch?v=`. `play_youtube` ilk
  videoyu arama HTML'indeki ilk `videoRenderer`'dan buluyor (`AppSearch.kt`);
  `search_in_app` YouTube/Music/Spotify/Chrome/Google/Play/Haritalar.
- **Xiaomi arka plan açılış kapısı:** Android "SYSTEM_ALERT_WINDOW ile izinli"
  dese de MIUI `Permission Denied Activity` ile iptal ediyordu, araç "açıldı"
  diyordu. MIUI app-op 10021 — adb: `appops set com.airon.mobile 10021 allow`.
  `MiuiBackgroundStart` artık okuyor, kurulum kartında satır var.
- **"Hey Aıron" (Vosk) BAŞARISIZ.** Küçük Türkçe modelin sözlüğünde "Aıron" yok.
  TTS ile 12/16 tuttu ama kullanıcının gerçek sesi: "hayır unut", "hayır oyu",
  "kayra", "yeridir", "hey aydı" — sabit kalıp yok. Grammar modu da kötü
  ("her yer kar" → "hey iron"). `VOICE_RECOGNITION` kaynağı bu cihazda SIFIR
  örnek veriyor, `VOICE_COMMUNICATION` çalışıyor.
- **Ham openWakeWord gömme + DTW şablonu da ayırmıyor:** "Aaron", "ayran" Aıron'la
  aynı skor. Kod şu an Vosk'lu hâlde telefonda (servis bekleme modu, ses devri,
  1,5 sn ön kayıt çalışıyor — sadece tanıyıcı değişecek).

## 2026-09-16/17 — kendi sesiyle uyandırma, araba modu, istek listesi

- **"Aıron" artık openWakeWord.** Vosk kaldırıldı (APK 50 → 23 MB). Eğitim ayrı projede:
  `C:\Users\yunus\Projects\airon-wake` (kendi `.venv`'i — PATH'teki `python` hermes-agent
  ortamı, oraya paket kurma). Veri: uygulamadaki kayıt ekranı (Ayarlar → Uyandırma sözü
  kaydı; 41 "Aıron", 41 benzer kelime, 6 konuşma, 2 ortam) + edge-tts/piper 4580 klip
  (`synth.py`), `filter_tts.py` TTS pozitiflerini kullanıcının sesine benzerliğe göre süzüyor.
  Model `airon_r3`: eşik 0,5 + 2 ardışık parça → İngilizce 10,7 sa akışta ~1,9 yanlış/sa,
  eğitime girmeyen kayıtlarda tanıma %63–75, benzer kelime %0.
- **Telefon/Python eşdeğerliği birebir** (82 dosya, fark 0,0000): `WakeTestReceiver`
  (yalnız adb, DUMP izni) + `airon-wake/device_parity.py`. Mel çıktısı çalışma anında
  `(1, 1, t, 32)` — zaman ekseni üçüncü boyut (Astra yakaladı, ilk sürüm hiç çalışmazdı).
- **Arayüz:** PC'deki tel kafes çekirdeğin Canvas karşılığı (`Orb.kt`, üç ikosfer,
  kapalıyken de buz mavisi); ses düzeyi kaydırıcısı + 9 Gemini sesi (açılır liste);
  geri tuşu ana ekrana döner; anahtar/PC adresi panelden çıkarken kaydedilir, adres
  değişince PC oturumu silinir.
- **Yazıya dökme "Iron Man" yazıyordu:** `inputAudioTranscription.languageHints=tr-TR`
  + `adaptationPhrases` (Gemini API destekliyor, canlı `setupComplete` ile doğrulandı).
- **Araba modu:** oturumda Bluetooth eller serbest (`setCommunicationDevice`, yalnız
  Android 12+; bekleme dinlemesi telefon mikrofonunda kalır — SCO açık kalırsa araba
  radyoyu keser), müzik kısma (geçici odak), gelen WhatsApp/SMS'i okuyup cevap sorma
  (`MessagingStyle` ile yön/tekrar ayrımı, kullanıcı sustuktan 1,5 sn sonra),
  `start_navigation` (ev/iş adresi Ayarlar'da), pil muafiyeti adb ile verildi.
  Gerçek arabada henüz denenmedi.
- **İstek listesi:** Aıron yapamadığı işte "İstek listene ekleyeyim mi?" diye soruyor →
  `add_feature_request` → telefonda `requests_pending.json` → `/api/remote/requests` →
  [[Istek-Listesi]] (`backend/core/feature_requests.py`). Durumu elle `yapıldı` yapınca
  telefon bir sonraki konuşmada, kullanıcının ilk işi bittikten sonra haber veriyor
  (`/requests/done` + `/requests/ack`). Canlı Gemini denemesinde akış doğru çalıştı.
  PC'deki Aıron yeniden başlayınca uçlar devreye giriyor.
- Gemini'ye metin turu (`clientContent`) ses modelinde çalışıyor — mesaj okuma ve
  "yapıldı" haberi bu yoldan.

## Sıradaki

- Gerçek kullanımda uyandırma geri bildirimi; arabada 2 ortam kaydı → yeniden eğitim;
  gerekirse Ayarlar'a eşik kaydırıcısı. Pil tüketimi ölçümü.
- Arabada Bluetooth sesi, mesaj okuma ve kilitli ekranda navigasyonu doğrula.
- WhatsApp otomatik gönderme erişilebilirlik servisi güncellemede kapanmış — kullanıcı açacak.
- **Faz 3 — ortak hafıza:** telefon ve PC aynı `memory.json`'u görsün.
