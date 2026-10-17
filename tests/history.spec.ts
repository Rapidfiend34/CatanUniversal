import { test, expect } from '@playwright/test';
import { newGame } from '../src/engine';
import type { RoomView } from '../src/online/types';

function fixture() {
  const game = newGame([{ name: 'Lucía', bot: false }, { name: 'Mateo', bot: false }, { name: 'Eva', bot: false }]);
  game.log = [
    'Mateo gana con 10 puntos.', 'Lucía propone un intercambio a Mateo.',
    'Mateo acepta: Lucía intercambia recursos con Mateo.', 'Eva convierte un poblado en ciudad.',
    'Mateo funda un poblado.', 'Lucía construye una carretera.', 'Mateo lanza los dados: 7.',
    'Lucía compra una carta de desarrollo.', 'Turno de Eva.', 'Una nueva isla. Una historia por construir.',
  ];
  return game;
}

test('visual history filters old saves by category and participant, handles empty results and resets', async ({ page }) => {
  const game = fixture();
  await page.addInitScript(saved => localStorage.setItem('isla-universal-v1', saved), JSON.stringify(game));
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver historial completo' }).click();
  const events = page.locator('.history-event');
  await expect(events).toHaveCount(10);
  await expect(events.first()).toContainText('Mateo gana con 10 puntos.');
  await page.locator('[data-history-category="trade"]').click();
  await page.getByRole('combobox', { name: 'Filtrar historial por jugador' }).selectOption('1');
  await expect(events).toHaveCount(2);
  await expect(page.locator('#history-count')).toHaveText('2 de 10 eventos · Más recientes primero');
  await expect(events.first()).toContainText('Lucía propone un intercambio a Mateo.');
  await page.getByRole('combobox', { name: 'Filtrar historial por jugador' }).selectOption('2');
  await expect(events).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No hay eventos con estos filtros.' })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar todo el historial' }).click();
  await expect(events).toHaveCount(10);
  await page.locator('[data-history-category="important"]').click();
  await expect(events).toHaveCount(3);
  await expect(page.locator('[data-history-category="important"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.locator('[data-history-category="build"]').click();
  await page.getByRole('combobox', { name: 'Filtrar historial por jugador' }).selectOption('0');
  await expect(events).toHaveCount(1);
  await expect(events).toContainText('Lucía construye una carretera.');
  await page.screenshot({ path: 'test-results/history-desktop.png' });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__isla.state)).toEqual(game);
});

test('mobile online history updates while preserving filters and displays only public events', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const game = fixture();
  let view: RoomView = { code: 'HIST234', mode: 'online', capacity: 3, version: 1, gameVersion: 1,
    expiresAt: Date.now() + 3600000, isHost: true, self: 0, screen: false,
    seats: game.players.map(p => ({ name: p.name, color: p.color, ready: true })), game,
    cardCounts: [0, 0, 0], devCounts: [0, 0, 0], deckCount: game.deck.length, scores: [0, 0, 0], preview: 'inspect' };
  view.game!.deck = [];
  await page.route('**/api/rooms**', route => route.fulfill({ json: view }));
  await page.addInitScript(() => localStorage.setItem('isla-room-player-HIST234', JSON.stringify({ code: 'HIST234', token: 'a'.repeat(64), screen: false })));
  await page.goto('/?room=HIST234');
  await expect.poll(() => page.evaluate(() => (window as any).__isla.room?.code)).toBe('HIST234');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Historial de la partida' }).click();
  await page.getByRole('combobox', { name: 'Filtrar historial por jugador' }).selectOption('2');
  await page.locator('[data-history-category="build"]').click();
  await expect(page.locator('.history-event')).toHaveCount(1);
  view = structuredClone(view); view.version++; view.gameVersion++;
  view.game!.log.unshift('Eva construye una carretera.');
  await expect(page.locator('.history-event')).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Filtrar historial por jugador' })).toHaveValue('2');
  await expect(page.locator('[data-history-category="build"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByRole('dialog')).not.toContainText('Punto de victoria');
  await page.screenshot({ path: 'test-results/history-mobile.png' });
});
