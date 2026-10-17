import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, execute, legalSettlements } from '../src/engine.ts';
import { historyEntries, filterHistory } from '../src/history.ts';

const players = [{ name: 'Ana', bot: false }, { name: 'Ana María', bot: false }, { name: 'Dados [7].', bot: false }];

test('history classifies actual engine events and reads older saves without changing game data', () => {
  const initial = newGame(players);
  const game = execute(initial, { type: 'settlement', id: legalSettlements(initial)[0] });
  const before = structuredClone(game);
  const entries = historyEntries(game);
  assert.equal(entries[0].category, 'build');
  assert.deepEqual(entries[0].players, [0]);
  assert.equal(entries[1].important, true);
  assert.deepEqual(game, before);
});

test('history combines category and player filters, including both sides of each trade and robbery', () => {
  const game = { players, log: [
    'Ana María propone un intercambio a Ana.',
    'Ana acepta: Ana María intercambia recursos con Ana.',
    'Ana rechaza el intercambio de Ana María. Dados [7]. prefiere construir.',
    'Ana María comercia con el banco (3:1).',
    'Ana María roba una carta a Ana.',
    'Ana funda un poblado.',
  ] };
  const entries = historyEntries(game);
  assert.equal(filterHistory(entries, 'trade', 0).length, 3);
  assert.equal(filterHistory(entries, 'trade', 1).length, 4);
  assert.equal(filterHistory(entries, 'trade', 2).length, 0);
  assert.equal(filterHistory(entries, 'important', 0)[0].text, game.log[4]);
  assert.deepEqual(filterHistory(entries, 'build', 0).map(e => e.text), ['Ana funda un poblado.']);
});

test('important events include sevens, discards, robber, scarcity and victory without losing dice filtering', () => {
  const entries = historyEntries({ players, log: [
    'Dados [7]. lanza los dados: 7.', 'Ana lanza los dados: 8.',
    'Ana descarta 4 cartas.', 'Ana María mueve el ladrón.',
    'Escasez de Madera: se entrega lo que queda en el banco.',
    'Dados [7]. gana con 10 puntos.', 'Ana juega Caballero.', 'Turno de Ana.',
    'Construcción intermedia de Ana María: construye, compra desarrollo o pasa.',
    'Un mensaje antiguo no reconocido.',
  ] });
  assert.equal(filterHistory(entries, 'important').length, 5);
  assert.equal(filterHistory(entries, 'dice').length, 2);
  assert.equal(filterHistory(entries, 'cards', 0).length, 1);
  assert.equal(filterHistory(entries, 'turns').length, 2);
  assert.equal(filterHistory(entries, 'all').at(-1)?.text, 'Un mensaje antiguo no reconocido.');
  assert.deepEqual(entries[0].players, [2]);
});

test('history keeps newest-first order and uses only public messages, not private hands', () => {
  const game = newGame(players);
  game.log = Array.from({ length: 80 }, (_, i) => `Evento ${i}`);
  const entries = historyEntries(game);
  assert.equal(entries.length, 70);
  assert.equal(entries[0].text, 'Evento 0');
  assert.equal(entries.at(-1)?.text, 'Evento 69');
  const redacted = structuredClone(game); redacted.players.forEach(p => { p.hand.ore = 19; p.dev = [{ type: 'victory', turn: 0 }]; });
  assert.deepEqual(historyEntries(redacted), entries);
});
