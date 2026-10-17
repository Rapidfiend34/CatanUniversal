import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { AddressInfo } from 'node:net';

async function ready(page: Page) {
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20000 }).toBe(true);
  await page.getByRole('button', { name: 'Opciones de partida' }).click();
  await expect(page.locator('.pwa-offline-status')).toContainText('Listo para jugar sin conexión');
  await page.keyboard.press('Escape');
}
async function build(page: Page) {
  await page.locator('[data-act="locations"]').first().click();
  await page.locator('.location-row').first().click();
}
const state = (page: Page) => page.evaluate(() => (window as any).__isla.state);

test('production manifest provides installable PNG icons and an Apple touch icon', async ({ page, request }) => {
  await page.goto('/'); await ready(page);
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone'); expect(manifest.start_url).toBe('/'); expect(manifest.scope).toBe('/');
  expect(manifest.icons.some((icon: any) => icon.sizes === '192x192')).toBe(true);
  expect(manifest.icons.some((icon: any) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src), bytes = await image.body();
    expect(image.headers()['content-type']).toContain('image/png');
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const bytes = await (await request.get(apple!)).body();
  expect(bytes.readUInt32BE(16)).toBe(180); expect(bytes.readUInt32BE(20)).toBe(180);
});

test('a controlled offline reload renders the board, persists local building and runs AI without caching API responses', async ({ page, context }) => {
  await page.goto('/'); await ready(page);
  const api = await page.evaluate(async () => {
    const response = await fetch('/api/rooms?code=APIT234', { headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } });
    return { status: response.status, type: response.headers.get('content-type') };
  });
  expect(api.status).toBeGreaterThanOrEqual(400); expect(api.type).toContain('application/json');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#render-error')).toBeHidden();
  await page.getByRole('button', { name: 'Opciones de partida' }).click();
  await expect(page.locator('.pwa-offline-status')).toContainText('Listo para jugar sin conexión');
  await page.keyboard.press('Escape');
  await build(page);
  const saved = await state(page);
  expect(saved.phase).toBe('setup-road'); expect(saved.vertices.filter((v: any) => v.owner === 0)).toHaveLength(1);
  await page.reload();
  expect(await state(page)).toEqual(saved);
  expect(await page.evaluate(async () => {
    try { await fetch('/api/rooms?code=APIT234', { headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } }); return false; }
    catch { return true; }
  })).toBe(true);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    return urls;
  });
  expect(cached.some(url => url.includes('/api/'))).toBe(false);
  await page.getByRole('button', { name: 'Nueva partida', exact: true }).click();
  await page.getByRole('button', { name: 'Descubrir mi isla' }).click();
  await build(page); await build(page);
  await expect.poll(async () => (await state(page)).players.filter((p: any) => p.bot).length).toBe(2);
  await expect.poll(async () => (await state(page)).vertices.filter((v: any) => v.owner === 1).length, { timeout: 12000 }).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'test-results/pwa-offline.png' });
});

test.describe('iPhone installation instructions', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('the mobile guide explains Safari installation and offline readiness', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20000 }).toBe(true);
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await expect(page.locator('.pwa-offline-status')).toContainText('Listo para jugar sin conexión');
    await page.getByRole('button', { name: 'Instalar Isla Universal' }).click();
    await expect(page.getByRole('dialog')).toContainText('En iPhone o iPad');
    await expect(page.getByRole('dialog')).toContainText('Añadir a pantalla de inicio');
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/pwa-iphone-guide.png' });
  });
});

test('the install control delegates to the browser prompt and acknowledges an installed app', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => { (window as any).__installRequested = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Opciones de partida' }).click();
  await page.getByRole('button', { name: 'Instalar Isla Universal' }).click();
  expect(await page.evaluate(() => (window as any).__installRequested)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('button', { name: 'Aplicación instalada' })).toBeVisible();
});

test('a real waiting worker updates only after confirmation and keeps the saved game', async ({ browser }) => {
  const root = resolve('dist'), originalWorker = await readFile(resolve(root, 'sw.js'), 'utf8');
  let worker = originalWorker;
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url || '/', 'http://test.local').pathname;
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + '/')) { response.writeHead(404); response.end(); return; }
      try {
        response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); response.setHeader('Cache-Control', 'no-store');
        response.end(pathname === '/sw.js' ? worker : await readFile(file));
      } catch { response.writeHead(404); response.end(); }
    })();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`); await ready(page);
    await build(page); const saved = await state(page);
    await page.evaluate(async () => { (window as any).__stillPlaying = true; await caches.open('another-app-cache'); });
    worker = originalWorker.replace(/const VERSION = "([^"]+)"/, 'const VERSION = "$1-next-release"');
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.locator('#pwa-update-banner')).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => (window as any).__stillPlaying)).toBe(true);
    expect(await state(page)).toEqual(saved);
    await page.getByRole('button', { name: 'Ver actualización' }).click();
    await page.getByRole('button', { name: 'Seguir jugando' }).click();
    await expect(page.locator('#pwa-update-banner')).toBeHidden();
    expect(await page.evaluate(() => (window as any).__stillPlaying)).toBe(true);
    await page.getByRole('button', { name: 'Opciones de partida' }).click();
    await page.getByRole('button', { name: 'Actualización disponible', exact: false }).click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Guardar y actualizar' }).click()]);
    expect(await page.evaluate(() => typeof (window as any).__stillPlaying)).toBe('undefined');
    await expect(page.locator('canvas')).toBeVisible();
    expect(await state(page)).toEqual(saved);
    await expect(page.locator('#pwa-update-banner')).toBeHidden();
    const names = await page.evaluate(() => caches.keys());
    expect(names.filter(name => name.startsWith('isla-universal-pwa-'))).toHaveLength(1);
    expect(names).toContain('another-app-cache');
    await context.setOffline(true); await page.reload();
    expect(await state(page)).toEqual(saved);
  } finally { await context.close(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
});
