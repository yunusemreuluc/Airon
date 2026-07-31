"""
Basit hava durumu ozeti — uzaktaki bir servis uzerinden calisir.
Alp Ünlü tarafından yapılmıştır — @alppunlu

KONUM ÖNCELİĞİ (2026-07-31'de gerçek konum tespiti eklendi):
1. Çağrıda verilen `location` — kullanıcı açıkça bir şehir söylediyse ("Ankara'da
   hava nasıl") o kazanır
2. `AIRON_WEATHER_LOCATION` env değişkeni — elle konulmuş kalıcı geçersiz kılma
3. **Gerçek konum** (actions/location.py — Windows Konum Servisi, olmazsa IP)
4. `DEFAULT_LOCATION` — yalnızca yukarıdakilerin hepsi başarısızsa

3. adım eklenmeden önce sabit bir şehre bakılıyordu; tesadüfen doğruydu ama
kullanıcı taşınsa ya da seyahate çıksa sessizce yanlış cevap verirdi.
"""

from __future__ import annotations

import datetime
import os

import requests

from actions.location import as_query, detect_location
from actions.tool_result import fail, ok
from core.tool_registry import register_tool

# Hiçbir kaynak çalışmazsa kullanılan son çare. Artık "varsayılan konum" değil,
# yalnızca gerçek tespit de IP de başarısız olduğunda devreye giren bir yedek.
DEFAULT_LOCATION = "Konya"

# WMO hava kodu → (Türkçe açıklama, emoji, ikon türü). Open-Meteo bu standart kodları
# kullanıyor (bkz. https://open-meteo.com/en/docs — "WMO Weather interpretation codes").
# "kind" alanı, hava durumunu ikona/görsele çevirmek isteyen arayüz için basitleştirilmiş
# kategori — Tkinter Windows'ta renkli emoji glyph'lerini düzgün render ETMİYOR
# (tek renkli/siyah-beyaz bir sembole düşüyor), bu yüzden gerçek renkli ikon için
# emoji metnine değil bu kategoriye ihtiyaç var.
_WMO_CODES: dict[int, tuple[str, str, str]] = {
    0: ("Açık", "☀️", "sun"),
    1: ("Genellikle açık", "🌤️", "partly_cloudy"),
    2: ("Parçalı bulutlu", "⛅", "partly_cloudy"),
    3: ("Kapalı", "☁️", "cloudy"),
    45: ("Sisli", "🌫️", "fog"),
    48: ("Kırağı sisi", "🌫️", "fog"),
    51: ("Hafif çisenti", "🌦️", "drizzle"),
    53: ("Çisenti", "🌦️", "drizzle"),
    55: ("Yoğun çisenti", "🌧️", "rain"),
    56: ("Donan çisenti", "🌧️", "rain"),
    57: ("Yoğun donan çisenti", "🌧️", "rain"),
    61: ("Hafif yağmur", "🌦️", "drizzle"),
    63: ("Yağmur", "🌧️", "rain"),
    65: ("Şiddetli yağmur", "🌧️", "rain"),
    66: ("Donan yağmur", "🌧️", "rain"),
    67: ("Şiddetli donan yağmur", "🌧️", "rain"),
    71: ("Hafif kar", "🌨️", "snow"),
    73: ("Kar", "🌨️", "snow"),
    75: ("Yoğun kar", "❄️", "snow"),
    77: ("Kar taneleri", "❄️", "snow"),
    80: ("Hafif sağanak", "🌦️", "drizzle"),
    81: ("Sağanak", "🌧️", "rain"),
    82: ("Şiddetli sağanak", "⛈️", "thunderstorm"),
    85: ("Hafif kar sağanağı", "🌨️", "snow"),
    86: ("Yoğun kar sağanağı", "❄️", "snow"),
    95: ("Gök gürültülü fırtına", "⛈️", "thunderstorm"),
    96: ("Dolu ile fırtına", "⛈️", "thunderstorm"),
    99: ("Şiddetli dolu ile fırtına", "⛈️", "thunderstorm"),
}
_TR_WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]


def _wmo_lookup(code) -> tuple[str, str, str]:
    try:
        return _WMO_CODES.get(int(code), ("Bilinmiyor", "🌡️", "unknown"))
    except (TypeError, ValueError):
        return ("Bilinmiyor", "🌡️", "unknown")


def _resolve_target(location: str | None) -> tuple[str, str]:
    """(servise gönderilecek sorgu, kullanıcıya gösterilecek ad).

    Gerçek konumda sorgu KOORDİNAT oluyor, şehir adı değil: "Konya" birden fazla
    yere işaret edebilir, koordinat tektir. Gösterilecek ad o zaman boş dönüyor
    ve servisin cevabındaki `nearest_area`dan doldurluyor — böylece kullanıcı
    hangi şehre bakıldığını görüyor, ham koordinat duymuyor.
    """
    explicit = (location or "").strip()
    if explicit:
        return explicit, explicit

    override = (os.environ.get("AIRON_WEATHER_LOCATION") or "").strip()
    if override:
        return override, override

    detected = detect_location()
    query = as_query(detected)
    if query:
        return query, str((detected or {}).get("city") or "")

    return DEFAULT_LOCATION, DEFAULT_LOCATION


@register_tool("get_weather")
def get_weather_summary(location: str | None = None) -> dict:
    target, display = _resolve_target(location)
    try:
        response = requests.get(
            f"https://wttr.in/{target}",
            params={"format": "j1"},
            timeout=10,
            headers={"User-Agent": "Airon Windows"},
        )
        response.raise_for_status()
        payload = response.json()
        current = (payload.get("current_condition") or [{}])[0]
        temp_c = current.get("temp_C")
        feels_like = current.get("FeelsLikeC")
        weather_desc = ((current.get("weatherDesc") or [{}])[0]).get("value", "")
        humidity = current.get("humidity")

        # Koordinatla sorulduysa okunur şehir adını cevaptan al — kullanıcıya
        # "37.88,32.49 için hava durumu" demek anlamsız olurdu.
        if not display:
            area = (payload.get("nearest_area") or [{}])[0]
            display = str(((area.get("areaName") or [{}])[0]).get("value", "")).strip()
        if not display:
            display = target

        parts = []
        if temp_c:
            parts.append(f"{temp_c} derece")
        if weather_desc:
            parts.append(weather_desc.lower())
        if feels_like and feels_like != temp_c:
            parts.append(f"hissedilen {feels_like} derece")
        if humidity:
            parts.append(f"nem yüzde {humidity}")

        if not parts:
            return fail("Hava durumu bilgisi şu anda alınamadı.")

        return ok(
            f"{display} için hava durumu: " + ", ".join(parts) + ".",
            location=display, temp_c=temp_c, feels_like_c=feels_like,
            description=weather_desc, humidity=humidity,
        )
    except Exception:
        return fail("Hava durumu bilgisi şu anda alınamadı.")


def get_weather_forecast(location: str | None = None, days: int = 5) -> dict:
    """Çok günlük hava tahmini — Open-Meteo (API anahtarı gerekmeyen, ücretsiz
    coğrafi kodlama + tahmin servisi). get_weather_summary'nin kullandığı
    wttr.in'in ücretsiz sürümü sadece 3 gün veriyor; gerçek 5+ günlük tahmin
    için Open-Meteo'ya geçildi. Ana UI'daki hava durumu panelinin gün-gün
    gezinme (sağ/sol ok) özelliği için kullanılıyor."""
    days = max(1, min(16, int(days or 5)))
    explicit = (location or "").strip() or (os.environ.get("AIRON_WEATHER_LOCATION") or "").strip()

    try:
        if explicit:
            # Ada göre soruldu — coğrafi kodlamadan koordinat çıkar.
            geo = requests.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": explicit, "count": 1, "language": "tr"},
                timeout=10,
            )
            geo.raise_for_status()
            results = geo.json().get("results") or []
            if not results:
                return fail(f"'{explicit}' için konum bulunamadı.")
            place = results[0]
            lat, lon = place.get("latitude"), place.get("longitude")
            resolved_name = str(place.get("name") or explicit)
        else:
            # Gerçek konum zaten koordinat veriyor — coğrafi kodlama adımına
            # hiç gerek yok, bir ağ isteği ve bir hata kaynağı eksiliyor.
            detected = detect_location()
            if detected:
                lat, lon = detected["lat"], detected["lon"]
                resolved_name = str(detected.get("city") or "").strip() or "Bulunduğun yer"
            else:
                geo = requests.get(
                    "https://geocoding-api.open-meteo.com/v1/search",
                    params={"name": DEFAULT_LOCATION, "count": 1, "language": "tr"},
                    timeout=10,
                )
                geo.raise_for_status()
                results = geo.json().get("results") or []
                if not results:
                    return fail("Konum bulunamadı.")
                place = results[0]
                lat, lon = place.get("latitude"), place.get("longitude")
                resolved_name = DEFAULT_LOCATION

        forecast = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat, "longitude": lon,
                "daily": "weathercode,temperature_2m_max,temperature_2m_min",
                "timezone": "auto",
                "forecast_days": days,
            },
            timeout=10,
        )
        forecast.raise_for_status()
        daily = forecast.json().get("daily") or {}
        dates = daily.get("time") or []
        codes = daily.get("weathercode") or []
        max_temps = daily.get("temperature_2m_max") or []
        min_temps = daily.get("temperature_2m_min") or []

        day_list = []
        for i, date_str in enumerate(dates):
            try:
                weekday_tr = _TR_WEEKDAYS[datetime.date.fromisoformat(date_str).weekday()]
            except Exception:
                weekday_tr = ""
            code = codes[i] if i < len(codes) else None
            description, icon, icon_kind = _wmo_lookup(code)
            day_list.append({
                "date": date_str,
                "weekday": weekday_tr,
                "max_c": max_temps[i] if i < len(max_temps) else None,
                "min_c": min_temps[i] if i < len(min_temps) else None,
                "description": description,
                "icon": icon,
                "icon_kind": icon_kind,
            })

        if not day_list:
            return fail("Tahmin verisi alınamadı.")

        return ok(
            f"{resolved_name} için {len(day_list)} günlük hava tahmini alındı.",
            location=resolved_name, days=day_list,
        )
    except Exception:
        return fail("Hava tahmini şu anda alınamadı.")
