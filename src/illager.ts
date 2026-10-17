import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

// Voxel reconstruction of the user's illager reference. Y=0 is the soles;
// the front faces +Z. Created with the other pieces and disposed by Board.
export function createIllager() {
  const figure = new Group(); figure.name = 'illager-robber';
  const materials = new Map<string, MeshStandardMaterial>();
  const block = (name: string, color: string, x: number, y: number, z: number, width: number, height: number, depth: number) => {
    let material = materials.get(color);
    if (!material) { material = new MeshStandardMaterial({ color, roughness: 1 }); materials.set(color, material); }
    const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
    mesh.name = name; mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = mesh.receiveShadow = true; figure.add(mesh); return mesh;
  };
  // Separated boots and a long dark tunic with collar, belt and front seam.
  for (const x of [-.044, .044]) block('boot', '#292d2b', x, 0, 0, .068, .105, .09);
  block('tunic', '#3d3630', 0, .10, 0, .17, .235, .115);
  block('tunic-front', '#493e33', 0, .12, .060, .046, .19, .009);
  block('collar', '#5b5144', 0, .305, .024, .115, .035, .09);
  block('belt', '#695b47', 0, .18, .004, .177, .026, .123);
  for (const x of [-.108, .108]) {
    block('sleeve', '#35322f', x, .195, 0, .047, .135, .12);
    block('hand', '#818189', x, .143, .003, .047, .052, .105);
  }
  // Oversized cubical head, characteristic stepped brow and long nose.
  block('head', '#939d9b', 0, .335, 0, .225, .245, .19);
  for (const side of [-1, 1]) {
    const x = side * .057;
    block('eye-white', '#e6e7df', x, .424, .097, .046, .040, .008);
    block('eye-green', '#34554b', x - side * .010, .424, .103, .019, .037, .008);
    block('brow', '#363c39', x, .466, .100, .060, .023, .011);
    block('brow-step', '#363c39', x + side * .013, .489, .100, .034, .017, .011);
  }
  block('nose-bridge', '#798583', 0, .413, .115, .054, .048, .047);
  block('long-nose', '#737e7e', 0, .322, .132, .054, .100, .080);
  figure.rotation.y = -.18;
  return figure;
}
