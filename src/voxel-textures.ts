import type { Resource } from './engine';
import { CanvasTexture, NearestFilter } from 'three';

const palettes: Record<Resource | 'desert', [string, string, string]> = {
  wood: ['#356b3d', '#4d8b48', '#80a95c'], brick: ['#9b5b4e', '#b87159', '#d39470'], sheep: ['#9eae88', '#b9c9a5', '#d8dfc7'], wheat: ['#a98736', '#c6a94c', '#e0c665'], ore: ['#596e74', '#71868a', '#a0afb0'], desert: ['#a88654', '#c3a46a', '#dfc484'],
};
export function voxelTexture(resource: Resource | 'desert'): CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!; const [base, light, accent] = palettes[resource];
  ctx.fillStyle = base; ctx.fillRect(0, 0, 32, 32);
  const seed = resource.length * 17 + resource.charCodeAt(0);
  for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x += 4) {
    const n = (x * 13 + y * 7 + seed) % 11;
    if (n < 4) { ctx.fillStyle = light; ctx.fillRect(x, y, 3, 3); }
    else if (n === 7 || n === 9) { ctx.fillStyle = accent; ctx.fillRect(x + 1, y + 1, 2, 2); }
  }
  if (resource === 'brick') { ctx.strokeStyle = '#7e4b45'; ctx.lineWidth = 2; for (let y = 8; y < 32; y += 8) ctx.strokeRect(0, y, 32, 8); for (let y = 0; y < 32; y += 16) for (let x = 8; x < 32; x += 16) ctx.fillRect(x, y, 2, 8); }
  if (resource === 'ore') { ctx.fillStyle = '#d6c17a'; for (const [x, y] of [[6, 8], [21, 6], [14, 22], [26, 26]]) ctx.fillRect(x, y, 4, 4); }
  if (resource === 'wheat') { ctx.fillStyle = '#e3ca62'; for (let x = 3; x < 32; x += 7) { ctx.fillRect(x, 5, 2, 23); ctx.fillRect(x + 2, 7, 3, 2); ctx.fillRect(x + 2, 12, 3, 2); } }
  if (resource === 'wood') { ctx.fillStyle = '#234f32'; for (let x = 4; x < 32; x += 9) ctx.fillRect(x, 3, 3, 26); }
  if (resource === 'sheep') { ctx.fillStyle = '#f0f2df'; ctx.fillRect(4, 5, 8, 7); ctx.fillRect(18, 16, 9, 7); }
  const texture = new CanvasTexture(canvas); texture.colorSpace = 'srgb'; texture.magFilter = NearestFilter; texture.minFilter = NearestFilter; return texture;
}
