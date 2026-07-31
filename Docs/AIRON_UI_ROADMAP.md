# AIRON UI — Kalan İşler

Bu dosya 17 fazlık bir plan olarak başladı. **Tamamlanan fazlar 2026-07-29'da silindi**
(kullanıcı isteği) — burada yalnızca yapılmamış işler var. Biten bir madde bu dosyadan
çıkarılır; nasıl yapıldığı `Notes/` altındaki belgelerde anlatılır.

Tamamlananların özeti: altyapı, yerleşim, 3D sahne, Energy Core, elektrik arkları,
yörünge düğümleri, düğüm bağlantıları (neural network), AI durum animasyonları, fare
etkileşimi, açılış animasyonu, masaüstü paketleme (WebView2), sesli asistan entegrasyonu,
ayarlar paneli, performans optimizasyonu, uyku modu (çekirdeğe tıklama), tepsi kontrolü,
odaklı düğüme kamera yaklaşması, **Vision paneli**, **alt Timeline**, **Hafıza ve
Otomasyon panelleri**, **ses dalga formu**, **düşünme sesi** ve **telemetri kartı**.

---

## 1. Vision paneli — kalanlar

Panel yapıldı (2026-07-30): canlı kamera görüntüsü, yerel YOLO-World taraması, tespit
çerçeveleri ve etiketleri. OCR 2026-07-31'de eklendi (yerel EasyOCR, Türkçe+İngilizce,
`read_text` aracıyla sesli de kullanılabiliyor). Kamera aç/kapat, "Nesneler" ve
"Yazıyı oku" arayüzden çalışıyor (`backend/api/vision.py`).

- [ ] Yüz tanıma

## 2. Sol panel modülleri — kalanlar

Hafıza ve Otomasyon 2026-07-30'da gerçek veriye bağlandı. Kalan ikisinin arkasında
gösterilecek bir veri **yok**, o yüzden dürüst boş durum gösteriyorlar:

- [ ] Ajanlar — çoklu ajan sistemi henüz planlama aşamasında (bağlanacak bir şey yok)
- [ ] Tarayıcı — oturum durumu tutulmuyor; sayfa içi etkileşim eklenince anlamlı olacak

## 3. Küçük artıklar

- [ ] Telemetri kartında GPU ve sıcaklık yok — Windows'ta `psutil` ikisini de güvenilir
      vermiyor (`sensors_temperatures` çoğu masaüstünde boş döner, GPU için ayrı bir
      satıcı kütüphanesi gerekir). Uydurmak yerine hiç gösterilmiyor.
      (İnternet ve saat 2026-07-31'de eklendi — `Notes/Arayuz.md` § Telemetri şeridi.)
- [ ] Sol ray etiketi ile AIRON imzası 19×9 px çakışıyor — yerleşim kararı gerekiyor
      (`Docs/YAPILACAKLAR.md` #19).

---

## Bilinçli olarak yapılmayacaklar

- **Mobil optimizasyon** — Aıron artık bir masaüstü uygulaması (WebView2 penceresi).
  Tarayıcıda geliştirme modu hâlâ çalışıyor ama mobil bir hedef değil.
