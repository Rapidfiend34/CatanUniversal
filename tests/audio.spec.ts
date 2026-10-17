import { test, expect } from '@playwright/test';

test('audio starts on interaction, channels and volumes are independent and preferences survive reload', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    (window as any).__audioTest = { contexts: [] as AudioContext[], notes: 0 };
    window.AudioContext = class extends NativeAudio {
      constructor() { super(); (window as any).__audioTest.contexts.push(this); }
      createOscillator() {
        const oscillator = super.createOscillator(), start = oscillator.start.bind(oscillator);
        oscillator.start = (when?: number) => { (window as any).__audioTest.notes++; start(when); };
        return oscillator;
      }
    };
  });
  const notes = () => page.evaluate(() => (window as any).__audioTest.notes as number);
  await page.goto('/');
  expect(await notes()).toBe(0);
  await page.getByRole('button', { name: 'Opciones de partida' }).click();
  const effects = page.locator('[data-act="sound"]'), music = page.locator('[data-act="music"]');
  await expect(effects).toHaveAttribute('aria-pressed', 'false');
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await effects.click();
  await expect.poll(() => page.evaluate(() => (window as any).__audioTest.contexts[0]?.state)).toBe('running');
  // Turning effects on plays a short confirmation through the real Web Audio engine.
  await expect.poll(notes).toBeGreaterThan(0);
  await page.getByRole('slider', { name: 'Volumen de efectos' }).fill('37');
  await expect(page.locator('[data-audio-volume="effects"]').locator('..').locator('output')).toHaveText('37%');
  await music.click();
  await page.getByRole('slider', { name: 'Volumen de música' }).fill('18');
  const beforeMusic = await notes();
  await expect.poll(notes).toBeGreaterThan(beforeMusic);
  await effects.click();
  await expect(effects).toHaveAttribute('aria-pressed', 'false');
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await music.click();
  const stopped = await notes();
  await page.waitForTimeout(1000);
  expect(await notes()).toBe(stopped);
  // Save enabled music: restoration must wait for a new user gesture.
  await music.click();
  await page.reload();
  expect(await notes()).toBe(0);
  expect(await page.evaluate(() => (window as any).__audioTest.contexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Opciones de partida' }).click();
  await expect.poll(notes).toBeGreaterThan(0);
  await expect(effects).toHaveAttribute('aria-pressed', 'false');
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('slider', { name: 'Volumen de efectos' })).toHaveValue('37');
  await expect(page.getByRole('slider', { name: 'Volumen de música' })).toHaveValue('18');
  // Simulate the lifecycle signal delivered when switching away from the tab.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.evaluate(() => (window as any).__audioTest.contexts[0].state)).toBe('suspended');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.evaluate(() => (window as any).__audioTest.contexts[0].state)).toBe('running');
});

test('mobile audio controls remain usable when Web Audio is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { Object.defineProperty(window, 'AudioContext', { value: undefined }); });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.locator('[data-act="sound"]').click();
  await page.locator('[data-act="music"]').click();
  await page.getByRole('slider', { name: 'Volumen de música' }).fill('15');
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('[data-act="locations"]').first().click();
  await page.locator('.location-row').first().click();
  expect(await page.evaluate(() => (window as any).__isla.state.phase)).toBe('setup-road');
  expect(errors).toEqual([]);
});
