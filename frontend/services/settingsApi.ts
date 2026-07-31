import { apiBase } from './voiceApi';

// Ayarlar — Tkinter penceresindeki ayar panelinin (ui.py) web karşılığı.
// Kaynak tek: config/api_keys.json (bkz. backend/api/settings.py).
export interface Settings {
  voice: string;
  voices: string[];
  hasApiKey: boolean;
  apiKeyMasked: string;
  sfxEnabled: boolean;
  sfxVolume: number;
  micDevice: string;
  speakerDevice: string;
  startupEnabled: boolean;
  shortcutExists: boolean;
}

interface ApiResult<T = Record<string, unknown>> {
  success: boolean;
  message: string;
  data?: T;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    return (await response.json()) as ApiResult<T>;
  } catch {
    return { success: false, message: 'Aıron çalışmıyor.' };
  }
}

export async function fetchSettings(): Promise<Settings | null> {
  const result = await request<Settings>('/api/settings');
  return result.success && result.data ? result.data : null;
}

export function saveSettings(patch: Partial<Settings> & { geminiApiKey?: string }) {
  return request('/api/settings', { method: 'POST', body: JSON.stringify(patch) });
}

export const createDesktopShortcut = () => request('/api/settings/shortcut', { method: 'POST' });

export const setStartupEnabled = (enabled: boolean) =>
  request('/api/settings/startup', { method: 'POST', body: JSON.stringify({ enabled }) });

export const minimizeToTray = () => request('/api/settings/tray', { method: 'POST' });
