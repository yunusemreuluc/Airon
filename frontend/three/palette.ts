import * as THREE from 'three';

// Çekirdeğin durum paletinin WebGL tarafı: renk sönümleme yardımcıları.
// Renklerin kendisi (ve neden öyle oldukları) three/coreColors.ts içinde —
// telefon arayüzü Three.js yüklemeden onları okuyabilsin diye ayrı.
export { SLEEP_PALETTE, STATE_PALETTE, type CorePalette } from './coreColors';

// Renk geçişinin yumuşaklığı. Notes/Tasarim-Kurallari.md § Animasyon — "Never use linear
// movement": üstel sönümleme, kare hızından bağımsız.
const COLOR_DAMPING = 2.6;

// Hex dizeleri her karede THREE.Color'a çevrilmesin diye önbellek; `SCRATCH` de
// ara karışımlar için tek bir yeniden kullanılan nesne (kare başına ayırma yok).
const CACHE = new Map<string, THREE.Color>();
const SCRATCH = new THREE.Color();

function cached(hex: string): THREE.Color {
  let color = CACHE.get(hex);
  if (!color) {
    color = new THREE.Color(hex);
    CACHE.set(hex, color);
  }
  return color;
}

/** Bir uniform rengini hedefe doğru yumuşakça çeker (yerinde değiştirir). */
export function dampColor(current: THREE.Color, targetHex: string, delta: number): void {
  current.lerp(cached(targetHex), 1 - Math.exp(-COLOR_DAMPING * delta));
}

/**
 * Ark rengi — arkların kendi çeşitliliği (platin/mavi karışımı, bkz.
 * ElectricArcs.ARC_COLORS) korunuyor, yalnızca `blend` kadar paletin kenar
 * rengine çekiliyor. Hepsi tek renge indirilseydi beş ark aynı görünür ve
 * boşalma hissi düzleşirdi.
 */
export function dampArcColor(
  current: THREE.Color,
  baseHex: string,
  targetHex: string,
  blend: number,
  delta: number,
): void {
  SCRATCH.copy(cached(baseHex)).lerp(cached(targetHex), blend);
  current.lerp(SCRATCH, 1 - Math.exp(-COLOR_DAMPING * delta));
}
