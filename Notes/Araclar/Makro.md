---
tags: [airon, arac, arayuz]
---

# Makro — core/macro_engine.py + backend/api/macro.py + MacroPanelContent.tsx

Bağlı: [[Home]] · [[Arayuz]] · [[Ekran-Mudahale]] · [[Bilinen-Tuzaklar]]

Kullanıcı isteği (2026-08-07): ekranda bir görseli bulup belirli aralıklarla
tıklayan makro. Sol paneldeki **Makro** modülünden yönetiliyor.

## Neden vision değil, şablon eşleştirme

[[Ekran-Mudahale]] ve [[Gemini-Masaustu]] hedefi Gemini vision'a buldurur.
Ölçüldü (2026-08-07) ve bu iş için yetersiz: vision 0-1000 normalize koordinat
döndürüyor, 1920 piksellik ekranda ~2 piksel/birim çözünürlük demek — küçük
hedeflerde komşu ögeye tıklıyor. Üstelik her adım bir model çağrısı, yani hem
yavaş hem kotalı.

Makro bunun yerine `cv2.matchTemplate` kullanıyor: piksel hassasiyetinde,
~10-30 ms, API çağrısı yok. Koordinat matematiği üç ayrı konumda **0 piksel
sapmayla** doğrulandı (güven 1.0000).

## Hedefler

Her hedef bir görsel + bulununca yapılacak eylem. Ayarlar: eşik (0-1), eylem
(sol/sağ/çift tık, tuş basma, **görünce dur**), ofset X/Y, bekleme (ms), sıra,
aç/kapa. Görseller `macros/images/<id>.png`, ayarlar `macros/profil.json`.

`dur` eylemi güvenlik içindir: ölüm ekranı, envanter dolu uyarısı gibi bir
görsel çıkınca makro kendini durdurur. Yalnızca `dur` hedefi varsa makro
**başlamaz** — tıklayacak bir şey yok demektir.

## Ayırt edicilik uyarısı

Şablon fazla düz/tekdüzeyse ekranda her yere uyar. Ölçüldü: tekdüze gri bir
şablon 1920x1080 ekranda **1.745.151** noktada 0.80 üstü skor veriyor. Bu
yüzden görsel eklenirken standart sapması ölçülüyor; 12'nin altındaysa panelde
uyarı çıkıyor (düz terminal arkaplanı ~1-3, detaylı bölge ~17-96).

İlk test bu tuzağa düştü: düz bir alandan kırpılan şablon yanlış yere
eşleşti — koordinat hatası sanılabilirdi, değildi.

## Dene (probe)

`POST /api/macro/probe` tek tarama yapar, **tıklamaz**: her hedefin o anki
skoru, eşiği ve ekranda kaç yere uyduğu. Eşiği kör ayarlamak yerine ölçerek
ayarlamayı sağlıyor. 50'den fazla aday çıkması "şablon belirsiz" demek.

## Durdurma

Dört yol: **F12** (her tur kontrol edilir, panele dönmeye gerek yok), süre
sınırı, eylem sayısı sınırı, `dur` hedefi. Bunlar süs değil — kontrolden çıkan
bir makro gerçek fareyi ele geçirir. `pyautogui.FAILSAFE` kapalı çünkü panik
tuşu bizde.

## Mimari

Motor backend sürecinde kendi thread'inde yaşıyor; ses döngüsüne (AironLive)
hiç dokunmuyor — ekran ve fare ondan bağımsız kaynaklar. Bu yüzden
[[Screen-Vision]] ve Vision panelinin aksine komut kanalına ihtiyaç yok,
uçlar gerçek sonuç döndürüyor.

Panel çalışırken ~0.9 sn, boştayken 4 sn'de bir yeniliyor. Yenileme etkisi
türetilmiş bir `running` **boolean'ına** bağlı: `status` nesnesine bağlansaydı
her yoklamada kimliği değişip zamanlayıcı sürekli kurulup yıkılırdı.

## Sınırlar — canlı testte doğrulanacak

- **Oyun pencereli/kenarlıksız modda olmalı.** Exclusive fullscreen'de ekran
  görüntüsü siyah gelir, hiçbir şey bulunamaz.
- **Sentetik tıklamayı oyun görmeyebilir.** `pyautogui` `SendInput` kullanıyor;
  DirectInput kullanan oyunlar bunu yok sayabilir. Bu, motor doğru çalışsa bile
  oyunun tepki vermemesi demektir ve ancak denenerek öğrenilir.
- **Şablon ölçeğe duyarlı.** Oyunun zoom/çözünürlük ayarı, görselin kırpıldığı
  andakinden farklıysa eşleşme tutmaz.

## Henüz yok

Sesli kontrol (`start_macro`/`stop_macro` araçları) eklenmedi — panel önce
canlı testten geçsin. Bölge seçimi ayarı motorda ve API'de var, panelde arayüzü
yok (şimdilik tüm ekran taranıyor).
