---
tags: [airon, gelistirme, claude-code]
---

# Geliştirme Ortamı — Claude Code alt-ajanları

Bu not Aıron'un **kendi kodunu** değil, Aıron'u geliştirirken kullanılan araçları anlatır.
Aıron çalışma zamanında bu ajanların hiçbirini kullanmaz — bunlar Claude Code oturumunda
`Agent` aracıyla çağrılan yardımcı personalardır.

## The Agency (agency-agents)

Kaynak: https://github.com/msitarzewski/agency-agents (MIT)

258 ajanlık, 18 bölümlük bir persona koleksiyonu. Her ajan tek bir `.md` dosyası:
YAML frontmatter (`name`, `description`, `color`, `emoji`, `vibe`) + rol tanımı,
iş akışı ve teslim listesi.

### Kurulum (2026-08-01)

| | |
|---|---|
| Depo | `~/.claude/agency-agents` (`--depth 1` klon, güncelleme: `git pull`) |
| Kurulu ajanlar | `~/.claude/agents` — **global**, tüm projelerde geçerli |
| Kurulan bölümler | engineering (58), design (10), security (12), testing (9), project-management (7), product (5) = **101** |
| Kurulmayan | marketing, specialized, strategy, game-development, gis, sales, academic, finance, healthcare, spatial-computing, support, paid-media |

Global seçildi: ajanlar Aıron'a özgü değil, depoyu kirletmemeleri gerekiyor.

### Neden hepsi değil

Claude Code her oturumda kurulu tüm ajanların `description` alanını sistem promptuna
yükler. 258 ajan kalıcı bir token maliyeti demek ve seçim isabetini de düşürür —
model 258 seçenek arasından doğru olanı bulmakta zorlanır. Aıron bir Python + Next.js
masaüstü uygulaması; pazarlama, GIS veya oyun geliştirme ajanlarının burada işi yok.

### Tuzak: `name` alanı kebab-case olmalı

Depodaki 258 dosyanın 255'inde frontmatter şöyleydi:

```yaml
name: AI Engineer
```

Claude Code alt-ajan adı `subagent_type` parametresine gider ve tanımlayıcı formatı
bekler — boşluklu/büyük harfli ad çağrılamaz. Kurulum sırasında her dosyanın `name`
alanı **dosya adına** göre yeniden yazıldı:

```yaml
name: engineering-ai-engineer
```

Bölüm öneki korundu: hem çakışma olmuyor hem de ad ajanın alanını söylüyor.

Kurulum betiği saklandı: `~/.claude/install-agency-agents.ps1`. Yeni bölüm eklemek
için aynı normalizasyonu tekrarlamak gerekir — dosyaları düz kopyalamak **çalışmaz**.

Dosyalar UTF-8 **BOM'suz** yazıldı; BOM `---` satırının önüne düşüp frontmatter
ayrıştırmasını bozar. PowerShell 5.1'de `Out-File -Encoding utf8` BOM ekler,
bu yüzden `[System.IO.File]::WriteAllText` + `UTF8Encoding($false)` kullanıldı.

### Aıron'la doğrudan ilgili olanlar

- `engineering-ai-engineer`, `engineering-multi-agent-systems-architect`,
  `engineering-prompt-engineer` — `core/prompt.txt` ve `tool_defs.py` turları
- `engineering-voice-ai-integration-engineer` — Gemini Live ses döngüsü
- `engineering-desktop-app-engineer` — `desktop.py`, WebView2 penceresi
- `engineering-frontend-developer`, `design-ui-designer`, `design-ux-architect` —
  `frontend/`, bkz. [[Arayuz]] ve [[Tasarim-Kurallari]]
- `testing-reality-checker` — "gerçekten çalışıyor mu" denetimi, bkz. [[Bilinen-Tuzaklar]]
  arayüzde dürüstlük kuralı
- `security-appsec-engineer` — [[Ekran-Mudahale]] ve [[Otonom-Duzeltme]] güvenlik kapıları

### Kalan bölümleri eklemek

```powershell
& "$env:USERPROFILE\.claude\install-agency-agents.ps1" -Divisions marketing,strategy,specialized
```

Ajanları kaldırmak: `~/.claude/agents` içinden ilgili `.md` dosyalarını silmek yeterli.

Yeni ajanlar oturum başında yüklenir — kurulumdan sonra Claude Code'un yeniden
başlatılması gerekir.
