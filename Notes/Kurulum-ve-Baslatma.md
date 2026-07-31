---
tags: [airon, kurulum]
---

# Kurulum ve Başlatma

Bağlı: [[Home]] · [[Mimari]]

## Kurulum (manuel — setup.bat kaldırıldı)
`OKU_BENI.txt` içinde adımlar: `python -m venv venv` → `venv\Scripts\activate.bat` →
`pip install -r requirements.txt` → `config\api_keys.example.json`'ı `config\api_keys.json`
olarak kopyala → (opsiyonel) `Fonts/*.ttf`'i Windows'a kur.

## BASLAT.bat
Kök dizinde. `venv\Scripts\pythonw.exe` varsa onunla, yoksa sistem `pythonw` ile `main.py`'yi
konsolsuz başlatır. `setup.bat`'a bağımlı değildi — venv zaten varsa direkt kullanır.

## make_shortcut.py
Windows `.lnk` kısayolları üretir (macOS sürümündeki `.app`/LaunchAgent'ın karşılığı):
- `create_desktop_shortcut()` → Masaüstü\Aıron.lnk
- `create_startup_shortcut()` / `remove_startup_shortcut()` → Başlangıç klasörü (açılışta otomatik
  başlatma)
- PowerShell `WScript.Shell` COM nesnesi ile `.lnk` yazar, hedef `pythonw.exe main.py`
- Ayarlar panelindeki "masaüstüne kısayol" / "açılışta başlat" düğmeleri bunu çağırır
  (`backend/api/settings.py`)

## wakeup_listener.py
`WakeGestureListener` — mikrofon RMS eşiğiyle çift alkış algılar, 2sn pencere içinde 2 alkış olursa
`on_wake()` çağırır (pencereyi öne getirir). main.py'de `ENABLE_CLAP_WAKE = False` ile varsayılan
kapalı — yanlış tetiklenme riski nedeniyle (main.py:865 yorum satırı).

## requirements.txt / Fonts / SFX / Icon
- `Fonts/` — Grift font ailesi (.ttf), kurulum sırasında Windows Fonts'a kopyalanır
- `SFX/` — orijinal proje sesleri geri yüklendi (`Start/Done/Error/HUD/Think.mp3`,
  OneDrive çöp kutusundan kurtarıldı — 2026-07-06). `ui.py`'deki `_HUD_FILE` vb. sabitler
  tekrar `.mp3` uzantısına işaret ediyor. **HUD ambient döngüsü bilinçli olarak kapalı**:
  ui.py'de `ENABLE_AMBIENT_HUD = False` sabiti (SFX yol sabitlerinin hemen altında) —
  `SoundManager.start_ambient()` bu bayrağı görünce dosya diskte olsa bile hiç çalmadan
  döner. Rahatsız edici bulunduğu için kapatıldı; tekrar açmak istenirse tek satır
  (`ENABLE_AMBIENT_HUD = True`) yeterli, başka değişiklik gerekmez.
  Start/Done/Error/Think normal çalışıyor: açılışta bir kez `_play_startup_sfx_once`
  (main açılışında `self.root.after(400, ...)` ile tetiklenir), araç başarı/hata
  durumlarında Done/Error, "THINKING" durumunda Think döngüsü.
- `Icon/` — instagram/youtube ikonları (UI'de kullanılan görseller)

## Ses cihazları ve "Aıron konuşmuyor" teşhisi (2026-07-29)
Aıron'un sesli çalışması üç halkaya bağlı ve **herhangi biri koptuğunda belirti aynı: sessizlik.**
Bu belirsizlik gerçek bir arızada saatler kaybettirdiği için teşhis araca dönüştürüldü.

### ses_testi.py
`venv\Scripts\python.exe ses_testi.py` — üç halkayı ayrı ayrı test eder:
1. **Çıkış** — 24 kHz akış (Aıron'un konuştuğu format) açılıyor mu + test tonu çalar
2. **Giriş** — mikrofon gerçekten veri üretiyor mu
3. Giriş arızalıysa **tüm mikrofonları** tarar ve config'e yazılacak çalışan cihazı önerir

`ses_testi.py --aironun-sesi` — Gemini Live'dan Aıron'un GERÇEK sesini alır ve sırayla
her çıkış cihazından çalar. "Ses gelmiyor"un en sık nedeni arıza değil YÖNLENDİRME:
varsayılan çıkış kulaklık jakına düşmüşken kullanıcı hoparlörden dinliyor olabiliyor.
Örnek `logs/airon_ses_ornegi.pcm`'e kaydedilir — tekrar çalıştırmak kota harcamaz.

**Mikrofon olmadan da Aıron konuşur:** UI'deki yazı kutusuna yazılan metin
`AironLive._on_text_command` → `send_client_content` ile gönderilir ve oturum
`response_modalities=["AUDIO"]` olduğu için cevap SESLİ gelir. Mikrofon arızasında
kullanıcıya bu yol öneriliyor (bkz. `core/audio_devices.py` → `describe_input_problem`).

### İki tür mikrofon arızası — ikisi de "hata vermez"
- `silent` — tamponlar sıfır dolu. Uç nokta Windows'ta AKTİF ve seviyesi %97 görünse
  bile olabilir (bu makinede tam olarak bu yaşandı).
- `frozen` — tamponlar sıfır değil ama **her tamponda birebir aynı değer**; sürücü ses
  yerine sabit çöp döndürüyor. Bu makinede DirectSound yolu böyle davranıyordu.
  Sadece "seviye > 0" bakan bir kontrol bunu "çalışıyor" sanır — bu yüzden canlılık
  kararı seviyeye değil **seviyenin değişimine** (standart sapma) bakar.
  Bkz. `core/audio_devices.py` → `probe_input()`.

### Cihaz seçimi
`config/api_keys.json` içinde iki opsiyonel anahtar (bkz. `app_config.py` DEFAULT_CONFIG):
- `"mic_device"` — cihaz adının bir parçası, ör. `"Microphone Array"`
- `"speaker_device"` — ör. `"Speaker"` (Windows varsayılanı kulaklık jakına düştüğünde)

İsim tutuluyor, indeks değil: PortAudio indeksleri cihaz takılınca/yeniden başlatınca kayar.
Eşleşme bulunamazsa uygulama sessize düşmez, varsayılan cihaza geri döner (log'a uyarı yazar).

`main.py` her açılışta (süreç başına bir kez, `_check_microphone_health`) mikrofonu 2 sn
dinler; ölü bulursa UI log'una ne yapılacağını yazan bir `ERR:` satırı düşer — eskiden
hiçbir belirti vermeden sessizce oturuyordu.

## AIRON.bat — masaüstü penceresi (2026-07-29)
Kullanıcı isteğiyle 3D arayüz artık tarayıcıda değil, kendi uygulama penceresinde açılıyor.
**Arayüz yeniden yazılmadı** — aynı Next.js/WebGL kodu Windows'un WebView2 (Chromium)
motorunda çalışıyor, görüntü tarayıcıdakiyle birebir aynı. Pencerede doğrulandı:
WebGL2 aktif, `ANGLE (AMD Radeon, Direct3D11)` — yani gerçek GPU hızlandırma, yazılımsal
render değil.

### Nasıl çalışıyor
`AIRON.bat` → `desktop.py` → tek Python süreci, iki katman:
```
[WebView2 penceresi] --HTTP/WS--> [FastAPI 127.0.0.1:8000, arka plan thread]
                                     ├── /        frontend/out (statik arayüz)
                                     ├── /api/*   REST
                                     └── /ws      canlı durum akışı
```
- `frontend/next.config.ts` → `output: 'export'`: `npm run build` artık `frontend/out/`
  altında saf HTML/CSS/JS üretiyor. Çalışma zamanında Node sunucusu **gerekmiyor**.
  Mümkün, çünkü uygulama tek sayfa ve tamamen istemci taraflı.
- `backend/main.py` sonunda `StaticFiles` mount'u var. **EN SONDA olmalı** — "/" altındaki
  her yolu yakalar; API/WS rotaları önce kaydedildiği için gölgede kalmaz. Export yoksa
  mount edilmez, `npm run dev` akışı bozulmaz.
- `desktop.py` 8000 portu zaten dinlemedeyse ikinci backend açmaz (mevcut olanı kullanır).
- `gui="edgechromium"` zorunlu: belirtilmezse pywebview eski EdgeHTML'e düşebilir, orada
  WebGL2 ve `backdrop-filter` çalışmaz — arayüz siyah görünürdü.

### Hangi başlatıcı ne yapıyor
| Dosya | Ne başlatır |
|---|---|
| `AIRON.bat` | Masaüstü penceresi (3D arayüz). İlk açılışta arayüzü bir kez derler. |
| `BASLAT.bat` | Sesli asistan (`main.py`, Tkinter penceresi + Gemini Live) |
| `WEB-BASLAT.bat` | Geliştirme: `npm run dev` + tarayıcı (hot reload) |

### Masaüstü kısayolları
`python make_shortcut.py` — argümansız İKİ kısayol da oluşturur:
`Aıron.lnk` (main.py, sesli asistan) ve `Aıron 3D.lnk` (desktop.py, 3D pencere).
Tek uygulama için: `python make_shortcut.py desktop`.

Kısayollar `pythonw.exe` ile başlatıyor — konsol penceresi açılmaz. **Bunun iki tuzağı
var ve ikisi de "kısayol hiç açılmıyor" olarak görünür:**

1. `pythonw` altında `sys.stdout` ve `sys.stderr` **None**'dır. `print()` bunu sessizce
   tolere eder ama `logging`/uvicorn etmez — `StreamHandler` None akışa yazmaya çalışınca
   patlar ve backend thread'i ilk saniyede ölür. İlk kısayol denemesinde tam olarak bu
   oldu: hiçbir süreç kalmıyordu. `desktop.py` artık bu durumda akışları
   `logs/desktop.log`'a yönlendiriyor (yan fayda: kısayoldan açılan uygulamanın hatası
   diskte görünür).
2. Konsol olmadığı için hata mesajı kullanıcıya ulaşmaz. `desktop.py` ölümcül hataları
   `_fatal()` ile Windows iletişim kutusunda gösteriyor — ör. arayüz derlenmemişse.

### Birleşti (2026-07-29) — sesli asistan + 3D arayüz tek uygulama
`AIRON.bat` / `Aıron 3D` kısayolu artık **sesli asistanı da** aynı süreçte başlatıyor.
Ayrı Tkinter penceresi yok.

**Nasıl yapıldı:** `AironLive`'ın TEK SATIRI değişmedi. Ses döngüsü arayüzüne 15 noktadan
dokunuyordu (9 metot + 6 geri çağırma yuvası); `core/web_ui.py` → `WebUI` tam olarak o
yüzeyi taklit ediyor ama ekrana çizmek yerine olayları WebSocket'e yayınlıyor. Bağımlılık,
ses döngüsü yeniden yazılarak değil **karşı taraf değiştirilerek** koparıldı — sesin
çalıştığı bilinen kod yoluna hiç dokunulmadı.

```
AironLive --(ui.set_state/write_log/...)--> WebUI --WS--> 3D arayüz
AironLive <--(on_text_command/on_pause)---- WebUI <--HTTP-- 3D arayüz
```

| Katman | Dosya |
|---|---|
| Arayüz adaptörü | `core/web_ui.py` |
| Komut yolu (arayüz→ses) | `backend/core/commands.py`, `backend/api/voice.py` |
| Olay yolu (ses→arayüz) | `backend/websocket/manager.py` → `broadcast_threadsafe` |
| Sohbet paneli | `frontend/components/VoicePanelContent.tsx`, `ConversationLog.tsx` |

**Dikkat edilecek üç nokta:**
- `WebUI` içindeki hiçbir çağrı ses döngüsünü bloklamamalı ve patlamamalı. Arayüz kapalıyken
  bile Aıron konuşmaya devam etmeli — olaylar sessizce düşer.
- `connected` ≠ `ready`. Ses döngüsü süreçte olabilir ama Gemini Live oturumu henüz
  kurulmamış olabilir; o aralıkta gönderilen komut **kaybolur**. Arayüz yazma kutusunu
  `ready` gelene kadar kilitliyor (`/api/voice/status` + `assistant_status` olayı).
- `"Siz: ..."` satırını `AironLive._on_text_command` zaten yazıyor; `WebUI` tekrar yazmamalı
  (ilk sürümde satır sohbette iki kez görünüyordu).

Ses döngüsü backend ile aynı süreçte olduğu için `core/web_bridge.py` (HTTP köprüsü)
`disable()` ile kapatılıyor — yoksa süreç her durum değişiminde kendine HTTP isteği atardı.

Arayüz üzerinde tasarım çalışırken kotayı/mikrofonu meşgul etmemek için:
`python desktop.py --sadece-arayuz`


## Bellek profili (2026-07-29 ölçümü)
Ölçüm 31.3 GB RAM'li makinede, `Aıron 3D` açıkken, süreç ağacının tamamı üzerinde yapıldı.

| Katman | RAM |
|---|---|
| WebView2 (6 süreç, Chromium + WebGL) | ~1.0 GB |
| Python (backend + ses döngüsü + araçlar) | ~255 MB |
| **Toplam** | **~1.25 GB** (sistemin %4'ü) |

Karşılaştırma (aynı anda): Chrome 2.2 GB, VS Code 2.8 GB.

**Sızıntı yok.** 8 dakikalık boşta ölçümde Python 257→257 MB (±6 dalgalanma),
WebView2 1142→963 MB'a *düştü* (Chromium belleği geri veriyor).

### Yapılan optimizasyon — açılışta 340 MB → 139 MB
`main.py` araçları kaydetmek için tüm `actions/*` modüllerini import ediyor. İki modül
ağır kütüphaneleri **modül seviyesinde** import ediyordu, yani özellik hiç kullanılmasa
bile bedeli her açılışta ödeniyordu:

- `actions/object_recognition.py` → `from ultralytics import YOLOWorld` = torch +
  ultralytics + matplotlib zinciri, **273 MB**
- `actions/video_analysis.py` → `import yt_dlp`, **~50 MB**

İkisi de gerçek kullanım anına ertelendi. Kurulu olup olmadığını anlamak için import
gerekmiyor: `importlib.util.find_spec(...)` modülü çalıştırmadan sadece dosya sisteminde
arar. `HAS_ULTRALYTICS` / `HAS_YTDLP` davranışı aynı kaldı.

**Kural:** `actions/` altındaki bir modüle ağır bir bağımlılık eklerken import'u
fonksiyon içine koy — `main.py` hepsini açılışta yüklüyor.

### İleride ne büyür
- **Nesne tanıma ilk kez çalıştığında** torch zinciri yüklenir ve süreç ömrü boyunca
  kalır (+273 MB) — sürekli görü yapan bir kurulumda Python tarafı ~530 MB'a çıkar.
- **WebView2'nin ~1 GB'ı** bu mimarinin taban maliyeti; arayüze özellik eklemek bunu
  kayda değer artırmaz (3D sahne zaten GPU'da). Ağır doku/model eklenirse artar.
- Sohbet geçmişi `MAX_LINES = 200` ile sınırlı (frontend/stores/conversationStore.ts) —
  uzun oturumda sınırsız büyümez.
- Webcam önizlemesi 8 FPS'e kısıldı ve **dinleyen arayüz yoksa hiç üretilmiyor**
  (`manager.has_clients()`), aksi halde saniyede 8 kez ~130 KB base64 boşa üretiliyordu.


## Ayarlar paneli ve asistan dock'u (2026-07-29)
Tkinter penceresindeki ayar paneli 3D arayüze taşındı; sohbet sağ alt köşeye alındı.

### Ayarlar — sol ray > dişli ikon
| Kontrol | Nereye yazıyor |
|---|---|
| Gemini API anahtarı | `config/api_keys.json` → `gemini_api_key` (panelde maskeli gösterilir) |
| Ses (9 seçenek) | `voice` + oturumu anında yeniler (`commands.dispatch("voice")` → `AironLive._on_voice_change`) |
| Ses efektleri aç/kapa | `sfx_enabled` |
| FX seviyesi | `sfx_volume` (kaydırırken değil, **bırakınca** yazılır — her piksel için diske yazmamak için) |
| Açılışta başlat | Başlangıç klasörü kısayolu (`make_shortcut.py`) |
| Masaüstüne kısayol | `Aıron 3D.lnk` |
| Tepsiye al | `desktop.py` → `TrayController` |

Tkinter sürümü SFX ayarlarını yalnızca bellekte tutuyordu; burada diske yazılıyor.

### SFX — artık tarayıcı çalıyor
Python'un `SoundManager`'ı yerine ses efektleri arayüzde çalıyor: `backend/main.py`
`SFX/` klasörünü `/sfx` altında sunuyor, `frontend/services/sfxPlayer.ts` çalıyor.
Bağlanan olaylar: açılış (`Start.mp3`), araç başarısı (`sfx` olayı → `Done.mp3`),
hata satırı (`ERR:` → `Error.mp3`).

**Kritik ayrıntı:** Chromium kullanıcı sayfaya dokunmadan ses çalmayı engeller, bu
yüzden açılış sesi hiç duyulmazdı. `desktop.py` en üstte
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--autoplay-policy=no-user-gesture-required`
ayarlıyor — WebView2 bu değişkeni yalnızca motor başlamadan önce okur, o yüzden
import'lardan bile önce set ediliyor.

### Tepsi (TrayController)
Tepsi ikonu YALNIZCA küçültülmüşken var olur — pencere açıkken duran bir ikon
gereksiz. `pystray.run()` bloklar, kendi thread'inde çalışır. Menü: "Aıron'u aç"
(çift tık varsayılanı) ve "Çıkış".

### Sağ alt dock (AssistantDock.tsx)
Mikrofon düğmesi sol panelden kaldırıldı. Gerekçe yerleşimsel: sol panel modül
gezinmesi için, asistanla konuşmak ise gezinmeden bağımsız ve sürekli erişilebilir
olmalı. Dock kapalıyken **son sohbet satırını** gösteriyor — kullanıcı paneli
açmadan da bir şey olduğunu görsün diye. `navigationStore`'daki `voice` modülü
kaldırıldı, yerine `settings` geldi.


## Pencere boyutu hafızası (2026-07-29)
Pencere, en son bırakıldığı boyutta ve konumda açılır. Kayıt: `config/window_state.json`
(kimlik bilgisi taşıyan `api_keys.json`'a karıştırılmadı). İlk açılışta kayıt yokken
ekranın %82 × %89'u, ortalanmış.

### Neden Win32, neden pywebview değil
Bu makinede Windows ölçeklemesi **%125** (1920x1080 fiziksel = 1536x864 mantıksal) ve
pywebview'in birimleri tutarlı değil:

| Kaynak | Birim |
|---|---|
| `create_window(width=...)` | mantıksal (%125'te 1600 istenince ekranda 2000 px olur, ekrandan taşar) |
| `window.width` özelliği | mantıksal |
| `webview.screens[0].width` | mantıksal (1536) |
| `min_size` | mantıksal (1280x800 → ekranda 1600x1000) |

Bu yüzden boyut/konum **Win32 ile** ölçülüyor (`GetWindowRect`) ve **Win32 ile**
uygulanıyor (`SetWindowPos`) — ikisi de aynı birimi kullandığı için gidiş-dönüş kararlı.
Ekran boyutu da `GetDeviceCaps(DESKTOPHORZRES/VERTRES)` ile alınıyor; bu değer
ölçeklemeden etkilenmez. `webview.screens` ile karşılaştırmak pencereyi her açılışta
ölçekleme oranı kadar küçültüyordu.

**Ölçüm tuzağı:** Pencereyi DPI-farkında OLMAYAN bir süreçten ölçerseniz (ör. hızlıca
yazılmış bir test betiği) Windows koordinatları sanallaştırır ve yanlış sayı görürsünüz.
Doğru ölçüm için ölçen süreçte `shcore.SetProcessDpiAwareness(2)` çağrılmalı.
Uygulamanın kendi süreci SYSTEM DPI-farkında.

Ekranı kaplamış haldeyken kapatılırsa yalnızca `{"maximized": true}` kaydedilir —
kaplanmış boyutu "normal boyut" diye kaydetmek, sonraki açılışta ekran kadar büyük ama
kaplanmamış bir pencere bırakırdı.
