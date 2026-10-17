import { test, expect, type Page } from '@playwright/test';
import { newGame } from '../src/engine';
import type { RoomView } from '../src/online/types';

function fixture(): RoomView {
  const game = newGame([{ name: 'Lucía', bot: false }, { name: 'Mateo', bot: false }, { name: 'Eva', bot: true }]);
  game.phase = 'roll'; game.turn = 1; game.deck = [];
  return { code: 'CONN234', mode: 'online', capacity: 3, version: 1, gameVersion: 1, expiresAt: Date.now() + 3600000,
    isHost: true, self: 0, screen: false, seats: game.players.slice(0, 2).map(p => ({ name: p.name, color: p.color, ready: true })),
    game, cardCounts: [0, 0, 0], devCounts: [0, 0, 0], deckCount: 25, scores: [0, 0, 0], preview: 'inspect' };
}
async function remember(page: Page, code = 'CONN234', screen = false) {
  await page.addInitScript(({ code, screen }) => localStorage.setItem(`isla-room-${screen ? 'screen' : 'player'}-${code}`, JSON.stringify({ code, token: 'a'.repeat(64), screen })), { code, screen });
}

test('saved room restores after API failures and clearly reports offline and recovered states on mobile', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const view = fixture(); let failed = true, posts = 0;
  await remember(page);
  await page.route('**/api/rooms**', route => {
    if (route.request().method() === 'POST') posts++;
    return failed ? route.fulfill({ status: 503, json: { error: 'Temporalmente no disponible' } }) : route.fulfill({ json: view });
  });
  await page.goto('/?room=CONN234');
  await expect(page.locator('#connection-panel')).toContainText('Reconectando con la sala');
  await expect(page.locator('#join-room-form')).toHaveCount(0);
  failed = false;
  await expect(page.locator('.room-status')).toHaveAttribute('data-connection', 'connected');
  await expect.poll(() => page.evaluate(() => (window as any).__isla.room?.self)).toBe(0);
  await context.setOffline(true); failed = true;
  await expect(page.locator('#connection-panel')).toContainText('Sin conexión a internet');
  await expect(page.locator('#connection-panel')).toContainText('Tu acceso se conserva');
  await page.locator('.turn-button').focus(); await page.keyboard.press('Enter');
  expect(posts).toBe(0);
  expect(await page.locator('#connection-panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/connection-mobile-offline.png' });
  failed = false; await context.setOffline(false);
  await expect(page.locator('.room-status')).toHaveAttribute('data-connection', 'connected');
  await expect(page.locator('#connection-panel')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Conexión recuperada');
  await expect.poll(() => page.evaluate(() => (window as any).__isla.room?.self)).toBe(0);
});

test('a failed command retries the identical identifier and state version before confirming recovery', async ({ page }) => {
  let view = fixture(); const requests: string[] = [];
  let release!: () => void;
  const retry = new Promise<void>(resolve => { release = resolve; });
  await remember(page);
  await page.route('**/api/rooms**', async route => {
    if (route.request().method() !== 'POST') { await route.fulfill({ json: view }); return; }
    requests.push(route.request().postData()!);
    if (requests.length === 1) { await route.fulfill({ status: 503, json: { error: 'Reintenta' } }); return; }
    await retry;
    view = structuredClone(view); view.version++; view.gameVersion++;
    view.game!.dice = [3, 3]; view.game!.phase = 'action'; view.game!.log.unshift('Lucía lanza los dados: 6.');
    await route.fulfill({ json: view });
  });
  await page.goto('/?room=CONN234');
  await page.getByRole('button', { name: 'Lanzar dados' }).click();
  await expect(page.locator('#connection-panel')).toContainText('Reconectando con la sala');
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toBe(requests[0]);
  release();
  await expect(page.locator('#connection-panel')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/network-busy/);
  await expect(page.getByRole('button', { name: 'Terminar turno' })).toBeEnabled();
});

test('notices show new remote actions once and expired rooms explain why retrying stopped', async ({ page }) => {
  let view = fixture(), expired = false;
  await remember(page);
  await page.route('**/api/rooms**', route => expired ? route.fulfill({ status: 410, json: { error: 'La sala ha caducado. Crea otra para seguir jugando.' } }) : route.fulfill({ json: view }));
  await page.goto('/?room=CONN234');
  await expect(page.locator('.room-status')).toHaveAttribute('data-connection', 'connected');
  await expect(page.locator('#toast')).toBeHidden();
  view = structuredClone(view); view.version++; view.gameVersion++;
  view.game!.log.unshift('Mateo funda un poblado.');
  await expect(page.locator('#toast')).toHaveText('Mateo funda un poblado.');
  await expect(page.locator('#toast')).toBeHidden({ timeout: 8000 });
  await page.waitForTimeout(1700);
  await expect(page.locator('#toast')).toBeHidden();
  expired = true;
  await expect(page.locator('#connection-panel')).toContainText('La sala ha caducado');
  await expect(page.locator('.room-status')).toHaveAttribute('data-connection', 'unavailable');
  await expect(page.locator('[data-act="retry-room"]')).toHaveCount(0);
  await page.locator('#connection-panel [data-act="leave-room"]').click();
  await expect(page.locator('#network-bar')).toBeHidden();
  await expect(page.locator('#connection-panel')).toBeHidden();
});

test('manual retry restores access and leaving during a failed command cancels subsequent retries', async ({ page }) => {
  const view = fixture(); let reads = 0, writes = 0;
  await remember(page);
  await page.addInitScript(() => document.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('[data-act="retry-room"]')) (window as any).__manualRecovery = true;
  }, true));
  await page.route('**/api/rooms**', async route => {
    if (route.request().method() === 'POST') { writes++; return route.fulfill({ status: 503, json: { error: 'Temporalmente no disponible' } }); }
    reads++;
    const recovered = await page.evaluate(() => !!(window as any).__manualRecovery);
    return recovered ? route.fulfill({ json: view }) : route.fulfill({ status: 503, json: { error: 'Temporalmente no disponible' } });
  });
  await page.goto('/?room=CONN234');
  await expect.poll(() => reads).toBeGreaterThanOrEqual(3);
  const retry = page.getByRole('button', { name: 'Reintentar ahora', exact: true });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.locator('.room-status')).toHaveAttribute('data-connection', 'connected');
  await page.getByRole('button', { name: 'Lanzar dados' }).click();
  await expect(page.locator('#connection-panel')).toBeVisible();
  await page.locator('#connection-panel [data-act="leave-room"]').click();
  const sent = writes;
  expect(sent).toBeGreaterThan(0);
  await page.waitForTimeout(1800);
  expect(writes).toBe(sent);
  await expect(page.locator('#network-bar')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__isla.room)).toBeNull();
});

for (const party of [false, true]) test(`${party ? 'Party TV' : 'Online'} confirms full capacity and gives newcomers a clear recovery choice`, async ({ page, browser }) => {
  test.setTimeout(90000);
  const code = 'FULL' + Array.from({ length: 3 }, () => '23456789'[Math.floor(Math.random() * 8)]).join('');
  const host = 'a'.repeat(64), players = party ? ['b', 'c', 'd'] : ['a', 'b', 'c'];
  const created = await page.request.post('/api/rooms', { data: { op: 'create', code, token: host, mode: party ? 'party' : 'online', name: 'Lucía', capacity: 3 } });
  expect(created.ok()).toBe(true);
  await remember(page, code, party);
  await page.goto(`/?room=${code}${party ? '&screen=tv' : ''}`);
  await expect(page.locator('[data-room-code]')).toHaveText(code);
  for (const [i, letter] of players.entries()) {
    if (!party && i === 0) continue;
    const joined = await page.request.post('/api/rooms', { data: { op: 'join', code, token: letter.repeat(64), name: `Amigo ${i + 1}` } });
    expect(joined.ok()).toBe(true);
  }
  await expect(page.locator('.lobby-capacity.full')).toContainText('Sala completa · 3 de 3 jugadores');
  await expect(page.locator('[data-act="room-start"]')).toBeDisabled();
  for (const letter of players) expect((await page.request.post('/api/rooms', { headers: { Authorization: 'Bearer ' + letter.repeat(64) }, data: { op: 'ready', code, ready: true } })).ok()).toBe(true);
  await expect(page.locator('.lobby-capacity')).toContainText('Todos están listos');
  await expect(page.locator('[data-act="room-start"]')).toBeEnabled();
  const context = await browser.newContext();
  try {
    const stranger = await context.newPage();
    await stranger.goto(new URL('/?room=' + code, page.url()).href);
    await stranger.locator('#join-room-form [name="name"]').fill('Sin plaza');
    await stranger.locator('#join-room-form button').click();
    await expect(stranger.getByRole('heading', { name: 'La sala está completa.' })).toBeVisible();
    await stranger.getByRole('button', { name: 'Probar otro código' }).click();
    await expect(stranger.locator('#join-room-form')).toBeVisible();
  } finally { await context.close(); }
  const response = await page.request.get('/api/rooms?code=' + code, { headers: { Authorization: 'Bearer ' + host } });
  expect((await response.json()).seats).toHaveLength(3);
});
