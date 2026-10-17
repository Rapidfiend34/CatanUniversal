import { test, expect, type Page } from '@playwright/test';
import { newGame, execute, legalSettlements, legalRoads, RESOURCES } from '../src/engine';
import type { RoomView } from '../src/online/types';

function fixture() {
  let game = newGame([{ name: 'Ana', bot: false }, { name: 'Luis', bot: false }, { name: 'Eva', bot: false }]);
  while (game.phase.startsWith('setup')) game = execute(game, game.phase === 'setup-settlement' ? { type: 'settlement', id: legalSettlements(game)[0] } : { type: 'road', id: legalRoads(game)[0] });
  game = execute(game, { type: 'roll' }, () => .1);
  game.players[0].hand = { wood: 2, brick: 0, sheep: 1, wheat: 1, ore: 1 };
  game.players[1].hand.sheep = 2;
  for (const r of RESOURCES) game.bank[r] = 19 - game.players.reduce((sum, p) => sum + p.hand[r], 0);
  return game;
}
const quantity = (page: Page, name: string) => page.locator('.trade-quantity').filter({ has: page.locator(`input[name="${name}"]`) });
async function openOffer(page: Page) {
  await page.locator('[data-act="trade"]').click();
  await page.locator('[data-trade-tab="players"]').click();
}

test('trade buttons respect own stock, reset both sides and submit the selected amounts with explicit consent', async ({ page }) => {
  const game = fixture();
  await page.addInitScript(saved => localStorage.setItem('isla-universal-v1', saved), JSON.stringify(game));
  await page.goto('/'); await openOffer(page);
  await expect(page.locator('#offer-form input[type="number"]')).toHaveCount(0);
  const wood = quantity(page, 'give-wood'), asked = quantity(page, 'receive-sheep');
  await expect(wood.locator('[data-act="offer-decrease"]')).toBeDisabled();
  await expect(quantity(page, 'give-brick').locator('[data-act="offer-increase"]')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Proponer intercambio' })).toBeDisabled();
  await wood.locator('[data-act="offer-increase"]').click({ clickCount: 2 });
  await expect(wood.locator('output')).toHaveText('2');
  await expect(wood.locator('[data-act="offer-increase"]')).toBeDisabled();
  await wood.locator('[data-act="offer-decrease"]').click();
  await expect(wood.locator('output')).toHaveText('1');
  await asked.locator('[data-act="offer-increase"]').click();
  await expect(page.getByRole('button', { name: 'Proponer intercambio' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reiniciar selección del intercambio' }).click();
  for (const output of await page.locator('#offer-form output').all()) await expect(output).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Proponer intercambio' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reiniciar selección del intercambio' })).toBeDisabled();
  await wood.locator('[data-act="offer-increase"]').focus(); await page.keyboard.press('Space');
  await asked.locator('[data-act="offer-increase"]').click();
  await page.locator('#offer-form').screenshot({ path: 'test-results/trade-click-controls-desktop.png' });
  expect(await page.evaluate(() => (window as any).__isla.state)).toEqual(game);
  await page.getByRole('button', { name: 'Proponer intercambio' }).click();
  const pending = await page.evaluate(() => (window as any).__isla.state);
  expect(pending.pendingTrade.give.wood).toBe(1); expect(pending.pendingTrade.receive.sheep).toBe(1);
  expect(pending.players.map((p: any) => p.hand)).toEqual(game.players.map(p => p.hand));
  await page.getByRole('button', { name: 'Aceptar intercambio' }).click();
  const after = await page.evaluate(() => (window as any).__isla.state);
  expect(after.players[0].hand.wood).toBe(1); expect(after.players[0].hand.sheep).toBe(2);
});

test('mobile online controls stay within the viewport and never rely on private rival resources', async ({ page }) => {
  const game = fixture(); game.players[1].hand = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const view: RoomView = { code: 'TRAD234', mode: 'online', capacity: 3, version: 1, gameVersion: 1, expiresAt: Date.now() + 3600000, isHost: true, self: 0, screen: false, seats: game.players.map(p => ({ name: p.name, color: p.color, ready: true })), game, cardCounts: [5, 7, 3], devCounts: [0, 0, 0], deckCount: game.deck.length, scores: [2, 2, 2], preview: 'inspect' };
  await page.route('**/api/rooms**', route => route.fulfill({ json: view }));
  await page.addInitScript(() => { localStorage.setItem('isla-room-player-TRAD234', JSON.stringify({ code: 'TRAD234', token: 'a'.repeat(64), screen: false })); localStorage.setItem('isla-theme-v1', 'voxel'); });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?room=TRAD234');
  await expect.poll(() => page.evaluate(() => (window as any).__isla.room?.code)).toBe('TRAD234');
  await openOffer(page);
  await quantity(page, 'give-wood').locator('[data-act="offer-increase"]').click();
  await quantity(page, 'receive-sheep').locator('[data-act="offer-increase"]').click();
  await expect(quantity(page, 'receive-sheep').locator('output')).toHaveText('1');
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/trade-click-controls-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Reiniciar selección del intercambio' }).click();
  await expect(quantity(page, 'give-wood').locator('output')).toHaveText('0');
  await expect(quantity(page, 'receive-sheep').locator('output')).toHaveText('0');
});
