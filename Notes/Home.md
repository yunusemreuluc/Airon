---
tags: [airon, moc]
---

# Aıron — Not Haritası (MOC)

Bu klasör, Aıron Windows projesinin kod tabanını özetleyen Obsidian notlarını içerir.
Amaç: kaynak kodun tamamını her seferinde yeniden okumadan, kısa notlardan bağlam almak.
Not bir kaynağı özetliyorsa dosya:satır referansı verir — detay gerekirse oradan bakılır.

## Çekirdek
- [[Mimari]] — main.py, AironLive, WebcamStreamer, bağlantı/olay döngüsü
- [[Arac-Tanimlari]] — tool_defs.py (Gemini function declarations) ve core/prompt.txt (sistem promptu)
- [[Bellek-ve-Config]] — memory_manager.py (kalıcı hafıza), app_config.py (API anahtarları/ayarlar)
- [[Arayuz]] — 3D sahne ve paneller: Vision, Timeline, uyku modu, sol panel modülleri, telemetri
- [[Tasarim-Kurallari]] — arayüz stili, animasyon, renk, bileşen adları (kod yorumlarındaki
  `CLAUDE.md § ...` atıfları buraya bakar)
- [[Bilinen-Tuzaklar]] — zamana mal olmuş tuzaklar, arayüzde dürüstlük, nasıl doğrulanır
- [[Yerel-Model]] — Ollama denendi ve **kaldırıldı**; ölçümler duruyor (num_ctx, Türkçe, VRAM)
- `CLAUDE.md` — yalın karar kitabı: Obsidian-önce iş akışı, rol, performans hedefi
- [[Kurulum-ve-Baslatma]] — kurulum ve çalıştırma: requirements.txt, AIRON.bat, make_shortcut.py,
  bellek profili; ayrıca `desktop.py` (WebView2 penceresi), `frontend/` (Next.js + Three.js) ve
  `core/web_ui.py` (ses döngüsü ↔ arayüz adaptörü)
- [[Gelistirme-Ortami]] — Aıron'un kodu değil, onu geliştirirken kullanılan araçlar:
  Claude Code alt-ajanları (agency-agents), kurulum kapsamı ve kebab-case `name` tuzağı

## Araçlar (actions/*.py — Gemini'nin çağırdığı fonksiyonlar)
- [[Open-App]] — uygulama açma
- [[Sys-Info]] — pil/CPU/RAM/disk/saat/ağ
- [[Weather]] — hava durumu (wttr.in)
- [[Calendar]] — Google Calendar (tarayıcı tabanlı)
- [[Reminders]] — Microsoft To-Do (tarayıcı tabanlı)
- [[Browser]] — URL açma, arama, YouTube ilk sonucu oynatma
- [[Media]] — Spotify/YouTube'da müzik çalma
- [[Shell]] — cmd.exe komut çalıştırma
- [[Webcam]] — canlı webcam akışı (main.py, WebcamStreamer)
- [[Screen-Vision]] — aktif pencere ekran görüntüsü + Gemini vision analizi
- [[Ekran-Mudahale]] — ekranda öge bulup tıklama/yazma (iki adımlı onay)
- [[Nesne-Tanima]] — kameradaki nesneler, YOLO-World (yerel) + öğretme
- [[OCR]] — kameradaki yazıyı okuma, EasyOCR (yerel, Türkçe+İngilizce)
- [[Izleme-ve-Brifing]] — proaktif izlemeler, günlük brifing, aktivite günlüğü
- [[Otonom-Duzeltme]] — gördüğü hatayı kendi düzeltmesi, üç güvenlik kapısı, off/safe/all
- [[Ambient-Baglam]] — kullanıcı şu an ne yapıyor (pencere/program/boşta), kotasız
- [[Dosya]] — doğal dille dosya arama ve içerik özetleme (salt okuma)
- [[Dosya-Yonetimi]] — sıralı adlandırma, taşıma, silme (Geri Dönüşüm Kutusu'na)
- [[Bildirimler-ve-Guc]] — Windows bildirimlerini okuma, kapat/yeniden başlat
- [[Gemini-Masaustu]] — Chrome'da Gemini'ye prompt gönderme otomasyonu
- [[Youtube-Stats]] — YouTube Data API kanal raporu
- [[WhatsApp]] — mesaj gönderme, kişi kaydetme, vCard içe aktarma
- [[Video-Analizi]] — YouTube linki veya yerel video dosyasını Gemini'ye izletip rapor aldırma

## Genel akış
1. `main.py` içindeki `AironLive.run()` Gemini Live API'ye bağlanır (`LIVE_MODEL`).
2. Ses/webcam akışları `asyncio.TaskGroup` ile paralel task'lar olarak yürür.
3. Model bir `function_call` döndürdüğünde `_execute_tool()` ilgili `actions/*.py` fonksiyonunu çağırır.
4. Sonuç `FunctionResponse` olarak modele geri gönderilir; `write_log` ile arayüze (WebSocket) akar.

## Temizlik kuralı
`actions/tts.py`, `actions/webcam_vision.py`, `actions/health.py` hiçbir yerden import
edilmiyordu (macOS sürümünden kalma) — 2026-07-29'da silindiler. Aynı temizlikte
kullanılmayan frontend bileşenleri ve iskelet backend uçları da kaldırıldı.

**Kural:** bir modül `tool_defs.py`'de tanımlı değilse ve hiçbir yerden import
edilmiyorsa yaşamıyordur. "İleride lazım olur" diye tutulan kod, gerçekten lazım
olduğunda zaten yeniden yazılıyor — bkz. `Docs/AIRON_UI_ROADMAP.md`.

Aynı kural 2026-08-06'da tekrar uygulandı: iskelet backend uçları
(`GET /api/system/status`, `GET /api/settings/status` — ikisi de "hazır" yazıp
boş dönüyordu, arayüz hiçbirini çağırmıyordu), hiçbir yerden import edilmeyen
`GlassButton`, boş `.gitkeep` klasörleri (`animations/`, `assets/`, `effects/`,
`styles/`, `types/`, `utils/`, `backend/services/`) ve git'te izlenen bir hata
ayıklama artığı (`logs/airon_ses_ornegi.pcm`) silindi. Aynı turda beş servis
dosyasındaki tekrar `frontend/services/apiClient.ts` altında toplandı
([[Arayuz]] § Veri akışı).

**Denetimin nasıl yapıldığı önemli:** `@register_tool` ile kaydedilen araçlar
`main.py`'de İSİMLE hiç çağrılmıyor — import'un tek amacı dekoratörü
çalıştırmak. Kör bir "kullanılmayan import" temizliği bu 20+ satırı silip
araçları sessizce yok ederdi; dosyadaki `noqa: F401` yorumları tam bu yüzden
duruyor. Ölü kod ararken registry, `TOOL_DECLARATIONS` ve `core/prompt.txt`
üçlüsü birlikte kontrol edilmeli (2026-08-06'da 36/36 örtüşüyordu; yalnızca
`read_text` prompt'ta eksikti, eklendi — [[OCR]]).

## Kaldırılan: Tkinter arayüzü (2026-07-29)
`ui.py` (3108 satır, "UI v6 Holo Prime") ve `wakeup_listener.py` kullanıcı isteğiyle
tamamen silindi. Tkinter Canvas gerçek blur/bloom/parçacık üretemediği için yaklaşık bir
karşılık çiziyordu; yerini WebGL tabanlı gerçek 3D arayüz aldı (`frontend/`, `desktop.py`).
`AironLive` bu geçişte **değişmedi** — arayüz bağımlılığı `core/web_ui.py` adaptörüyle
karşılandı. Daha öncesinde aynı orb'u PySide6 ile render etme denemesi de yapılmış ve
CPU maliyeti (~%100 tek çekirdek) yüzünden geri alınmıştı; WebGL yolunda o sorun yok
(GPU'da çalışıyor, bkz. [[Kurulum-ve-Baslatma]] bellek/performans ölçümü).
