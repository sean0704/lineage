import * as THREE from 'three';
import { Tweens } from './Tween';

export type FrameCallback = (dt: number, time: number) => void;

/** 一個可切換的場景（村莊 / 地監） */
export interface View {
  readonly group: THREE.Group;
  readonly background: number;
  readonly fogDensity: number;
  update?(dt: number, time: number): void;
  dispose(): void;
}

/**
 * Three.js 核心：場景、攝影機、主迴圈、鏡頭震動。
 *
 * 攝影機掛在 rig 底下：rig 決定位置與朝向，camera 的區域座標只用於震動，
 * 震動結束時硬性歸零，常態下絕不疊加任何搖擺。
 */
export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig = new THREE.Group();
  readonly gl: THREE.WebGLRenderer;
  readonly tweens = new Tweens();
  private readonly callbacks = new Set<FrameCallback>();
  private view: View | null = null;
  private last = performance.now();
  private elapsed = 0;
  private shakeState: { start: number; duration: number; intensity: number } | null = null;
  private readonly fog = new THREE.FogExp2(0x000000, 0.06);
  private running = false;

  constructor(private readonly container: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 80);
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x000000);

    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.15;
    container.appendChild(this.gl.domElement);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  get maxAnisotropy(): number {
    return this.gl.capabilities.getMaxAnisotropy();
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    // 直式螢幕時加寬視野，避免畫面太窄
    this.camera.fov = w / h < 1 ? 80 : 68;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h, false);
  }

  setView(view: View): void {
    if (this.view) {
      this.scene.remove(this.view.group);
      this.view.dispose();
    }
    this.tweens.finishAll();
    this.view = view;
    this.scene.add(view.group);
    (this.scene.background as THREE.Color).setHex(view.background);
    this.fog.color.setHex(view.background);
    this.fog.density = view.fogDensity;
    this.stopShake();
  }

  onFrame(cb: FrameCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  /** intensity 為世界座標位移量，duration 為毫秒 */
  shake(intensity: number, duration: number): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.shakeState = { start: performance.now(), duration, intensity };
  }

  private stopShake(): void {
    this.shakeState = null;
    this.camera.position.set(0, 0, 0);
  }

  private applyShake(now: number): void {
    const s = this.shakeState;
    if (!s) return;
    const t = (now - s.start) / s.duration;
    if (t >= 1) {
      this.stopShake();
      return;
    }
    const k = (1 - t) * (1 - t) * s.intensity;
    this.camera.position.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, 0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      // 分頁切回時避免巨大的 delta
      const dtMs = Math.min(100, now - this.last);
      this.last = now;
      this.elapsed += dtMs / 1000;
      this.tweens.update(dtMs);
      const dt = dtMs / 1000;
      this.view?.update?.(dt, this.elapsed);
      this.callbacks.forEach((cb) => cb(dt, this.elapsed));
      this.applyShake(now);
      this.gl.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  /** 世界座標 → 容器內的像素座標（給 DOM 浮動文字使用） */
  project(world: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = world.clone().project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.container.clientWidth,
      y: ((1 - v.y) / 2) * this.container.clientHeight,
      visible: v.z < 1,
    };
  }
}
