// Sesli asistana (backend/api/voice.py) giden komutlar.
//
// İki çalışma biçimi var ve taban adres buna göre değişiyor:
//   • Masaüstü uygulaması — arayüz backend'in kendisinden (8000) sunuluyor,
//     istekler aynı kaynağa gider, taban boş string.
//   • `npm run dev` — arayüz 3000'de, backend 8000'de; mutlak adres gerekir
//     (CORS'ta 3000 zaten izinli, bkz. backend/core/config.py).
const DEV_BACKEND_ORIGIN = 'http://localhost:8000';

export function apiBase(): string {
  if (typeof window === 'undefined') return DEV_BACKEND_ORIGIN;
  return window.location.port === '3000' ? DEV_BACKEND_ORIGIN : '';
}

export interface ApiResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

async function post(path: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    return (await response.json()) as ApiResult;
  } catch {
    // Backend kapalı — arayüz çökmemeli, kullanıcıya dürüst bir mesaj dönmeli.
    return { success: false, message: 'Aıron çalışmıyor.' };
  }
}

export const sendTextCommand = (text: string) => post('/api/voice/text', { text });
export const setMuted = (value: boolean) => post('/api/voice/mute', { value });
export const setPaused = (value: boolean) => post('/api/voice/pause', { value });
export const resetSession = () => post('/api/voice/reset');

export interface VoiceStatus {
  connected: boolean;
  ready: boolean;
}

export async function fetchVoiceStatus(): Promise<VoiceStatus> {
  try {
    const response = await fetch(`${apiBase()}/api/voice/status`);
    const result = (await response.json()) as ApiResult;
    const data = (result.data ?? {}) as Partial<VoiceStatus>;
    return { connected: Boolean(data.connected), ready: Boolean(data.ready) };
  } catch {
    return { connected: false, ready: false };
  }
}
