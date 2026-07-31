'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useNodeFocusStore } from '@/stores/nodeFocusStore';
import { readOrbitNodePosition } from './nodeData';

// CLAUDE.md § MOTION — fare ile derinlik/perspektif, asla abartılı.
// Mouse Parallax, Smooth Orbit, Idle Motion.
const IDLE_ORBIT_SPEED = 0.06; // rad/sn — çok yavaş, fark edilir ama dikkat dağıtmaz
const IDLE_ORBIT_X = 0.4;
const IDLE_ORBIT_Y = 0.2;
const PARALLAX_STRENGTH = 0.6;
const DAMPING = 4; // THREE.MathUtils.damp — üstel yumuşatma, asla lineer hareket yok

// Kameranın sahneye uzaklığı. Scene.tsx'teki başlangıç konumu da bunu kullanıyor —
// tek kaynak. (Önceden burada sabit 8 yazıyordu ve her karede Scene.tsx'te verilen
// mesafeyi eziyordu; yörünge yarıçapları büyütülünce düğümler ekran dışına taşıyordu.)
export const CAMERA_DISTANCE = 10;

// ── Düğüme odaklanma (kullanıcı isteği, 2026-07-30) ─────────────────────────
// Bir yörünge düğümüne tıklayınca kamera ona doğru süzülüyor ve düğüm orbitine
// devam ettikçe onu TAKİP ediyor — sabit bir "zoom" değil, hareketli bir plan.
//
// Kamera her zaman düğüm ile varsayılan kamera konumu arasındaki DOĞRU üzerinde
// duruyor, düğümden sabit uzaklıkta. Bunun sebebi düğümlerin z'sinin -5 ile +5
// arasında dolaşması: sabit bir dünya konumuna gitmek, uzaktaki düğüm için çok
// uzak, yakındaki için kürenin içine girecek kadar yakın olurdu.
// 5.0 ile başlanmıştı ama çok yakındı: çekirdek ekranın sol kenarında kırpılıp
// kadrajın dörtte birini yutuyor, karşı taraf boş kalıyordu. 7.0'da çekirdek
// hâlâ büyük ve yakın ama kadraja SIĞIYOR.
const FOCUS_DISTANCE = 7.0;
// Bakış hedefi tam düğüm değil, çekirdek ile düğüm arasında ona yakın bir nokta:
// düğüm merkeze yaklaşırken çekirdek de kadrajda kalıyor, yani "sisteme
// yaklaşıyoruz" hissi korunuyor — boşlukta yüzen bir çipe dalış değil.
const FOCUS_LOOK_BIAS = 0.7;
// Bakış hedefini sağa kaydırmak özneyi ekranda SOLA kaydırıyor. İlk denemede 0.9
// verilmişti ve düğümü doğrudan çekirdeğin üstüne bindiriyordu; sağ üstteki odak
// kartından (NodeFocusCard) kaçınmak için bu kadar itmek gerekmiyor.
// Kamera odakta da +z tarafında kaldığı için dünya +x'i ekran sağına yakın —
// kadraj için bu yaklaşım yeterli, tam kamera-uzayı hesabı gerekmiyor.
const FOCUS_FRAME_SHIFT = 0.35;
// Odak geçişi kamera sönümlemesinden YAVAŞ: uçuş hissini veren şey bu fark.
const FOCUS_DAMPING = 2.2;
// Odaktayken sahne kendi kendine dolaşmayı bırakıyor — kullanıcı kartı okurken
// kadrajın kaymaya devam etmesi huzursuz ediyor. Fare tepkisi kısılıyor ama
// tamamen kesilmiyor ("nothing feels static").
const FOCUS_IDLE_SUPPRESS = 0.85;
const FOCUS_PARALLAX_SUPPRESS = 0.5;

const ORIGIN = new THREE.Vector3(0, 0, 0);

export function CameraRig() {
  const angle = useRef(0);
  const focus = useRef(0);
  // Odak kadrajı sabit nesnelerde tutuluyor: odak bırakıldığında `focus` sıfıra
  // sönerken hedefin son bilinen hâline hâlâ ihtiyaç var (yoksa geri dönüş
  // yumuşak olmaz, kamera sıçrardı).
  const focusPosition = useRef(new THREE.Vector3());
  const focusLook = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());
  // Kare başına THREE.Vector3 ayırmamak için yeniden kullanılan ara nesneler
  // (sahnedeki diğer kare döngüleri de aynı deseni izliyor).
  const positionScratch = useRef(new THREE.Vector3());
  const lookScratch = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const camera = state.camera;

    const focusedId = useNodeFocusStore.getState().focusedNodeId;
    // Bir kare eski olabilir: OrbitNodes bu bileşenden SONRA mount edildiği için
    // (bkz. Scene.tsx) konumu bir sonraki karede yazıyor. Düğümler ~0.1 rad/sn
    // ile döndüğü için 16 ms'lik gecikme görünmez.
    const nodePosition = focusedId ? readOrbitNodePosition(focusedId) : undefined;

    if (nodePosition) {
      // Düğümden varsayılan kamera konumuna doğru birim vektör → kamera hep
      // izleyici tarafında, düğümden FOCUS_DISTANCE kadar uzakta.
      focusPosition.current
        .set(0, 0, CAMERA_DISTANCE)
        .sub(nodePosition)
        .normalize()
        .multiplyScalar(FOCUS_DISTANCE)
        .add(nodePosition);

      focusLook.current.copy(ORIGIN).lerp(nodePosition, FOCUS_LOOK_BIAS);
      focusLook.current.x += FOCUS_FRAME_SHIFT;
    }

    focus.current = THREE.MathUtils.damp(
      focus.current,
      nodePosition ? 1 : 0,
      FOCUS_DAMPING,
      delta,
    );
    const focusAmount = focus.current;

    // ── Varsayılan kadraj ──
    angle.current += delta * IDLE_ORBIT_SPEED;
    const idleScale = 1 - focusAmount * FOCUS_IDLE_SUPPRESS;
    const parallaxScale = 1 - focusAmount * FOCUS_PARALLAX_SUPPRESS;

    const restX =
      Math.sin(angle.current) * IDLE_ORBIT_X * idleScale +
      state.pointer.x * PARALLAX_STRENGTH * parallaxScale;
    const restY =
      Math.cos(angle.current * 0.7) * IDLE_ORBIT_Y * idleScale +
      state.pointer.y * PARALLAX_STRENGTH * 0.5 * parallaxScale;

    // ── İki kadrajı odak oranına göre karıştır ──
    const target = positionScratch.current.set(restX, restY, CAMERA_DISTANCE);
    if (focusAmount > 0.0001) {
      target.lerp(focusPosition.current, focusAmount);
    }

    camera.position.x = THREE.MathUtils.damp(camera.position.x, target.x, DAMPING, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, target.y, DAMPING, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, target.z, DAMPING, delta);

    // Bakış noktası da sönümleniyor: doğrudan atansa odak değişiminde kadraj
    // kırbaç gibi savrulurdu.
    const lookTarget = lookScratch.current.copy(ORIGIN);
    if (focusAmount > 0.0001) {
      lookTarget.lerp(focusLook.current, focusAmount);
    }
    lookAt.current.x = THREE.MathUtils.damp(lookAt.current.x, lookTarget.x, DAMPING, delta);
    lookAt.current.y = THREE.MathUtils.damp(lookAt.current.y, lookTarget.y, DAMPING, delta);
    lookAt.current.z = THREE.MathUtils.damp(lookAt.current.z, lookTarget.z, DAMPING, delta);
    camera.lookAt(lookAt.current);
  });

  return null;
}
