"""
Ses cihazı seçimi ve mikrofon sağlık kontrolü.

NEDEN VAR (2026-07-29): Aıron sessiz kalıyordu ve hiçbir yerde nedeni
görünmüyordu. Teşhis: mikrofon uç noktası Windows'ta AKTİF ve sesi açık (%97)
görünmesine rağmen hiçbir host API'de gerçek ses üretmiyordu. PyAudio bu durumda
hata vermez — akışı açar ve içi boş tamponlar döndürür. Gemini Live hiç konuşma
duymadığı için hiç yanıt vermez; kullanıcıya bu "Aıron'un sesi gelmiyor" olarak
görünür. Sessiz arıza, en pahalı arıza türüdür — bu modül onu sesli hale getiriyor.

İKİ TÜR ARIZA VAR ve ikisi de "sıfır ses" gibi görünmez:

  1. SESSİZ  — tamponlar sıfır dolu (ölü mikrofon / susturulmuş donanım).
  2. DONMUŞ  — tamponlar sıfır DEĞİL ama her tamponda birebir aynı değer.
     Bu makinede DirectSound yolu tam olarak bunu yapıyordu: her okumada aynı
     sabit çöp tamponu döndürüyor. Sadece "seviye > 0" bakan naif bir kontrol
     bunu "çalışan mikrofon" sanır. Gerçek ses her zaman DEĞİŞİR — bu yüzden
     canlılık kararı seviyeye değil, seviyenin DEĞİŞİMİNE bakar.
"""

from __future__ import annotations

import logging
import math
import statistics
import struct
from dataclasses import dataclass

logger = logging.getLogger("airon")

# Medyan RMS bu eşiğin altındaysa "sinyal yok". Çalışan bir mikrofon sessiz odada
# bile gürültü tabanı üretir; gerçekten ölü bir akış tam sıfır döndürür.
SILENCE_LEVEL_THRESHOLD = 3.0
# Tampondan tampona RMS değişimi (standart sapma) bunun altındaysa akış "donmuş":
# sürücü ses yerine sabit bir tampon veriyor.
FROZEN_SPREAD_THRESHOLD = 0.5
# Sürücüler akış açılışında geçici çöp/klik üretebiliyor — ilk bu kadar saniye atılır.
WARMUP_SECONDS = 0.75


@dataclass
class InputProbe:
    """Bir mikrofon akışının kısa süreli ölçümü."""

    verdict: str  # "live" | "silent" | "frozen" | "unopenable"
    peak: float = 0.0
    median: float = 0.0
    spread: float = 0.0
    error: str = ""

    @property
    def ok(self) -> bool:
        return self.verdict == "live"


def rms_int16(data: bytes) -> float:
    """16-bit mono PCM tamponunun RMS'i. (audioop Python 3.13'te kaldırıldığı için
    standart kütüphaneye bağlı kalmadan hesaplanıyor.)"""
    count = len(data) // 2
    if count == 0:
        return 0.0
    samples = struct.unpack(f"<{count}h", data[: count * 2])
    return math.sqrt(sum(s * s for s in samples) / count)


def _iter_devices(pya, kind: str):
    channel_key = "maxInputChannels" if kind == "input" else "maxOutputChannels"
    for index in range(pya.get_device_count()):
        try:
            info = pya.get_device_info_by_index(index)
        except Exception:
            continue
        if int(info.get(channel_key, 0)) < 1:
            continue
        yield index, info


def resolve_device_index(pya, kind: str, name_hint: str) -> int | None:
    """Config'teki isim ipucuna uyan cihazın indeksini döndürür.

    None dönerse çağıran taraf parametreyi hiç geçmemeli — PortAudio kendi
    varsayılanını kullanır. (İpucu boşsa veya eşleşme yoksa istenen davranış budur:
    yapılandırma hatası uygulamayı sessize almamalı.)
    """
    hint = (name_hint or "").strip().lower()
    if not hint:
        return None

    for index, info in _iter_devices(pya, kind):
        if hint in str(info.get("name", "")).lower():
            logger.info("[AIRON] 🎚 %s cihazı seçildi: [%s] %s", kind, index, info.get("name"))
            return index

    logger.warning(
        "[AIRON] ⚠ config'teki %s cihazı bulunamadı (%r) — varsayılan cihaz kullanılıyor.",
        kind,
        name_hint,
    )
    return None


def probe_input(pya, device_index: int | None, rate: int, seconds: float = 2.5) -> InputProbe:
    """Mikrofonu kısa süre dinler ve gerçekten ses üretip üretmediğine karar verir."""
    chunk = 1024
    kwargs = {"input_device_index": device_index} if device_index is not None else {}
    try:
        import pyaudio  # type: ignore[reportMissingModuleSource]

        stream = pya.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=rate,
            input=True,
            frames_per_buffer=chunk,
            **kwargs,
        )
    except Exception as exc:
        return InputProbe(verdict="unopenable", error=str(exc))

    warmup_buffers = int(rate / chunk * WARMUP_SECONDS)
    levels: list[float] = []
    try:
        for i in range(int(rate / chunk * seconds)):
            data = stream.read(chunk, exception_on_overflow=False)
            if i >= warmup_buffers:
                levels.append(rms_int16(data))
    except Exception as exc:
        return InputProbe(verdict="unopenable", error=str(exc))
    finally:
        try:
            stream.close()
        except Exception:
            pass

    if len(levels) < 3:
        return InputProbe(verdict="unopenable", error="yeterli örnek alınamadı")

    median = statistics.median(levels)
    spread = statistics.pstdev(levels)
    peak = max(levels)

    if median <= SILENCE_LEVEL_THRESHOLD:
        verdict = "silent"
    elif spread < FROZEN_SPREAD_THRESHOLD:
        # Seviye var ama hiç değişmiyor — gerçek ses değil, sabit tampon.
        verdict = "frozen"
    else:
        verdict = "live"

    return InputProbe(verdict=verdict, peak=peak, median=median, spread=spread)


def describe_input_problem(probe: InputProbe) -> str:
    """Ölçümü kullanıcının uygulayabileceği bir mesaja çevirir. Sorun yoksa boş string."""
    if probe.verdict == "live":
        return ""

    if probe.verdict == "unopenable":
        return (
            f"Mikrofon akışı açılamadı ({probe.error[:120]}). Başka bir uygulama cihazı "
            "özel (exclusive) modda tutuyor olabilir."
        )

    if probe.verdict == "frozen":
        return (
            "Mikrofon sürücüsü ses yerine sabit bir tampon döndürüyor (gerçek kayıt yok). "
            "Genellikle sürücü sorunudur: Realtek/AMD ses sürücüsünü güncelle ya da "
            'config/api_keys.json içinde "mic_device" ile başka bir cihaz seç.'
        )

    # silent
    return (
        "Mikrofon veri üretmiyor (tam sessizlik) — Aıron seni DUYAMIYOR. "
        "Bu arada aşağıdaki yazı kutusuna yazarsan Aıron sana SESLİ cevap verir; "
        "mikrofon olmadan da konuşabilirsiniz. "
        "Mikrofonu düzeltmek için sırayla kontrol et: kulaklığın üzerindeki fiziksel "
        "susturma düğmesi, Windows > Ayarlar > Ses > Giriş'te doğru cihazın seçili "
        "olması ve seviyesi. Farklı bir mikrofon için config/api_keys.json içine "
        '"mic_device": "<cihaz adının bir parçası>" ekle.'
    )
