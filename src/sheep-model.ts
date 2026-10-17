import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, type Material } from 'three';
import { VoxelMaterials } from './voxel-materials';

type Part = { x: number; bottom: number; z: number; w: number; h: number; d: number };

// Reference-based sheep with a wool-covered cubical head, beige face,
// outward-facing black pupils, pink muzzle and four separate hooves.
// Materials are shared across the map; Board disposes them with the terrain.
export class SheepModels {
  private box = new BoxGeometry(1, 1, 1);
  private wool = new VoxelMaterials().get('wool');
  private skin = new MeshStandardMaterial({ color: '#b18b67', roughness: 1 });
  private hoof = new MeshStandardMaterial({ color: '#463a2b', roughness: 1 });
  private white = new MeshStandardMaterial({ color: '#f7f4e9', roughness: 1 });
  private black = new MeshStandardMaterial({ color: '#292b25', roughness: 1 });
  private pink = new MeshStandardMaterial({ color: '#d89499', roughness: 1 });

  create() {
    const sheep = new Group(); sheep.name = 'reference-sheep';
    const batches = new Map<Material, Part[]>();
    const block = (material: Material, x: number, bottom: number, z: number, w: number, h: number, d: number) => {
      const parts = batches.get(material) || []; batches.set(material, parts); parts.push({ x, bottom, z, w, h, d });
    };
    // Four tan legs, dark hooves, and the fleece hanging over their tops.
    for (const x of [-.061, .061]) for (const z of [-.09, .09]) {
      block(this.hoof, x, 0, z, .036, .025, .038);
      block(this.skin, x, .025, z, .035, .069, .037);
      block(this.wool, x, .073, z, .047, .047, .050);
    }
    block(this.wool, 0, .088, 0, .183, .153, .275);
    block(this.wool, 0, .111, .170, .137, .151, .118);
    block(this.skin, 0, .131, .232, .105, .104, .012);
    // Small white cheeks preserve the characteristic Minecraft sheep face.
    for (const side of [-1, 1]) {
      block(this.white, side * .056, .119, .236, .022, .044, .014);
      block(this.white, side * .034, .183, .241, .032, .031, .007);
      block(this.black, side * .045, .183, .246, .016, .028, .007);
    }
    block(this.pink, 0, .137, .242, .039, .032, .012);
    block(this.pink, 0, .127, .243, .027, .013, .012);
    const matrix = new Matrix4();
    for (const [material, parts] of batches) {
      const mesh = new InstancedMesh(this.box, material, parts.length);
      parts.forEach((p, index) => { matrix.makeScale(p.w, p.h, p.d); matrix.setPosition(p.x, p.bottom + p.h / 2, p.z); mesh.setMatrixAt(index, matrix); });
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); sheep.add(mesh);
    }
    return sheep;
  }
}
