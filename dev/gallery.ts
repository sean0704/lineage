/**
 * 開發用：一次展示所有程序化怪物與寶箱模型（npm run dev 後開啟 /dev/gallery.html）。
 * 網址加上 ?only=goblin,deathKnight 可只顯示指定怪物。
 */
import * as THREE from 'three';
import { MONSTERS } from '../src/data/monsters';
import { buildChest } from '../src/render/models/chest';
import { MonsterView } from '../src/render/MonsterView';
import type { ChestTier } from '../src/systems/dungeonGen';
import { Tweens } from '../src/render/Tween';

const only = new URLSearchParams(location.search).get('only')?.split(',');
const keys = Object.keys(MONSTERS).filter((k) => !only || only.includes(k));
const cols = Math.min(keys.length, 6);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151a24);
scene.add(new THREE.HemisphereLight(0x8090b0, 0x202020, 2.2));
const sun = new THREE.DirectionalLight(0xffe0c0, 2.5);
sun.position.set(3, 6, 8);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2e36 }));
scene.add(floor);

const spacing = 2.6;
const rows = Math.ceil(keys.length / cols) + (only ? 0 : 1);
const views: MonsterView[] = [];
const labels: { el: HTMLElement; pos: THREE.Vector3 }[] = [];
const labelRoot = document.getElementById('labels')!;
const addLabel = (text: string, pos: THREE.Vector3) => {
  const el = document.createElement('span');
  el.textContent = text;
  labelRoot.append(el);
  labels.push({ el, pos });
};

keys.forEach((key, i) => {
  const x = (i % cols) - (cols - 1) / 2;
  const z = Math.floor(i / cols);
  const v = new MonsterView(MONSTERS[key].model, 0, 0);
  v.root.position.set(x * spacing, 0, -z * spacing * 1.3);
  scene.add(v.root);
  views.push(v);
  addLabel(`${MONSTERS[key].name} (${key})`, v.root.position.clone().add(new THREE.Vector3(0, -0.05, 0.9)));
});
if (!only) {
  (['wooden', 'sturdy', 'ornate', 'legendary'] as ChestTier[]).forEach((tier, i) => {
    const c = buildChest(tier);
    c.root.position.set((i - 1.5) * spacing, 0, spacing * 1.3);
    if (i % 2) c.lid.rotation.x = -1.9;
    scene.add(c.root);
    addLabel(tier, c.root.position.clone().add(new THREE.Vector3(0, -0.05, 0.6)));
  });
}

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
const depth = rows * spacing * 1.3;
camera.position.set(0, depth * 0.55 + 2, depth * 0.75 + 6);
camera.lookAt(0, 0.8, -depth * 0.25);
const clock = new THREE.Clock();
const tweens = new Tweens();
// 開發用：在主控台呼叫 __gallery.views[0].attack(__gallery.tweens, 'melee', () => {}, true) 等方法預覽動作
(window as unknown as { __gallery: unknown }).__gallery = { views, tweens };
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  tweens.update(now - last);
  last = now;
  const t = clock.getElapsedTime();
  views.forEach((v) => v.update(0.016, t, camera.position));
  renderer.render(scene, camera);
  for (const l of labels) {
    const p = l.pos.clone().project(camera);
    l.el.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    l.el.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
  }
});
