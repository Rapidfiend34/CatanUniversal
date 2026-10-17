import wood from './assets/resources/wood.png';
import wheat from './assets/resources/wheat.png';
import sheep from './assets/resources/sheep.png';
import brick from './assets/resources/brick.png';
import ore from './assets/resources/ore.png';

// User-supplied PNG originals. Vite fingerprints them and the PWA precaches
// emitted assets. The SVG wrapper preserves sizing in costs and resource rows.
const sprites: Record<string, string> = { wood, wheat, sheep, brick, ore };
export function voxelResourceIcon(name: string, size: number): string | null {
  const source = sprites[name];
  return source ? `<svg class="voxel-resource-icon" data-resource="${name}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><image href="${source}" width="32" height="32" preserveAspectRatio="xMidYMid meet"/></svg>` : null;
}
