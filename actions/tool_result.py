"""
Araç dönüşleri için standart şema.

Eskiden her araç düz bir Türkçe string dönüyordu; main.py ise bu string içinde
"hata", "gerekli", "bağlantı" gibi anahtar kelimeler arayarak başarı/başarısızlık
TAHMİN ediyordu (_result_looks_like_error) — kırılgan bir sezgiseldi (örn.
"gerekli." gibi çok genel bir kelime yanlış pozitif üretebilirdi). Artık her
araç `{"success": bool, "message": str, "data": dict}` döner, main.py da
doğrudan `success` alanına bakar.

`message` alanı hâlâ kullanıcıya sesli aktarılacak doğal dil metni — sadece
artık yanına açık bir başarı/başarısızlık bayrağı ve (varsa) yapılandırılmış
ek veri (`data`) eşlik ediyor.
"""

from __future__ import annotations


def ok(message: str, **data) -> dict:
    return {"success": True, "message": message, "data": data}


def fail(message: str, **data) -> dict:
    return {"success": False, "message": message, "data": data}
