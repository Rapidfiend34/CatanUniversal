import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, execute, RESOURCES, emptyHand, total, points, bankSize, gameRules, isSecondary, secondaryPlayer, legalRoads, type Game, type Command, type Resource } from '../src/engine.ts';
import { botCommand } from '../src/bot.ts';
import { validateSave } from '../src/save.ts';
import { Rooms, type Room, RoomError } from '../server/rooms.ts';
import { MemoryStore } from '../server/store.ts';
import { randomBytes, randomUUID } from 'node:crypto';

function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function fresh(n = 10, seed = 1) { return newGame(Array.from({ length: n }, (_, i) => ({ name: `Bot ${i}`, bot: true })), seeded(seed), 'expanded'); }
function started(n = 10) { let g = fresh(n); while (g.phase.startsWith('setup')) g = execute(g, botCommand(g), seeded(g.setup)); return g; }
function grant(g: Game, r: Resource, n: number, p = g.current) { g.players[p].hand[r] += n; g.bank[r] -= n; }
function balance(g: Game) { for (const r of RESOURCES) { assert.equal(g.bank[r] + g.players.reduce((s, p) => s + p.hand[r], 0), bankSize(g)); assert(g.bank[r] >= 0); assert(g.players.every(p => Number.isInteger(p.hand[r]) && p.hand[r] >= 0)); } }

test('expanded maps have scaled supplies, connected topology, separated red tokens and ports', () => {
  for (const n of [5, 6, 7, 8, 9, 10]) for (let seed = 0; seed < 20; seed++) {
    const g = fresh(n, seed), rules = gameRules(n, 'expanded');
    assert.equal(g.tiles.length, n <= 6 ? 30 : n <= 8 ? 38 : 49);
    assert.equal(g.deck.length, n <= 6 ? 38 : n <= 8 ? 50 : 63);
    assert.equal(new Set(g.players.map(p => p.color)).size, n);
    [...RESOURCES, 'desert'].forEach((r, i) => assert.equal(g.tiles.filter(t => t.resource === r).length, rules.terrain[i]));
    assert.equal(g.vertices.filter(v => v.port).length, rules.ports * 2);
    assert.equal(g.vertices.length - g.edges.length + g.tiles.length, 1);
    const seen = new Set([0]); for (const id of seen) for (const edge of g.edges.filter(e => e.tiles.includes(id))) for (const other of edge.tiles) seen.add(other);
    assert.equal(seen.size, g.tiles.length);
    const histogram = (x: number) => g.tiles.filter(t => t.number === x).length;
    for (const value of [2, 3, 4, 5, 6]) assert.equal(histogram(value), histogram(14 - value));
    for (const t of g.tiles) {
      assert.equal(t.number === 0, t.resource === 'desert');
      if (t.number === 6 || t.number === 8) for (const other of g.tiles.filter(o => o.id !== t.id && (o.number === 6 || o.number === 8))) assert(Math.max(Math.abs(t.q - other.q), Math.abs(t.r - other.r), Math.abs(t.q + t.r - other.q - other.r)) > 1);
    }
    balance(g); validateSave(g);
  }
});

test('expanded setup still gives two free settlements and roads with conserved starting resources', () => {
  const g = started(); assert.equal(g.current, 0); assert.equal(g.turn, 1); assert.equal(g.phase, 'roll');
  for (let i = 0; i < 10; i++) { assert.equal(points(g, i), 2); assert.equal(g.edges.filter(e => e.owner === i).length, 2); }
  balance(g);
});

test('every player gets one intermediate build per round, with no roll, trade or development play', () => {
  for (const n of [5, 6, 7, 8, 9, 10]) {
    let g = started(n); const builders = new Set<number>();
    for (let i = 0; i < n; i++) {
      g.phase = 'action'; const main = g.current, turn = g.turn;
      g = execute(g, { type: 'end' }); assert.equal(g.primary, main); assert.equal(g.current, secondaryPlayer(g, main)); assert.equal(g.turn, turn); builders.add(g.current);
      for (const command of [{ type: 'roll' }, { type: 'trade', give: 'wood', receive: 'ore' }, { type: 'offer', player: main, give: { ...emptyHand(), wood: 1 }, receive: { ...emptyHand(), ore: 1 } }, { type: 'dev', card: 'knight' }] as Command[]) assert.throws(() => execute(g, command), /intermedia/);
      const copy = JSON.parse(JSON.stringify(g)); validateSave(copy); assert.deepEqual(copy, g);
      g = execute(copy, { type: 'end' }); assert.equal(g.current, (main + 1) % n); assert.equal(g.turn, turn + 1); assert.equal(g.phase, 'roll'); assert.equal(g.primary, null);
    }
    assert.equal(builders.size, n);
  }
});

test('intermediate builder pays normal costs, can buy development and win immediately', () => {
  let g = started(); g.phase = 'action'; g = execute(g, { type: 'end' });
  grant(g, 'wood', 1); grant(g, 'brick', 1); const road = legalRoads(g, false)[0]; const before = { ...g.players[g.current].hand };
  g = execute(g, { type: 'road', id: road }); assert.equal(g.players[g.current].hand.wood, before.wood - 1); assert.equal(g.players[g.current].hand.brick, before.brick - 1);
  for (const r of ['sheep', 'wheat', 'ore'] as Resource[]) grant(g, r, 1);
  const deck = g.deck.length; g = execute(g, { type: 'buy' }); assert.equal(g.deck.length, deck - 1); balance(g);
  const actor = g.current; g.players[actor].dev = Array.from({ length: 7 }, () => ({ type: 'victory' as const, turn: 0 }));
  const vertex = g.vertices.find(v => v.owner === actor)!; grant(g, 'ore', 3); grant(g, 'wheat', 2);
  g = execute(g, { type: 'city', id: vertex.id }); assert.equal(g.winner, actor); assert.equal(g.phase, 'finished'); validateSave(g);
});

test('expanded Monopoly touches only one to three selected rivals and rejects forged targets', () => {
  const g = started(); g.phase = 'action'; g.players[0].dev = [{ type: 'monopoly', turn: 0 }];
  for (let i = 1; i < 10; i++) grant(g, 'ore', 2, i);
  for (const targets of [undefined, [], [1, 2, 3, 4], [1, 1], [0], [10], [-1]]) assert.throws(() => execute(g, { type: 'dev', card: 'monopoly', resources: ['ore'], targets }));
  const before = g.players[0].hand.ore, after = execute(g, { type: 'dev', card: 'monopoly', resources: ['ore'], targets: [1, 5, 9] });
  assert.equal(after.players[0].hand.ore, before + [1, 5, 9].reduce((s, i) => s + g.players[i].hand.ore, 0));
  for (let i = 1; i < 10; i++) assert.equal(after.players[i].hand.ore, [1, 5, 9].includes(i) ? 0 : g.players[i].hand.ore);
  balance(after);
});

test('short bank stock is withheld for multiple recipients and partially paid to a sole recipient', () => {
  let g = fresh(); g.phase = 'roll'; g.turn = 1;
  const tile = g.tiles.find(t => t.resource === 'wood')!; g.tiles.forEach(t => { if (t.resource === 'wood') t.number = 3; }); tile.number = 6;
  g.vertices[tile.vertices[0]].owner = 0; g.vertices[tile.vertices[2]].owner = 1; grant(g, 'wood', 49, 9);
  let after = execute(g, { type: 'roll' }, () => .34); assert.equal(after.players[0].hand.wood, 0); assert.equal(after.players[1].hand.wood, 0); assert.equal(after.bank.wood, 1); assert(after.log.some(s => s.includes('Escasez'))); balance(after);
  g.vertices[tile.vertices[2]].owner = null; g.vertices[tile.vertices[0]].city = true;
  after = execute(g, { type: 'roll' }, () => .34); assert.equal(after.players[0].hand.wood, 1); assert.equal(after.bank.wood, 0); balance(after);
});

test('classic saves remain valid and expanded saves reject incorrect supply, variant and secondary actor', () => {
  const classic = newGame(Array.from({ length: 3 }, (_, i) => ({ name: '' + i, bot: true }))); delete classic.variant; delete classic.primary; validateSave(classic);
  const expanded = started(); validateSave(expanded);
  const wrong = structuredClone(expanded); wrong.bank.wood++; assert.throws(() => validateSave(wrong));
  wrong.bank.wood--; wrong.variant = 'classic'; assert.throws(() => validateSave(wrong));
  const secondary = structuredClone(expanded); secondary.phase = 'action'; secondary.primary = 0; assert.throws(() => validateSave(secondary));
});

test('complete 5–10 player AI games finish with conserved resources and legal intermediate actions', () => {
  for (const n of [5, 6, 7, 8, 9, 10]) {
    const rng = seeded(n); let g = newGame(Array.from({ length: n }, (_, i) => ({ name: `Bot ${i}`, bot: true })), rng, 'expanded'), steps = 0, builds = 0;
    while (g.phase !== 'finished' && steps++ < 6000) {
      const command = botCommand(g); if (isSecondary(g)) { assert(['road', 'settlement', 'city', 'buy', 'end'].includes(command.type)); if (command.type !== 'end') builds++; }
      g = execute(g, command, rng); balance(g);
    }
    assert.equal(g.phase, 'finished', `AI game with ${n} players must finish`); assert(points(g, g.winner!) >= 10); assert(builds > 0); validateSave(g);
  }
});

const token = () => randomBytes(32).toString('hex');
for (const mode of ['online', 'party'] as const) test(`expanded ${mode} room supports ten seats, private views and authorized intermediate construction`, async () => {
  const store = new MemoryStore(), service = new Rooms(store), host = token(), players = Array.from({ length: 10 }, (_, i) => mode === 'online' && i === 0 ? host : token()), code = 'BIGG234';
  await service.create({ code, token: host, name: 'Host', capacity: 10, variant: 'expanded', mode });
  for (let i = mode === 'online' ? 1 : 0; i < 10; i++) await service.join(code, players[i], `Friend ${i}`);
  await assert.rejects(() => service.join(code, token(), 'Extra'));
  for (const t of players) await service.update(code, t, { op: 'ready', ready: true });
  let view = await service.update(code, host, { op: 'start' }); assert.equal(view.variant, 'expanded'); assert.equal(view.game!.players.length, 10); assert.equal(view.deckCount, 63);
  async function setGame(fn: (g: Game) => void) { const record = (await store.read<Room>(code))!; fn(record.value.game!); await store.write(code, record.value, record.etag); }
  // Exercise IDs beyond the old four-player map through the actual command parser.
  const initial = view.game!; const id = initial.vertices.find(v => v.id > 53 && v.tiles.length === 3)!.id;
  const send = (v: typeof view, command: Command) => ({ op: 'command', gameVersion: v.gameVersion, requestId: randomUUID(), command });
  view = await service.update(code, players[0], send(view, { type: 'settlement', id })); assert.equal(view.game!.vertices[id].owner, 0);
  const road = view.game!.vertices[id].edges.find(e => e > 71)!; assert(road > 71); view = await service.update(code, players[0], send(view, { type: 'road', id: road })); assert.equal(view.game!.edges[road].owner, 0);
  await setGame(g => { g.phase = 'action'; g.turn = 1; g.setup = 20; g.current = 0; g.players.forEach(p => { p.bot = false; }); grant(g, 'wood', 30, 9); });
  view = await service.sync(code, players[0]); view = await service.update(code, players[0], send(view, { type: 'end' })); assert.equal(view.game!.current, 5); assert.equal(view.game!.primary, 0);
  await assert.rejects(() => service.update(code, players[0], send(view, { type: 'buy' })), (e: RoomError) => e.status === 403);
  await assert.rejects(() => service.update(code, players[5], send(view, { type: 'trade', give: 'wood', receive: 'ore' })));
  view = await service.update(code, players[5], send(view, { type: 'end' })); assert.equal(view.game!.current, 1); assert.equal(view.game!.phase, 'roll');
  const ninth = await service.sync(code, players[9]); assert.equal(ninth.game!.players[9].hand.wood, 30); assert.equal(ninth.self, 9); assert(ninth.game!.players.filter((_, i) => i !== 9).every(p => total(p.hand) === 0));
  if (mode === 'party') { const tv = await service.sync(code, host); assert.equal(tv.self, null); assert(tv.game!.players.every(p => total(p.hand) === 0)); }
  await setGame(g => { g.current = 9; g.phase = 'discard'; g.discards[9] = 15; });
  view = await service.sync(code, players[9]); view = await service.update(code, players[9], send(view, { type: 'discard', player: 9, cards: { ...emptyHand(), wood: 15 } })); assert.equal(view.game!.players[9].hand.wood, 15);
  const tile = view.game!.tiles.find(t => t.id > 18 && t.id !== view.game!.robber)!.id;
  view = await service.update(code, players[9], send(view, { type: 'robber', tile })); assert.equal(view.game!.robber, tile);
});

test('expanded room fills eight empty seats with named AI players', async () => {
  const service = new Rooms(new MemoryStore()), host = token(), friend = token(), code = 'BOTS234';
  await service.create({ code, token: host, name: 'Host', mode: 'online', variant: 'expanded', capacity: 10 }); await service.join(code, friend, 'Friend');
  for (const t of [host, friend]) await service.update(code, t, { op: 'ready', ready: true });
  const view = await service.update(code, host, { op: 'start' }); assert.equal(view.game!.players.filter(p => p.bot).length, 8); assert(view.game!.players.every(p => p.name && p.color));
});
