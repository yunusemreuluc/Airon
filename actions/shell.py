"""
Terminal komutu çalıştırma — Windows cmd/PowerShell.

Güvenlik modeli iki katmanlı:
  1) HARD_BLOCKED — asla çalıştırılmaz (confirm=True olsa bile).
  2) DESTRUCTIVE_PATTERNS — potansiyel olarak yıkıcı (silme, üzerine yazma,
     kayıt defteri değişikliği, indirip çalıştırma vb.); confirm=False ile
     çağrılırsa çalıştırılmaz, sadece ne yapılacağı açıklanır — kullanıcı
     onaylayıp confirm=True ile TEKRAR çağrılırsa gerçekten çalışır.
     (Aynı örüntü core/prompt.txt'te intervene_screen için de kullanılıyor.)

Eskiden sadece birkaç literal string'i (örn. "format c:") engelleyen bir
denylist vardı — bu hem eksikti (silme/indirme komutlarının çoğu serbestti)
hem de trivially bypass edilebiliyordu (farklı yazım/yol ile). Regex tabanlı
DESTRUCTIVE_PATTERNS çok daha geniş bir yıkıcı-komut ailesini yakalıyor;
mükemmel değil (komut satırı serbest metin) ama denylist'ten çok daha güvenli.
"""

import re
import subprocess

from actions.tool_result import fail, ok
from core.tool_registry import register_tool


# Bunlar confirm=True ile bile ASLA çalıştırılmaz.
HARD_BLOCKED = [
    "format c:",
    "format d:",
    "del /f /s /q c:\\",
    "rmdir /s /q c:\\",
    "rd /s /q c:\\",
    "shutdown",
    "net user administrator",
    "reg delete hklm",
    "bcdedit",
    "diskpart",
]

# Yıkıcı olabilecek komut kalıpları — confirm=True olmadan çalıştırılmaz.
# Silme, üzerine yazma/taşıma, kayıt defteri değişikliği, servis/işlem
# durdurma, indirip-çalıştırma (curl/iwr + iex) kalıplarını kapsar.
DESTRUCTIVE_PATTERNS = [
    r"\bdel\b", r"\berase\b", r"\brd\b", r"\brmdir\b",
    r"remove-item", r"\bri\b", r"clear-content", r"clear-item",
    r"\bformat\b", r"\bdiskpart\b", r"\bbcdedit\b",
    r"reg\s+(delete|add)",
    r"\bnet\s+user\b",
    r"\btaskkill\b", r"stop-process", r"stop-computer", r"restart-computer",
    r"\bshutdown\b",
    r">{1,2}",                                    # dosyaya yazma/üzerine yazma
    r"move-item", r"^\s*move\b",
    r"(invoke-webrequest|\biwr\b|\bcurl\b|\bwget\b).*(-outfile|-o\s)",  # indirme
    r"\biex\b|invoke-expression",                 # indir + çalıştır kalıbı
]


def _is_hard_blocked(cmd_lower: str) -> str:
    for blocked in HARD_BLOCKED:
        if blocked in cmd_lower:
            return blocked
    return ""


def _is_destructive(cmd_lower: str) -> bool:
    return any(re.search(pattern, cmd_lower) for pattern in DESTRUCTIVE_PATTERNS)


@register_tool("shell_run")
def shell_run(command: str, confirm: bool = False, timeout: int = 30) -> dict:
    if not command:
        return fail("Komut belirtilmedi.")

    cmd_lower = command.lower().strip()

    hard_blocked = _is_hard_blocked(cmd_lower)
    if hard_blocked:
        return fail(f"Güvenlik: Bu komut tamamen engellendi → {hard_blocked}", blocked_pattern=hard_blocked)

    if _is_destructive(cmd_lower) and not confirm:
        return ok(
            f"'{command}' komutu potansiyel olarak yıkıcı (dosya/kayıt silme, "
            "üzerine yazma, kayıt defteri değişikliği veya indirme/çalıştırma "
            "içerebilir). Çalıştırmamı onaylıyor musun?",
            needs_confirmation=True, command=command,
        )

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
        output = (result.stdout + result.stderr).strip()
        if len(output) > 800:
            output = output[:800] + "\n... (çıktı kısaltıldı)"
        if result.returncode != 0:
            return fail(output or f"Komut hata koduyla bitti ({result.returncode}).", return_code=result.returncode)
        return ok(output or "Komut başarıyla çalıştı (çıktı yok).", return_code=result.returncode)
    except subprocess.TimeoutExpired:
        return fail(f"Komut zaman aşımına uğradı ({timeout}s).")
    except Exception as e:
        return fail(f"Hata: {e}")
