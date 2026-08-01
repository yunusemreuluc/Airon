# Aıron — Yapılacaklar

**Vizyon (2026-07-26):** Aıron sadece "sesli asistan" değil — Iron Man'deki Jarvis gibi
ortamı sürekli/proaktif algılayıp gerektiğinde kendiliğinden harekete geçen bir sistem
olacak. Aşağıdaki maddeler bu hedefe giden adımlar; **tek tek** yapılacak, her biri
bitip test edilip onaylanınca bu dosyadan silinecek.

---

## 3. El hareketi tanıma ile masaüstü kontrolü
Görüntü işleme ile eli algılayıp, el hareketleriyle masaüstündeki dosyaları
açma/kapama gibi işlemler yapabilme ("ve daha fazlası" — genişleyebilir).
**Şimdilik ertelendi** — sırada değil, ileride dönülecek.

## 5. Proaktif takvim/hatırlatıcı bildirimi
**Şimdilik ertelendi** (2026-07-26) — gerçek engel bulundu: Windows'taki
`get_calendar_events`/`get_reminders` gerçek veri OKUMUYOR, sadece tarayıcıda
Google Calendar/Microsoft To-Do açıyor (macOS'un EventKit entegrasyonu Windows'a
hiç taşınmamış). Proaktif bildirim için önce Google Calendar API + (muhtemelen)
Microsoft Graph API ile gerçek OAuth entegrasyonu gerekiyor — bu kullanıcının da
tarafında iş (Google Cloud Console / Azure'da uygulama kaydı) gerektiren ayrı,
daha büyük bir görev. İleride dönülecek.

---

# CLAUDE.md'ye göre eksikler

2026-07-31'de `CLAUDE.md` madde madde kodla karşılaştırıldı; aşağıdakiler
sözleşmede yazıp gerçekte olmayanlar. Numaralar 13'ten başlıyor: 1-12 arası
kaynak kodun içinden atıf alıyor (ör. `actions/screen_watch.py` → "#7"),
tekrar kullanılırsa o atıflar yanlış maddeye işaret eder.

## 13. Muhakeme akışı (Reasoning) — alt panel
**Yapıldı (2026-07-31), CANLI ONAY BEKLİYOR.**

Yapılanlar: `_build_config()` artık `thinking_config=ThinkingConfig(
include_thoughts=True)` gönderiyor; `_receive_audio` içinde `model_turn.parts`
listesindeki `thought=True` işaretli parçalar toplanıyor, cümle sınırında
`reasoning` olayı olarak yayınlanıyor ve Timeline'da italik + beyin ikonuyla
gösteriliyor. `TimelineKind` içindeki ölü `'reasoning'` üyesi canlandı.

**Not:** ilk plan yanlış yeri işaret ediyordu — `out_buf` Aıron'un SÖYLEDİĞİ
şey, o zaten sohbette görünüyor. Gerçek muhakeme `model_turn.parts` içinde
ayrı bir bayrakla geliyor.

**Neden hâlâ silinmedi:** `models/gemini-2.5-flash-native-audio-latest`
modelinin düşünce parçası gerçekten yayınlayıp yayınlamadığı canlı oturumda
DOĞRULANMADI. Boru hattının tamamı (yayın, tampon, olay, arayüz) sahte veriyle
test edildi ve çalışıyor; eksik olan tek şey modelin gerçekten düşünce
göndermesi.

Model bu ayarı reddederse `_is_thinking_rejection` yakalayıp
`_thinking_supported = False` yapıyor ve hemen yeniden bağlanıyor — sesli
asistanın çalışması muhakeme akışına feda edilmiyor. Timeline'da muhakeme
satırı hiç görünmüyorsa sebep budur; `debug` akışında uyarı satırı çıkar.

## 14. Yüz tanıma
`CLAUDE.md` § RIGHT PANEL: Camera ✓, Object Detection ✓, OCR ✓, **Face
Recognition ✗**.

Yeni ve ağır bir bağımlılık gerekiyor (InsightFace ya da dlib) ve gizlilik
açısından hassas — kimin yüzünün nerede saklanacağı ayrıca kararlaştırılmalı.

## 20. Ambient bağlamı oturuma İTME yolu denenmedi
`get_context` bugün **çekme** modelinde: model ihtiyaç duyunca çağırıyor
(bkz. [[Ambient-Baglam]]). Sürekli enjeksiyon
(`send_client_content(turn_complete=False)`) bilerek yapılmadı — SDK
`send_realtime_input` ile karıştırmaya karşı uyarıyor ve açık bırakılan bir tur
Aıron'u sese sağır bırakabilir.

Denenecekse: kotanın bol olduğu bir anda, `_thinking_supported` desenindeki gibi
bir güvenlik valfiyle (reddedilirse/susarsa anında kapat ve yeniden bağlan).
Kazancı, modelin bağlamı çağırmayı unutamaması olurdu.

---

**Çalışma şekli:** Bu listeden birini seçip beraber yapıyoruz, test edip onaylandıktan
sonra maddeyi buradan siliyoruz, sıradakine geçiyoruz.
