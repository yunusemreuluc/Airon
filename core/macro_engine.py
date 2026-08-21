"""AIRON makro motoru — şablon eşleştirmeli otomatik tıklama.

MİMARİ KARAR: hedefi Gemini vision'a DEĞİL, OpenCV şablon eşleştirmesine
(`cv2.matchTemplate`) buldurur. Sebebi ölçüldü (2026-08-07): vision 0-1000
normalize koordinat döndürüyor, 1920 piksellik ekranda bu ~2 piksel/birim
çözünürlük demek ve küçük hedeflerde yanlış yere tıklıyor
(bkz. Docs/YAPILACAKLAR.md § 22). Şablon eşleştirme piksel hassasiyetinde,
~10-30 ms sürüyor ve API çağrısı harcamıyor.

Motor backend sürecinde kendi thread'inde yaşar; ses döngüsüne (AironLive)
hiç dokunmaz — ekran ve fare ondan bağımsız kaynaklar.

GÜVENLİK: F12 her turda kontrol edilir ve döngüyü anında keser. Ayrıca süre,
eylem sayısı ve "şu görsel çıkarsa dur" hedefi sınır koyar. Bunlar isteğe
bağlı süsler değil: kontrolden çıkan bir makro fareyi ele geçirir.
"""

from __future__ import annotations

import ctypes
import json
import logging
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

logger = logging.getLogger("airon.macro")

try:
    import cv2
    import numpy as np
    HAS_CV = True
except ImportError:  # pragma: no cover
    cv2 = None
    np = None
    HAS_CV = False

try:
    import mss
    HAS_MSS = True
except ImportError:  # pragma: no cover
    mss = None
    HAS_MSS = False

try:
    import pyautogui
    pyautogui.FAILSAFE = False  # panik tuşu bizde; köşeye kaçan fare motoru öldürmesin
    HAS_PYAUTOGUI = True
except ImportError:  # pragma: no cover
    pyautogui = None
    HAS_PYAUTOGUI = False

BASE_DIR = Path(__file__).resolve().parent.parent
MACRO_DIR = BASE_DIR / "macros"
IMAGE_DIR = MACRO_DIR / "images"
PROFILE_PATH = MACRO_DIR / "profil.json"

VK_F12 = 0x7B

# Ölçüldü: tekdüze gri bir şablon 1920x1080 ekranda 1.7 MİLYON noktada 0.80
# üstü skor veriyor — yani düz şablon garantili yanlış tıklama. Standart sapma
# bunun ucuz göstergesi (düz terminal arkaplanı ~1-3, detaylı bölge ~17-85).
DISTINCTIVENESS_MIN = 12.0
AMBIGUITY_WARN = 50

ACTIONS = ("sol", "sag", "cift", "tus", "dur")


@dataclass
class Target:
    """Aranacak tek bir görsel ve bulununca yapılacak şey."""
    id: str
    name: str
    image: str                    # macros/images/ altındaki dosya adı
    threshold: float = 0.80
    action: str = "sol"           # sol | sag | cift | tus | dur
    key: str = ""                 # action='tus' ise basılacak tuş
    offset_x: int = 0             # merkeze değil, kaç piksel yanına
    offset_y: int = 0
    cooldown_ms: int = 800        # bu hedefi tekrar tetiklemeden önce bekleme
    priority: int = 0             # küçük olan önce denenir
    enabled: bool = True
    distinctiveness: float = 0.0  # eklenirken ölçülür, panelde gösterilir


@dataclass
class Settings:
    scan_interval_ms: int = 500
    max_runtime_s: int = 300
    max_actions: int = 200
    region: list[int] = field(default_factory=list)  # [x, y, g, y] — boşsa tüm ekran


def _panic_pressed() -> bool:
    """F12 şu anda basılı mı. Ek paket gerektirmez."""
    try:
        return bool(ctypes.windll.user32.GetAsyncKeyState(VK_F12) & 0x8000)
    except Exception:
        return False


def load_template(path: Path):
    """Şablonu oku. `cv2.imread` Türkçe karakterli yollarda Windows'ta SESSİZCE
    None döner — proje yolunda 'Ders Notları/Aıron' var, bu yüzden dosya
    baytları okunup `imdecode`'a veriliyor."""
    if not HAS_CV:
        return None, "OpenCV kurulu değil"
    try:
        raw = np.fromfile(str(path), dtype=np.uint8)
    except OSError as exc:
        return None, f"dosya okunamadı: {exc}"
    if raw.size == 0:
        return None, "dosya boş"

    img = cv2.imdecode(raw, cv2.IMREAD_UNCHANGED)
    if img is None:
        return None, "görsel çözülemedi"
    if img.ndim == 3 and img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    elif img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    return img, ""


def measure_distinctiveness(path: Path) -> float:
    """Şablon ne kadar ayırt edici (standart sapma). Düşükse yanlış tıklar."""
    img, err = load_template(path)
    if img is None:
        return 0.0
    return round(float(np.std(img)), 1)


class MacroEngine:
    """Tek örnek (singleton) — aynı anda iki makro çalışmamalı, ikisi de aynı
    fareyi kullanır ve birbirinin tıklamasını bozar."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self.targets: list[Target] = []
        self.settings = Settings()

        # Çalışma durumu — panel bunu okuyor
        self.running = False
        self.stop_reason = ""
        self.started_at = 0.0
        self.action_count = 0
        self.scan_count = 0
        self.last_match: dict | None = None
        self.best_scores: dict[str, float] = {}   # hedef id -> bu turdaki en iyi skor
        self.log: list[dict] = []                 # son eylemler

        MACRO_DIR.mkdir(exist_ok=True)
        IMAGE_DIR.mkdir(exist_ok=True)
        self.load()

    # ---------------------------------------------------------------- kalıcılık

    def load(self) -> None:
        if not PROFILE_PATH.exists():
            return
        try:
            raw = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Makro profili okunamadı: %s", exc)
            return
        self.settings = Settings(**{**asdict(Settings()), **raw.get("settings", {})})
        self.targets = [
            Target(**{**asdict(Target(id="", name="", image="")), **item})
            for item in raw.get("targets", [])
        ]

    def save(self) -> None:
        MACRO_DIR.mkdir(exist_ok=True)
        payload = {
            "settings": asdict(self.settings),
            "targets": [asdict(t) for t in self.targets],
        }
        try:
            PROFILE_PATH.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except OSError as exc:
            logger.warning("Makro profili yazılamadı: %s", exc)

    # ------------------------------------------------------------------ hedefler

    def add_target(self, name: str, image_bytes: bytes, **kwargs) -> tuple[Target | None, str]:
        IMAGE_DIR.mkdir(parents=True, exist_ok=True)
        target_id = uuid.uuid4().hex[:8]
        filename = f"{target_id}.png"
        path = IMAGE_DIR / filename
        try:
            path.write_bytes(image_bytes)
        except OSError as exc:
            return None, f"Görsel kaydedilemedi: {exc}"

        img, err = load_template(path)
        if img is None:
            path.unlink(missing_ok=True)
            return None, f"Görsel okunamadı: {err}"

        target = Target(
            id=target_id,
            name=name or f"Hedef {len(self.targets) + 1}",
            image=filename,
            distinctiveness=round(float(np.std(img)), 1),
            **kwargs,
        )
        with self._lock:
            self.targets.append(target)
        self.save()
        return target, ""

    def update_target(self, target_id: str, changes: dict) -> bool:
        with self._lock:
            for target in self.targets:
                if target.id == target_id:
                    for key, value in changes.items():
                        if hasattr(target, key) and key not in ("id", "image", "distinctiveness"):
                            setattr(target, key, value)
                    break
            else:
                return False
        self.save()
        return True

    def delete_target(self, target_id: str) -> bool:
        with self._lock:
            for index, target in enumerate(self.targets):
                if target.id == target_id:
                    (IMAGE_DIR / target.image).unlink(missing_ok=True)
                    del self.targets[index]
                    break
            else:
                return False
        self.save()
        return True

    def update_settings(self, changes: dict) -> None:
        with self._lock:
            for key, value in changes.items():
                if hasattr(self.settings, key):
                    setattr(self.settings, key, value)
        self.save()

    # -------------------------------------------------------------------- çalışma

    def missing_dependency(self) -> str:
        if not HAS_CV:
            return "OpenCV (cv2) kurulu değil"
        if not HAS_MSS:
            return "mss kurulu değil"
        if not HAS_PYAUTOGUI:
            return "pyautogui kurulu değil"
        return ""

    def start(self) -> tuple[bool, str]:
        missing = self.missing_dependency()
        if missing:
            return False, missing
        with self._lock:
            if self.running:
                return False, "Makro zaten çalışıyor."
            active = [t for t in self.targets if t.enabled and t.action != "dur"]
            if not active:
                return False, "Aktif hedef yok — önce görsel ekle."

            self._stop_event.clear()
            self.running = True
            self.stop_reason = ""
            self.started_at = time.time()
            self.action_count = 0
            self.scan_count = 0
            self.last_match = None
            self.best_scores = {}
            self.log = []

        self._thread = threading.Thread(target=self._run, name="airon-macro", daemon=True)
        self._thread.start()
        return True, "Makro başladı"

    def stop(self, reason: str = "elle durduruldu") -> bool:
        with self._lock:
            if not self.running:
                return False
            self.stop_reason = reason
        self._stop_event.set()
        return True

    def status(self) -> dict:
        with self._lock:
            elapsed = time.time() - self.started_at if self.running else 0.0
            return {
                "available": not self.missing_dependency(),
                "unavailableReason": self.missing_dependency(),
                "running": self.running,
                "stopReason": self.stop_reason,
                "elapsedSeconds": round(elapsed, 1),
                "actionCount": self.action_count,
                "scanCount": self.scan_count,
                "lastMatch": self.last_match,
                "bestScores": dict(self.best_scores),
                "log": list(self.log[-8:]),
                "targets": [asdict(t) for t in self.targets],
                "settings": asdict(self.settings),
            }

    def _record(self, text: str, kind: str = "info") -> None:
        self.log.append({"at": round(time.time() - self.started_at, 1), "text": text, "kind": kind})
        if len(self.log) > 40:
            del self.log[:-40]

    def _run(self) -> None:
        """Tarama döngüsü. Sadece bu thread fareyi kullanır."""
        templates: dict[str, object] = {}
        for target in self.targets:
            if not target.enabled:
                continue
            img, err = load_template(IMAGE_DIR / target.image)
            if img is None:
                self._record(f"'{target.name}' görseli okunamadı: {err}", "error")
                continue
            templates[target.id] = img

        last_fired: dict[str, float] = {}
        reason = "süre doldu"

        try:
            with mss.MSS() as sct:
                monitor = sct.monitors[1]
                if len(self.settings.region) == 4:
                    x, y, w, h = self.settings.region
                    region = {"left": x, "top": y, "width": w, "height": h}
                else:
                    region = monitor

                while not self._stop_event.is_set():
                    if _panic_pressed():
                        reason = "F12 ile durduruldu"
                        break
                    elapsed = time.time() - self.started_at
                    if elapsed >= self.settings.max_runtime_s:
                        reason = f"{self.settings.max_runtime_s} sn süre sınırı"
                        break
                    if self.action_count >= self.settings.max_actions:
                        reason = f"{self.settings.max_actions} eylem sınırı"
                        break

                    frame = np.array(sct.grab(region))
                    frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
                    self.scan_count += 1

                    ordered = sorted(
                        (t for t in self.targets if t.enabled and t.id in templates),
                        key=lambda t: t.priority,
                    )

                    stop_now = ""
                    for target in ordered:
                        template = templates[target.id]
                        th, tw = template.shape[:2]
                        if th > frame.shape[0] or tw > frame.shape[1]:
                            continue

                        result = cv2.matchTemplate(frame, template, cv2.TM_CCOEFF_NORMED)
                        _, score, _, loc = cv2.minMaxLoc(result)
                        self.best_scores[target.id] = round(float(score), 3)

                        if score < target.threshold:
                            continue

                        if target.action == "dur":
                            stop_now = f"'{target.name}' göründü"
                            break

                        now = time.time()
                        if now - last_fired.get(target.id, 0.0) < target.cooldown_ms / 1000:
                            continue

                        cx = region["left"] + loc[0] + tw // 2 + target.offset_x
                        cy = region["top"] + loc[1] + th // 2 + target.offset_y
                        self._act(target, cx, cy)
                        last_fired[target.id] = now
                        self.action_count += 1
                        self.last_match = {
                            "targetId": target.id,
                            "name": target.name,
                            "score": round(float(score), 3),
                            "x": cx,
                            "y": cy,
                        }
                        self._record(
                            f"{target.name} → ({cx},{cy}) skor {score:.3f}", "action"
                        )
                        break  # tur başına tek eylem: sıra ve bekleme anlamını korusun

                    if stop_now:
                        reason = stop_now
                        break

                    self._stop_event.wait(self.settings.scan_interval_ms / 1000)
        except Exception as exc:  # motor çökerse panel bunu görmeli
            logger.exception("Makro döngüsü hata verdi")
            reason = f"hata: {exc}"
        finally:
            with self._lock:
                self.running = False
                if not self.stop_reason:
                    self.stop_reason = reason
                self._record(f"durdu — {self.stop_reason}", "stop")

    def _act(self, target: Target, x: int, y: int) -> None:
        if target.action == "tus":
            if target.key:
                pyautogui.press(target.key)
            return
        if target.action == "sag":
            pyautogui.rightClick(x, y)
        elif target.action == "cift":
            pyautogui.click(x, y, clicks=2, interval=0.08)
        else:
            pyautogui.click(x, y)


engine = MacroEngine()
