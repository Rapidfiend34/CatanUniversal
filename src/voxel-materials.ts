import { CanvasTexture, MeshStandardMaterial, NearestFilter, SRGBColorSpace, type Material } from 'three';

// Original 16 × 16 pixel art. One palette per surface, rather than a resource
// image stretched over the whole biome. No downloads are required offline.
export type Surface = 'grass' | 'grassSide' | 'dirt' | 'stone' | 'iron' | 'bark' | 'rings' | 'leaves' | 'planks' | 'clay' | 'brick' | 'sand' | 'sandstone' | 'water' | 'wool' | 'dark' | 'wheat' | 'hay' | 'cactus' | 'flower' | 'yellow';
const colors: Record<Surface, string[]> = {
  grass: ['#6ba93a', '#78b73f', '#85bd49', '#94c650', '#5e9634'],
  grassSide: ['#90633f', '#9d7049', '#ab7d50', '#805536'],
  dirt: ['#93623c', '#a67449', '#805333', '#b48655'],
  stone: ['#80898a', '#939b97', '#727d7d', '#a2a69c'],
  iron: ['#7e8786', '#8f9691', '#707c7c', '#b59776', '#d2b68d'],
  bark: ['#755332', '#896039', '#624329', '#a17642'],
  rings: ['#d8b276', '#eccb8e', '#c2975b', '#ab7a43'],
  leaves: ['#3f8832', '#4a9638', '#57a53c', '#348031', '#70b643'],
  planks: ['#b48b51', '#c79c5d', '#d1ab6d', '#98713e'],
  clay: ['#bc7652', '#c8845a', '#a46345', '#dc9767'],
  brick: ['#ae5f43', '#bf7250', '#d18b63', '#824b38'],
  sand: ['#d7c28a', '#e4d29a', '#dcca94', '#c7b37d'],
  sandstone: ['#c4a96f', '#d9bf84', '#bba16a', '#e2cc94'],
  water: ['#398aa5', '#439cb5', '#57adc2', '#367c9b'],
  wool: ['#e4e5d4', '#f2f0df', '#d6d8c9', '#f8f6e8'],
  dark: ['#3f4139', '#515044', '#353a34', '#686052'],
  wheat: ['#d4af36', '#e3c451', '#edcf5c', '#b79b31'],
  hay: ['#c7a33e', '#dfbb49', '#b29231', '#ecd16b'],
  cactus: ['#3a8548', '#499752', '#32753e', '#6faa50'],
  flower: ['#f7f1d9', '#fff9e8', '#e4dfc9', '#ffffff'],
  yellow: ['#e7bb3c', '#f1cd4b', '#dca628', '#ffe26d'],
};

function pixels(surface: Surface) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const palette = colors[surface];
  let seed = [...surface].reduce((n, c) => n * 31 + c.charCodeAt(0), 19) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const step = surface === 'grass' || surface === 'leaves' ? 4 : ['dirt', 'stone', 'clay', 'sand', 'wool'].includes(surface) ? 2 : 1;
  for (let y = 0; y < 16; y += step) for (let x = 0; x < 16; x += step) {
    let index = random() < .6 ? 0 : Math.floor(random() * palette.length);
    if (surface === 'bark') index = (Math.floor(x / 3) + (random() > .8 ? 1 : 0)) % palette.length;
    if (surface === 'rings') index = Math.floor(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) / 1.6) % palette.length;
    if (surface === 'planks' && y % 4 === 0) index = 3;
    if (surface === 'brick' && (y % 5 === 0 || (x + (Math.floor(y / 5) % 2) * 4) % 8 === 0)) index = 3;
    if (surface === 'hay') index = x % 6 === 0 ? 2 : Math.floor(random() * 2);
    if (surface === 'sandstone' && y % 6 === 0) index = 2;
    if (surface === 'cactus') index = x % 4 === 0 ? 2 : index;
    ctx.fillStyle = palette[index]; ctx.fillRect(x, y, step, step);
  }
  if (surface === 'grassSide') {
    for (let x = 0; x < 16; x++) { ctx.fillStyle = colors.grass[x % 4]; ctx.fillRect(x, 0, 1, 3 + Math.floor(random() * 3)); }
  }
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
  map.magFilter = map.minFilter = NearestFilter; map.generateMipmaps = false;
  return map;
}

export type Block = Exclude<Surface, 'grassSide' | 'rings'>;
export class VoxelMaterials {
  private surfaces = new Map<Surface, MeshStandardMaterial>();
  get(surface: Surface) {
    let material = this.surfaces.get(surface);
    if (!material) { material = new MeshStandardMaterial({ map: pixels(surface), roughness: 1 }); this.surfaces.set(surface, material); }
    return material;
  }
  block(kind: Block): Material | Material[] {
    if (kind === 'grass') return [this.get('grassSide'), this.get('grassSide'), this.get('grass'), this.get('dirt'), this.get('grassSide'), this.get('grassSide')];
    if (kind === 'bark') return [this.get('bark'), this.get('bark'), this.get('rings'), this.get('rings'), this.get('bark'), this.get('bark')];
    return this.get(kind);
  }
}
