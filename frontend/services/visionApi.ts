import { fetchData, post } from './apiClient';

// Görü uçları (backend/api/vision.py).
//
// DİKKAT — bu çağrılar SONUÇ DÖNDÜRMÜYOR, komut gönderiyor. Kamerayı tutan taraf
// ses döngüsünün thread'i; tespit sonuçları ve kamera durumu WebSocket'ten
// (`vision_detections`, `webcam_state`) geliyor. Burada dönen "başarı" yalnızca
// "istek iletildi" demek.

export const setWebcamEnabled = (enabled: boolean) => post('/api/vision/webcam', { enabled });

export const requestDetection = () => post('/api/vision/detect');

/** Yerel OCR (EasyOCR). Sonuç `vision_text` olayıyla gelir. */
export const requestOcr = () => post('/api/vision/ocr');

/** Görü bu pencerede kullanılabilir mi (sesli asistan bağlı mı)? */
export async function fetchVisionAvailable(): Promise<boolean> {
  const data = await fetchData<{ available?: boolean }>('/api/vision/status');
  return Boolean(data?.available);
}
