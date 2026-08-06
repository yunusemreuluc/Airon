import { fetchData } from './apiClient';

// Sol paneldeki modüllerin (Hafıza, Otomasyon) veri uçları.
// Bkz. backend/api/memory.py, backend/api/automation.py.

export interface MemoryEntry {
  key: string;
  label: string;
  text: string;
  updatedAt: string;
}

export interface MemoryCategory {
  id: string;
  label: string;
  count: number;
  entries: MemoryEntry[];
}

export interface MemorySnapshot {
  total: number;
  categories: MemoryCategory[];
}

export interface WatchEntry {
  id: number;
  instruction: string;
  condition: string;
  remainingSeconds: number;
}

export interface AutomationSnapshot {
  /** Ses döngüsü bağlı mı — bağlı değilse "izleme yok" DEMİYORUZ, bakacak yer yok. */
  available: boolean;
  watches: WatchEntry[];
  briefing: Record<string, unknown> | null;
}

export const fetchMemory = () => fetchData<MemorySnapshot>('/api/memory');

export const fetchAutomation = () => fetchData<AutomationSnapshot>('/api/automation');
