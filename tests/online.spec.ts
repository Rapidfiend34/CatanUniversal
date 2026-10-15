import { test, expect as baseExpect, type Page, type Browser } from '@playwright/test';
import { total } from '../src/engine';
import type { RoomView } from '../src/online/types';
const expect = baseExpect.configure({ timeout: 20000 });

const room = (page: Page): Promise<RoomView> => page.evaluate(() => (window as any).__isla.room);
async function create(page: Page, party: boolean) {
  await page.goto('/');
  await page.locator('[data-act="rooms"]').click();
  await page.locator(`[data-act="create-${party ? 'party' : 'online'}"]`).click();
  await page.locator('#create-room-form [name="name"]').fill(party ? 'Televisión' : 'Lucía');
  await page.locator('#create-room-form button[type="submit"]').click();
  await expect(page.locator('[data-room-code]')).toBeVisible();
  await expect(page.locator('.room-qr')).toHaveAttribute('src', /^data:image/);
  return (await room(page)).code;
}
async function join(page: Page, code: string, name: string) {
  await page.goto('/?room=' + code);
  await page.locator('#join-room-form [name="name"]').fill(name);
  await page.locator('#join-room-form button[type="submit"]').click();
  await expect(page.locator('[data-room-code]')).toHaveText(code);
  await page.locator('[data-act="room-ready"]').click();
  await expect.poll(async () => { const r = await room(page); return r.seats[r.self!].ready; }).toBe(true);
}
async function advanceSetup(host: Page, players: Page[]) {
  for (let n = 0; n < 8; n++) {
    const r = await room(host); if (!r.game?.phase.startsWith('setup')) break;
    const player = players[r.game.current];
    await expect.poll(async () => (await room(player)).gameVersion).toBe(r.gameVersion);
    for (let k = 0; k < 2; k++) {
      const version = (await room(player)).gameVersion;
      await player.locator('[data-act="locations"]').first().click();
      await player.locator('.location-row').first().click();
      await expect.poll(async () => (await room(player)).gameVersion).toBeGreaterThan(version);
      await expect(player.locator('body')).not.toHaveClass(/network-busy/);
    }
    await expect.poll(async () => (await room(host)).gameVersion).toBe((await room(player)).gameVersion);
  }
  await expect.poll(async () => (await room(host)).game?.phase).toBe('roll');
  const version = (await room(host)).gameVersion;
  for (const player of players) await expect.poll(async () => (await room(player)).gameVersion).toBe(version);
}
async function phone(browser: Browser) {
  return browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
}

test('online friends join by code, play synchronized turns and reconnect with private hands', async ({ browser, page }) => {
  test.setTimeout(240000);
  const context = await browser.newContext(); const friend = await context.newPage();
  try {
    const code = await create(page, false);
    let temporaryFailure = false;
    await friend.route('**/api/rooms', async route => {
      if (!temporaryFailure && route.request().method() === 'POST' && route.request().postDataJSON()?.op === 'join') { temporaryFailure = true; await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporalmente no disponible"}' }); }
      else await route.continue();
    });
    await join(friend, code, 'Mateo');
    expect(temporaryFailure).toBe(true);
    await page.locator('[data-act="room-ready"]').click();
    await expect(page.locator('[data-act="room-start"]')).toBeEnabled();
    await page.locator('[data-act="room-start"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await advanceSetup(page, [page, friend]);
    for (const [index, p] of [page, friend].entries()) {
      const r = await room(p); expect(r.self).toBe(index); expect(r.game!.deck).toEqual([]);
      expect(r.game!.players.filter((_, i) => i !== index).every(p => total(p.hand) === 0 && !p.dev.length)).toBe(true);
      expect(total(r.game!.players[index].hand)).toBe(r.cardCounts[index]);
    }
    await expect(friend.locator('.turn-button')).toBeDisabled();
    await page.getByRole('button', { name: 'Lanzar dados' }).click();
    await expect.poll(async () => (await room(page)).game!.phase).not.toBe('roll');
    if ((await room(page)).game!.phase === 'robber') {
      await page.locator('[data-act="locations"]').first().click(); await page.locator('.location-row').first().click();
      await expect.poll(async () => (await room(page)).game!.phase).not.toBe('robber');
      if ((await room(page)).game!.phase === 'steal') {
        const dialog = page.getByRole('dialog');
        if (!await dialog.locator('[data-steal-card]').count()) await dialog.locator('[data-victim]').first().click();
        await dialog.locator('[data-steal-card]').first().click();
      }
    }
    await page.getByRole('button', { name: 'Terminar turno' }).click();
    await expect.poll(async () => (await room(friend)).game!.current).toBe(1);
    await expect(friend.getByRole('button', { name: 'Lanzar dados' })).toBeEnabled();
    await friend.reload(); await expect.poll(async () => (await room(friend))?.self).toBe(1);
    await expect(friend.getByRole('button', { name: 'Lanzar dados' })).toBeEnabled();
    const newcomer = await browser.newContext();
    try { const p = await newcomer.newPage(); await p.goto('/?room=' + code); await p.locator('#join-room-form [name="name"]').fill('Intruso'); await p.locator('#join-room-form button').click(); await expect(p.locator('#toast')).toContainText('ya ha empezado'); } finally { await newcomer.close(); }
  } finally { await context.close(); }
});

test('Party TV displays public board while phones control their own seats and recover connection', async ({ browser, page }) => {
  test.setTimeout(240000); await page.setViewportSize({ width: 1920, height: 1080 });
  const firstContext = await phone(browser), secondContext = await phone(browser);
  try {
    const first = await firstContext.newPage(), second = await secondContext.newPage();
    const code = await create(page, true); expect((await room(page)).self).toBeNull();
    await page.screenshot({ path: 'test-results/party-tv-lobby.png' });
    await join(first, code, 'Sofía'); await join(second, code, 'Diego');
    await expect(page.locator('[data-act="room-start"]')).toBeEnabled(); await page.locator('[data-act="room-start"]').click();
    await expect(first.locator('body')).toHaveClass(/controller-focus/);
    await expect(first.locator('.turn-button')).toBeVisible();
    await first.screenshot({ path: 'test-results/party-controller.png', fullPage: true });
    await advanceSetup(page, [first, second]);
    const tv = await room(page);
    expect(tv.screen).toBe(true); expect(tv.game!.players.every(p => total(p.hand) === 0 && !p.dev.length)).toBe(true); expect(tv.game!.deck).toEqual([]);
    expect(await page.locator('#bottom-panel').isVisible()).toBe(false);
    expect(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/party-tv-board.png' });
    await first.locator('[data-act="controller-view"]').click(); await expect(first.locator('body')).not.toHaveClass(/controller-focus/); await expect(first.locator('canvas')).toBeVisible();
    await first.locator('[data-act="controller-view"]').click(); await expect(first.locator('body')).toHaveClass(/controller-focus/);
    await firstContext.setOffline(true); await expect(first.locator('.room-status')).toContainText('Reconectando', { timeout: 12000 });
    await firstContext.setOffline(false); await expect(first.locator('.room-status')).toContainText('conectada', { timeout: 12000 });
    await page.reload(); await expect.poll(async () => (await room(page))?.screen).toBe(true);
    expect((await room(page)).game!.players.every(p => total(p.hand) === 0)).toBe(true);
  } finally { await firstContext.close(); await secondContext.close(); }
});
