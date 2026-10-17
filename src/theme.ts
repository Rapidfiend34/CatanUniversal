import type { Resource } from './engine';
export type ThemeId = 'classic' | 'voxel';
export const THEME_KEY = 'isla-theme-v1';
export const THEME_NAMES: Record<ThemeId, string> = { classic: 'Isla Universal', voxel: 'Mundo de bloques' };
const labels: Record<ThemeId, Record<Resource, string>> = { classic: { wood: 'Madera', brick: 'Arcilla', sheep: 'Lana', wheat: 'Trigo', ore: 'Mineral' }, voxel: { wood: 'Bloque de madera', brick: 'Ladrillo', sheep: 'Oveja', wheat: 'Bala de paja', ore: 'Lingote de hierro' } };
let active: ThemeId = (() => { try { return localStorage.getItem(THEME_KEY) === 'voxel' ? 'voxel' : 'classic'; } catch { return 'classic'; } })();
export function theme() { return active; }
export function setTheme(next: ThemeId) { active = next; try { localStorage.setItem(THEME_KEY, next); } catch {} }
export function resourceName(resource: Resource) { return labels[active][resource]; }
export function themeLabel() { return THEME_NAMES[active]; }
