import * as THREE from 'three';
import type { Tile } from './engine';
import { VoxelMaterials, type Block } from './voxel-materials';
import { SheepModels } from './sheep-model';

export const BIOME_TOKEN = { x: .26, z: .32, y: .445 };
export const BIOME_ROBBER = { x: -.25, z: .34, y: .43 };
type Cube = { x: number; y: number; z: number; w: number; h: number; d: number; rotation: number; tint: number };

// Batch cubes by texture. The detailed scenery is built once per map, not on
// each turn; InstancedMesh keeps hundreds of little blocks inexpensive.
export class VoxelMap {
  private materials = new VoxelMaterials();
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private sheepModels = new SheepModels();

  tile(tile: Tile) {
    const group = new THREE.Group();
    group.name = `biome-${tile.resource}-${tile.id}`;
    group.position.set(tile.x, 0, tile.z);
    group.userData = { kind: 'tile', id: tile.id };
    const batches = new Map<Block, Cube[]>();
    const cube = (kind: Block, x: number, bottom: number, z: number, w: number, h = w, d = w, rotation = 0, tint = 1) => {
      const batch = batches.get(kind) || []; batches.set(kind, batch);
      batch.push({ x, y: bottom + h / 2, z, w, h, d, rotation, tint });
    };
    const reserved = (x: number, z: number) => Math.hypot(x - BIOME_TOKEN.x, z - BIOME_TOKEN.z) < .25 || Math.hypot(x - BIOME_ROBBER.x, z - BIOME_ROBBER.z) < .15;
    const inside = (x: number, z: number, margin = 0) => Math.abs(x) <= .79 - margin && Math.abs(z) + Math.abs(x) / Math.sqrt(3) < .91 - margin;
    const surface = (x: number, z: number) => {
      if (reserved(x, z)) return .405;
      if (tile.resource === 'wood' || tile.resource === 'sheep') {
        if (x < .32 && x > -.33 && z < -.05 && z > -.57) return .585;
        if (x < .52 && x > -.56 && z < .12 && z > -.68) return .495;
      }
      return .405;
    };
    const top: Block = tile.resource === 'desert' ? 'sand' : tile.resource === 'ore' ? 'stone' : tile.resource === 'brick' ? 'clay' : 'grass';
    // Stair-stepped hexagonal footprint follows the game's actual vertices.
    // Keep the perimeter free for roads, houses and legal placement targets.
    for (let iz = -7; iz <= 7; iz++) for (let ix = -6; ix <= 6; ix++) {
      const x = ix * .12, z = iz * .12;
      if (!inside(x, z, .065)) continue;
      const h = surface(x, z), tone = 1 - ((ix * 13 + iz * 7 + tile.id + 50) % 4) * .025;
      cube(tile.resource === 'desert' ? 'sandstone' : 'stone', x, .14, z, .12, .06, .12, 0, .85);
      cube(tile.resource === 'desert' ? 'sandstone' : 'dirt', x, .20, z, .12, h - .28, .12);
      cube(top, x, h - .08, z, .12, .08, .12, 0, tone);
    }
    const tree = (x: number, z: number, size: number) => {
      const y = surface(x, z);
      cube('bark', x, y, z, .105 * size, .42 * size, .105 * size);
      cube('leaves', x, y + .31 * size, z, .34 * size, .20 * size, .34 * size);
      cube('leaves', x + .025 * size, y + .51 * size, z, .24 * size, .13 * size, .24 * size, 0, 1.08);
      cube('leaves', x - .13 * size, y + .34 * size, z + .015, .16 * size, .14 * size, .20 * size, 0, .94);
      cube('leaves', x + .12 * size, y + .30 * size, z + .10 * size, .15 * size, .17 * size, .18 * size, 0, .98);
    };
    const flower = (x: number, z: number, yellow = false) => {
      const y = surface(x, z);
      cube('leaves', x, y, z, .016, .06, .016);
      cube(yellow ? 'yellow' : 'flower', x, y + .055, z, .055, .024, .055);
      if (!yellow) cube('yellow', x, y + .08, z, .018, .009, .018);
    };
    const rock = (x: number, z: number, size = .10) => cube('stone', x, surface(x, z), z, size, size * .8, size * .8);
    const bush = (x: number, z: number) => {
      const y = surface(x, z); cube('leaves', x, y, z, .13, .10, .13);
      cube('leaves', x + .025, y + .1, z, .08, .05, .08, 0, 1.07);
    };
    if (tile.resource === 'wood') {
      // A terraced miniature woodland based on the supplied reference.
      tree(-.10, -.37, 1.02); tree(-.48, -.03, .78); tree(.40, -.15, .85);
      tree(-.43, .43, .62); tree(.51, .40, .61);
      cube('bark', -.12, .405, .06, .085, .28, .085, Math.PI / 2);
      cube('bark', -.12, .49, .06, .085, .23, .085, Math.PI / 2);
      cube('bark', .06, .405, .60, .1, .14, .1);
      bush(-.53, -.33); bush(.16, -.64); bush(-.62, .22); bush(.38, .61);
      rock(-.61, -.12); rock(.63, .10); rock(-.06, .75, .08);
      for (const [x, z] of [[-.28, -.60], [.38, -.45], [-.58, .32], [-.12, .56], [.46, .12]]) flower(x, z);
    } else if (tile.resource === 'brick') {
      // Terracotta quarry: stepped cut banks, brick stacks and a small kiln.
      for (let step = 0; step < 3; step++) cube('clay', -.30 + step * .12, .405, -.32 - step * .10, .58 - step * .08, .12 + step * .12, .24);
      cube('brick', .35, .405, -.21, .32, .24, .28);
      cube('dark', .35, .405, -.055, .14, .14, .035);
      cube('sandstone', .35, .645, -.21, .37, .065, .32);
      cube('brick', .43, .71, -.25, .10, .19, .10);
      for (let n = 0; n < 3; n++) cube('brick', -.44 + n * .11, .405, .10, .10, .08 + (n % 2) * .08, .16);
      cube('planks', .0, .405, -.53, .27, .045, .16);
      rock(-.63, -.08); rock(.59, .15, .08); bush(-.5, .35); flower(.03, .65, true);
    } else if (tile.resource === 'wheat') {
      for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
        const x = -.48 + col * .16, z = -.50 + row * .13;
        cube('dirt', x, .405, z, .13, .02, .11);
        const h = .10 + ((row + col + tile.id) % 3) * .025;
        for (const dx of [-.025, .025]) {
          cube('wheat', x + dx, .425, z, .016, h, .016);
          cube('wheat', x + dx, .425 + h - .045, z, .038, .055, .038);
        }
      }
      cube('water', .40, .407, -.38, .09, .025, .55);
      for (const [x, z] of [[-.48, .2], [-.38, .2], [-.43, .3]]) cube('hay', x, .405, z, .12, .12, .12);
      cube('hay', -.43, .525, .24, .12, .12, .12);
      for (const x of [-.60, -.2, .2]) cube('planks', x, .405, -.64, .035, .15, .035);
      cube('planks', -.2, .49, -.64, .82, .026, .027); flower(-.13, .65); rock(.52, .05, .06);
    } else if (tile.resource === 'sheep') {
      const sheep = (x: number, z: number, size = 1) => {
        const model = this.sheepModels.create();
        model.position.set(x, surface(x, z), z); model.scale.setScalar(size); group.add(model);
      };
      sheep(-.43, -.22, .8); sheep(.10, -.33, .85); sheep(-.50, .32, .8);
      for (const x of [-.53, -.17, .19, .53]) cube('planks', x, surface(x, -.60), -.60, .035, .16, .035);
      cube('planks', 0, .55, -.60, 1.10, .03, .03);
      bush(.48, -.15); rock(-.61, .05, .07);
      for (const [x, z] of [[-.20, -.50], [.40, -.42], [.50, .14], [-.15, .6], [.04, .75]]) flower(x, z, x > .3);
    } else if (tile.resource === 'ore') {
      for (const [x, z, h] of [[-.45, -.24, .24], [-.25, -.40, .48], [0, -.47, .60], [.23, -.37, .42], [.45, -.24, .24]]) {
        cube('stone', x, .405, z, .25, h, .27);
        cube('iron', x, .405 + h * .4, z + .14, .16, .13, .025);
      }
      cube('dark', -.13, .405, -.10, .23, .26, .08);
      for (const x of [-.27, .02]) cube('bark', x, .405, -.03, .055, .31, .06);
      cube('planks', -.125, .715, -.03, .38, .06, .07);
      for (const z of [.07, .19, .31]) cube('planks', -.45, .405, z, .28, .025, .045);
      for (const x of [-.54, -.36]) cube('iron', x, .433, .19, .02, .02, .35);
      rock(.50, .12, .14); rock(-.13, .70, .10); bush(.54, -.47);
    } else {
      for (let level = 0; level < 3; level++) cube('sandstone', -.14, .405 + level * .10, -.38, .64 - level * .16, .10, .44 - level * .10);
      const cactus = (x: number, z: number, h: number) => {
        cube('cactus', x, .405, z, .085, h, .085);
        cube('cactus', x + .07, .405 + h * .4, z, .10, .055, .06);
        cube('cactus', x + .10, .405 + h * .4, z, .055, .12, .06);
      };
      cactus(-.48, .08, .27); cactus(.45, -.15, .22);
      for (const [x, z] of [[-.48, -.39], [.10, -.64], [-.04, .62], [.60, .06]]) cube('sandstone', x, .405, z, .09, .065, .08);
    }
    // A few tufts tie the dioramas together; placement avoids the number token.
    if (top === 'grass') for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + tile.id * .7, x = Math.cos(a) * .62, z = Math.sin(a) * .62;
      if (!inside(x, z, .06) || reserved(x, z)) continue;
      cube('leaves', x, surface(x, z), z, .024, .07, .024);
      cube('leaves', x + .026, surface(x, z), z, .020, .045, .02);
    }
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    for (const [kind, cubes] of batches) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.materials.block(kind), cubes.length);
      cubes.forEach((c, i) => {
        position.set(c.x, c.y, c.z); scale.set(c.w, c.h, c.d); rotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), c.rotation);
        matrix.compose(position, rotation, scale); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, new THREE.Color().setScalar(c.tint));
      });
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
    }
    return group;
  }
}
