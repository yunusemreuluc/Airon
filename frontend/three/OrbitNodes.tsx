'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { IconType } from 'react-icons';
import {
  LuBrain,
  LuCalendarDays,
  LuFolder,
  LuGlobe,
  LuMic,
  LuScanEye,
  LuWorkflow,
} from 'react-icons/lu';
import { getOrbitSpeedMultiplier, useAIStateStore } from '@/stores/aiStateStore';
import { useNodeFocusStore } from '@/stores/nodeFocusStore';
import { SLEEP_DIM, usePowerStore } from '@/stores/powerStore';
import {
  getOrbitNodePosition,
  ORBIT_NODES,
  publishOrbitNodePosition,
  type OrbitNodeDef,
} from './nodeData';
import { getRevealProgress } from './reveal';

// Kullanıcı isteğiyle (2026-07-28) — düğümler artık düz renkli toplar yerine
// modülle ilgili ikonlar; isim etiketi sürekli görünmek yerine sadece hover'da
// (Sidebar.tsx'teki tooltip deseniyle aynı) beliriyor.
const NODE_ICONS: Record<string, IconType> = {
  voice: LuMic,
  vision: LuScanEye,
  memory: LuBrain,
  browser: LuGlobe,
  calendar: LuCalendarDays,
  automation: LuWorkflow,
  files: LuFolder,
};

// Orbit Nodes: her node bir modül. Node Sistemi
// (Voice/Vision/Memory/Browser/Calendar/Automation/Files) + Node Hareketleri
// (Orbit/Hover/Zoom/Click). Kullanıcının paylaştığı referans görsele göre: her
// düğüm çekirdeğe ince bir ışık demetiyle bağlı, altında cam bir etiket çipi var.
// Düğümlerin birbirine bağlandığı "takımyıldız" ağı onun (Neural Network) konusu.
// "Konuşurken: Node'lar parlasın", "Vision çalışırken: Vision Node parlasın,
// kameradan merkeze veri aksın."
const HOVER_SCALE = 1.12;
const ACTIVE_SCALE = 1.06;
const FLOW_SPEED = 0.55; // döngü/sn — düğümden çekirdeğe veri akışı
const ORIGIN = new THREE.Vector3(0, 0, 0);
// Açılış Animasyonu: düğümler Energy Core'dan sonra,
// birbiri ardına (index'e göre gecikmeli) büyüyerek beliriyor.
const NODE_REVEAL_BASE_DELAY = 4.0;
const NODE_REVEAL_STAGGER = 0.1;
const NODE_REVEAL_DURATION = 0.6;
// Kullanıcı isteğiyle (2026-07-27) — çekirdek-düğüm ışık demetleri %25-30 opaklık
// aralığında ince kalmalı (önceki 0.35 referans görsele göre fazla belirgindi).
const BEAM_OPACITY = 0.28;
// Uykuya geçişte ışık demetinin sönme hızı — çekirdeğinkiyle aynı ritim.
const DIM_DAMPING = 2.6;
// Çipin CSS ile sönme süresi. AppShell'deki HUD sönmesiyle (900ms) aynı:
// düğümler ve paneller aynı anda çekilmeli, biri geride kalmamalı.
const CHIP_FADE_MS = 900;

function OrbitNode({ node, index }: { node: OrbitNodeDef; index: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const beamGeometryRef = useRef<THREE.BufferGeometry>(null);
  const beamMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const flowRef = useRef<THREE.Mesh>(null);
  const angleRef = useRef(node.phase);
  const positionRef = useRef(new THREE.Vector3());
  const dimRef = useRef(1);
  const [isHovered, setIsHovered] = useState(false);

  const aiState = useAIStateStore((state) => state.aiState);
  const focusedNodeId = useNodeFocusStore((state) => state.focusedNodeId);
  // Abone olan seçici (her karede okuma değil): uyku durumu toggle başına bir
  // kez değişiyor, çipin CSS'i bu yüzden React tarafında sürülebiliyor.
  const isAsleep = usePowerStore((state) => state.powerState === 'asleep');

  const isVisionNode = node.id === 'vision';
  const revealDelay = NODE_REVEAL_BASE_DELAY + index * NODE_REVEAL_STAGGER;
  const Icon = NODE_ICONS[node.id];
  const isFocused = focusedNodeId === node.id;

  // Parlama artık 3D küre yerine çipin CSS gölgesinde — kamera düğüme yaklaşınca
  // 3B kürenin ekrandaki boyutu çipten kopuyordu (çip sabit piksel boyutunda).
  const glowStrength = (isVisionNode && aiState === 'vision') || aiState === 'speaking' ? 26 : 14;

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const reveal = getRevealProgress(state.clock.elapsedTime, revealDelay, NODE_REVEAL_DURATION);

    angleRef.current +=
      delta * node.speed * getOrbitSpeedMultiplier(useAIStateStore.getState().aiState);
    const position = getOrbitNodePosition(node, angleRef.current, positionRef.current);
    group.position.copy(position);
    // CameraRig odaklı düğüme yaklaşmak için bunu okuyor (bkz. nodeData.ts).
    publishOrbitNodePosition(node.id, position);

    dimRef.current = THREE.MathUtils.damp(
      dimRef.current,
      usePowerStore.getState().powerState === 'asleep' ? SLEEP_DIM : 1,
      DIM_DAMPING,
      delta,
    );

    if (beamMaterialRef.current) {
      beamMaterialRef.current.opacity = BEAM_OPACITY * reveal * dimRef.current;
    }

    beamGeometryRef.current?.setFromPoints([ORIGIN, position]);

    const flow = flowRef.current;
    if (flow) {
      // Uykuda gizleniyor: katı beyaz ve toneMapped=false olduğu için
      // karartılmazsa uyuyan sahnedeki EN parlak nesne bu tek nokta oluyordu.
      flow.visible =
        isVisionNode &&
        useAIStateStore.getState().aiState === 'vision' &&
        usePowerStore.getState().powerState === 'awake';
      if (flow.visible) {
        // Kameradan (düğüm) merkeze (çekirdek) doğru akış — progress 1→0.
        const progress = 1 - ((state.clock.elapsedTime * FLOW_SPEED) % 1);
        flow.position.lerpVectors(ORIGIN, position, progress);
      }
    }
  });

  return (
    <>
      <line>
        <bufferGeometry ref={beamGeometryRef} />
        <lineBasicMaterial
          ref={beamMaterialRef}
          color={node.color}
          transparent
          opacity={BEAM_OPACITY}
          toneMapped={false}
        />
      </line>
      {isVisionNode && (
        <mesh ref={flowRef} visible={false}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshBasicMaterial color="#e8eef7" toneMapped={false} />
        </mesh>
      )}
      <group ref={groupRef}>
        {/* Düğümün tamamı artık bir HTML ikon çipi — hem görsel hem etkileşim hedefi
            aynı 36px daire. (Önceden arkada bir 3B küre vardı; kamera düğüme
            yaklaşınca kürenin ekran boyutu sabit boyutlu çipten kopuyordu.) */}
        {/* zIndexRange — kullanıcı isteğiyle (2026-07-29): düğümler panellerin
            ÜSTÜNE çıkıyor, hatta panelin üzerinden tıklanabiliyordu. drei'nin
            varsayılanı [16777271, 0]; yani en yakın düğüm ~16.7 milyonluk bir
            z-index alıyor ve arayüzdeki her şeyi (paneller z-30, ray z-20,
            vinyet z-10) eziyor.

            Düğümler sahnenin parçası, arayüzün değil — bu yüzden 3D katmanın
            hemen üstünde ama TÜM arayüz katmanlarının altında kalacak dar bir
            aralığa alındı. Sonuç: paneller açıkken düğümler camın arkasından
            bulanıklaşarak süzülüyor ve tıklamalar panele gidiyor. */}
        <Html position={[0, 0, 0]} center zIndexRange={[9, 1]}>
          {/* Çipin dış halkası (odaklıyken beliren ince ring) ile iç dairesi ayrı:
              odak durumu boyut değiştirerek değil, çevresine bir hat çizerek
              belli oluyor — yerleşim kaymadan okunan, sakin bir aktiflik işareti. */}
          <div
            className="flex cursor-pointer items-center justify-center rounded-full ease-out"
            style={{
              padding: 3,
              background: isFocused ? `${node.color}22` : 'transparent',
              border: `1px solid ${isFocused ? `${node.color}59` : 'transparent'}`,
              transform: `scale(${isHovered ? HOVER_SCALE : isFocused ? ACTIVE_SCALE : 1})`,
              // Uykuda çip sönüyor ve tıklanamaz oluyor: uyuyan bir sistemde
              // modül açmak, uykuyu sessizce anlamsız kılardı.
              opacity: isAsleep ? SLEEP_DIM : 1,
              pointerEvents: isAsleep ? 'none' : 'auto',
              transition: `transform 300ms var(--ease-out-quint), opacity ${CHIP_FADE_MS}ms ease-out`,
            }}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onClick={() => useNodeFocusStore.getState().toggleFocusedNode(node.id)}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-[10px] transition-shadow duration-300 ease-out"
              style={{
                background: 'rgba(9, 12, 19, 0.8)',
                border: `1px solid ${node.color}${isHovered ? '4d' : '26'}`,
                boxShadow: `0 0 ${glowStrength}px ${node.color}55, inset 0 1px 0 rgba(255,255,255,0.08)`,
              }}
            >
              <Icon size={16} strokeWidth={1.6} color={node.color} />
            </div>
          </div>
          {isHovered && (
            <div className="pointer-events-none absolute top-full left-1/2 mt-2.5 -translate-x-1/2">
              <div className="node-label-card text-foreground px-2.5 py-1 text-[11px] font-medium tracking-[0.06em] whitespace-nowrap">
                {node.label}
              </div>
            </div>
          )}
        </Html>
      </group>
    </>
  );
}

export function OrbitNodes() {
  return (
    <>
      {ORBIT_NODES.map((node, index) => (
        <OrbitNode key={node.id} node={node} index={index} />
      ))}
    </>
  );
}
