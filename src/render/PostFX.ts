import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type Quality = 'high' | 'medium' | 'low';

export interface GradeSettings {
  /** 暗部色調（乘上去的顏色） */
  shadowTint: THREE.ColorRepresentation;
  /** 亮部色調 */
  highlightTint: THREE.ColorRepresentation;
  saturation: number;
  contrast: number;
  vignette: number;
  bloom: number;
}

export const DEFAULT_GRADE: GradeSettings = {
  shadowTint: 0x8fa4c8,
  highlightTint: 0xffe2c0,
  saturation: 1.08,
  contrast: 1.08,
  vignette: 0.55,
  bloom: 0.62,
};

/** 色彩分級：分離色調、飽和度、對比、暗角、顆粒、受擊色差與紅邊（在顯示色彩空間運算） */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uShadowTint: { value: new THREE.Color(DEFAULT_GRADE.shadowTint) },
    uHighTint: { value: new THREE.Color(DEFAULT_GRADE.highlightTint) },
    uSaturation: { value: DEFAULT_GRADE.saturation },
    uContrast: { value: DEFAULT_GRADE.contrast },
    uVignette: { value: DEFAULT_GRADE.vignette },
    uChroma: { value: 0 },
    uDamage: { value: 0 },
    uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
    uGrain: { value: 0.028 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uChroma;
    uniform float uDamage;
    uniform vec4 uFlash;
    uniform float uGrain;
    uniform float uTime;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 dir = vUv - 0.5;
      vec3 col;
      if (uChroma > 0.0001) {
        col.r = texture2D(tDiffuse, vUv + dir * uChroma).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - dir * uChroma).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // 分離色調：暗部偏冷、亮部偏暖
      col = mix(col, col * uShadowTint * 1.25, (1.0 - smoothstep(0.0, 0.45, luma)) * 0.45);
      col = mix(col, col * uHighTint * 1.08, smoothstep(0.45, 1.0, luma) * 0.35);
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      vec2 v = dir * vec2(uAspect, 1.0);
      float dist = length(v);
      float vig = smoothstep(0.95, 0.2, dist);
      col *= mix(1.0, vig, uVignette);

      col = mix(col, vec3(0.55, 0.02, 0.02), uDamage * smoothstep(0.25, 0.85, dist));
      col = mix(col, uFlash.rgb, uFlash.a * smoothstep(0.1, 0.9, dist + 0.25));

      float n = hash(vUv * vec2(1931.0, 1777.0) + fract(uTime * 7.13));
      col += (n - 0.5) * uGrain;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

interface Pulse {
  value: number;
  decay: number;
}

/**
 * 後製管線：MSAA → 泛光 → 色調映射 + sRGB → 色彩分級。
 * 畫質低時關閉泛光與 MSAA、降低像素比。
 */
export class PostFX {
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private grade!: ShaderPass;
  private quality: Quality;
  private width = 1;
  private height = 1;
  private chroma: Pulse = { value: 0, decay: 6 };
  private damage: Pulse = { value: 0, decay: 2.5 };
  private flash: Pulse = { value: 0, decay: 5 };
  private readonly flashColor = new THREE.Color();
  private gradeTarget: GradeSettings = { ...DEFAULT_GRADE };

  constructor(
    private readonly gl: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    quality: Quality,
  ) {
    this.quality = quality;
    this.build();
  }

  get currentQuality(): Quality {
    return this.quality;
  }

  private build(): void {
    const samples = this.quality === 'high' ? 4 : this.quality === 'medium' ? 2 : 0;
    const target = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, samples });
    this.composer?.dispose();
    this.composer = new EffectComposer(this.gl, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), this.gradeTarget.bloom, 0.5, 0.96);
    this.bloom.enabled = this.quality !== 'low';
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.applyGrade();
    this.applyPixelRatio();
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.build();
    this.setSize(this.width, this.height);
  }

  private applyPixelRatio(): void {
    const dpr = window.devicePixelRatio || 1;
    const ratio = this.quality === 'high' ? Math.min(dpr, 2) : this.quality === 'medium' ? Math.min(dpr, 1.5) : 1;
    this.gl.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
  }

  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.applyPixelRatio();
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / Math.max(1, h);
  }

  /** 切換場景時的色彩分級（村莊、各樓層主題） */
  setGrade(g: Partial<GradeSettings>): void {
    this.gradeTarget = { ...DEFAULT_GRADE, ...g };
    this.applyGrade();
  }

  private applyGrade(): void {
    const u = this.grade.uniforms;
    const g = this.gradeTarget;
    (u.uShadowTint.value as THREE.Color).set(g.shadowTint);
    (u.uHighTint.value as THREE.Color).set(g.highlightTint);
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uVignette.value = g.vignette;
    this.bloom.strength = g.bloom;
  }

  /** 重擊時的色差脈衝 */
  impact(strength = 1): void {
    if (this.reducedMotion()) return;
    this.chroma.value = Math.max(this.chroma.value, 0.006 * strength);
  }

  /** 受傷時畫面邊緣泛紅 */
  hurt(strength = 0.6): void {
    this.damage.value = Math.min(1, Math.max(this.damage.value, strength));
  }

  /** 畫面邊緣閃光（治療綠、魔力藍、升級金） */
  pulse(color: THREE.ColorRepresentation, strength = 0.35): void {
    this.flashColor.set(color);
    this.flash.value = Math.max(this.flash.value, strength);
  }

  private reducedMotion(): boolean {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  render(dt: number, time: number): void {
    const u = this.grade.uniforms;
    for (const p of [this.chroma, this.damage, this.flash]) p.value = Math.max(0, p.value - p.value * p.decay * dt - 0.0005);
    u.uChroma.value = this.chroma.value;
    u.uDamage.value = this.damage.value;
    (u.uFlash.value as THREE.Vector4).set(this.flashColor.r, this.flashColor.g, this.flashColor.b, this.flash.value);
    u.uTime.value = time;
    this.composer.render(dt);
  }
}

export function defaultQuality(): Quality {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  return coarse || window.innerWidth < 900 ? 'medium' : 'high';
}
