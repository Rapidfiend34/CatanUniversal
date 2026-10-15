import { test, expect, type Page } from '@playwright/test';
import { newGame, execute, legalSettlements, legalRoads, emptyHand, RESOURCES, total, type Game } from '../src/engine';
import { botCommand } from '../src/bot';

const state = (page: Page): Promise<Game> => page.evaluate(() => (window as any).__isla.state);
async function localGame(page: Page) {
  await page.getByRole('button', { name: 'Nueva partida', exact: true }).click();
  await page.locator('[name="mode"]').selectOption('local');
  await page.locator('[name="name"]').fill('Lucía');
  await page.getByRole('button', { name: 'Descubrir mi isla' }).click();
}
async function pickLocation(page: Page) {
  await page.locator('[data-act="locations"]').first().click();
  await page.locator('.location-row').first().click();
}
async function chooseRobberyCard(page: Page) {
  if ((await state(page)).phase !== 'steal') return;
  const dialog=page.getByRole('dialog');
  if (!await dialog.locator('[data-steal-card]').count()) await dialog.locator('[data-victim]').first().click();
  await dialog.locator('[data-steal-card]').first().click();
}
async function importGame(page: Page, g: Game, dialogExpected = false) {
  await page.getByRole('button', { name: 'Opciones de partida' }).click();
  await page.locator('#import-game').setInputFiles({ name: 'partida.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(g)) });
  if (!dialogExpected) await expect(page.getByRole('dialog')).toHaveCount(0);
}
function setupGame(): Game { let g = newGame([{ name: 'Lucía', bot: false }, { name: 'Mateo', bot: false }, { name: 'Eva', bot: false }]); while (g.phase.startsWith('setup')) g = execute(g, botCommand(g)); return g; }
function aiTradingGame() {
  const g=setupGame();g.phase='action';g.players.forEach((p,i)=>{p.hand=emptyHand();p.bot=i>0;});
  g.players[0].hand={...emptyHand(),ore:2,wood:1};g.players[1].hand={...emptyHand(),wood:3,wheat:2,ore:2};
  for(const r of RESOURCES)g.bank[r]=19-g.players.reduce((n,p)=>n+p.hand[r],0);
  return g;
}
function robberyGame(multiple=false){
  const g=setupGame();g.phase='robber';g.current=0;g.turn=2;g.dice=[3,4];g.resume='action';g.robber=0;
  g.vertices.forEach(v=>{v.owner=null;v.city=false;});g.edges.forEach(e=>e.owner=null);
  const t=g.tiles[9];g.vertices[t.vertices[0]].owner=1;g.vertices[t.vertices[4]].owner=0;if(multiple)g.vertices[t.vertices[2]].owner=2;
  g.players[0].hand={...emptyHand(),wood:2};g.players[1].hand={...emptyHand(),ore:2,wheat:1};g.players[2].hand={...emptyHand(),sheep:1,brick:1};g.players[1].dev=[{type:'victory',turn:0}];
  for(const r of RESOURCES)g.bank[r]=19-g.players.reduce((n,p)=>n+p.hand[r],0);return g;
}
async function moveRobber(page:Page){await page.locator('[data-act="locations"]').first().click();await page.getByRole('dialog').locator('[data-location="9"]').click();}

test('3D canvas renders, real pointer builds a settlement, road selection persists', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
  expect(await page.locator('#render-error').isVisible()).toBe(false);
  await page.screenshot({ path: 'test-results/desktop.png' });
  const g = await state(page), ids = legalSettlements(g);
  let clicked = false;
  for (const id of ids) {
    const pt = await page.evaluate(id => (window as any).__isla.project('settlement', id), id);
    if (!pt || pt.x < 350 || pt.x > 1170 || pt.y < 340 || pt.y > 690) continue;
    await page.mouse.click(pt.x, pt.y);
    if ((await state(page)).phase === 'setup-road') { clicked = true; break; }
  }
  expect(clicked).toBe(true);
  expect((await state(page)).vertices.filter(v => v.owner === 0)).toHaveLength(1);
  await pickLocation(page);
  await expect.poll(async () => (await state(page)).setup).toBeGreaterThanOrEqual(1);
  await page.reload(); await expect(page.locator('canvas')).toBeVisible();
  expect((await state(page)).vertices.filter(v => v.owner === 0)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('complete local setup, privacy curtain, roll, end turn and help', async ({ page }) => {
  await page.goto('/'); await localGame(page);
  for (let i = 0; i < 6; i++) {
    if (await page.locator('[data-act="reveal"]').count()) await page.locator('[data-act="reveal"]').click();
    await pickLocation(page); await pickLocation(page);
  }
  expect((await state(page)).phase).toBe('roll');
  await expect(page.getByRole('button', { name: 'Lanzar dados' })).toBeEnabled();
  await page.getByRole('button', { name: 'Lanzar dados' }).click();
  let g = await state(page);
  if (g.phase === 'discard') throw new Error('Initial hands cannot need discards');
  if (g.phase === 'robber') { await pickLocation(page); await chooseRobberyCard(page); }
  await page.getByRole('button', { name: 'Terminar turno' }).click();
  await expect(page.getByRole('dialog')).toContainText('Turno de Jugador 2');
  await page.getByRole('button', { name: 'Estoy listo' }).click();
  expect((await state(page)).current).toBe(1);
  await page.getByRole('button', { name: 'Cómo jugar' }).click();
  await expect(page.getByRole('dialog')).toContainText('Gana con 10 puntos');
});

test('trade, buy development, play plenty and import validation through the interface', async ({ page }) => {
  await page.goto('/'); let g = setupGame();g.phase='action';g.turn=5;
  for (const r of RESOURCES) { g.players[0].hand[r]=6; g.bank[r]=19-g.players.reduce((n,p)=>n+p.hand[r],0); }
  g.players[0].dev.push({type:'plenty',turn:1});
  await importGame(page,g);
  await page.getByRole('button', { name: 'Comerciar', exact: true }).click();
  await page.locator('#trade-form [name="give"]').selectOption('wood');
  await page.locator('#trade-form [name="receive"]').selectOption('ore');
  const before = await state(page);
  await page.getByRole('button', { name: 'Realizar intercambio' }).click();
  await expect.poll(async()=>(await state(page)).players[0].hand.ore).toBe(before.players[0].hand.ore+1);
  await page.getByRole('button', { name: 'Cerrar ventana' }).click();
  await page.locator('[data-build="dev"]').click();
  expect((await state(page)).players[0].dev.length).toBe(2);
  await page.locator('[data-act="cards"]').click();
  await page.locator('[data-dev="plenty"]').click();
  await page.locator('#dev-form [name="first"]').selectOption('wood');
  await page.locator('#dev-form [name="second"]').selectOption('brick');
  await page.locator('#dev-form button').click();
  expect((await state(page)).players[0].played).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A malformed import must not replace the running game.
  const valid = await state(page);await page.getByRole('button', { name: 'Opciones de partida' }).click();
  await page.locator('#import-game').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1}')});
  await expect(page.locator('#toast')).toContainText('no contiene una partida válida');expect((await state(page)).turn).toBe(valid.turn);
});

test('mobile board and construction controls are usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.waitForTimeout(500);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.turn-button')).toBeVisible();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  await pickLocation(page);expect((await state(page)).phase).toBe('setup-road');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Exportar partida');
  await page.getByRole('button', { name: 'Cerrar ventana' }).click();
  await page.getByRole('button', { name: 'Nueva partida', exact:true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('road building before dice, city upgrade and explicit local trade consent', async ({ page }) => {
  await page.goto('/');let g=setupGame();g.turn=5;g.players[0].dev.push({type:'roads',turn:1});
  for(const r of RESOURCES){g.players[0].hand[r]=5;g.players[1].hand[r]=3;g.bank[r]=19-g.players.reduce((n,p)=>n+p.hand[r],0);}
  await importGame(page,g);await page.locator('[data-act="cards"]').click();await page.locator('[data-dev="roads"]').click();
  expect((await state(page)).freeRoads).toBe(2);await pickLocation(page);await pickLocation(page);
  expect((await state(page)).phase).toBe('roll');await expect(page.getByRole('button',{name:'Lanzar dados'})).toBeEnabled();
  g=await state(page);g.phase='action';await importGame(page,g);
  await page.locator('[data-build="city"]').click();await pickLocation(page);
  expect((await state(page)).vertices.some(v=>v.owner===0&&v.city)).toBe(true);
  await page.getByRole('button',{name:'Comerciar',exact:true}).click();await page.locator('[data-trade-tab="players"]').click();
  await page.locator('#offer-form [name="give-wood"]').fill('1');await page.locator('#offer-form [name="receive-sheep"]').fill('1');
  const before=await state(page);await page.getByRole('button',{name:'Proponer intercambio'}).click();
  expect((await state(page)).players[0].hand.wood).toBe(before.players[0].hand.wood);
  await page.getByRole('button',{name:'Aceptar intercambio'}).click();
  expect((await state(page)).players[0].hand.wood).toBe(before.players[0].hand.wood-1);
  expect((await state(page)).players[1].hand.sheep).toBe(before.players[1].hand.sheep-1);
});

test('mandatory discard, robber movement and stolen resource resolve in the UI', async ({ page }) => {
  await page.goto('/');let g=setupGame();g.players[0].hand.wood+=8;g.bank.wood-=8;
  let n=0;g=execute(g,{type:'roll'},()=>n++===0?.34:.51);expect(g.phase).toBe('discard');
  await page.getByRole('button',{name:'Opciones de partida'}).click();
  await page.locator('#import-game').setInputFiles({name:'seven.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(g))});
  await expect(page.getByRole('dialog')).toContainText('aligera tu equipaje');
  const required=g.discards[0];await page.locator('#discard-form [name="wood"]').fill(String(required));
  await page.getByRole('button',{name:'Devolver recursos'}).click();expect((await state(page)).phase).toBe('robber');
  await pickLocation(page);await chooseRobberyCard(page);
  expect((await state(page)).phase).toBe('action');await expect(page.getByRole('button',{name:'Terminar turno'})).toBeEnabled();
});

test('human can select an AI, get an accepted offer, and receive a strategic rejection', async ({page})=>{
  await page.goto('/');const g=aiTradingGame();await importGame(page,g);
  async function propose(give:string,receive:string){
    await page.getByRole('button',{name:'Comerciar',exact:true}).click();await page.locator('[data-trade-tab="players"]').click();
    await page.locator('#offer-form [name="player"]').selectOption('1');
    await page.locator(`#offer-form [name="give-${give}"]`).fill('1');await page.locator(`#offer-form [name="receive-${receive}"]`).fill('1');
    await page.getByRole('button',{name:'Proponer intercambio'}).click();
  }
  await propose('ore','wood');
  await expect.poll(async()=>(await state(page)).log[0]).toContain('Mateo acepta');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const accepted=await state(page);expect(accepted.players[0].hand.ore).toBe(1);expect(accepted.players[0].hand.wood).toBe(2);expect(accepted.players[1].hand.ore).toBe(3);
  await propose('wood','ore');
  await expect.poll(async()=>(await state(page)).log[0]).toContain('Mateo rechaza');
  const rejected=await state(page);expect(rejected.players.map(p=>p.hand)).toEqual(accepted.players.map(p=>p.hand));expect(rejected.bank).toEqual(accepted.bank);
  await expect(page.locator('#toast')).toContainText('Prefiero conservar');
});

test('AI proposal waits for the human across reload and a refusal transfers no cards',async({page})=>{
  await page.goto('/');let g=aiTradingGame();g.current=1;g=execute(g,botCommand(g));expect(g.pendingTrade?.to).toBe(0);
  await importGame(page,g,true);await expect(page.getByRole('dialog')).toContainText('Mateo te propone');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();
  await page.reload();await expect(page.getByRole('dialog')).toContainText('La partida espera tu decisión');
  await page.waitForTimeout(1200);expect((await state(page)).pendingTrade).toEqual(g.pendingTrade);
  await page.getByRole('button',{name:'Rechazar oferta',exact:true}).click();const after=await state(page);
  expect(after.pendingTrade).toBeNull();expect(after.players.map(p=>p.hand)).toEqual(g.players.map(p=>p.hand));expect(after.current).toBe(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async()=>(await state(page)).current).not.toBe(1);
});

test('AI initiates a trade on its turn and resumes building after human acceptance',async({page})=>{
  await page.goto('/');const g=aiTradingGame();g.current=1;
  await importGame(page,g,true);await expect(page.getByRole('dialog')).toContainText('Mateo te propone');
  await expect(page.getByRole('button',{name:'Aceptar intercambio'})).toBeEnabled();
  expect((await state(page)).players.map(p=>p.hand)).toEqual(g.players.map(p=>p.hand));
  await page.screenshot({path:'test-results/ai-trade.png'});
  await page.getByRole('button',{name:'Aceptar intercambio'}).click();
  const after=await state(page);expect(after.pendingTrade).toBeNull();expect(after.players[0].hand.ore).toBe(g.players[0].hand.ore-1);expect(after.players[0].hand.wood).toBe(g.players[0].hand.wood+1);
  await expect.poll(async()=>(await state(page)).vertices.filter(v=>v.owner===1&&v.city).length).toBe(1);
});

test('AI-to-AI trades resolve automatically and an unaffordable human offer can be declined',async({page})=>{
  await page.goto('/');let g=aiTradingGame();g.current=1;g.players[2].hand={...emptyHand(),ore:1};g.bank.ore--;
  g=execute(g,{type:'offer',player:2,give:{...emptyHand(),wood:1},receive:{...emptyHand(),ore:1}});
  await importGame(page,g);await expect.poll(async()=>(await state(page)).pendingTrade).toBeNull();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Import another valid pending offer asking the human for a resource they lack.
  let unfunded=aiTradingGame();unfunded.current=1;
  unfunded=execute(unfunded,{type:'offer',player:0,give:{...emptyHand(),wood:1},receive:{...emptyHand(),brick:1}});
  await importGame(page,unfunded,true);await expect(page.getByRole('button',{name:'Aceptar intercambio'})).toBeDisabled();
  await page.getByRole('button',{name:'Rechazar oferta'}).click();expect((await state(page)).pendingTrade).toBeNull();
});

test('seven shows the lone rival’s resource cards face down and waits for a card click',async({page})=>{
  await page.goto('/');const g=robberyGame();await importGame(page,g);await moveRobber(page);
  const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Elige una carta de Mateo');
  await expect(dialog.locator('[data-steal-card]')).toHaveCount(3);
  await expect(dialog).not.toContainText(/Madera|Arcilla|Lana|Trigo|Mineral/);
  for(const button of await dialog.locator('[data-steal-card]').all()){expect(await button.getAttribute('data-resource')).toBeNull();expect(await button.getAttribute('title')).toBeNull();}
  expect((await state(page)).players).toEqual(g.players);await page.waitForTimeout(1000);expect((await state(page)).phase).toBe('steal');
  await page.screenshot({path:'test-results/robbery-hidden-cards.png'});
  await dialog.getByRole('button',{name:'Robar carta oculta 2 de Mateo',exact:true}).click();
  const after=await state(page);expect(after.phase).toBe('action');expect(total(after.players[0].hand)).toBe(3);expect(total(after.players[1].hand)).toBe(2);expect(after.players[1].dev).toEqual(g.players[1].dev);expect(after.players[2]).toEqual(g.players[2]);expect(after.bank).toEqual(g.bank);
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Terminar turno'})).toBeEnabled();
});

test('with multiple affected rivals, choosing a rival does not yet steal a card',async({page})=>{
  await page.goto('/');const g=robberyGame(true);await importGame(page,g);await moveRobber(page);
  const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Elige a quién robar');await expect(dialog.locator('[data-steal-card]')).toHaveCount(0);
  await dialog.locator('[data-victim="1"]').click();await expect(dialog.locator('[data-steal-card]')).toHaveCount(3);expect((await state(page)).players).toEqual(g.players);
  await dialog.locator('[data-victim="2"]').click();await expect(dialog.locator('[data-steal-card]')).toHaveCount(2);expect((await state(page)).players).toEqual(g.players);
  await dialog.locator('[data-steal-card="1"]').click();const after=await state(page);expect(after.players[1]).toEqual(g.players[1]);expect(total(after.players[2].hand)).toBe(1);expect(total(after.players[0].hand)).toBe(3);expect(after.log[0]).toContain('Eva');
});

test('pending robbery is restored on reload and cannot be skipped with Escape',async({page})=>{
  await page.goto('/');const g=robberyGame(true);await importGame(page,g);await moveRobber(page);await page.getByRole('dialog').locator('[data-victim="2"]').click();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();await page.reload();
  await expect(page.getByRole('dialog')).toContainText('Elige a quién robar');expect((await state(page)).players).toEqual(g.players);
  await chooseRobberyCard(page);expect((await state(page)).phase).toBe('action');
});

test('knight before dice opens hidden cards and returns to the required dice roll',async({page})=>{
  await page.goto('/');const g=robberyGame();g.phase='roll';g.dice=null;g.players[0].dev=[{type:'knight',turn:0}];await importGame(page,g);
  await page.locator('[data-act="cards"]').click();await page.locator('[data-dev="knight"]').click();expect((await state(page)).phase).toBe('robber');
  await moveRobber(page);await page.getByRole('dialog').locator('[data-steal-card="0"]').click();expect((await state(page)).phase).toBe('roll');await expect(page.getByRole('button',{name:'Lanzar dados'})).toBeEnabled();
});

test('no resource-bearing rivals means no robbery dialog and an explicit explanation',async({page})=>{
  await page.goto('/');const g=robberyGame();for(const r of RESOURCES){g.bank[r]+=g.players[1].hand[r];g.players[1].hand[r]=0;}await importGame(page,g);await moveRobber(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#toast')).toContainText('No hay rivales con cartas de recursos');expect((await state(page)).phase).toBe('action');expect((await state(page)).players[1].dev).toEqual(g.players[1].dev);
});

test('face-down resource card selection is usable on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');const g=robberyGame();
  await page.getByRole('button',{name:'Ajustes',exact:true}).click();await page.locator('#import-game').setInputFiles({name:'robbery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(g))});
  await moveRobber(page);const card=page.getByRole('dialog').getByRole('button',{name:'Robar carta oculta 3 de Mateo'});await expect(card).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/robbery-mobile.png'});await card.click();expect((await state(page)).phase).toBe('action');
});
