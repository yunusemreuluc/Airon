---
tags: [airon, arac]
---

# Gemini Masaüstü Otomasyonu — actions/gemini_automation.py

Bağlı: [[Home]] · [[Arac-Tanimlari]] · [[Browser]] · [[Ekran-Mudahale]]

Masaüstündeki Chrome simgesinden başlayıp belirtilen profille açar, yeni sekmede
Google Gemini web sitesine gidip bir prompt gönderir.

Neden ayrı bir araç: [[Browser]] yalnızca URL açıyor, sayfa içi etkileşim
yapmıyor. Bu araç ise gerçek bir UI otomasyonu — profil seçimi, sekme açma,
prompt yazma ve gönderme adımlarını sırayla yürütüyor.

`repeat_count` / `repeat_text` ile aynı isteği (varsayılan `next`) tekrar
gönderebiliyor.

`confirm` parametresi var — [[Ekran-Mudahale]] ve [[Bildirimler-ve-Guc]] ile aynı
iki adımlı onay deseni.

`Docs/YAPILACAKLAR.md` listesinin dışında, kullanıcının ayrıca istediği bir
özellik.

Tool: `gemini_desktop_task` ([[Arac-Tanimlari]]).
