'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAIStateStore } from '@/stores/aiStateStore';
import { usePowerStore } from '@/stores/powerStore';
import { dampArcColor, SLEEP_PALETTE, STATE_PALETTE } from './palette';
import { getRevealProgress } from './reveal';
import { ELECTRIC_ARC_FRAGMENT_SHADER, ELECTRIC_ARC_VERTEX_SHADER } from './shaders/electricArc';

// Electric Arcs: shader, animasyonlu şimşek, rastgele
// üretim, dinamik yoğunluk. "Konuşurken: Elektrikler hızlansın" — regen
// aralığı ve yoğunluk her yeniden üretimde (event bazlı, sıçrama riski yok) AI
// durumuna göre ayarlanıyor.
const ARC_COUNT = 5;
// Platin + Buz Mavisi palet (2026-07-28). Gerçek elektrik boşalması merkezde
// beyaza doyar — bu yüzden arkların çoğunluğu platin, mavi olan azınlıkta.
const ARC_COLORS = ['#e8eef7', '#7fb2ff', '#dce8fa'];
const CORE_RADIUS = 1.75;
const TUBE_RADIUS = 0.024;
const REGEN_MIN_MS = 260;
const REGEN_MAX_MS = 560;
const DISPLACEMENT_ITERATIONS = 3;
const DISPLACEMENT_JITTER = 0.5;
const SPEAKING_REGEN_BOOST = 1.8;
const SPEAKING_INTENSITY_BOOST = 1.6;
// Arklar çekirdeğin paletine doğru çekiliyor — tamamen değil (0.7): gerçek bir
// boşalma merkezde beyaza doyar, arkların platin kimliği korunmalı. Yeşil
// çekirdeğin etrafındaki MAVİ arkı düzelten şey bu karışım.
//
// 2026-08-06: bu karışım eskiden YALNIZCA konuşurken (ve uykuda) uygulanıyordu,
// yani kehribar `automation` ve mor `memory` çekirdeklerin etrafında arklar buz
// mavisi kalıyordu. Hata görünmüyordu çünkü dolu plazma küre arkların yarısını
// örtüyordu; çekirdek tel kafese dönünce (bkz. EnergyCore.tsx) arklar cismin
// içinden geçer oldu ve uyumsuzluk ekranda apaçık ortaya çıktı. Karışım artık
// HER durumda uygulanıyor — `idle` paletinin kenarı zaten platin olduğu için
// varsayılan görünüm değişmiyor.
const CORE_COLOR_BLEND = 0.7;
// Uykuda arklar tamamen susuyor: elektrik, "çalışıyor"un en güçlü işareti.
const REACT_DAMPING = 3;
// Açılış Animasyonu: arklar bağlantılardan sonra,
// en son belirir ("Electricity" adımı).
const REVEAL_DELAY = 4.6;
const REVEAL_DURATION = 0.8;

function randomPointOnSphere(radius: number): THREE.Vector3 {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  );
}

// Klasik fraktal şimşek: her yinelemede orta noktalar rastgele saptırılır,
// sapma miktarı bir sonraki yinelemede küçülür — pürüzlü ama tutarlı bir çizgi.
function buildBoltPoints(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
  let points = [start, end];
  for (let iter = 0; iter < DISPLACEMENT_ITERATIONS; iter++) {
    const next: THREE.Vector3[] = [points[0]];
    const scale = DISPLACEMENT_JITTER * 0.55 ** iter;
    for (let i = 0; i < points.length - 1; i++) {
      const mid = points[i].clone().lerp(points[i + 1], 0.5);
      mid.add(
        new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).multiplyScalar(scale),
      );
      next.push(mid, points[i + 1]);
    }
    points = next;
  }
  return points;
}

function buildArcGeometry(): THREE.TubeGeometry {
  const start = randomPointOnSphere(CORE_RADIUS);
  const end = randomPointOnSphere(CORE_RADIUS);
  const curve = new THREE.CatmullRomCurve3(buildBoltPoints(start, end));
  return new THREE.TubeGeometry(curve, 24, TUBE_RADIUS, 4, false);
}

interface ArcRuntimeState {
  nextRegenAt: number;
  seed: number;
  baseIntensity: number;
}

function Arc({ colorHex }: { colorHex: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  // Başlangıç değerleri sabit/saf — gerçek rastgelelik yalnızca useFrame içinde
  // (render dışı) üretiliyor (react-hooks/purity).
  const stateRef = useRef<ArcRuntimeState>({ nextRegenAt: 0, seed: 0, baseIntensity: 1 });

  const uniforms = {
    uColor: { value: new THREE.Color(colorHex) },
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uSeed: { value: 0 },
  };

  useFrame((frameState, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    const elapsedMs = frameState.clock.elapsedTime * 1000;
    const runtime = stateRef.current;
    const aiState = useAIStateStore.getState().aiState;
    const isSpeaking = aiState === 'speaking';
    const isAsleep = usePowerStore.getState().powerState === 'asleep';

    // Uykuda yeni ark üretilmiyor: her yeniden üretim bir geometri ayırma
    // (dispose + TubeGeometry) demek, görünmeyen bir şey için boşuna GPU işi.
    if (elapsedMs >= runtime.nextRegenAt && !isAsleep) {
      const regenBoost = isSpeaking ? SPEAKING_REGEN_BOOST : 1;
      const intensityBoost = isSpeaking ? SPEAKING_INTENSITY_BOOST : 1;

      mesh.geometry.dispose();
      mesh.geometry = buildArcGeometry();
      runtime.nextRegenAt =
        elapsedMs + (REGEN_MIN_MS + Math.random() * (REGEN_MAX_MS - REGEN_MIN_MS)) / regenBoost;
      runtime.seed = Math.random() * 1000;
      runtime.baseIntensity = (0.6 + Math.random() * 0.5) * intensityBoost;
      material.uniforms.uSeed.value = runtime.seed;
    }

    const reveal = getRevealProgress(frameState.clock.elapsedTime, REVEAL_DELAY, REVEAL_DURATION);
    material.uniforms.uTime.value = frameState.clock.elapsedTime;
    // Sönme yumuşak: arkların bir karede yok olması "kapandı" değil "koptu"
    // gibi okunuyor.
    material.uniforms.uIntensity.value = THREE.MathUtils.damp(
      material.uniforms.uIntensity.value,
      isAsleep ? 0 : runtime.baseIntensity * reveal,
      REACT_DAMPING,
      delta,
    );

    const palette = isAsleep ? SLEEP_PALETTE : STATE_PALETTE[aiState];
    dampArcColor(
      material.uniforms.uColor.value,
      colorHex,
      palette.rim,
      CORE_COLOR_BLEND,
      delta,
    );
  });

  return (
    <mesh ref={meshRef}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={ELECTRIC_ARC_VERTEX_SHADER}
        fragmentShader={ELECTRIC_ARC_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export function ElectricArcs() {
  return (
    <>
      {Array.from({ length: ARC_COUNT }, (_, i) => (
        <Arc key={i} colorHex={ARC_COLORS[i % ARC_COLORS.length]} />
      ))}
    </>
  );
}
