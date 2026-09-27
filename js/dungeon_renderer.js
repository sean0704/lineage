/**
 * DungeonRenderer - Three.js 3D Visual Stage for Lineage Adventure
 * Handles 3D environments (Dungeon Corridor, Village Square), dynamic lighting,
 * torch fires, atmospheric fog, camera effects, and particle ambiance.
 */
class DungeonRenderer {
    constructor() {
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.torches = [];
        this.dustParticles = null;
        this.currentEnv = 'village';
        this.currentFloor = 1;
        this.clock = new THREE.Clock();
        this.cameraShake = { intensity: 0, decay: 5, trauma: 0 };
        this.dungeonGroup = new THREE.Group();
        this.villageGroup = new THREE.Group();
        this.stageGroup = new THREE.Group(); // Holds characters & chests
        this.isInitialized = false;
    }

    init(containerEl) {
        if (!containerEl) {
            console.error("Renderer container element not found");
            return;
        }
        this.container = containerEl;
        const width = containerEl.clientWidth || 600;
        const height = containerEl.clientHeight || 340;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111622);
        this.scene.fog = new THREE.FogExp2(0x111622, 0.08);

        // Camera
        this.camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
        this.camera.position.set(0, 2.2, 5.2);
        this.camera.lookAt(0, 1.1, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;

        containerEl.innerHTML = '';
        containerEl.appendChild(this.renderer.domElement);

        // Groups
        this.scene.add(this.dungeonGroup);
        this.scene.add(this.villageGroup);
        this.scene.add(this.stageGroup);

        // Build Stages
        this.buildDungeonStage();
        this.buildVillageStage();
        this.buildAtmosphericParticles();

        // Resize Listener
        window.addEventListener('resize', () => this.onResize());

        this.setEnvironment('village', 1);
        this.isInitialized = true;
        this.animate();
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight || 340;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    buildDungeonStage() {
        const texLoader = new THREE.TextureLoader();
        
        // Floor
        const floorGeo = new THREE.PlaneGeometry(8, 20);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x222733,
            roughness: 0.85,
            metalness: 0.1
        });
        texLoader.load('assets/textures/dungeon_floor.png', (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(4, 10);
            floorMat.map = tex;
            floorMat.needsUpdate = true;
        }, undefined, () => {});

        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.dungeonGroup.add(floor);

        // Side Walls
        const wallGeo = new THREE.PlaneGeometry(20, 6);
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x2a303d,
            roughness: 0.9,
            metalness: 0.05
        });
        texLoader.load('assets/textures/dungeon_wall.png', (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(6, 2);
            wallMat.map = tex;
            wallMat.needsUpdate = true;
        }, undefined, () => {});

        const leftWall = new THREE.Mesh(wallGeo, wallMat);
        leftWall.position.set(-3.5, 3, 0);
        leftWall.rotation.y = Math.PI / 2;
        this.dungeonGroup.add(leftWall);

        const rightWall = new THREE.Mesh(wallGeo, wallMat);
        rightWall.position.set(3.5, 3, 0);
        rightWall.rotation.y = -Math.PI / 2;
        this.dungeonGroup.add(rightWall);

        // Back Wall
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), wallMat);
        backWall.position.set(0, 3, -10);
        this.dungeonGroup.add(backWall);

        // Pillars alongside corridor
        const pillarGeo = new THREE.BoxGeometry(0.5, 6, 0.5);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x363d4e, roughness: 0.8 });
        for (let z = -8; z <= 4; z += 4) {
            const p1 = new THREE.Mesh(pillarGeo, pillarMat);
            p1.position.set(-3.2, 3, z);
            this.dungeonGroup.add(p1);

            const p2 = new THREE.Mesh(pillarGeo, pillarMat);
            p2.position.set(3.2, 3, z);
            this.dungeonGroup.add(p2);

            // Add Torches to front pillars
            if (z === 0 || z === -4) {
                this.addTorch(-3.0, 2.2, z, 1);
                this.addTorch(3.0, 2.2, z, -1);
            }
        }

        // Ambient Light for dungeon
        this.dungeonAmbient = new THREE.AmbientLight(0x1a2130, 0.6);
        this.dungeonGroup.add(this.dungeonAmbient);
    }

    addTorch(x, y, z, facingX) {
        const torchGroup = new THREE.Group();
        torchGroup.position.set(x, y, z);

        // Bracket
        const bracket = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.4),
            new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 })
        );
        bracket.rotation.z = facingX * 0.4;
        torchGroup.add(bracket);

        // Flame point light
        const light = new THREE.PointLight(0xff7722, 1.8, 8, 1.5);
        light.position.set(facingX * 0.1, 0.25, 0);
        light.castShadow = true;
        torchGroup.add(light);

        // Flame glow billboard
        const flameMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffaa33 })
        );
        flameMesh.position.copy(light.position);
        torchGroup.add(flameMesh);

        this.dungeonGroup.add(torchGroup);
        this.torches.push({ light, flameMesh, baseIntensity: 1.8, seed: Math.random() * 10 });
    }

    buildVillageStage() {
        // Cobblestone ground
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 16),
            new THREE.MeshStandardMaterial({ color: 0x2e382d, roughness: 0.9 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.villageGroup.add(ground);

        // Campfire / Lantern in center
        const fireLight = new THREE.PointLight(0xffaa44, 2.2, 10, 1.2);
        fireLight.position.set(0, 0.8, -1.0);
        this.villageGroup.add(fireLight);
        this.torches.push({ light: fireLight, flameMesh: null, baseIntensity: 2.2, seed: 1.5 });

        // Fire logs
        for (let i = 0; i < 4; i++) {
            const log = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 0.7),
                new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.9 })
            );
            log.position.set(0, 0.08, -1.0);
            log.rotation.z = (Math.PI / 4) * i;
            log.rotation.x = 0.2;
            this.villageGroup.add(log);
        }

        // Village background silhouettes / huts
        const hutMat = new THREE.MeshStandardMaterial({ color: 0x252a32, roughness: 0.85 });
        const hut1 = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 2.5), hutMat);
        hut1.position.set(-4, 1.25, -5);
        this.villageGroup.add(hut1);

        const roof1 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.5, 4), new THREE.MeshStandardMaterial({ color: 0x4a2a18 }));
        roof1.position.set(-4, 3.25, -5);
        roof1.rotation.y = Math.PI / 4;
        this.villageGroup.add(roof1);

        const hut2 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3, 3), hutMat);
        hut2.position.set(4, 1.5, -6);
        this.villageGroup.add(hut2);

        // Village Ambient
        const villageAmbient = new THREE.AmbientLight(0x3a4b60, 0.8);
        this.villageGroup.add(villageAmbient);
    }

    buildAtmosphericParticles() {
        const count = 60;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 8;
            positions[i * 3 + 1] = Math.random() * 4;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffaa66,
            size: 0.06,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        this.dustParticles = new THREE.Points(geo, mat);
        this.scene.add(this.dustParticles);
    }

    setEnvironment(envType, floor = 1) {
        this.currentEnv = envType;
        this.currentFloor = floor;

        if (envType === 'village') {
            this.villageGroup.visible = true;
            this.dungeonGroup.visible = false;
            this.scene.background.setHex(0x161d28);
            this.scene.fog.color.setHex(0x161d28);
            this.scene.fog.density = 0.04;
            this.camera.position.set(0, 2.0, 5.0);
        } else {
            // Dungeon Floors 1-7 color ambiance
            this.villageGroup.visible = false;
            this.dungeonGroup.visible = true;
            let bgColor = 0x111622;
            let fogDensity = 0.07;

            if (floor <= 2) {
                bgColor = 0x121720; // Deep stone blue
            } else if (floor <= 4) {
                bgColor = 0x0f1c18; // Eerie damp crypt green
            } else if (floor <= 5) {
                bgColor = 0x1a1224; // Mystic archmage purple
            } else {
                bgColor = 0x241010; // Fiery depths of Death Knight
                fogDensity = 0.09;
            }

            this.scene.background.setHex(bgColor);
            this.scene.fog.color.setHex(bgColor);
            this.scene.fog.density = fogDensity;
            this.camera.position.set(0, 2.2, 5.2);
        }
    }

    shakeCamera(intensity = 0.4, trauma = 1.0) {
        this.cameraShake.intensity = intensity;
        this.cameraShake.trauma = trauma;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const time = this.clock.getElapsedTime();
        const delta = this.clock.getDelta();

        // Animate Torches
        this.torches.forEach(t => {
            const flicker = Math.sin(time * 6 + t.seed) * 0.15 + (Math.random() - 0.5) * 0.1;
            t.light.intensity = t.baseIntensity + flicker;
            if (t.flameMesh) {
                t.flameMesh.scale.setScalar(0.9 + flicker * 0.3);
            }
        });

        // Animate Dust Particles
        if (this.dustParticles) {
            const pos = this.dustParticles.geometry.attributes.position.array;
            for (let i = 0; i < pos.length / 3; i++) {
                pos[i * 3 + 1] -= 0.003;
                if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 4;
            }
            this.dustParticles.geometry.attributes.position.needsUpdate = true;
        }

        // Animate Entities
        if (this.entityManager) {
            this.entityManager.update(time);
        }

        // Camera Shake & Subtle Sway
        let shakeOffsetX = 0;
        let shakeOffsetY = 0;
        if (this.cameraShake.trauma > 0) {
            this.cameraShake.trauma = Math.max(0, this.cameraShake.trauma - delta * this.cameraShake.decay);
            const shake = this.cameraShake.trauma * this.cameraShake.intensity;
            shakeOffsetX = (Math.random() - 0.5) * shake;
            shakeOffsetY = (Math.random() - 0.5) * shake;
        }

        const swayX = Math.sin(time * 0.5) * 0.04;
        const swayY = Math.cos(time * 0.8) * 0.03;
        this.camera.position.x = swayX + shakeOffsetX;
        this.camera.position.y = (this.currentEnv === 'village' ? 2.0 : 2.2) + swayY + shakeOffsetY;
        this.camera.lookAt(0, 1.1, 0);

        this.renderer.render(this.scene, this.camera);
    }
}

window.DungeonRenderer = DungeonRenderer;
