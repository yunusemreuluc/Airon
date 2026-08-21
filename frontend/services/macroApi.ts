import { apiBase, post, request, type ApiResult } from './apiClient';

// Makro modülü — şablon eşleştirmeli otomatik tıklama.
// Bkz. backend/api/macro.py ve core/macro_engine.py.

export type MacroAction = 'sol' | 'sag' | 'cift' | 'tus' | 'dur';

export interface MacroTarget {
  id: string;
  name: string;
  image: string;
  threshold: number;
  action: MacroAction;
  key: string;
  offset_x: number;
  offset_y: number;
  cooldown_ms: number;
  priority: number;
  enabled: boolean;
  /** Şablonun standart sapması. Düşükse ekranda çok yere uyar ve yanlış tıklar. */
  distinctiveness: number;
}

export interface MacroSettings {
  scan_interval_ms: number;
  max_runtime_s: number;
  max_actions: number;
  region: number[];
}

export interface MacroLogEntry {
  at: number;
  text: string;
  kind: string;
}

export interface MacroStatus {
  available: boolean;
  unavailableReason: string;
  running: boolean;
  stopReason: string;
  elapsedSeconds: number;
  actionCount: number;
  scanCount: number;
  lastMatch: { targetId: string; name: string; score: number; x: number; y: number } | null;
  bestScores: Record<string, number>;
  log: MacroLogEntry[];
  targets: MacroTarget[];
  settings: MacroSettings;
}

export interface ProbeResult {
  targetId: string;
  name: string;
  score?: number;
  threshold?: number;
  found?: boolean;
  candidates?: number;
  ambiguous?: boolean;
  x?: number;
  y?: number;
  error?: string;
}

/** Durum uçları `success:false` de dönebiliyor (bağımlılık eksikse) ama `data`
 *  yine dolu geliyor — o yüzden `fetchData` değil, tam zarf okunuyor. */
export async function fetchMacroStatus(): Promise<MacroStatus | null> {
  const result = await request<MacroStatus>('/api/macro/status');
  return (result.data as MacroStatus) ?? null;
}

export const startMacro = () => post('/api/macro/start');
export const stopMacro = () => post('/api/macro/stop');
export const probeMacro = () => post<{ results: ProbeResult[] }>('/api/macro/probe');

export const addMacroTarget = (payload: {
  name: string;
  image: string;
  threshold?: number;
  action?: MacroAction;
  key?: string;
  offsetX?: number;
  offsetY?: number;
  cooldownMs?: number;
}) => post('/api/macro/targets', payload);

export const updateMacroTarget = (id: string, changes: Partial<MacroTarget>) =>
  request(`/api/macro/targets/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });

export const deleteMacroTarget = (id: string) =>
  request(`/api/macro/targets/${id}`, { method: 'DELETE' });

export const updateMacroSettings = (changes: Partial<MacroSettings>) =>
  request('/api/macro/settings', { method: 'PATCH', body: JSON.stringify(changes) });

/** Önizleme adresi. Görsel değişmediği için id yeterli — cache kırmaya gerek yok. */
export const targetImageUrl = (id: string) => `${apiBase()}/api/macro/targets/${id}/image`;

/** Dosyayı base64 data URL'e çevirir (backend JSON zarfını bozmamak için). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

export type { ApiResult };
