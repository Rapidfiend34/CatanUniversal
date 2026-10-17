import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/engine.ts';
import { roomNotice } from '../src/online/notices.ts';
import type { RoomView } from '../src/online/types.ts';

function fixture(): RoomView {
  const game = newGame([{ name: 'Lucía', bot: false }, { name: 'Mateo', bot: false }, { name: 'Eva', bot: true }]);
  return { code: 'TEST234', mode: 'online', capacity: 3, version: 1, gameVersion: 1, expiresAt: Date.now() + 100000,
    isHost: true, self: 0, screen: false, seats: game.players.slice(0, 2).map(p => ({ ...p, ready: false })),
    game, cardCounts: [0, 0, 0], devCounts: [0, 0, 0], deckCount: 25, scores: [0, 0, 0], preview: 'inspect' };
}

test('room notices skip initial restoration, unchanged polls, previews and actions from self', () => {
  const before = fixture(), next = structuredClone(before);
  assert.equal(roomNotice(null, next), null);
  assert.equal(roomNotice(before, next), null);
  next.version++; next.preview = 'road';
  assert.equal(roomNotice(before, next), null);
  next.gameVersion++; next.game!.log.unshift('Lucía construye una carretera.');
  assert.equal(roomNotice(before, next), null);
});

test('new public actions are grouped and a trade response is attributed to the responder', () => {
  const before = fixture(), next = structuredClone(before); next.gameVersion++;
  next.game!.log.unshift('Mateo funda un poblado.', 'Mateo construye una carretera.');
  assert.match(roomNotice(before, next)!, /Mateo funda un poblado.*1 eventos más/);
  const response = structuredClone(before); response.gameVersion++;
  response.game!.log.unshift('Mateo acepta: Lucía intercambia recursos con Mateo.');
  assert.equal(roomNotice(before, response), response.game!.log[0]);
  response.self = 1;
  assert.equal(roomNotice({ ...before, self: 1 }, response), null);
  next.game!.current = 0; next.game!.turn++;
  assert.match(roomNotice(before, next)!, /Es tu turno/);
});

test('Party TV receives public notices, including capped histories, without disclosing hands', () => {
  const before = fixture(); before.self = null; before.screen = true;
  before.game!.log = Array.from({ length: 70 }, (_, i) => `Mensaje ${i}`);
  const next = structuredClone(before); next.gameVersion++;
  next.game!.log = ['Mateo roba una carta a Lucía.', ...before.game!.log.slice(0, 69)];
  assert.equal(roomNotice(before, next), 'Mateo roba una carta a Lucía.');
  next.game!.players[1].hand.ore = 19; next.game!.players[1].dev = [{ type: 'victory', turn: 0 }];
  assert.equal(roomNotice(before, next), 'Mateo roba una carta a Lucía.');
  next.game!.log = ['Sin coincidencias con la vista anterior.'];
  assert.equal(roomNotice(before, next), null);
});

test('lobby notices distinguish readiness, newly occupied seats and a full room', () => {
  const before = fixture(); before.game = null;
  const next = structuredClone(before); next.seats[1].ready = true;
  assert.equal(roomNotice(before, next), 'Mateo está listo para empezar.');
  next.seats.push({ name: 'Eva', ready: false, color: '#123456' });
  assert.equal(roomNotice(before, next), 'Sala completa. Los 3 jugadores ya tienen plaza.');
  const empty = structuredClone(before); empty.seats = []; empty.mode = 'party'; empty.self = null;
  const joined = structuredClone(empty); joined.seats = [before.seats[1]];
  assert.equal(roomNotice(empty, joined), 'Mateo se ha unido a la sala.');
});
