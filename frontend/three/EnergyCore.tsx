'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAIStateStore, type AIState } from '@/stores/aiStateStore';
import { usePowerStore } from '@/stores/powerStore';
import { playSfx } from '@/services/sfxPlayer';
import { dampColor, SLEEP_PALETTE, STATE_PALETTE } from './palette';
import { getRevealProgress } from './reveal';
import { ENERGY_CORE_FRAGMENT_SHADER, ENERGY_CORE_VERTEX_SHADER } from './shaders/energyCore';

// Notes/Tasarim-Kurallari.md § Enerji çekirdeği — "The center of AIRON is alive... It constantly
// breathes, rotates slowly, emits particles, changes glow."
// Durum davranışı: konuşurken çekirdek büyür, dinlerken nabız hızlanır,
// düşünürken parıltı kısılır ve yüzey sakinleşir, görü sırasında yüzey
// türbülanslı akar (bkz. aşağıdaki get* fonksiyonları).
const ROTATION_SPEED = 0.08; // rad/sn
const FLOAT_AMPLITUDE = 0.18;
const FLOAT_SPEED = 0.6;
const BREATH_SPEED = 0.7;
const REACT_DAMPING = 4;
const BASE_DISTORTION = 0.16;
// Notes/Tasarim-Kurallari.md § Hareket (fare) — "Energy core follows the cursor subtly". Kameranın
// takibi CameraRig'de; burada çekirdeğin kendisi üzerine gelince hafifçe tepki veriyor.
const HOVER_INTENSITY_BOOST = 0.22;
const HOVER_SCALE_BOOST = 0.05;
// Açılış Animasyonu: Energy Core, BootOverlay'in
// logosu solmaya başladığı sırada büyüyerek belirir.
// 2026-07-31: açılış yavaşlatıldı ve sıralama değişti — önce korona
// (EnergyTendrils, 2.5 sn) beliriyor, çekirdek ondan sonra geliyor.
const REVEAL_DELAY = 3.4;
const REVEAL_DURATION = 0.9;
// Kullanıcı isteğiyle (2026-07-27) — aşırı parlaklık/beyaz kırpılmayı önlemek için
// nihai yoğunluk her zaman bu tavanın altında tutuluyor (fragment shader'daki
// çarpanlarla birlikte).
const MAX_INTENSITY = 1.5;

// ── Uyku (kullanıcı isteği, 2026-07-30) ─────────────────────────────────────
// Çekirdeğe tıklayınca Aıron uyuyor (bkz. stores/powerStore.ts). Değerler
// "sönmüş" değil "dinlenen" bir cisim hedefliyor: nefes çok yavaşlıyor, yüzey
// neredeyse düzleşiyor, ışıma dibe iniyor ama SIFIR OLMUYOR — sıfır olsa
// uygulama çökmüş gibi görünürdü.
// 0.13 ile başlanmıştı ama perdenin karartmasıyla birleşince çekirdek siyah bir
// DELİK gibi görünüyordu — uyuyan bir cisim değil, eksik bir şey. Kenar hattının
// okunması için taban buraya çekildi.
const SLEEP_INTENSITY = 0.32;
const SLEEP_SCALE = 0.87;
const SLEEP_DISTORTION = 0.035;
const SLEEP_ROTATION_MULTIPLIER = 0.16;
const SLEEP_BREATH_MULTIPLIER = 0.32;

// ── Beş tepki (2026-07-31, Notes/Arayuz.md § Beş tepki) ────────────────────────────────
// `automation` ve `memory` sahnede BİRBİRİNİN ZITTI olacak şekilde ayarlandı:
// otomasyon hızlı/sıkı/pürüzsüz (bir makine dönüyor), hafıza yavaş/geniş/
// dalgalı (derinden bir şey yüzeye çıkıyor). Tek başına renk yetmezdi — renk
// körlüğünde ya da göz ucuyla bakıldığında ayrımı taşıyan şey HAREKET.

function getBreathSpeedMultiplier(state: AIState): number {
  if (state === 'listening') return 1.7;
  if (state === 'thinking') return 0.6;
  if (state === 'automation') return 1.25; // iş temposu — telaşlı değil, kararlı
  if (state === 'memory') return 0.42; // derin ve yavaş nefes
  return 1;
}

function getExtraIntensity(state: AIState): number {
  // Konuşma yeşile döndüğünden beri 0.45 yerine 0.32: yeşil, gözün en duyarlı
  // olduğu dalga boyu: aynı sayısal yoğunlukta maviden belirgin şekilde daha
  // parlak görünüyor ve bloom'la birlikte fosforlu kaleme dönüyordu.
  if (state === 'speaking') return 0.32;
  // Kehribar da sıcak ve parlak algılanıyor; yeşille aynı gerekçeyle frenli.
  if (state === 'automation') return 0.24;
  if (state === 'vision') return 0.18;
  if (state === 'thinking') return -0.15;
  // Hatırlamak parlamak değil: çekirdek hafifçe kısılıyor, ışık dışarı değil
  // içeri gidiyor gibi okunsun.
  if (state === 'memory') return -0.08;
  return 0;
}

function getTargetDistortion(state: AIState): number {
  if (state === 'vision') return 0.32; // veri akışı — daha türbülanslı yüzey
  if (state === 'memory') return 0.26; // derinden yüzeye çıkan bir şey
  if (state === 'thinking') return 0.08; // sakin, az dalgalı
  if (state === 'automation') return 0.07; // makine yüzeyi: pürüzsüz, kararlı
  return BASE_DISTORTION;
}

function getExtraScale(state: AIState): number {
  if (state === 'speaking') return 0.14;
  if (state === 'automation') return -0.05; // sıkışmış, odaklanmış
  if (state === 'memory') return 0.06; // hatırlarken hafifçe açılıyor
  return 0;
}

// Dönüş hızı: otomasyonun asıl imzası. Renk "bir şey değişti" der, HIZ "Aıron
// şu an senin makinende çalışıyor" der — kullanıcı ekrana bakmıyorken bile göz
// ucuyla yakalanan sinyal bu.
function getRotationMultiplier(state: AIState): number {
  if (state === 'automation') return 2.4;
  if (state === 'memory') return 0.4;
  if (state === 'thinking') return 0.7;
  return 1;
}

export function EnergyCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const breathPhaseRef = useRef(0);
  const hoveredRef = useRef(false);
  // Dönüş hızı de sönümleniyor, doğrudan atanmıyor: 1×'ten 2.4×'e ANINDA
  // geçmek küreyi bir motor gibi tekletiyor. "Never use linear movement"
  // (Notes/Tasarim-Kurallari.md § Animasyon) hız değişimi için de geçerli.
  const rotationMultiplierRef = useRef(1);

  // Ref üzerinden mutasyon — useFrame'de her karede güncellenen değerler için
  // React'in kendi önerdiği kaçış yolu (useMemo çıktısını sonradan değiştirmek
  // yeni react-hooks/immutability kuralına takılıyor, ref'e dokunmak takılmıyor).
  const uniforms = {
    uTime: { value: 0 },
    uDistortion: { value: BASE_DISTORTION },
    uIntensity: { value: 1 },
    // Platin + Buz Mavisi palet (2026-07-28): gövde derin mavi → buz mavisi
    // gradyanı, silüet/kenar ise platin (bkz. shaders/energyCore.ts uRimColor).
    uColorA: { value: new THREE.Color('#3f6db8') },
    uColorB: { value: new THREE.Color('#7fb2ff') },
    uRimColor: { value: new THREE.Color('#e8eef7') },
  };

  useFrame((state, delta) => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    if (!material || !mesh) return;

    const aiState = useAIStateStore.getState().aiState;
    const isAsleep = usePowerStore.getState().powerState === 'asleep';
    const t = state.clock.elapsedTime;

    // Nefes alma fazı biriktirilerek ilerliyor (ham elapsedTime değil) — böylece
    // AI durumu değişince nefes hızı sıçrama yapmadan, yumuşakça değişiyor.
    const breathMultiplier = isAsleep ? SLEEP_BREATH_MULTIPLIER : getBreathSpeedMultiplier(aiState);
    breathPhaseRef.current += delta * BREATH_SPEED * breathMultiplier;
    const breath = Math.sin(breathPhaseRef.current);

    const reveal = getRevealProgress(t, REVEAL_DELAY, REVEAL_DURATION);

    // Renk: uykuda soğuk çeliğe, konuşurken yeşil-limon plazmaya. Üç uniform da
    // aynı paletten besleniyor (bkz. three/palette.ts) ve yumuşakça geçiyor —
    // anlık renk sıçraması "durum değişti" yerine "hata oldu" gibi okunuyor.
    const palette = isAsleep ? SLEEP_PALETTE : STATE_PALETTE[aiState];
    dampColor(material.uniforms.uColorA.value, palette.bodyDeep, delta);
    dampColor(material.uniforms.uColorB.value, palette.bodyLight, delta);
    dampColor(material.uniforms.uRimColor.value, palette.rim, delta);

    material.uniforms.uTime.value = t;
    // Uykuda fare etkileşimi susuyor: uyuyan bir cisim imlece tepki vermemeli.
    const hoverBoost = hoveredRef.current && !isAsleep ? HOVER_INTENSITY_BOOST : 0;
    const targetIntensity = isAsleep
      ? SLEEP_INTENSITY * reveal
      : Math.min(1 + breath * 0.25 + getExtraIntensity(aiState) + hoverBoost, MAX_INTENSITY) *
        reveal;
    material.uniforms.uIntensity.value = THREE.MathUtils.damp(
      material.uniforms.uIntensity.value,
      targetIntensity,
      REACT_DAMPING,
      delta,
    );
    material.uniforms.uDistortion.value = THREE.MathUtils.damp(
      material.uniforms.uDistortion.value,
      isAsleep ? SLEEP_DISTORTION : getTargetDistortion(aiState),
      REACT_DAMPING,
      delta,
    );

    rotationMultiplierRef.current = THREE.MathUtils.damp(
      rotationMultiplierRef.current,
      isAsleep ? SLEEP_ROTATION_MULTIPLIER : getRotationMultiplier(aiState),
      REACT_DAMPING,
      delta,
    );
    mesh.rotation.y += delta * ROTATION_SPEED * rotationMultiplierRef.current;
    // Süzülme uykuda da sürüyor (sadece nefes yavaşlıyor): tamamen durursa
    // çekirdek canlı bir cisim değil, donmuş bir kare gibi görünüyor.
    mesh.position.y = Math.sin(t * FLOAT_SPEED) * FLOAT_AMPLITUDE;
    const targetScale = isAsleep
      ? (SLEEP_SCALE + breath * 0.012) * reveal
      : (1 +
          breath * 0.03 +
          getExtraScale(aiState) +
          (hoveredRef.current ? HOVER_SCALE_BOOST : 0)) *
        reveal;
    mesh.scale.setScalar(THREE.MathUtils.damp(mesh.scale.x, targetScale, REACT_DAMPING, delta));
  });

  return (
    <mesh
      ref={meshRef}
      // Çekirdeğe tıklamak Aıron'u uyutuyor (kullanıcı isteği, 2026-07-30).
      // Uyandırma burada DEĞİL: uykuda ekranı SleepVeil kaplıyor ve her yere
      // tıklamak uyandırıyor — uyuyan bir sistemde 1.4 birimlik bir küreyi
      // nişan almak zorunda kalmak yanlış olurdu (bkz. components/SleepVeil.tsx).
      onClick={(e) => {
        e.stopPropagation();
        usePowerStore.getState().toggle();
        playSfx('hud');
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hoveredRef.current = true;
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hoveredRef.current = false;
        document.body.style.cursor = 'auto';
      }}
    >
      <icosahedronGeometry args={[1.4, 5]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={ENERGY_CORE_VERTEX_SHADER}
        fragmentShader={ENERGY_CORE_FRAGMENT_SHADER}
      />
    </mesh>
  );
}
