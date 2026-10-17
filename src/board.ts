import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { type Game, type Resource, legalRoads, legalSettlements } from './engine';

import { theme } from './theme';
import { VoxelMap, BIOME_TOKEN, BIOME_ROBBER } from './voxel-map';
import { createIllager } from './illager';
import { VillageHouses } from './village-house';

export type Mode = 'inspect' | 'road' | 'settlement' | 'city';
const terrain: Record<Resource | 'desert', string> = { wood: '#63876a', brick: '#c18d76', sheep: '#a4b58a', wheat: '#cfb578', ore: '#929c9d', desert: '#ddc49a' };
const mat = (color: THREE.ColorRepresentation, roughness = .9) => new THREE.MeshStandardMaterial({ color, roughness });
export class Board {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-8, 8, 8, -8, .1, 150);
  controls: OrbitControls;
  ground = new THREE.Group();
  pieces = new THREE.Group();
  targets = new THREE.Group();
  ray = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  private observer: ResizeObserver;
  private animation = 0;
  private lastGame: Game | null = null;
  private lastMode: Mode = 'inspect';
  private selectionKey = '';
  private mapScale = 1;
  private islandBase = new THREE.Group();
  private sea: THREE.ShaderMaterial;
  private water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private hovered: THREE.Object3D | null = null;
  private down = { x: 0, y: 0 };
  onSelect: (kind: string, id: number) => void = () => {};
  constructor(public host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#dbe6df');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.domElement.setAttribute('aria-label', 'Tablero tridimensional interactivo. También puedes seleccionar construcciones con la lista accesible.');
    host.append(this.renderer.domElement);
    this.scene.fog = new THREE.Fog('#dbe6df', 28, 75);
    this.camera.position.set(10, 13, 13);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.enablePan = true;
    this.controls.minZoom = .7; this.controls.maxZoom = 2.4;
    this.controls.minPolarAngle = .3; this.controls.maxPolarAngle = Math.PI / 2.6;
    this.controls.target.set(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight('#fff9e9', '#8fa9a0', 2.6));
    const sun = new THREE.DirectionalLight('#fff5dd', 4);
    sun.position.set(-6, 13, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .5, far: 35 });
    sun.shadow.bias = -.0003; sun.shadow.normalBias = .025; sun.shadow.radius = 4; this.scene.add(sun);
    this.sea = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uVoxel: { value: 0 } }, vertexShader: 'varying vec3 vPos; void main(){vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: `varying vec3 vPos; uniform float uTime; uniform float uVoxel; void main(){float d=length(vPos.xy); float wave=sin(d*9.-uTime*.6)*.5+.5; float ring=smoothstep(.91,1.,wave)*smoothstep(4.8,5.3,d)*(1.-smoothstep(5.5,8.,d)); vec3 a=vec3(.69,.80,.77); vec3 b=vec3(.84,.89,.85); float mixv=1.-exp(-d*.11); vec3 col=mix(a,b,mixv)+ring*.055; float w=sin(vPos.x*4.+uTime*.2)*sin(vPos.y*3.+uTime*.3); if(uVoxel > .5){vec2 p=floor(vPos.xy*8.)/8.; float rip=sin(p.x*2.+uTime*.25)*sin(p.y*3.+uTime*.2); col=mix(vec3(.63,.78,.80),vec3(.78,.87,.85),smoothstep(1.,12.,d))+rip*.012;} gl_FragColor=vec4(col+w*.005,1.);}` });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), this.sea); this.water.rotation.x = -Math.PI / 2; this.water.position.y = -.28; this.scene.add(this.water);
    const island = new THREE.Mesh(new THREE.CylinderGeometry(4.88, 5.10, .32, 72), mat('#c3b598')); island.position.y = -.06; island.receiveShadow = true; this.islandBase.add(island);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(4.96, 5.05, .075, 72), mat('#e4d7b7')); rim.position.y = .09; rim.receiveShadow = true; this.islandBase.add(rim); this.scene.add(this.islandBase);
    this.scene.add(this.ground, this.pieces, this.targets);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    host.addEventListener('pointerdown', e => { this.down = { x: e.clientX, y: e.clientY }; });
    host.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 7) return;
      const hit = this.pick(e); if (hit) this.onSelect(hit.userData.kind, hit.userData.id);
    });
    host.addEventListener('pointermove', e => { const hit = this.pick(e); this.hovered = hit; host.style.cursor = hit ? 'pointer' : 'grab'; });
    const frame = (t: number) => { this.animation = requestAnimationFrame(frame); if (document.hidden || !this.host.clientWidth || !this.host.clientHeight) return; this.sea.uniforms.uTime.value = t / 1000; this.controls.update(); this.targets.children.forEach(c => { const m = c as THREE.Mesh; if (m.material instanceof THREE.MeshStandardMaterial) m.material.emissiveIntensity = c === this.hovered ? .65 : .18 + Math.sin(t / 550) * .08; }); this.renderer.render(this.scene, this.camera); }; frame(0);
  }
  private resize() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; const aspect = w / h, height = (aspect < 1 ? 6.9 / aspect : 6.5) * this.mapScale; this.camera.left = -height * aspect; this.camera.right = height * aspect; this.camera.top = height; this.camera.bottom = -height; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); }
  private pick(e: PointerEvent): THREE.Object3D | null {
    // A fast second click can arrive before the frame following a build.
    // Refresh transforms so newly created road targets are selectable at once.
    this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld();
    const b = this.renderer.domElement.getBoundingClientRect(); this.pointer.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.targets.children, true); if (hits.length) return hits[0].object;
    const land = this.ray.intersectObjects(this.ground.children, true);
    // Number labels are drawn above scenery; clicking one must select that
    // tile even if a neighbouring tree intersects the same camera ray.
    if (theme() === 'voxel') for (const hit of land) if (hit.object instanceof THREE.Sprite) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object !== this.ground) { if (object.userData.kind) return object; object = object.parent; }
    }
    for (const h of land) { let o: THREE.Object3D | null = h.object; while (o && o !== this.ground) { if (o.userData.kind) return o; o = o.parent; } } return null;
  }
  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  private disposeGroup(group: THREE.Group) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    group.traverse(o => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.Mesh) geometries.add(o.geometry);
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(material); if (material.map) textures.add(material.map);
      }
    });
    geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); group.clear();
  }
  create(g: Game) {
    const voxel = theme() === 'voxel', voxelMap = voxel ? new VoxelMap() : null;
    this.islandBase.visible = !voxel;
    this.water.position.y = voxel ? -1.65 : -.28;
    this.sea.uniforms.uVoxel.value = voxel ? 1 : 0;
    this.renderer.toneMappingExposure = voxel ? .95 : 1.35;
    this.renderer.setClearColor(voxel ? '#cadeda' : '#dbe6df');
    this.scene.fog = new THREE.Fog(voxel ? '#cadeda' : '#dbe6df', 28, 75);
    this.host.dataset.mapStyle = voxel ? 'voxel' : 'classic';
    this.mapScale = Math.max(1, ...g.vertices.map(v => Math.hypot(v.x, v.z) / 4.6));
    this.islandBase.scale.set(this.mapScale, 1, this.mapScale);
    this.resize(); this.home();
    this.scene.traverse(o => { if (o instanceof THREE.DirectionalLight) { Object.assign(o.shadow.camera, { left: -9 * this.mapScale, right: 9 * this.mapScale, top: 9 * this.mapScale, bottom: -9 * this.mapScale }); o.shadow.camera.updateProjectionMatrix(); } });
    this.disposeGroup(this.ground); this.selectionKey = '';
    for (const t of g.tiles) {
      const group = voxelMap ? voxelMap.tile(t) : new THREE.Group();
      if (!voxelMap) { group.position.set(t.x, 0, t.z); group.userData = { kind: 'tile', id: t.id }; }
      this.ground.add(group);
      if (!voxel) {
      this.mesh(new THREE.CylinderGeometry(.963, .963, .27, 6), mat(terrain[t.resource]), group, 0, .27, 0);
      const rand = (n: number) => { const x = Math.sin(t.id * 171.3 + n * 37.17 + 1) * 43758.5453; return x - Math.floor(x); };
      for (let i = 0; i < (t.resource === 'ore' ? 5 : t.resource === 'wood' ? 9 : 7); i++) {
        const a = rand(i * 3) * Math.PI * 2, radius = .4 + rand(i * 3 + 1) * .29, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        if (t.resource === 'wood') {
          const h = .3 + rand(i + 50) * .3;
          this.mesh(new THREE.CylinderGeometry(.025, .04, h, 5), mat('#756449'), group, x, .42 + h / 2, z);
          this.mesh(new THREE.ConeGeometry(.15, h, 6), mat(i % 2 ? '#345b44' : '#436e4b'), group, x, .55 + h / 2, z);
          this.mesh(new THREE.ConeGeometry(.11, h * .75, 6), mat('#537f53'), group, x, .68 + h / 2, z);
        } else if (t.resource === 'ore') {
          const h = .3 + rand(i + 10) * .55;
          const m = this.mesh(new THREE.ConeGeometry(.22 + h / 9, h, 5), mat(i % 2 ? '#6c7e7b' : '#83918a'), group, x, .41 + h / 2, z); m.rotation.y = i * 1.2;
          this.mesh(new THREE.ConeGeometry(.09, h * .25, 5), mat('#e2e5d8'), group, x, .41 + h * .9, z);
        } else if (t.resource === 'sheep') {
          this.mesh(new THREE.IcosahedronGeometry(.105, 1), mat('#f1eede'), group, x, .54, z).scale.set(1.25, .8, .8);
          this.mesh(new THREE.IcosahedronGeometry(.047, 1), mat('#655f4d'), group, x + .11, .53, z);
          for (const dx of [-.045, .05]) this.mesh(new THREE.BoxGeometry(.022, .08, .022), mat('#716954'), group, x + dx, .46, z);
        } else if (t.resource === 'wheat') {
          for (let j = 0; j < 4; j++) {
            this.mesh(new THREE.BoxGeometry(.023, .22, .025), mat('#a68b4c'), group, x + j * .035, .52, z);
            this.mesh(new THREE.CapsuleGeometry(.027, .09, 2, 4), mat(i % 2 ? '#e7c571' : '#edcf88'), group, x + j * .035, .66, z);
          }
        } else if (t.resource === 'brick') {
          this.mesh(new THREE.BoxGeometry(.20, .11 + (i % 3) * .07, .14), mat(i % 2 ? '#ae725d' : '#d3987b'), group, x, .46 + (i % 3) * .035, z).rotation.y = i * .8;
          this.mesh(new THREE.DodecahedronGeometry(.09, 0), mat('#a7705d'), group, x - .08, .45, z + .08);
        } else {
          this.mesh(new THREE.SphereGeometry(.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e4cb9b'), group, x, .4, z).scale.y = .3;
          if (i === 1 || i === 5) { this.mesh(new THREE.CapsuleGeometry(.035, .20, 2, 5), mat('#83966a'), group, x, .53, z); }
        }
      }
      }
      if (t.number) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#f5edda'; ctx.beginPath(); ctx.arc(128, 128, 119, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ddcfaf'; ctx.lineWidth = 5; ctx.stroke();
        const red = t.number === 6 || t.number === 8; ctx.fillStyle = red ? '#b9553d' : '#364a41'; ctx.font = voxel ? 'bold 110px monospace' : 'bold 110px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(t.number), 128, 111);
        const dots = 6 - Math.abs(7 - t.number); for (let i = 0; i < dots; i++) { ctx.beginPath(); ctx.arc(128 + (i - (dots - 1) / 2) * 19, 184, 5.5, 0, Math.PI * 2); ctx.fill(); }
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const token = this.mesh(voxel ? new THREE.BoxGeometry(.36, .035, .36) : new THREE.CylinderGeometry(.268, .268, .044, 40), mat('#d5c5a4'), group, voxel ? BIOME_TOKEN.x : 0, voxel ? BIOME_TOKEN.y : .43, voxel ? BIOME_TOKEN.z : 0);
        if (voxel) {
          const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
          label.scale.set(.38, .38, 1); label.position.y = .075; label.renderOrder = 3; token.add(label);
        } else {
          const face = new THREE.Mesh(new THREE.PlaneGeometry(.54, .54), new THREE.MeshBasicMaterial({ map: texture, transparent: true })); face.rotation.x = -Math.PI / 2; face.position.y = .024; token.add(face);
        }
      }
    }
    const ports = new Set<string>();
    for (const v of g.vertices) if (v.port) {
      const mate = v.edges.map(id => g.edges[id]).find(e => e.tiles.length === 1 && g.vertices[e.a === v.id ? e.b : e.a].port === v.port);
      if (!mate || ports.has(String(mate.id))) continue; ports.add(String(mate.id));
      const a = g.vertices[mate.a], b = g.vertices[mate.b], x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      const factor = 1.15, dock = new THREE.Group(); dock.position.set(x * factor, .2, z * factor); dock.rotation.y = -Math.atan2(z, x); this.ground.add(dock);
      for (let i = 0; i < 5; i++) this.mesh(new THREE.BoxGeometry(.085, .05, .38), mat(i % 2 ? '#ae9b76' : '#c3af86'), dock, -.22 + i * .1, 0, 0);
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#f8f3e7'; ctx.beginPath(); ctx.roundRect(0, 0, 128, 64, 15); ctx.fill(); ctx.fillStyle = v.port === 'any' ? '#405b50' : terrain[v.port]; ctx.beginPath(); ctx.arc(26, 32, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#344a40'; ctx.font = 'bold 29px sans-serif'; ctx.fillText(v.port === 'any' ? '3:1' : '2:1', 46, 43);
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); sprite.position.set(x * 1.26, .45, z * 1.26); sprite.scale.set(.68, .34, 1); sprite.userData = { kind: 'port', id: v.id }; this.ground.add(sprite);
    }
    this.update(g, 'inspect', true);
  }
  update(g: Game, mode: Mode, interactive: boolean, numbered = false) {
    const voxel = theme() === 'voxel';
    const houses = voxel ? new VillageHouses() : null;
    this.lastGame = g; this.lastMode = mode; this.disposeGroup(this.pieces); this.disposeGroup(this.targets);
    for (const e of g.edges) if (e.owner !== null) {
      const a = g.vertices[e.a], b = g.vertices[e.b];
      const road = this.mesh(new THREE.BoxGeometry(.73, .095, .115), mat(g.players[e.owner].color), this.pieces, (a.x + b.x) / 2, .465, (a.z + b.z) / 2); road.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      for (const t of [-.22, .22]) { const peg = new THREE.Mesh(new THREE.SphereGeometry(.022, 5, 4), mat('#f5ddaf')); peg.position.set(t, .052, 0); road.add(peg); }
    }
    for (const v of g.vertices) if (v.owner !== null) {
      const group = new THREE.Group(); group.position.set(v.x, .43, v.z); group.rotation.y = Math.PI / 6; this.pieces.add(group);
      const color = g.players[v.owner].color;
      if (houses) { group.add(houses.create(color, v.city)); continue; }
      this.mesh(new THREE.BoxGeometry(.23, .22, .24), mat(color), group, 0, .11, 0);
      const roof = this.mesh(new THREE.ConeGeometry(.235, .18, 4), mat(color), group, 0, .30, 0); roof.rotation.y = Math.PI / 4; roof.scale.z = .85;
      this.mesh(new THREE.BoxGeometry(.055, .09, .01), mat('#fff0ce'), group, 0, .07, .126);
      if (v.city) {
        this.mesh(new THREE.BoxGeometry(.15, .37, .18), mat(color), group, .17, .185, 0);
        this.mesh(new THREE.ConeGeometry(.15, .14, 4), mat('#eee2c1'), group, .17, .44, 0).rotation.y = Math.PI / 4;
        this.mesh(new THREE.BoxGeometry(.04, .06, .01), mat('#fff0ce'), group, .17, .28, .096);
      }
    }
    const t = g.tiles[g.robber], robber = new THREE.Group(); robber.position.set(t.x + (voxel ? BIOME_ROBBER.x : .22), voxel ? BIOME_ROBBER.y : .43, t.z + (voxel ? BIOME_ROBBER.z : .26)); this.pieces.add(robber);
    if (voxel) {
      robber.add(createIllager());
    } else {
    this.mesh(new THREE.ConeGeometry(.13, .3, 12), mat('#384b49'), robber, 0, .15, 0);
    this.mesh(new THREE.SphereGeometry(.09, 12, 8), mat('#384b49'), robber, 0, .34, 0);
    this.mesh(new THREE.CylinderGeometry(.15, .17, .045, 16), mat('#b9a27b'), robber, 0, .025, 0);
    }
    if (!interactive) return;
    const kind = g.phase === 'setup-settlement' ? 'settlement' : g.phase === 'setup-road' || g.freeRoads ? 'road' : mode;
    if (g.phase === 'robber') {
      for (const t of g.tiles) if (t.id !== g.robber) { const m = this.mesh(new THREE.CylinderGeometry(.85, .85, .03, 6), new THREE.MeshStandardMaterial({ color: '#e5c16b', transparent: true, opacity: .3, emissive: '#bda866', depthWrite: false }), this.targets, t.x, .43, t.z); m.userData = { kind: 'tile', id: t.id }; }
    } else if (kind === 'road') {
      for (const id of legalRoads(g)) { const e = g.edges[id], a = g.vertices[e.a], b = g.vertices[e.b]; const m = this.mesh(new THREE.BoxGeometry(.73, .085, .18), new THREE.MeshStandardMaterial({ color: '#faf1d0', emissive: '#a8c698', transparent: true, opacity: .8 }), this.targets, (a.x + b.x) / 2, .48, (a.z + b.z) / 2); m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); m.userData = { kind: 'road', id }; }
    } else if (kind === 'settlement' || kind === 'city') {
      const ids = kind === 'settlement' ? legalSettlements(g) : g.vertices.filter(v => v.owner === g.current && !v.city).map(v => v.id);
      for (const id of ids) { const v = g.vertices[id]; const m = this.mesh(new THREE.CylinderGeometry(.15, .15, .035, 24), new THREE.MeshStandardMaterial({ color: '#fff0c5', emissive: '#abc78e' }), this.targets, v.x, kind === 'city' ? .92 : .46, v.z); m.userData = { kind, id }; }
    }
    if (voxel) for (const target of this.targets.children) {
      const material = (target as THREE.Mesh).material as THREE.MeshStandardMaterial;
      material.depthTest = false; material.depthWrite = false; target.renderOrder = 4;
    }
    if (numbered) for (const target of [...this.targets.children]) {
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff9e5'; ctx.beginPath(); ctx.roundRect(2, 2, 92, 60, 12); ctx.fill(); ctx.fillStyle = '#31533f'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(target.userData.id + 1), 48, 44);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; const label = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false })); label.position.copy(target.position); label.position.y += .18; label.scale.set(.32, .22, 1); label.userData = { ...target.userData }; this.targets.add(label);
    }
  }
  home() { this.camera.position.set(10, 13, 13); this.controls.target.set(0, 0, 0); this.camera.zoom = 1; this.camera.updateProjectionMatrix(); this.controls.update(); }
  zoom(delta: number) { this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom + delta, .7, 2.4); this.camera.updateProjectionMatrix(); }
  project(kind: string, id: number): { x: number; y: number } | null {
    if (!this.lastGame) return null; const g = this.lastGame;
    let x: number, z: number;
    if (kind === 'tile') { x = g.tiles[id].x + (theme() === 'voxel' ? BIOME_TOKEN.x : 0); z = g.tiles[id].z + (theme() === 'voxel' ? BIOME_TOKEN.z : 0); }
    else if (kind === 'road') { const e = g.edges[id]; x = (g.vertices[e.a].x + g.vertices[e.b].x) / 2; z = (g.vertices[e.a].z + g.vertices[e.b].z) / 2; }
    else { x = g.vertices[id].x; z = g.vertices[id].z; }
    const height = kind === 'tile' && theme() === 'voxel' ? BIOME_TOKEN.y + .075 : .48;
    const p = new THREE.Vector3(x, height, z).project(this.camera), r = this.renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  dispose() { cancelAnimationFrame(this.animation); this.observer.disconnect(); this.controls.dispose(); this.disposeGroup(this.ground); this.disposeGroup(this.pieces); this.disposeGroup(this.targets); this.disposeGroup(this.islandBase); this.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (!Array.isArray(o.material)) o.material.dispose(); } }); this.renderer.dispose(); }
}
