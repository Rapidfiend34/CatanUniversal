// Original pixel sprites, drawn on a 32 × 32 grid. Kept inline so costs,
// exchanges and cards use the same artwork without network requests.
const path = (fill: string, d: string) => `<path fill="${fill}" d="${d}"/>`;
const rect = (fill: string, x: number, y: number, w: number, h: number) => `<rect fill="${fill}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;

const wood =
  path('#543820', 'M16 1 30 9v15L16 32 2 24V9Z') +
  path('#926337', 'M3 10 16 17v13L3 23Z') + path('#694626', 'M16 17 29 10v13l-13 7Z') +
  path('#b68145', 'M4 12v10l2 1V13Zm5 3v10l2 1V16Zm4 2v11l2 1V18Z') +
  path('#9a6a37', 'M18 17v11l2-1V16Zm5-3v11l2-1V13Z') +
  path('#e1bb7d', 'M16 3 28 9l-12 7L4 9Z') +
  path('#ad7e45', 'M16 5 24 9l-8 5-8-5Z') +
  path('#eccb92', 'M16 7 21 9l-5 3-5-3Z') + rect('#b68a50', 15, 8, 3, 2);

const wheat =
  path('#715023', 'M16 1 30 9v15L16 32 2 24V9Z') +
  path('#d7a12f', 'M3 10 16 17v13L3 23Z') + path('#ab7c24', 'M16 17 29 10v13l-13 7Z') +
  path('#f5d369', 'M16 3 28 9l-12 7L4 9Z') +
  path('#e7bb47', 'm7 9 10-5 2 1L9 10Zm5 3 10-5 2 1-10 5Z') +
  path('#f4c84f', 'M5 12v10l2 1V13Zm5 3v10l2 1V16Z') +
  path('#d5a33c', 'M18 18v10l2-1V17Zm6-3v9l2-1V14Z') +
  path('#9b3e29', 'm3 13 13 7 13-7v3l-13 7-13-7Zm0 7 13 7 13-7v3l-13 7-13-7Z') +
  path('#b95030', 'm9 6 13 7 3-2L12 4Z');

const sheep =
  path('#3b3b35', 'M5 19h5v10H5Zm14 1h5v10h-5Zm-8-1h4v8h-4Zm15-2h4v9h-4Z') +
  rect('#686354', 6, 24, 3, 3) + rect('#686354', 20, 25, 3, 3) +
  path('#a9b0a5', 'M2 10 16 4l13 6v11l-14 6-13-6Z') +
  path('#f6f3e3', 'M3 10 16 5l12 5-13 6Z') +
  path('#dddccd', 'M3 11 15 17v9L3 20Z') + path('#bfc5b8', 'm15 17 13-6v9l-13 6Z') +
  rect('#f5f1e2', 5, 13, 4, 5) + rect('#ebe9da', 10, 17, 3, 5) +
  path('#e9e7d8', 'm7 10 5-2 4 2-5 2Zm10-3 6 3-4 2-5-3Z') +
  path('#756b5b', 'm21 12 6-2 5 3v9l-7 3-5-3v-8Z') +
  path('#a1937b', 'm22 13 5-2 4 3-6 2Z') + path('#8b7d67', 'm21 15 4 2v7l-4-3Z') +
  rect('#eee9dc', 26, 16, 5, 3) + rect('#252c28', 27, 17, 2, 2) +
  rect('#c1a18e', 26, 21, 4, 2);

const brick =
  path('#623a2b', 'm2 14 19-9 9 5v9l-19 9-9-5Z') +
  path('#b46140', 'm3 15 8 5v7l-8-5Z') + path('#994a32', 'm11 20 18-9v7l-18 9Z') +
  path('#de9163', 'm3 14 18-8 8 4-18 9Z') +
  path('#f0ac78', 'm6 14 15-6 3 2-15 6Z') +
  path('#bd6b47', 'm16 15 10-4 2 1-10 5Z') +
  path('#d57d51', 'm13 21 6-3v2l-6 3Zm9-4 5-2v2l-5 2Z') + rect('#e19565', 5, 17, 2, 3);

const ore =
  path('#424d51', 'm2 15 5-7 16-5 7 5v11l-19 9-9-5Z') +
  path('#aebfc1', 'm3 16 8 4v7l-8-5Z') + path('#7e929a', 'm11 20 18-9v7l-18 9Z') +
  path('#e7f0e9', 'm3 15 5-6 15-5 6 5-18 10Z') +
  path('#ffffff', 'm8 10 14-4 3 2-15 6Z') +
  path('#c6d6d4', 'm13 15 11-5 3 1-14 7Z') +
  path('#dce5df', 'm13 21 13-6v2l-13 6Z') + rect('#f6f8ee', 5, 17, 2, 4);

const sprites: Record<string, string> = { wood, wheat, sheep, brick, ore };
export function voxelResourceIcon(name: string, size: number): string | null {
  const sprite = sprites[name];
  return sprite ? `<svg class="voxel-resource-icon" data-resource="${name}" width="${size}" height="${size}" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">${sprite}</svg>` : null;
}
