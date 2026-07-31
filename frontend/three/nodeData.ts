import * as THREE from 'three';

// Node Sistemi. OrbitNodes.tsx (düğümlerin kendisi) ve
// NodeConnections.tsx (düğümler arası bağlantılar) aynı yörünge matematiğini
// paylaşıyor, bu yüzden tanım + pozisyon hesabı burada tek bir yerde tutuluyor.
//
// Renkler (2026-07-28, Platin + Buz Mavisi palet) bilerek tek bir soğuk aile
// içinde üç tona sınırlı: #7fb2ff (buz mavisi), #e8eef7 (platin), #a9c4e6
// (çelik gri-mavi). Her düğüme ayrı bir renk vermek "kategori" yanılsaması
// yaratırdı — düğümler eşdeğer modüller, renk yalnızca yörüngede ritim kuruyor.
export interface OrbitNodeDef {
  id: string;
  label: string;
  // Odak kartında (NodeFocusCard) alt görev satırı olarak gösterilen kısa açıklama.
  description: string;
  color: string;
  radius: number;
  speed: number;
  phase: number;
  inclination: number;
}

export const ORBIT_NODES: OrbitNodeDef[] = [
  {
    id: 'voice',
    label: 'Ses',
    description: 'Gemini Live ile konuşma tanıma ve sentezleme',
    color: '#7fb2ff',
    radius: 4.3,
    speed: 0.09,
    phase: 0.0,
    inclination: 0.15,
  },
  {
    id: 'vision',
    label: 'Görme',
    description: 'Kamera akışı, nesne tanıma ve OCR',
    color: '#e8eef7',
    radius: 4.8,
    speed: -0.07,
    phase: 1.0,
    inclination: -0.35,
  },
  {
    id: 'memory',
    label: 'Hafıza',
    description: 'Geçmiş konuşma ve bağlam kaydı',
    color: '#a9c4e6',
    radius: 4.2,
    speed: 0.11,
    phase: 2.3,
    inclination: 0.38,
  },
  {
    id: 'browser',
    label: 'Tarayıcı',
    description: 'Web gezinme ve sayfa etkileşimi',
    color: '#7fb2ff',
    radius: 5.0,
    speed: -0.06,
    phase: 3.4,
    inclination: -0.15,
  },
  {
    id: 'calendar',
    label: 'Takvim',
    description: 'Etkinlik ve hatırlatma yönetimi',
    color: '#a9c4e6',
    radius: 4.4,
    speed: 0.08,
    phase: 4.2,
    inclination: 0.3,
  },
  {
    id: 'automation',
    label: 'Otomasyon',
    description: 'Görev zincirleri ve arka plan iş akışları',
    color: '#e8eef7',
    radius: 4.9,
    speed: -0.09,
    phase: 5.1,
    inclination: -0.38,
  },
  {
    id: 'files',
    label: 'Dosyalar',
    description: 'Dosya sistemi erişimi ve organizasyon',
    color: '#7fb2ff',
    radius: 4.3,
    speed: 0.07,
    phase: 0.6,
    inclination: 0.05,
  },
];

const ROTATION_AXIS = new THREE.Vector3(1, 0, 0);

// `angle` — çağıran taraf tutuyor (ör. bir ref'te biriktirilen "node.phase +
// birikmiş_zaman * node.speed"). Ham elapsedTime yerine biriktirilen bir açı
// kullanılıyor ki ileride yörünge hızı (AI durumuna göre) değiştiğinde konum
// sıçraması olmasın — sadece hız yumuşakça değişsin.
export function getOrbitNodePosition(
  node: OrbitNodeDef,
  angle: number,
  target: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  target.set(Math.cos(angle) * node.radius, 0, Math.sin(angle) * node.radius);
  return target.applyAxisAngle(ROTATION_AXIS, node.inclination);
}

// ── Düğümlerin o anki dünya konumu ──────────────────────────────────────────
// CameraRig, odaklanılan düğüme yaklaşmak için onun CANLI konumunu bilmek
// zorunda (kullanıcı isteği, 2026-07-30). Konum ise yörünge açısını biriktiren
// OrbitNode bileşeninin içinde yaşıyor.
//
// NEDEN ZUSTAND DEĞİL: bu veri her karede değişiyor. Store'a yazmak kare başına
// bir React güncellemesi demek olurdu — 3D sahnedeki konum bilgisi React'in
// haberi olmadan akmalı (useMouseParallax'ta da aynı gerekçeyle doğrudan DOM'a
// yazılıyor).
//
// NEDEN YENİDEN HESAPLAMIYORUZ: açı, AI durumuna göre değişen bir hız çarpanıyla
// biriktiriliyor (getOrbitSpeedMultiplier) — yani yola bağımlı. Kamera tarafında
// ham `elapsedTime`den yeniden türetilse zamanla düğümün gerçek yerinden kayardı.
// Bu yüzden TEK YAZAR OrbitNodes: konumu zaten hesaplayan taraf yayınlıyor.
const ORBIT_NODE_POSITIONS = new Map<string, THREE.Vector3>();

export function publishOrbitNodePosition(id: string, position: THREE.Vector3): void {
  const stored = ORBIT_NODE_POSITIONS.get(id);
  if (stored) stored.copy(position);
  else ORBIT_NODE_POSITIONS.set(id, position.clone());
}

export function readOrbitNodePosition(id: string): THREE.Vector3 | undefined {
  return ORBIT_NODE_POSITIONS.get(id);
}
