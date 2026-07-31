'use client';

import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

// Unreal Bloom + kullanıcı isteğiyle (2026-07-28)
// eklenen sinematik derinlik katmanı. Sıra önemli: önce ışıma, sonra kadraj
// (vinyet), en son film greni — grenin bloom tarafından yeniden parlatılmaması için.
//
// Değerler bilerek muhafazakâr: bu üç efekt "profesyonel" ile "ucuz filtre"
// arasındaki farkı fark edilirlik eşiğinin hemen altında kalarak yaratıyor.
export function PostProcessing() {
  return (
    <EffectComposer>
      {/* Soğuk palet sıcak paletten daha geç doyuyor — eşik biraz düşürülüp
          yoğunluk artırıldı; çekirdeğin kenarı beyaza kırpılmadan ışıyor. */}
      <Bloom intensity={0.55} luminanceThreshold={0.32} luminanceSmoothing={0.35} mipmapBlur />

      {/* Kadraj: kenarları karartıp gözü çekirdeğe çeker. Fotoğraf lensi kadar
          hafif — belirgin bir "tünel" değil. */}
      <Vignette offset={0.28} darkness={0.62} blendFunction={BlendFunction.NORMAL} />

      {/* Film greni: koyu gradyanlardaki bantlaşmayı (color banding) kırar.
          8-bit ekranlarda geniş koyu alanlar halka halka görünür — bu, düz renk
          zeminli koyu arayüzlerin en görünür teknik kusurudur. */}
      <Noise opacity={0.02} blendFunction={BlendFunction.OVERLAY} premultiply />
    </EffectComposer>
  );
}
