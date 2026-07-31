import { apiBase } from './voiceApi';

// Görü uçları (backend/api/vision.py).
//
// DİKKAT — bu çağrılar SONUÇ DÖNDÜRMÜYOR, komut gönderiyor. Kamerayı tutan taraf
// ses döngüsünün thread'i; tespit sonuçları ve kamera durumu WebSocket'ten
// (`vision_detections`, `webcam_state`) geliyor. Burada dönen "başarı" yalnızca
// "istek iletildi" demek.

interface VisionResult {
  success: boolean;
  message: string;
}

async function post(path: string, body?: unknown): Promise<VisionResult> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    return (await response.json()) as VisionResult;
  } catch {
    return { success: false, message: 'Aıron çalışmıyor.' };
  }
}

export const setWebcamEnabled = (enabled: boolean) => post('/api/vision/webcam', { enabled });

export const requestDetection = () => post('/api/vision/detect');

/** Yerel OCR (EasyOCR). Sonuç `vision_text` olayıyla gelir. */
export const requestOcr = () => post('/api/vision/ocr');

/** Görü bu pencerede kullanılabilir mi (sesli asistan bağlı mı)? */
export async function fetchVisionAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBase()}/api/vision/status`);
    const result = (await response.json()) as { data?: { available?: boolean } };
    return Boolean(result.data?.available);
  } catch {
    return false;
  }
}
