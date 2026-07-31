---
tags: [airon, bellek, config]
---

# Bellek ve Config — memory_manager.py + app_config.py

Bağlı: [[Home]] · [[Mimari]] · [[Arac-Tanimlari]] · [[WhatsApp]]

## app_config.py
`config/api_keys.json` dosyasını okuyup/yazan basit katman. `DEFAULT_CONFIG`:
`gemini_api_key, voice, youtube_api_key, youtube_channel_handle`.
- `load_app_config()` — dosyayı okur, eksik alanları default ile doldurur
- `save_app_config(updates)` — merge edip yazar
- `get_app_config_value(key, default)` — tek değer okuma (çoğu `actions/*.py` bunu kullanır)
- `has_gemini_api_key()` — UI'nin "API anahtarı gir" ekranını göstermesi için

`config/api_keys.example.json` şablon, gerçek dosya `config/api_keys.json` git'e girmemeli
(kişisel anahtar içerir).

## memory/memory_manager.py
`memory/memory.json` içine kalıcı, kategori/anahtar/değer şeklinde basit bir JSON hafıza.
- `load_memory()` / `update_memory(data)` (deep-merge) / `_write_memory()`
- `delete_memory(category, key, match_text)` — tam eşleşme veya bulanık metin eşleşmesiyle
  (`_entry_matches` — normalize edip token bazlı karşılaştırır) kayıt siler
- `format_memory_for_prompt(memory)` — hafızayı `[KULLANICI HAKKINDA BİLGİLER]` bloğu olarak
  sistem promptuna eklenecek metne çevirir ([[Mimari]] `_build_config()` içinde kullanılır)

`whatsapp_contacts` kategorisi özel formatlanır (`display_name`, `value`, `aliases`) —
bkz. [[WhatsApp]].

## Araçlarla bağlantı
`save_memory` / `delete_memory` tool'ları ([[Arac-Tanimlari]]) doğrudan bu modülün
`update_memory` / `delete_memory` fonksiyonlarını çağırır (main.py `_execute_tool` içinde).
