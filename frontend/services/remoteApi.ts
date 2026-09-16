// Uzaktan erişim (telefon) uçları — backend/api/remote.py.
//
// `apiClient.request` kullanılmıyor, çünkü o HTTP durumunu yutuyor: telefonda
// 401 "oturum düştü, PIN ekranına dön" demek (ör. PIN PC'den değiştirildi) ve
// bunu diğer hatalardan ayırt etmek gerekiyor.
import { apiBase, fetchData, post, type ApiResult } from './apiClient';

export interface RemoteSession {
  authenticated: boolean;
  remote: boolean;
  pinSet: boolean;
  lockedSeconds: number;
}

export type RemoteResult<T = Record<string, unknown>> = ApiResult<T> & { unauthorized: boolean };

async function remoteRequest<T>(path: string, init?: RequestInit): Promise<RemoteResult<T>> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...init,
    });
    const body = (await response.json()) as ApiResult<T>;
    return { ...body, unauthorized: response.status === 401 };
  } catch {
    return { success: false, message: 'PC’ye ulaşılamıyor.', unauthorized: false };
  }
}

export async function fetchRemoteSession(): Promise<RemoteSession | null> {
  const result = await remoteRequest<RemoteSession>('/api/remote/session');
  return result.success && result.data ? result.data : null;
}

export const loginWithPin = (pin: string) =>
  remoteRequest('/api/remote/login', { method: 'POST', body: JSON.stringify({ pin }) });

export const logoutRemote = () => remoteRequest('/api/remote/logout', { method: 'POST' });

export const sendRemoteText = (text: string) =>
  remoteRequest('/api/voice/text', { method: 'POST', body: JSON.stringify({ text }) });

export const setRemoteMode = (value: boolean) =>
  remoteRequest('/api/remote/mode', { method: 'POST', body: JSON.stringify({ value }) });

export async function fetchRemoteHistory(): Promise<{
  lines: { text: string; at: number }[];
  unauthorized: boolean;
}> {
  const result = await remoteRequest<{ lines: { text: string; at: number }[] }>(
    '/api/remote/history',
  );
  return { lines: result.data?.lines ?? [], unauthorized: result.unauthorized };
}

// ── Masaüstü ayarlar paneli (yalnızca yerel pencere) ──
export interface RemoteConfig {
  pinSet: boolean;
  minPinLength: number;
  maxPinLength: number;
  remotePort: number;
}

export const fetchRemoteConfig = () => fetchData<RemoteConfig>('/api/remote/config');
export const saveRemotePin = (pin: string) => post('/api/remote/pin', { pin });
export const setRemoteModeLocal = (value: boolean) => post('/api/remote/mode', { value });
