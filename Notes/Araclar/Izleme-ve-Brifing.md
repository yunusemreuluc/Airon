---
tags: [airon, arac]
---

# İzleme, Brifing ve Aktivite — screen_watch.py · screen_monitor.py · activity_log.py

Bağlı: [[Home]] · [[Arac-Tanimlari]] · [[Screen-Vision]] · [[Ekran-Mudahale]] · [[Arayuz]]

Aıron'un **proaktif** tarafı: kullanıcı sormadan kendiliğinden konuşan
mekanizmalar. Hepsi `main.py` içinde `asyncio.TaskGroup` ile paralel arka plan
görevi olarak dönüyor.

## Ortak ön koşul

`_proactive_checks_allowed()` — duraklatılmışken, susturulmuşken, Aıron zaten
konuşurken veya canlı oturum hazır değilken **hiçbir bekçi çalışmaz**. Bazıları
ayrıca kamera açıkken de susuyor (`block_on_webcam`).

## Kullanıcının kurduğu izlemeler (start_watch / stop_watch)

`start_watch(instruction, condition, timeout_minutes)` hemen döner; gerçek
kontrol `_watch_custom_conditions` arka plan görevinde ~20 sn'de bir yapılır.
Koşul gerçekleşince (veya süre dolunca) izleme kendiliğinden kalkar ve Aıron
sesli haber verir.

[[Ekran-Mudahale]]'nin aksine **onay gerekmez** — bu araç yalnızca izler ve
bildirir, tıklamaz/yazmaz.

Aktif izlemeler `AironLive._active_watches` listesinde, yani **ses döngüsünün
belleğinde** yaşıyor; diskte karşılığı yok. Arayüzdeki Otomasyon paneli bu
yüzden dosyadan değil, `backend/core/commands.read_provider("automation")`
üzerinden okuyor ([[Arayuz]]).

`stop_watch(instruction)` — `instruction` boş bırakılırsa TÜM izlemeleri durdurur.

## Otomatik bekçiler (araç değil, arka plan)

- `_watch_screen_for_issues` — periyodik olarak aktif pencereyi kontrol eder
  (`actions/screen_monitor.py`), sorun görürse haber verir
- `_watch_system_health` — pil/disk/CPU/RAM eşikleri
  (`actions/sys_info.check_health_thresholds`)

## Günlük brifing

`start_daily_briefing(time_str)` — her gün belirtilen saatte (`SS:DD`, 24 saat)
kendiliğinden bir "günaydın" brifingi. **Şu an sadece hava durumu** —
takvim/hatırlatıcı/haberlere gerçek erişim yok (bkz. `Docs/YAPILACAKLAR.md` #5,
Google Calendar / Microsoft Graph OAuth entegrasyonu bekliyor).

Ayar `memory.json`'daki `scheduled_briefing` altında kalıcı ([[Bellek-ve-Config]]);
`PROTECTED_CATEGORIES` içinde olduğu için hafıza sıkıştırmasında arşivlenmiyor.

## Aktivite günlüğü

`get_daily_activity(date)` — o gün nelerin konuşulduğunu ve hangi araçların
çalıştırıldığını kronolojik döner (`memory/activity_log.py`). Ham liste sesli
okunmaz, özetlenip anlatılır.

Tool: `start_watch`, `stop_watch`, `start_daily_briefing`, `stop_daily_briefing`,
`get_daily_activity` ([[Arac-Tanimlari]]).
