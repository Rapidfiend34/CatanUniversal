import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, type Material } from 'three';
import { VoxelMaterials } from './voxel-materials';

export const SKYBLOCK_WALK_Y = .73;
export const SKYBLOCK_VERTEX_Y = .76;
type Part = { x: number; bottom: number; z: number; w: number; h: number; d: number; tint?: Color };

// Both houses and junctions have their grass at local Y=.30, translated by
// Board to Y=.43. Neutral supports are shared per vertex, not per road owner.
export class SkyblockRoads {
  private textures = new VoxelMaterials();
  private box = new BoxGeometry(1, 1, 1);
  private metal = new MeshStandardMaterial({ color: '#4b5352', roughness: .8 });
  private light = new MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffc35c', emissiveIntensity: .7, roughness: .65 });
  private grass = this.textures.block('grass');

  private build(name: string, parts: Map<Material | Material[], Part[]>) {
    const group = new Group(); group.name = name; const matrix = new Matrix4();
    for (const [material, blocks] of parts) {
      const mesh = new InstancedMesh(this.box, material, blocks.length);
      blocks.forEach((p, index) => {
        matrix.makeScale(p.w, p.h, p.d); matrix.setPosition(p.x, p.bottom + p.h / 2, p.z); mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, p.tint || new Color('#ffffff'));
      });
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
    }
    return group;
  }
  private add(parts: Map<Material | Material[], Part[]>, material: Material | Material[], x: number, bottom: number, z: number, w: number, h: number, d: number, tint?: Color) {
    const blocks = parts.get(material) || []; parts.set(material, blocks); blocks.push({ x, bottom, z, w, h, d, tint });
  }

  bridge(playerColor: string) {
    const parts = new Map<Material | Material[], Part[]>(), paint = new Color(playerColor);
    const plank = this.textures.get('teamPlanks'), wood = this.textures.get('planks');
    // Nine individual boards preserve a timber grain in the player's colour.
    for (let i = 0; i < 9; i++) this.add(parts, plank, -.324 + i * .081, .245, 0, .079, .055, .22, paint);
    for (const z of [-.077, .077]) this.add(parts, wood, 0, .213, z, .73, .032, .030);
    for (const x of [-.25, .25]) for (const z of [-.105, .105]) this.add(parts, wood, x, .30, z, .027, .135, .027);
    for (const z of [-.105, .105]) this.add(parts, wood, 0, .395, z, .53, .023, .024);
    // A small hanging lantern, lit by its material rather than extra lights.
    this.add(parts, wood, .25, .435, -.105, .027, .12, .027);
    this.add(parts, wood, .25, .53, -.073, .027, .025, .09);
    this.add(parts, this.metal, .25, .488, -.035, .009, .045, .009);
    this.add(parts, this.light, .25, .439, -.035, .040, .048, .040);
    for (const y of [.433, .487]) this.add(parts, this.metal, .25, y, -.035, .050, .008, .050);
    for (const x of [.228, .272]) for (const z of [-.057, -.013]) this.add(parts, this.metal, x, .441, z, .006, .044, .006);
    return this.build('skyblock-bridge', parts);
  }

  junction() {
    const parts = new Map<Material | Material[], Part[]>();
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) this.add(parts, this.grass, x * .10, .24, z * .10, .10, .06, .10);
    const dirt = this.textures.get('dirt'), stone = this.textures.get('stone');
    for (const x of [-.05, .05]) for (const z of [-.05, .05]) this.add(parts, dirt, x, .14, z, .10, .10, .10);
    this.add(parts, stone, .005, .075, 0, .14, .065, .14);
    this.add(parts, stone, .015, .035, .01, .07, .04, .07);
    this.add(parts, this.textures.get('leaves'), -.085, .30, .07, .018, .035, .018);
    return this.build('skyblock-road-junction', parts);
  }
}
