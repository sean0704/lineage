/**
 * EntityManager - Manages 3D Hero, Monster, Chest entities, animations & VFX
 */
class EntityManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.texLoader = new THREE.TextureLoader();
        this.heroMesh = null;
        this.monsterMesh = null;
        this.chestMesh = null;
        this.floatingTexts = [];
        this.particles = [];
        this.vfxGroup = new THREE.Group();
        this.renderer.scene.add(this.vfxGroup);

        this.heroBasePos = new THREE.Vector3(-1.2, 1.1, 0.4);
        this.monsterBasePos = new THREE.Vector3(1.2, 1.1, 0.0);
        this.chestBasePos = new THREE.Vector3(0, 0.9, 0.2);

        this.initHero();
    }

    createTextureMaterial(url, fallbackColor = 0x888888) {
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            roughness: 0.5,
            metalness: 0.1,
            side: THREE.DoubleSide,
            alphaTest: 0.05
        });

        this.texLoader.load(
            url,
            (tex) => {
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                mat.map = tex;
                mat.needsUpdate = true;
            },
            undefined,
            () => {
                mat.color.setHex(fallbackColor);
            }
        );
        return mat;
    }

    initHero() {
        const geo = new THREE.PlaneGeometry(1.6, 1.6);
        const mat = this.createTextureMaterial('assets/hero/hero.png', 0x4299e1);
        this.heroMesh = new THREE.Mesh(geo, mat);
        this.heroMesh.position.copy(this.heroBasePos);
        this.heroMesh.castShadow = true;
        this.renderer.stageGroup.add(this.heroMesh);

        // Ground shadow disk
        const shadowGeo = new THREE.CircleGeometry(0.5, 16);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
        this.heroShadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.heroShadow.rotation.x = -Math.PI / 2;
        this.heroShadow.position.set(-1.2, 0.02, 0.4);
        this.renderer.stageGroup.add(this.heroShadow);
    }

    spawnMonster(monsterKey, isBoss = false) {
        if (this.monsterMesh) {
            this.renderer.stageGroup.remove(this.monsterMesh);
            this.monsterMesh.geometry.dispose();
            this.monsterMesh = null;
        }
        if (this.monsterShadow) {
            this.renderer.stageGroup.remove(this.monsterShadow);
        }

        const scale = isBoss ? 2.2 : 1.6;
        const geo = new THREE.PlaneGeometry(scale, scale);
        const mat = this.createTextureMaterial(`assets/monsters/${monsterKey}.png`, isBoss ? 0xe53e3e : 0x48bb78);

        this.monsterMesh = new THREE.Mesh(geo, mat);
        this.monsterMesh.position.set(1.2, 0.3 + scale * 0.5, 0.0);
        this.monsterMesh.castShadow = true;
        this.renderer.stageGroup.add(this.monsterMesh);

        // Monster shadow
        const shadowGeo = new THREE.CircleGeometry(0.4 * scale, 16);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
        this.monsterShadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.monsterShadow.rotation.x = -Math.PI / 2;
        this.monsterShadow.position.set(1.2, 0.02, 0.0);
        this.renderer.stageGroup.add(this.monsterShadow);

        // Entrance scale bounce
        this.monsterMesh.scale.set(0.1, 0.1, 0.1);
        let t = 0;
        const entranceAnim = () => {
            t += 0.08;
            const s = Math.min(1.0, Math.sin(t * Math.PI * 0.5) * 1.1);
            if (this.monsterMesh) this.monsterMesh.scale.set(s, s, s);
            if (t < 1.0) requestAnimationFrame(entranceAnim);
            else if (this.monsterMesh) this.monsterMesh.scale.set(1, 1, 1);
        };
        entranceAnim();
    }

    removeMonster() {
        if (this.monsterMesh) {
            this.renderer.stageGroup.remove(this.monsterMesh);
            this.monsterMesh = null;
        }
        if (this.monsterShadow) {
            this.renderer.stageGroup.remove(this.monsterShadow);
            this.monsterShadow = null;
        }
    }

    spawnChest(chestType) {
        if (this.chestMesh) {
            this.renderer.stageGroup.remove(this.chestMesh);
            this.chestMesh = null;
        }
        const geo = new THREE.PlaneGeometry(1.4, 1.4);
        const mat = this.createTextureMaterial(`assets/chests/${chestType}.png`, 0xf6e05e);
        this.chestMesh = new THREE.Mesh(geo, mat);
        this.chestMesh.position.copy(this.chestBasePos);
        this.renderer.stageGroup.add(this.chestMesh);

        // Chest entrance hop
        this.chestMesh.scale.set(0.2, 0.2, 0.2);
        let t = 0;
        const hop = () => {
            t += 0.08;
            const s = Math.min(1.0, t);
            if (this.chestMesh) {
                this.chestMesh.scale.set(s, s, s);
                this.chestMesh.position.y = this.chestBasePos.y + Math.sin(t * Math.PI) * 0.3;
            }
            if (t < 1.0) requestAnimationFrame(hop);
            else if (this.chestMesh) this.chestMesh.position.copy(this.chestBasePos);
        };
        hop();
    }

    removeChest() {
        if (this.chestMesh) {
            this.renderer.stageGroup.remove(this.chestMesh);
            this.chestMesh = null;
        }
    }

    animateHeroAttack(onImpact) {
        if (!this.heroMesh) return;
        const startX = this.heroBasePos.x;
        const targetX = 0.4;
        let progress = 0;
        let impacted = false;

        const anim = () => {
            progress += 0.09;
            if (progress <= 0.5) {
                // Dash forward
                const p = progress / 0.5;
                this.heroMesh.position.x = startX + (targetX - startX) * p;
                this.heroMesh.rotation.z = -0.15 * p;
            } else {
                // Trigger impact once at apex
                if (!impacted) {
                    impacted = true;
                    if (onImpact) onImpact();
                    this.createSlashVFX(this.monsterBasePos.x - 0.2, this.monsterBasePos.y);
                }
                // Recoil back
                const p = (progress - 0.5) / 0.5;
                this.heroMesh.position.x = targetX - (targetX - startX) * p;
                this.heroMesh.rotation.z = -0.15 * (1 - p);
            }

            if (progress < 1.0) {
                requestAnimationFrame(anim);
            } else {
                this.heroMesh.position.copy(this.heroBasePos);
                this.heroMesh.rotation.z = 0;
            }
        };
        anim();
    }

    animateMonsterAttack(onImpact) {
        if (!this.monsterMesh) return;
        const startX = this.monsterBasePos.x;
        const targetX = -0.4;
        let progress = 0;
        let impacted = false;

        const anim = () => {
            progress += 0.08;
            if (progress <= 0.5) {
                const p = progress / 0.5;
                this.monsterMesh.position.x = startX + (targetX - startX) * p;
                this.monsterMesh.rotation.z = 0.15 * p;
            } else {
                if (!impacted) {
                    impacted = true;
                    if (onImpact) onImpact();
                    this.createClawVFX(this.heroBasePos.x + 0.2, this.heroBasePos.y);
                }
                const p = (progress - 0.5) / 0.5;
                this.monsterMesh.position.x = targetX - (targetX - startX) * p;
                this.monsterMesh.rotation.z = 0.15 * (1 - p);
            }

            if (progress < 1.0) {
                requestAnimationFrame(anim);
            } else {
                this.monsterMesh.position.copy(this.monsterBasePos);
                this.monsterMesh.rotation.z = 0;
            }
        };
        anim();
    }

    createSlashVFX(x, y) {
        const geo = new THREE.RingGeometry(0.3, 0.45, 16, 1, 0, Math.PI * 0.7);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x63b3ed,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });
        const slash = new THREE.Mesh(geo, mat);
        slash.position.set(x, y, 0.1);
        slash.rotation.z = Math.PI * 0.25;
        this.vfxGroup.add(slash);

        let t = 0;
        const anim = () => {
            t += 0.12;
            slash.scale.setScalar(1 + t * 0.8);
            slash.material.opacity = 1 - t;
            if (t < 1.0) {
                requestAnimationFrame(anim);
            } else {
                this.vfxGroup.remove(slash);
                geo.dispose();
                mat.dispose();
            }
        };
        anim();
    }

    createClawVFX(x, y) {
        for (let i = -1; i <= 1; i++) {
            const geo = new THREE.PlaneGeometry(0.06, 0.6);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xf56565,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending
            });
            const claw = new THREE.Mesh(geo, mat);
            claw.position.set(x + i * 0.15, y, 0.1);
            claw.rotation.z = -0.4;
            this.vfxGroup.add(claw);

            let t = 0;
            const anim = () => {
                t += 0.1;
                claw.material.opacity = 1 - t;
                if (t < 1.0) requestAnimationFrame(anim);
                else {
                    this.vfxGroup.remove(claw);
                    geo.dispose();
                    mat.dispose();
                }
            };
            anim();
        }
    }

    spawnDamageNumber(text, x, y, isCrit = false, color = '#ffffff') {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.font = isCrit ? 'bold 52px Inter, sans-serif' : 'bold 44px Inter, sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.strokeText(text, 128, 70);
        ctx.fillText(text, 128, 70);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1.0 });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(x, y + 0.3, 0.5);
        sprite.scale.set(1.4, 0.7, 1);
        this.vfxGroup.add(sprite);

        let t = 0;
        const drift = () => {
            t += 0.04;
            sprite.position.y += 0.02;
            sprite.material.opacity = Math.max(0, 1 - t);
            if (t < 1.0) {
                requestAnimationFrame(drift);
            } else {
                this.vfxGroup.remove(sprite);
                mat.dispose();
                tex.dispose();
            }
        };
        drift();
    }

    flashRed(targetMesh) {
        if (!targetMesh || !targetMesh.material) return;
        const origColor = targetMesh.material.color.getHex();
        targetMesh.material.color.setHex(0xff3333);
        setTimeout(() => {
            if (targetMesh && targetMesh.material) {
                targetMesh.material.color.setHex(origColor);
            }
        }, 120);
    }

    playLevelUpVFX() {
        const count = 30;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 0.5 + Math.random() * 0.3;
            pos[i * 3] = this.heroBasePos.x + Math.cos(angle) * r;
            pos[i * 3 + 1] = Math.random() * 0.5;
            pos[i * 3 + 2] = this.heroBasePos.z + Math.sin(angle) * r;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xf6e05e,
            size: 0.1,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        const particles = new THREE.Points(geo, mat);
        this.vfxGroup.add(particles);

        let t = 0;
        const anim = () => {
            t += 0.03;
            const arr = particles.geometry.attributes.position.array;
            for (let i = 0; i < count; i++) {
                arr[i * 3 + 1] += 0.06;
            }
            particles.geometry.attributes.position.needsUpdate = true;
            mat.opacity = 1 - t;
            if (t < 1.0) requestAnimationFrame(anim);
            else {
                this.vfxGroup.remove(particles);
                geo.dispose();
                mat.dispose();
            }
        };
        anim();
    }

    update(time) {
        // Idle breathing on entities
        if (this.heroMesh) {
            this.heroMesh.position.y = this.heroBasePos.y + Math.sin(time * 3) * 0.03;
        }
        if (this.monsterMesh) {
            this.monsterMesh.position.y = this.monsterBasePos.y + Math.sin(time * 2.5 + 1) * 0.04;
        }
        if (this.chestMesh) {
            this.chestMesh.position.y = this.chestBasePos.y + Math.sin(time * 2) * 0.02;
        }
    }
}

window.EntityManager = EntityManager;
