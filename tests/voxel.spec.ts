import { test, expect } from '@playwright/test';
import { newGame, legalSettlements, legalRoads } from '../src/engine';

const players = [{ name: 'Ana', bot: false }, { name: 'Luis', bot: false }, { name: 'Eva', bot: false }];
// These scenarios rebuild detailed maps repeatedly using software WebGL in CI.
test.setTimeout(90000);

test('rebuilt voxel map preserves games across theme switches and allows real board construction', async ({ page }) => {
  const game = newGame(players);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(saved => localStorage.setItem('isla-universal-v1', saved), JSON.stringify(game));
  await page.goto('/');
  for (const id of ['voxel', 'classic', 'voxel']) {
    await page.locator('[data-act="settings"]:visible').click();
    await page.locator(`[data-act="theme"][data-theme="${id}"]`).click();
    await expect(page.locator('#board')).toHaveAttribute('data-map-style', id);
    await expect(page.locator(`[data-act="theme"][data-theme="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as any).__isla.state)).toEqual(game);
  }
  await page.reload();
  await expect(page.locator('#board')).toHaveAttribute('data-map-style', 'voxel');
  const vertex = legalSettlements(game).find(id => {
    const v = game.vertices[id]; return v.x > 0 && v.z > 0;
  })!;
  const point = await page.evaluate(id => (window as any).__isla.project('settlement', id), vertex);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => (window as any).__isla.state.phase)).toBe('setup-road');
  const next = await page.evaluate(() => (window as any).__isla.state);
  expect(next.vertices[vertex].owner).toBe(0);
  const road = legalRoads(next)[0];
  const roadPoint = await page.evaluate(id => (window as any).__isla.project('road', id), road);
  await page.mouse.click(roadPoint.x, roadPoint.y);
  await expect.poll(() => page.evaluate(id => (window as any).__isla.state.edges[id].owner, road)).toBe(0);
  expect(errors).toEqual([]);
});

test('mobile expanded voxel board renders, inspects tiles and keeps settings within the viewport', async ({ page }) => {
  const game = newGame([...players, { name: 'Noa', bot: false }, { name: 'Leo', bot: false }], Math.random, 'expanded');
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(saved => { localStorage.setItem('isla-universal-v1', saved); localStorage.setItem('isla-theme-v1', 'voxel'); }, JSON.stringify(game));
  await page.goto('/');
  await expect(page.locator('#render-error')).toBeHidden();
  await expect(page.locator('#board')).toHaveAttribute('data-map-style', 'voxel');
  // Click a visible number badge. The randomly generated centre may be an
  // unlabelled desert, whose projected clearing can be occluded by scenery.
  const id = game.tiles.filter(t => t.number).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0].id;
  const point = await page.evaluate(id => (window as any).__isla.project('tile', id), id);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#tile-info')).toBeVisible();
  await expect(page.locator('#tile-info')).toContainText(`PARCELA ${id + 1}`);
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('button', { name: /Mundo de bloques/ })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/biomes/mobile-expanded.png' });
});
