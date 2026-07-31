'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DUST_FIELD_FRAGMENT_SHADER, DUST_FIELD_VERTEX_SHADER } from './shaders/dustField';

// Çekirdeğin çevresinde süzülen ince toz. drei'nin <Sparkles> bileşeninin yerini
// aldı — nedeni shaders/dustField.ts başındaki notta (kameraya yaklaşan parçacık
// sahneyi karartan dev bir kareye dönüşüyordu).

interface DustFieldProps {
  count: number;
  /** Kutunun boyutu [x, y, z] — parçacıklar bunun içinde dağılır. */
  scale: [number, number, number];
  size: number;
  color: string;
  opacity: number;
  speed?: number;
}

// Deterministik sözde-rastgele (GLSL tarzı sin-hash) — Background.tsx'teki
// NebulaBackdrop ve EnergyTendrils ile aynı desen: render sırasında Math.random()
// gibi saf olmayan bir çağrı kullanmamak için (react-hooks/purity).
function hash(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildGeometry(count: number, scale: [number, number, number]): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (hash(i * 3.1 + 0.7) - 0.5) * scale[0];
    positions[i * 3 + 1] = (hash(i * 3.1 + 1.9) - 0.5) * scale[1];
    positions[i * 3 + 2] = (hash(i * 3.1 + 2.7) - 0.5) * scale[2];

    seeds[i * 3] = hash(i * 5.3 + 0.2);
    seeds[i * 3 + 1] = hash(i * 5.3 + 1.1);
    seeds[i * 3 + 2] = hash(i * 5.3 + 2.4);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  return geometry;
}

export function DustField({ count, scale, size, color, opacity, speed = 0.18 }: DustFieldProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => buildGeometry(count, scale), [count, scale]);
  // Nokta boyutu piksel cinsinden — ekran yoğunluğu değişince zerreler aynı
  // fiziksel büyüklükte kalmalı.
  const pixelRatio = useThree((state) => state.viewport.dpr);

  const uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: speed },
    uSize: { value: size },
    // Hiçbir zerre bundan büyük çizilemez (piksel). Asıl arıza buydu.
    uMaxSize: { value: 14 },
    uPixelRatio: { value: pixelRatio },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
  };

  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uPixelRatio.value = pixelRatio;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={DUST_FIELD_VERTEX_SHADER}
        fragmentShader={DUST_FIELD_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
