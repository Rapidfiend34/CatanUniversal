import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, type Material } from 'three';
import { VoxelMaterials } from './voxel-materials';

type Part = { x: number; y: number; z: number; w: number; h: number; d: number; tint?: Color };
// Shared surface maps for all buildings in one Board.update. Each house uses
// a handful of instanced batches rather than a draw call for every little beam.
export class VillageHouses {
  private textures = new VoxelMaterials();
  private box = new BoxGeometry(1, 1, 1);
  private plaster = new MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  private glass = new MeshStandardMaterial({ color: '#ffedb0', emissive: '#edc466', emissiveIntensity: .25, roughness: .6 });
  private metal = new MeshStandardMaterial({ color: '#525958', roughness: .8 });

  create(playerColor: string, city = false) {
    const house = new Group(); house.name = city ? 'voxel-village-city' : 'voxel-village-settlement';
    const batches = new Map<Material | Material[], Part[]>();
    const surfaces = { wall: this.plaster, log: this.textures.block('bark'), roof: this.textures.get('planks'), stone: this.textures.get('stone'), grass: this.textures.block('grass'), dirt: this.textures.get('dirt'), leaf: this.textures.get('leaves'), flower: this.textures.get('flower'), yellow: this.textures.get('yellow'), glass: this.glass, metal: this.metal };
    const block = (kind: keyof typeof surfaces, x: number, bottom: number, z: number, w: number, h: number, d: number, tint?: Color) => {
      const material = surfaces[kind], parts = batches.get(material) || []; batches.set(material, parts);
      parts.push({ x, y: bottom + h / 2, z, w, h, d, tint });
    };
    const paint = new Color(playerColor);
    // Stone foundations and two-storey plaster walls, subtly varied in blocks.
    block('stone', 0, 0, 0, .30, .055, .29);
    for (let row = 0; row < 5; row++) for (let column = 0; column < 4; column++) {
      const tint = paint.clone().offsetHSL(0, -.05, ((row + column) % 3 - 1) * .025);
      block('wall', -.098 + column * .065, .055 + row * .055, 0, .065, .055, .25, tint);
    }
    for (const x of [-.137, .137]) for (const z of [-.13, .13]) block('log', x, .045, z, .027, .30, .027);
    for (const z of [-.139, .139]) block('roof', 0, .178, z, .29, .021, .017);
    // Front doorway, tiny stoop and a stepped porch roof.
    block('log', -.055, .043, .14, .065, .125, .018);
    block('metal', -.033, .10, .152, .009, .012, .006);
    block('stone', -.055, .005, .176, .11, .025, .075);
    for (const x of [-.11, 0]) block('log', x, .025, .177, .018, .15, .018);
    block('roof', -.055, .165, .17, .15, .025, .10);
    block('roof', -.055, .19, .16, .10, .022, .10);
    block('roof', -.055, .212, .15, .05, .022, .10);
    // Small suspended lantern beside the entrance.
    block('metal', .040, .132, .160, .008, .030, .008);
    block('glass', .040, .100, .160, .025, .031, .025);
    block('metal', .040, .095, .160, .030, .006, .030);
    block('metal', .040, .131, .160, .030, .006, .030);
    const window = (side: boolean, bottom: number) => {
      if (!side) {
        block('roof', 0, bottom, .134, .075, .065, .012);
        block('glass', 0, bottom + .008, .143, .052, .048, .009);
        for (const x of [-.052, .052]) block('log', x, bottom, .146, .023, .065, .015);
        block('roof', 0, bottom - .030, .152, .086, .025, .037);
        block('leaf', 0, bottom - .009, .156, .090, .014, .042);
        for (const x of [-.023, .023]) { block('flower', x, bottom + .006, .157, .012, .008, .012); block('yellow', x, bottom + .014, .157, .005, .004, .005); }
      } else {
        block('roof', .134, bottom, 0, .012, .067, .080);
        block('glass', .143, bottom + .008, 0, .009, .049, .056);
        for (const z of [-.055, .055]) block('log', .146, bottom, z, .015, .067, .026);
        block('roof', .152, bottom - .030, 0, .037, .025, .092);
        block('leaf', .156, bottom - .009, 0, .042, .014, .095);
        for (const z of [-.025, .025]) { block('flower', .157, bottom + .006, z, .012, .008, .012); block('yellow', .157, bottom + .014, z, .005, .004, .005); }
      }
    };
    window(false, .245); window(true, .095);
    // Broad overhang and five ascending roof courses, following the reference.
    for (let level = 0; level < 5; level++) {
      const width = .365 - level * .063;
      block('roof', 0, .33 + level * .029, 0, width, .029, .35);
    }
    block('stone', -.092, .39, -.087, .052, .14, .052);
    block('log', -.092, .53, -.087, .064, .025, .064);
    if (city) {
      // Keep upgrades unmistakable: a tall stone annex with player-colour trim.
      block('stone', .185, 0, -.035, .105, .48, .13);
      block('wall', .185, .30, .033, .110, .075, .009, paint);
      block('glass', .185, .405, .033, .035, .045, .012);
      block('roof', .185, .48, -.035, .145, .035, .17);
      block('roof', .185, .515, -.035, .085, .035, .17);
      block('roof', .185, .55, -.035, .030, .025, .17);
    }
    // Raise the existing house onto a small floating Skyblock island. The
    // lowest stone sits above road height, keeping the board's edges clear.
    const houseLift = .30;
    for (const parts of batches.values()) for (const part of parts) part.y += houseLift;
    for (let x = -2; x <= (city ? 3 : 2); x++) for (let z = -2; z <= 2; z++) {
      if (Math.abs(x) === 2 && Math.abs(z) === 2 || x === 3 && Math.abs(z) > 1) continue;
      block('grass', x * .09, .245, z * .09, .09, .055, .09);
    }
    // Individual soil cubes keep the pixel texture square on the exposed sides.
    const columns = city ? 5 : 4;
    for (let x = 0; x < columns; x++) for (let z = 0; z < 4; z++) {
      block('dirt', (x - (columns - 1) / 2) * .09 + (city ? .025 : 0), .185, (z - 1.5) * .09, .09, .06, .09);
    }
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) block('dirt', x * .09 - .015, .135, z * .09 - .01, .09, .05, .09);
    block('stone', .02, .105, .01, .19, .05, .19);
    block('stone', .045, .09, .025, .10, .03, .11);
    block('dirt', -.175, .185, .09, .07, .035, .09);
    block('stone', .12, .16, -.105, .08, .035, .07);
    // Tiny plants at the edge leave the doorstep and player-coloured walls open.
    for (const [x, z] of [[-.17, .15], [.16, .17], [-.17, -.15]]) {
      block('leaf', x, houseLift, z, .025, .035, .025);
      block('flower', x, houseLift + .035, z, .018, .008, .018);
      block('yellow', x, houseLift + .043, z, .006, .004, .006);
    }
    block('leaf', -.209, .20, .035, .016, .065, .055);
    const matrix = new Matrix4();
    for (const [material, parts] of batches) {
      const mesh = new InstancedMesh(this.box, material, parts.length);
      parts.forEach((p, index) => {
        matrix.makeScale(p.w, p.h, p.d); matrix.setPosition(p.x, p.y, p.z); mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, p.tint || new Color('#ffffff'));
      });
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); house.add(mesh);
    }
    return house;
  }
}
