import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, type Material } from 'three';
import { VoxelMaterials } from './voxel-materials';
import { cutLanding, islandCells, landingCutouts, polygonArea, type IslandKind, type Polygon } from './skyblock-connections';

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

  private build(name: string, parts: Map<Material | Material[], Part[]>, cutouts: Polygon[] = [], supportCutouts = cutouts) {
    const group = new Group(); group.name = name; const matrix = new Matrix4();
    for (const [material, blocks] of parts) {
      const whole: Part[] = [], positions: number[] = [], uvs: number[] = [];
      for (const p of blocks) {
        const rectangle = [{ x: p.x - p.w / 2, z: p.z - p.d / 2 }, { x: p.x + p.w / 2, z: p.z - p.d / 2 }, { x: p.x + p.w / 2, z: p.z + p.d / 2 }, { x: p.x - p.w / 2, z: p.z + p.d / 2 }];
        const polygons = cutLanding(rectangle, p.bottom < .245 ? supportCutouts : cutouts);
        if (Math.abs(polygons.reduce((area, polygon) => area + polygonArea(polygon), 0) - p.w * p.d) < 1e-10) { whole.push(p); continue; }
        for (const polygon of polygons) {
          const vertex = (index: number, y: number) => {
            const point = polygon[index]; positions.push(point.x, y, point.z);
            uvs.push((point.x - p.x) / p.w + .5, (point.z - p.z) / p.d + .5);
          };
          const top = p.bottom + p.h;
          for (let i = 1; i < polygon.length - 1; i++) {
            vertex(0, top); vertex(i + 1, top); vertex(i, top);
            vertex(0, p.bottom); vertex(i, p.bottom); vertex(i + 1, p.bottom);
          }
          for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            // Side UVs retain the grain vertically, including the cut ends.
            const offset = uvs.length;
            vertex(i, p.bottom); vertex(i, top); vertex(j, top);
            vertex(i, p.bottom); vertex(j, top); vertex(j, p.bottom);
            uvs.splice(offset, 12, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
          }
        }
      }
      const finish = (mesh: InstancedMesh) => { mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh); };
      if (whole.length) {
        const mesh = new InstancedMesh(this.box, material, whole.length);
        whole.forEach((p, index) => {
          matrix.makeScale(p.w, p.h, p.d); matrix.setPosition(p.x, p.bottom + p.h / 2, p.z); mesh.setMatrixAt(index, matrix);
          mesh.setColorAt(index, p.tint || new Color('#ffffff'));
        });
        finish(mesh);
      }
      if (positions.length) {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2)); geometry.computeVertexNormals();
        const mesh = new InstancedMesh(geometry, material, 1);
        mesh.setMatrixAt(0, new Matrix4()); mesh.setColorAt(0, blocks[0].tint || new Color('#ffffff')); finish(mesh);
      }
    }
    return group;
  }
  private add(parts: Map<Material | Material[], Part[]>, material: Material | Material[], x: number, bottom: number, z: number, w: number, h: number, d: number, tint?: Color) {
    const blocks = parts.get(material) || []; parts.set(material, blocks); blocks.push({ x, bottom, z, w, h, d, tint });
  }

  bridge(playerColor: string, angle = 0, ends: readonly [IslandKind, IslandKind] = ['junction', 'junction']) {
    const parts = new Map<Material | Material[], Part[]>(), paint = new Color(playerColor);
    const cutouts = landingCutouts(angle, ends);
    const plank = this.textures.get('teamPlanks'), wood = this.textures.get('planks');
    // Boards reach the landings and are cut to their exact rotated outlines.
    for (let i = 0; i < 9; i++) this.add(parts, plank, -4 / 9 + i / 9, .245, 0, 1 / 9 - .002, .055, .22, paint);
    for (const z of [-.077, .077]) this.add(parts, wood, 0, .213, z, 1, .032, .030);
    const left = Math.max(...cutouts.slice(0, islandCells(ends[0]).length).flatMap(p => p.map(v => v.x))) + .045;
    const right = Math.min(...cutouts.slice(islandCells(ends[0]).length).flatMap(p => p.map(v => v.x))) - .045;
    for (const x of [left, right]) for (const z of [-.105, .105]) this.add(parts, wood, x, .30, z, .027, .135, .027);
    for (const z of [-.105, .105]) this.add(parts, wood, (left + right) / 2, .395, z, right - left + .027, .023, .024);
    // A small hanging lantern, lit by its material rather than extra lights.
    this.add(parts, wood, right, .435, -.105, .027, .12, .027);
    this.add(parts, wood, right, .53, -.073, .027, .025, .09);
    this.add(parts, this.metal, right, .488, -.035, .009, .045, .009);
    this.add(parts, this.light, right, .439, -.035, .040, .048, .040);
    for (const y of [.433, .487]) this.add(parts, this.metal, right, y, -.035, .050, .008, .050);
    for (const x of [right - .022, right + .022]) for (const z of [-.057, -.013]) this.add(parts, this.metal, x, .441, z, .006, .044, .006);
    return this.build('skyblock-bridge', parts, cutouts, landingCutouts(angle, ends, true));
  }

  junction() {
    const parts = new Map<Material | Material[], Part[]>();
    for (const { x, z, size } of islandCells('junction')) this.add(parts, this.grass, x, .24, z, size, .06, size);
    const dirt = this.textures.get('dirt'), stone = this.textures.get('stone');
    for (const x of [-.05, .05]) for (const z of [-.05, .05]) this.add(parts, dirt, x, .14, z, .10, .10, .10);
    this.add(parts, stone, .005, .075, 0, .14, .065, .14);
    this.add(parts, stone, .015, .035, .01, .07, .04, .07);
    this.add(parts, this.textures.get('leaves'), -.085, .30, .07, .018, .035, .018);
    return this.build('skyblock-road-junction', parts);
  }
}
