import { test, expect as baseExpect, type Page } from '@playwright/test';
import { newGame, execute, RESOURCES, emptyHand, total, type Game, type Resource } from '../src/engine';
import { botCommand } from '../src/bot';

const expect = baseExpect.configure({ timeout: 20000 });
const state = (page: Page): Promise<Game> => page.evaluate(() => (window as any).__isla.state);
function setup() { let g = newGame(Array.from({ length: 10 }, (_, i) => ({ name: `Amigo ${i}`, bot: false })), Math.random, 'expanded'); while (g.phase.startsWith('setup')) g = execute(g, botCommand(g)); return g; }
function grant(g: Game, r: Resource, amount: number, player = 0) { g.players[player].hand[r] += amount; g.bank[r] -= amount; }
async function load(page: Page, g: Game) { await page.addInitScript(g => localStorage.setItem('isla-universal-v1', JSON.stringify(g)), g); await page.goto('/'); await expect(page.locator('canvas')).toBeVisible(); }
async function pick(page: Page) { await page.locator('[data-act="locations"]').first().click(); await page.locator('.location-row').first().click(); }

test('solo expanded game starts with nine bots, completes setup and survives reload', async ({ page }) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: 'Nueva partida', exact: true }).click();
  await page.locator('[name="variant"]').selectOption('expanded'); await page.locator('[name="count"]').selectOption('10');
  await page.locator('[name="name"]').fill('Capitana'); await page.getByRole('button', { name: 'Descubrir mi isla' }).click();
  let g = await state(page); expect(g.players.filter(p => p.bot)).toHaveLength(9); expect(g.tiles).toHaveLength(49); expect(g.bank.ore).toBe(50); expect(g.deck).toHaveLength(63);
  await pick(page); await pick(page);
  await expect.poll(async () => (await state(page)).setup, { timeout: 120000 }).toBe(19);
  expect((await state(page)).current).toBe(0); await pick(page); await pick(page);
  await expect(page.getByRole('button', { name: 'Lanzar dados' })).toBeEnabled();
  g = await state(page); expect(g.setup).toBe(20); expect(g.players.every(p => p.name && p.color)).toBe(true);
  await page.reload(); await expect(page.getByRole('button', { name: 'Lanzar dados' })).toBeEnabled(); expect(await state(page)).toEqual(g);
  await page.screenshot({ path: 'test-results/expanded-solo.png' }); expect(errors).toEqual([]);
});

test('intermediate construction offers purchases but no trade or development play, on mobile too', async ({ page }) => {
  const g = setup(); g.phase = 'action'; g.primary = 5; g.current = 0;
  grant(g, 'wood', 2); grant(g, 'brick', 2); grant(g, 'sheep', 1); grant(g, 'wheat', 1); grant(g, 'ore', 1); g.players[0].dev = [{ type: 'knight', turn: 0 }];
  await page.setViewportSize({ width: 390, height: 844 }); await load(page, g);
  await expect(page.locator('#phase-panel')).toContainText('CONSTRUCCIÓN INTERMEDIA'); await expect(page.getByRole('button', { name: 'Comerciar', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-act="cards"]').click(); await expect(page.locator('[data-dev="knight"]')).toBeDisabled(); await page.getByRole('button', { name: 'Cerrar ventana' }).click();
  await page.locator('[data-build="road"]').click(); await pick(page); expect((await state(page)).players[0].hand.wood).toBe(g.players[0].hand.wood - 1);
  await page.locator('[data-build="dev"]').click(); expect((await state(page)).deck).toHaveLength(62);
  await page.getByRole('button', { name: 'Terminar construcción' }).click(); expect((await state(page)).current).toBe(6); expect((await state(page)).phase).toBe('roll');
});

test('expanded Monopoly requires up to three selected rivals and transfers only their resource', async ({ page }) => {
  const g = setup(); g.phase = 'action'; g.players[0].dev = [{ type: 'monopoly', turn: 0 }];
  for (let i = 1; i < 10; i++) grant(g, 'ore', 2, i);
  await load(page, g); await page.locator('[data-act="cards"]').click(); await page.locator('[data-dev="monopoly"]').click(); await page.locator('#dev-form [name="first"]').selectOption('ore');
  for (const i of [1, 5, 8, 9]) await page.locator(`[name="target"][value="${i}"]`).check();
  await page.locator('#dev-form button').click(); await expect(page.locator('#toast')).toContainText('tres rivales'); expect((await state(page)).players[0].dev).toHaveLength(1);
  await page.locator('[name="target"][value="8"]').uncheck(); await page.locator('#dev-form button').click();
  const after = await state(page); expect(after.players[8].hand.ore).toBe(g.players[8].hand.ore); for (const i of [1, 5, 9]) expect(after.players[i].hand.ore).toBe(0);
  expect(after.players[0].hand.ore).toBe(g.players[0].hand.ore + [1, 5, 9].reduce((s, i) => s + g.players[i].hand.ore, 0));
});

for (const mode of ['online', 'party'] as const) test(`expanded ${mode} creation and joining starts a ten-player room with AI and private hands`, async ({ browser, page }) => {
  test.setTimeout(120000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    await page.goto('/'); await page.locator('[data-act="rooms"]').click(); await page.locator(`[data-act="create-${mode}"]`).click();
    await page.locator('#create-room-form [name="variant"]').selectOption('expanded'); await page.locator('#create-room-form [name="capacity"]').selectOption('10'); await page.locator('#create-room-form button[type="submit"]').click();
    await expect(page.locator('[data-room-code]')).toBeVisible(); await expect(page.locator('.lobby-seat')).toHaveCount(10);
    const code = await page.locator('[data-room-code]').innerText(), friend = await contexts[0].newPage(), second = mode === 'party' ? await contexts[1].newPage() : page;
    async function join(p: Page, name: string) { await p.goto('/?room=' + code); await p.locator('#join-room-form [name="name"]').fill(name); await p.locator('#join-room-form button').click(); await p.locator('[data-act="room-ready"]').click(); }
    await join(friend, 'Luna'); if (mode === 'party') await join(second, 'Sol'); else await page.locator('[data-act="room-ready"]').click();
    await expect(page.locator('[data-act="room-start"]')).toBeEnabled(); await page.locator('[data-act="room-start"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect.poll(() => friend.evaluate(() => (window as any).__isla.room?.game?.players.length)).toBe(10);
    const room = await page.evaluate(() => (window as any).__isla.room); expect(room.variant).toBe('expanded'); expect(room.game.tiles).toHaveLength(49); expect(room.game.players.filter((p: any) => p.bot)).toHaveLength(8); expect(room.deckCount).toBe(63);
    expect(room.game.players.every((p: any) => total(p.hand) === 0)).toBe(true);
    if (mode === 'party') { expect(room.screen).toBe(true); await expect(page.getByLabel('Banco común')).toBeVisible(); await expect(friend.locator('body')).toHaveClass(/controller-focus/); }
    await page.reload(); await expect.poll(() => page.evaluate(() => (window as any).__isla.room?.variant)).toBe('expanded');
    await expect(page.locator('canvas')).toBeVisible();
  } finally { for (const context of contexts) await context.close(); }
});
