import * as THREE from 'three';
import type { AIState } from '@/stores/aiStateStore';

// AIRON — çekirdeğin durum paleti.
//
// TEK KAYNAK OLMASI ŞART: çekirdek (EnergyCore), onu saran parçacık koronası
// (EnergyTendrils) ve elektrik arkları (ElectricArcs) ayrı bileşenler ama AYNI
// cismin parçaları. Renkleri üç yerde ayrı yazılsaydı konuşma rengi
// değiştiğinde biri geride kalır ve yeşil bir çekirdeğin etrafında mavi bir
// korona dönerdi.
//
// Kullanıcı isteğiyle (2026-07-30): Aıron KONUŞURKEN çekirdek maviden çıkıp
// turkuaz-yeşil bir plazmaya dönüyor (bkz. PLASMA_TEAL — beş ton karşılaştırılıp
// seçildi). Palet bilerek doygun neon değil: bloom (PostProcessing.tsx) üstüne
// bindiğinde beyaza kırpılmaması gerekiyor.
// Diğer durumlar globals.css'teki "Platin + Buz Mavisi" sisteminde kalıyor;
// renk dekorasyon değil, "Aıron şu an konuşuyor" bilgisini taşıyor.

export interface CorePalette {
  /** Gövdenin derin tonu — gölgede kalan yarı (shader'da uColorA). */
  bodyDeep: string;
  /** Gövdenin aydınlık tonu (shader'da uColorB). */
  bodyLight: string;
  /** Fresnel kenarı — gövdeden AYRI ve daha parlak bir ton (uRimColor). */
  rim: string;
  /** Çekirdeği saran parçacık koronası (EnergyTendrils uColor). */
  corona: string;
}

/** Platin + Buz Mavisi — varsayılan hâl (bkz. app/globals.css). */
const ICE: CorePalette = {
  bodyDeep: '#3f6db8',
  bodyLight: '#7fb2ff',
  rim: '#e8eef7',
  corona: '#bcd6ff',
};

/**
 * Konuşma — turkuaz-yeşil gövde, buzlu nane kenar.
 *
 * Kullanıcı seçimi (2026-07-30), beş ton yan yana çizilip karşılaştırıldıktan
 * sonra. Yol şuydu: ilk deneme limon-altındı (gövde #a8e05c, kenar #f0ffc4) ve
 * gövdeyle kenar aynı hueye düştüğü için küre tek düze bir asit yeşiline
 * yıkanıyordu; ikinci deneme kenarı altına çekip gövde/kenar ayrımını kurdu ama
 * gövde hâlâ fazla sıcak ve parlaktı.
 *
 * Bu palet yeşilin en SOĞUK ucunda duruyor ve asıl kazancı bu: ICE ile aynı renk
 * sıcaklığında kaldığı için idle → speaking geçişi bir renk kavgası değil, aynı
 * ailenin içinde bir kayma gibi okunuyor. Kenar (nane-beyaz) gövdeden hâlâ ayrı —
 * ICE'deki gövde/platin ilişkisinin karşılığı.
 */
const PLASMA_TEAL: CorePalette = {
  bodyDeep: '#06403c',
  bodyLight: '#4fd6a8',
  rim: '#dffff4',
  corona: '#8ae8c8',
};

export const STATE_PALETTE: Record<AIState, CorePalette> = {
  idle: ICE,
  listening: ICE,
  thinking: ICE,
  speaking: PLASMA_TEAL,
  vision: ICE,
};

/**
 * Uyku — renk YOK, yalnızca soğuk çelik.
 *
 * Uyuyan Aıron'un sönmüş değil "dinlenen" görünmesi bu paletin işi: gövde
 * neredeyse zemine karışıyor ama kenar hattı hâlâ okunuyor, yani cisim orada
 * duruyor. Tamamen siyaha indirilseydi uygulama çökmüş gibi görünürdü.
 */
export const SLEEP_PALETTE: CorePalette = {
  bodyDeep: '#0c141f',
  bodyLight: '#28374d',
  rim: '#5a7095',
  corona: '#2b3c54',
};

// Renk geçişinin yumuşaklığı. CLAUDE.md § ANIMATION RULES — "Never use linear
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
