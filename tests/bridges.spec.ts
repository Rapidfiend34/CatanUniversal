import { test, expect } from '@playwright/test';
import { newGame, execute, legalSettlements, legalRoads } from '../src/engine';

test('bridges use owner colours and share a single free junction, replaced by a building when occupied', async ({ page }) => {
  test.setTimeout(90000);
  let game = newGame([{ name: 'Ana', bot: false }, { name: 'Luis', bot: false }, { name: 'Eva', bot: false }]);
  while (game.phase.startsWith('setup')) game = execute(game, game.phase === 'setup-settlement' ? { type: 'settlement', id: legalSettlements(game)[0] } : { type: 'road', id: legalRoads(game)[0] });
  game = execute(game, { type: 'roll' }, () => .1);
  for (let i = 0; i < 2; i++) {
    for (const resource of ['wood', 'brick'] as const) if (!game.players[0].hand[resource]) { game.players[0].hand[resource]++; game.bank[resource]--; }
    game = execute(game, { type: 'road', id: legalRoads(game)[0] });
  }
  await page.addInitScript(() => localStorage.setItem('isla-theme-v1', 'voxel'));
  await page.goto('/');
  const result = await page.evaluate(async saved => {
    const { Board } = await import('/src/board.ts');
    const { Color } = await import('/node_modules/.vite/deps/three.js');
    document.querySelector<HTMLElement>('#app')!.style.display = 'none';
    const host = document.createElement('div'); host.style.cssText = 'width:1000px;height:700px'; document.body.append(host);
    const board = new Board(host); board.create(saved);
    const roads = board.pieces.children.filter(o => o.name === 'skyblock-bridge');
    const expected = [...new Set(saved.edges.filter(e => e.owner !== null).flatMap(e => [e.a, e.b]))].filter(id => saved.vertices[id].owner === null).sort((a, b) => a - b);
    const actual = board.pieces.children.filter(o => o.name === 'skyblock-road-junction').map(o => o.userData.vertex).sort((a, b) => a - b);
    const colorsMatch = roads.every(road => {
      const mesh = road.children[0] as any, color = new Color(), expectedColor = new Color(saved.players[road.userData.owner].color); mesh.getColorAt(0, color);
      return Math.abs(color.r - expectedColor.r) < .00001 && Math.abs(color.g - expectedColor.g) < .00001 && Math.abs(color.b - expectedColor.b) < .00001;
    });
    const free = expected[0];
    saved.vertices[free].owner = 0; board.update(saved, 'inspect', false);
    const replaced = !board.pieces.children.some(o => o.name === 'skyblock-road-junction' && o.userData.vertex === free);
    board.dispose(); host.remove();
    return { roadCount: roads.length, expected, actual, colorsMatch, replaced };
  }, game);
  expect(result.roadCount).toBe(game.edges.filter(e => e.owner !== null).length);
  expect(result.actual).toEqual(result.expected); expect(result.expected.length).toBeGreaterThan(0);
  expect(result.colorsMatch).toBe(true); expect(result.replaced).toBe(true);
});
