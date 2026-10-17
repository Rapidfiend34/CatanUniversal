import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { type Game, type Resource, legalRoads, legalSettlements } from './engine';
import { theme } from './theme';
import { voxelTexture } from './voxel-textures';

export type Mode = 'inspect' | 'road' | 'settlement' | 'city';
const terrain: Record<Resource | 'desert', string> = { wood: '#63876a', brick: '#c18d76', sheep: '#a4b58a', wheat: '#cfb578', ore: '#929c9d', desert: '#ddc49a' };
const voxelTerrain: Record<Resource | 'desert', string> = { wood: '#397544', brick: '#a96d5d', sheep: '#c9d3bf', wheat: '#c7a94c', ore: '#718087', desert: '#c9ae75' };
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
    this.sea = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: 'varying vec3 vPos; void main(){vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: `varying vec3 vPos; uniform float uTime; void main(){float d=length(vPos.xy); float wave=sin(d*9.-uTime*.6)*.5+.5; float ring=smoothstep(.91,1.,wave)*smoothstep(4.8,5.3,d)*(1.-smoothstep(5.5,8.,d)); vec3 a=vec3(.69,.80,.77); vec3 b=vec3(.84,.89,.85); float mixv=1.-exp(-d*.11); vec3 col=mix(a,b,mixv)+ring*.055; float w=sin(vPos.x*4.+uTime*.2)*sin(vPos.y*3.+uTime*.3); gl_FragColor=vec4(col+w*.005,1.);}` });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), this.sea); water.rotation.x = -Math.PI / 2; water.position.y = -.28; this.scene.add(water);
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
    const b = this.renderer.domElement.getBoundingClientRect(); this.pointer.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.targets.children, true); if (hits.length) return hits[0].object;
    const land = this.ray.intersectObjects(this.ground.children, true); for (const h of land) { let o: THREE.Object3D | null = h.object; while (o && o !== this.ground) { if (o.userData.kind) return o; o = o.parent; } } return null;
  }
  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  private disposeGroup(group: THREE.Group) { group.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) { if (o instanceof THREE.Mesh) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } }); group.clear(); }
  create(g: Game) {
    const voxel = theme() === 'voxel';
    this.renderer.setClearColor(voxel ? '#87b9d6' : '#dbe6df');
    this.scene.fog = new THREE.Fog(voxel ? '#87b9d6' : '#dbe6df', 28, 75);
    this.mapScale = Math.max(1, ...g.vertices.map(v => Math.hypot(v.x, v.z) / 4.6));
    this.islandBase.scale.set(this.mapScale, 1, this.mapScale);
    this.resize(); this.home();
    this.scene.traverse(o => { if (o instanceof THREE.DirectionalLight) { Object.assign(o.shadow.camera, { left: -9 * this.mapScale, right: 9 * this.mapScale, top: 9 * this.mapScale, bottom: -9 * this.mapScale }); o.shadow.camera.updateProjectionMatrix(); } });
    this.disposeGroup(this.ground); this.selectionKey = '';
    for (const t of g.tiles) {
      const group = new THREE.Group(); group.position.set(t.x, 0, t.z); group.userData = { kind: 'tile', id: t.id }; this.ground.add(group);
      const tileMaterial = voxel ? new THREE.MeshStandardMaterial({ map: voxelTexture(t.resource), roughness: .95 }) : mat(terrain[t.resource]);
      this.mesh(new THREE.CylinderGeometry(.963, .963, .27, voxel ? 4 : 6), tileMaterial, group, 0, .27, 0);
      const rand = (n: number) => { const x = Math.sin(t.id * 171.3 + n * 37.17 + 1) * 43758.5453; return x - Math.floor(x); };
      if (voxel) {
        const block = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => this.mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color), group, x, y, z);
        const base = t.resource === 'desert' ? '#a88654' : '#507a4b';
        block(0, .08, 0, 1.72, .16, 1.72, base);
        block(0, -.04, 0, 1.48, .08, 1.48, '#394f45');
        if (t.resource === 'wood') {
          block(0, .30, -.1, 1.28, .22, 1.12, '#6fa044');
          block(.18, .48, -.08, .88, .18, .82, '#8dbb50');
          for (const [x, z, s] of [[-.48, -.32, .82], [.12, -.18, 1.18], [.5, .32, .72], [-.28, .42, .62]]) {
            block(x, .62, z, .14, s, .14, '#68452e');
            block(x, .98 + s / 2, z, .42, .34, .42, '#2d713d');
            block(x + .12, 1.18 + s / 2, z, .3, .28, .3, '#438e48');
            block(x - .14, 1.08 + s / 2, z + .12, .26, .25, .26, '#367e40');
          }
          block(.36, .48, .42, .42, .2, .18, '#805536'); block(.58, .58, .42, .42, .2, .18, '#9b6841');
          block(-.58, .48, .3, .2, .32, .2, '#7a5132'); block(-.58, .66, .3, .24, .05, .24, '#c69655');
          for (const [x, z] of [[-.7, -.36], [.7, -.12], [-.72, .48], [.62, .58]]) { block(x, .48, z, .1, .28, .1, '#6eaa45'); block(x + .08, .62, z, .16, .1, .16, '#9bca55'); }
        } else if (t.resource === 'brick') {
          block(-.35, .48, -.28, .6, .42, .5, '#a65d4c'); block(.28, .58, -.12, .5, .62, .42, '#b86d54');
          block(.03, .86, -.12, .78, .12, .56, '#754940'); block(-.38, .35, .32, .18, .18, .18, '#d18b64');
        } else if (t.resource === 'wheat') {
          for (let x = -.5; x <= .5; x += .25) { block(x, .56, -.3, .07, .58, .07, '#a27b2b'); block(x, .82, -.3, .14, .08, .14, '#e4c65a'); }
          block(.35, .48, .28, .38, .36, .38, '#c99b3c'); block(.35, .71, .28, .42, .08, .42, '#e3bd52');
        } else if (t.resource === 'sheep') {
          block(-.45, .42, -.22, .08, .38, .08, '#8b6a3f'); block(.45, .42, -.22, .08, .38, .08, '#8b6a3f'); block(0, .43, -.22, .95, .08, .08, '#9a7548');
          block(-.15, .5, .32, .3, .24, .25, '#e4e7d4'); block(.04, .57, .32, .1, .16, .1, '#5c6358');
        } else if (t.resource === 'ore') {
          block(-.35, .55, -.2, .16, .85, .55, '#4a5d63'); block(.0, .48, -.2, .16, .7, .55, '#596f73'); block(.35, .4, -.2, .16, .52, .55, '#71868a');
          for (const [x, z] of [[-.4, .25], [.15, .22], [.42, .3]]) block(x, .46, z, .08, .28, .08, '#d6c17a');
        } else {
          block(-.35, .55, -.2, .18, .78, .18, '#3e7c48'); block(-.35, .9, -.2, .38, .18, .18, '#4a914d'); block(.37, .42, .28, .42, .16, .42, '#d4b375');
        }
      }
      for (let i = 0; i < (t.resource === 'ore' ? 5 : t.resource === 'wood' ? 9 : 7); i++) {
        const a = rand(i * 3) * Math.PI * 2, radius = .4 + rand(i * 3 + 1) * .29, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        if (t.resource === 'wood' && !voxel) {
          const h = .3 + rand(i + 50) * .3;
          this.mesh(new THREE.CylinderGeometry(.025, .04, h, 5), mat('#756449'), group, x, .42 + h / 2, z);
          this.mesh(voxel ? new THREE.BoxGeometry(.28, h, .28) : new THREE.ConeGeometry(.15, h, 6), mat(i % 2 ? '#345b44' : '#436e4b'), group, x, .55 + h / 2, z);
          this.mesh(voxel ? new THREE.BoxGeometry(.22, h * .55, .22) : new THREE.ConeGeometry(.11, h * .75, 6), mat('#537f53'), group, x, .68 + h / 2, z);
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
      if (t.number) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#f5edda'; ctx.beginPath(); ctx.arc(128, 128, 119, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ddcfaf'; ctx.lineWidth = 5; ctx.stroke();
        const red = t.number === 6 || t.number === 8; ctx.fillStyle = red ? '#b9553d' : '#364a41'; ctx.font = 'bold 110px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(t.number), 128, 111);
        const dots = 6 - Math.abs(7 - t.number); for (let i = 0; i < dots; i++) { ctx.beginPath(); ctx.arc(128 + (i - (dots - 1) / 2) * 19, 184, 5.5, 0, Math.PI * 2); ctx.fill(); }
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const token = this.mesh(new THREE.CylinderGeometry(.268, .268, .044, 40), mat('#d5c5a4'), group, 0, .43, 0);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(.54, .54), new THREE.MeshBasicMaterial({ map: texture, transparent: true })); face.rotation.x = -Math.PI / 2; face.position.y = .024; token.add(face);
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
    this.lastGame = g; this.lastMode = mode; this.disposeGroup(this.pieces); this.disposeGroup(this.targets);
    for (const e of g.edges) if (e.owner !== null) {
      const a = g.vertices[e.a], b = g.vertices[e.b];
      const road = this.mesh(new THREE.BoxGeometry(.73, .095, .115), mat(g.players[e.owner].color), this.pieces, (a.x + b.x) / 2, .465, (a.z + b.z) / 2); road.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      for (const t of [-.22, .22]) { const peg = new THREE.Mesh(new THREE.SphereGeometry(.022, 5, 4), mat('#f5ddaf')); peg.position.set(t, .052, 0); road.add(peg); }
    }
    for (const v of g.vertices) if (v.owner !== null) {
      const group = new THREE.Group(); group.position.set(v.x, .43, v.z); group.rotation.y = Math.PI / 6; this.pieces.add(group);
      const color = g.players[v.owner].color;
      this.mesh(new THREE.BoxGeometry(.23, .22, .24), mat(color), group, 0, .11, 0);
      const roof = this.mesh(new THREE.ConeGeometry(.235, .18, 4), mat(color), group, 0, .30, 0); roof.rotation.y = Math.PI / 4; roof.scale.z = .85;
      this.mesh(new THREE.BoxGeometry(.055, .09, .01), mat('#fff0ce'), group, 0, .07, .126);
      if (v.city) {
        this.mesh(new THREE.BoxGeometry(.15, .37, .18), mat(color), group, .17, .185, 0);
        this.mesh(new THREE.ConeGeometry(.15, .14, 4), mat('#eee2c1'), group, .17, .44, 0).rotation.y = Math.PI / 4;
        this.mesh(new THREE.BoxGeometry(.04, .06, .01), mat('#fff0ce'), group, .17, .28, .096);
      }
    }
    const t = g.tiles[g.robber], robber = new THREE.Group(); robber.position.set(t.x + .22, .43, t.z + .26); this.pieces.add(robber);
    this.mesh(new THREE.ConeGeometry(.13, .3, 12), mat('#384b49'), robber, 0, .15, 0);
    this.mesh(new THREE.SphereGeometry(.09, 12, 8), mat('#384b49'), robber, 0, .34, 0);
    this.mesh(new THREE.CylinderGeometry(.15, .17, .045, 16), mat('#b9a27b'), robber, 0, .025, 0);
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
    if (kind === 'tile') { x = g.tiles[id].x; z = g.tiles[id].z; }
    else if (kind === 'road') { const e = g.edges[id]; x = (g.vertices[e.a].x + g.vertices[e.b].x) / 2; z = (g.vertices[e.a].z + g.vertices[e.b].z) / 2; }
    else { x = g.vertices[id].x; z = g.vertices[id].z; }
    const p = new THREE.Vector3(x, .48, z).project(this.camera), r = this.renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  dispose() { cancelAnimationFrame(this.animation); this.observer.disconnect(); this.controls.dispose(); this.renderer.dispose(); }
}
