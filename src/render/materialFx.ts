import * as THREE from 'three';

/**
 * 共用的材質強化（透過 onBeforeCompile 注入 MeshStandardMaterial）：
 * - 輪廓邊光（fresnel）：讓暗處的剪影依然清楚
 * - 地面遮蔽：越接近地面越暗，物件不再像漂浮
 * - 世界座標斑駁：打破大面積平塗色，帶出手繪質感
 *
 * 邊光顏色是全域共用的 uniform，場景切換時由 setRimColor() 調整。
 */
const rimColor = { value: new THREE.Color(0x9fb4ff) };
const rimStrength = { value: 0.42 };

export function setRimColor(color: THREE.ColorRepresentation, strength = 0.42): void {
  rimColor.value.set(color);
  rimStrength.value = strength;
}

export interface EnhanceOptions {
  rim?: boolean;
  /** 地面遮蔽強度 0~1 */
  groundAO?: number;
  /** 斑駁強度 0~1 */
  mottle?: number;
  /** 斑駁尺度（越大越細碎） */
  mottleScale?: number;
}

export function enhanceMaterial(mat: THREE.MeshStandardMaterial, o: EnhanceOptions = {}): THREE.MeshStandardMaterial {
  const rim = o.rim ?? true;
  const ao = o.groundAO ?? 0.5;
  const mottle = o.mottle ?? 0.18;
  const scale = o.mottleScale ?? 7;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = rimColor;
    shader.uniforms.uRimStrength = rimStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFxWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vFxWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vFxWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFxWorld;
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        float fxHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float fxNoise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          float n000 = fxHash(i), n100 = fxHash(i + vec3(1,0,0)), n010 = fxHash(i + vec3(0,1,0)), n110 = fxHash(i + vec3(1,1,0));
          float n001 = fxHash(i + vec3(0,0,1)), n101 = fxHash(i + vec3(1,0,1)), n011 = fxHash(i + vec3(0,1,1)), n111 = fxHash(i + vec3(1,1,1));
          return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${mottle > 0 ? `diffuseColor.rgb *= ${(1 - mottle).toFixed(3)} + ${(mottle * 2).toFixed(3)} * fxNoise(vFxWorld * ${scale.toFixed(1)});` : ''}
        ${ao > 0 ? `diffuseColor.rgb *= mix(${(1 - ao).toFixed(3)}, 1.0, smoothstep(0.0, 0.85, vFxWorld.y));` : ''}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${rim ? `float fxRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += uRimColor * fxRim * uRimStrength;` : ''}`,
      );
  };
  mat.customProgramCacheKey = () => `fx|${rim}|${ao}|${mottle}|${scale}`;
  return mat;
}
