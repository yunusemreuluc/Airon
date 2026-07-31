'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getOrbitSpeedMultiplier, useAIStateStore } from '@/stores/aiStateStore';
import { SLEEP_DIM, usePowerStore } from '@/stores/powerStore';
import { getOrbitNodePosition, ORBIT_NODES, type OrbitNodeDef } from './nodeData';
import { getRevealProgress } from './reveal';

// Neural Network: düğümleri birbirine bağla.
// Animated lines, dynamic connections, glow, particle flow. Kullanıcının paylaştığı
// referans görseldeki soluk "takımyıldız" ağına karşılık geliyor — bilerek 7 düğümün
// tamamını birbirine bağlamıyoruz (21 çizgi dağınık görünürdü), seyrek bir ağ yeterli.
// "AI düşünürken: Connections yanıp sönsün."
const EDGES: [string, string][] = [
  ['voice', 'vision'],
  ['vision', 'memory'],
  ['memory', 'browser'],
  ['browser', 'calendar'],
  ['calendar', 'automation'],
  ['automation', 'files'],
  ['files', 'voice'],
  ['voice', 'memory'],
  ['vision', 'calendar'],
];

const LINE_COLOR = '#7fb2ff';
// Kullanıcı isteğiyle (2026-07-27) — bağlantı çizgileri %25-30 opaklık aralığında
// ince/yarı saydam kalmalı (önceki 0.14 çok soluktu, referans görselde daha belirgin).
const LINE_BASE_OPACITY = 0.28;
const LINE_PULSE_AMPLITUDE = 0.04;
const FLICKER_BASE_SPEED = 0.6;
const FLICKER_THINKING_SPEED = 2.6;
const FLOW_COLOR = '#e8eef7';
const FLOW_SPEED = 0.16; // döngü/sn
const FLOW_RADIUS = 0.035;
// Açılış Animasyonu: bağlantılar düğümlerden hemen
// sonra belirir.
const REVEAL_DELAY = 4.2;
const REVEAL_DURATION = 0.6;
// Uykuya geçiş hızı — ağın sönmesi çekirdeğinkiyle aynı ritimde olmalı.
const DIM_DAMPING = 2.6;

function findNode(id: string): OrbitNodeDef {
  const node = ORBIT_NODES.find((n) => n.id === id);
  if (!node) throw new Error(`nodeData.ts içinde bulunamayan node id: ${id}`);
  return node;
}

function Connection({
  fromNode,
  toNode,
  index,
}: {
  fromNode: OrbitNodeDef;
  toNode: OrbitNodeDef;
  index: number;
}) {
  const lineGeometryRef = useRef<THREE.BufferGeometry>(null);
  const lineMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const particleRef = useRef<THREE.Mesh>(null);
  const particleMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const fromAngleRef = useRef(fromNode.phase);
  const toAngleRef = useRef(toNode.phase);
  const flickerPhaseRef = useRef(0);
  const dimRef = useRef(1);
  const fromPos = useRef(new THREE.Vector3());
  const toPos = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const aiState = useAIStateStore.getState().aiState;
    const orbitMultiplier = getOrbitSpeedMultiplier(aiState);

    fromAngleRef.current += delta * fromNode.speed * orbitMultiplier;
    toAngleRef.current += delta * toNode.speed * orbitMultiplier;
    getOrbitNodePosition(fromNode, fromAngleRef.current, fromPos.current);
    getOrbitNodePosition(toNode, toAngleRef.current, toPos.current);

    lineGeometryRef.current?.setFromPoints([fromPos.current, toPos.current]);

    const flickerSpeed = aiState === 'thinking' ? FLICKER_THINKING_SPEED : FLICKER_BASE_SPEED;
    flickerPhaseRef.current += delta * flickerSpeed;

    // Uykuda ağ neredeyse kayboluyor ama tamamen değil (bkz. SLEEP_DIM):
    // perdenin karartmasının üstüne binerek soluk bir iskelet bırakıyor.
    const isAsleep = usePowerStore.getState().powerState === 'asleep';
    dimRef.current = THREE.MathUtils.damp(
      dimRef.current,
      isAsleep ? SLEEP_DIM : 1,
      DIM_DAMPING,
      delta,
    );

    const reveal = getRevealProgress(t, REVEAL_DELAY, REVEAL_DURATION);
    const material = lineMaterialRef.current;
    if (material) {
      material.opacity =
        (LINE_BASE_OPACITY +
          Math.sin(flickerPhaseRef.current + index * 1.7) * LINE_PULSE_AMPLITUDE) *
        reveal *
        dimRef.current;
    }

    const particle = particleRef.current;
    if (particle) {
      const progress = (t * FLOW_SPEED + index * 0.37) % 1;
      particle.position.lerpVectors(fromPos.current, toPos.current, progress);
    }
    // Akış parçacığı katı beyaz: karartılmazsa uykuda ekrandaki en parlak
    // nesne o oluyordu.
    if (particleMaterialRef.current) {
      particleMaterialRef.current.opacity = reveal * dimRef.current;
    }
  });

  return (
    <>
      <line>
        <bufferGeometry ref={lineGeometryRef} />
        <lineBasicMaterial
          ref={lineMaterialRef}
          color={LINE_COLOR}
          transparent
          opacity={LINE_BASE_OPACITY}
          toneMapped={false}
        />
      </line>
      <mesh ref={particleRef}>
        <sphereGeometry args={[FLOW_RADIUS, 8, 8]} />
        <meshBasicMaterial
          ref={particleMaterialRef}
          color={FLOW_COLOR}
          transparent
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

export function NodeConnections() {
  return (
    <>
      {EDGES.map(([fromId, toId], index) => (
        <Connection
          key={`${fromId}-${toId}`}
          fromNode={findNode(fromId)}
          toNode={findNode(toId)}
          index={index}
        />
      ))}
    </>
  );
}
