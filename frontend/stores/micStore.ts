import { create } from 'zustand';

// Mikrofon seviyesi geçmişi — sohbet dock'undaki dalga formu için.
// Backend `mic_level` olayını ~12 FPS yayınlıyor (bkz. core/web_ui.py).
//
// Geçmiş BURADA tutuluyor, bileşende değil: dalga formu sökülüp takıldığında
// (dock kapanıp açıldığında) çubuklar sıfırdan başlamasın, akış kesintisiz
// görünsün diye.

/** Kaç çubuk gösterilecek. 12 FPS'te 20 çubuk ≈ son 1.7 saniye. */
export const WAVEFORM_BARS = 20;

interface MicStore {
  /** En eskiden en yeniye; her zaman WAVEFORM_BARS uzunluğunda. */
  levels: number[];
  pushLevel: (level: number) => void;
}

export const useMicStore = create<MicStore>((set) => ({
  levels: new Array(WAVEFORM_BARS).fill(0),
  pushLevel: (level) =>
    set((state) => ({
      levels: [...state.levels.slice(1), Math.max(0, Math.min(1, level))],
    })),
}));
