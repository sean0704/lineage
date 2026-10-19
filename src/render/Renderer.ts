import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PostFX, type GradeSettings, type Quality } from './PostFX';
import { Tweens } from './Tween';

export type FrameCallback = (dt: number, time: number) => void;

/** 一個可切換的場景（村莊 / 地監） */
export interface View {
  readonly group: THREE.Group;
  readonly background: number;
  readonly fogDensity: number;
  /** 此場景的色彩分級 */
  readonly grade?: Partial<GradeSettings>;
  /** 環境反射強度 */
  readonly environment?: number;
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
  readonly post: PostFX;
  private readonly callbacks = new Set<FrameCallback>();
  private view: View | null = null;
  private last = performance.now();
  private elapsed = 0;
  private shakeState: { start: number; duration: number; intensity: number } | null = null;
  private readonly fog = new THREE.FogExp2(0x000000, 0.06);
  private running = false;
  private hitStopTimer = 0;

  constructor(private readonly container: HTMLElement, quality: Quality) {
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 80);
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x000000);

    // 抗鋸齒由後製管線的 MSAA 處理
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    container.appendChild(this.gl.domElement);
    this.post = new PostFX(this.gl, this.scene, this.camera, quality);

    // 低強度的環境反射：讓金屬有光澤，又不會沖淡地監的黑暗
    const pmrem = new THREE.PMREMGenerator(this.gl);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.1;
    pmrem.dispose();

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
    this.post.setSize(w, h);
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
    this.post.setGrade(view.grade ?? {});
    this.scene.environmentIntensity = view.environment ?? 0.1;
    // 趁場景切換的淡出黑幕時預先編譯著色器，避免第一次看到物件時卡頓
    try {
      this.gl.compile(this.scene, this.camera);
    } catch {
      /* 預編譯失敗不影響正常繪製 */
    }
    this.stopShake();
  }

  onFrame(cb: FrameCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  /** 命中停頓：短暫放慢所有補間動畫，強化打擊感 */
  hitStop(ms: number): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.tweens.timeScale = 0.06;
    window.clearTimeout(this.hitStopTimer);
    this.hitStopTimer = window.setTimeout(() => (this.tweens.timeScale = 1), ms);
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
      this.post.render(dt, this.elapsed);
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
