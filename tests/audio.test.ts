import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameSounds } from '../src/audio.ts';
import { newGame, emptyHand } from '../src/engine.ts';

test('audio cues distinguish updates from polling and notify only the trade recipient', () => {
  const previous = newGame([{ name: 'Uno', bot: false }, { name: 'Dos', bot: false }, { name: 'Tres', bot: true }]);
  assert.deepEqual(gameSounds(previous, structuredClone(previous), 0), []);
  const next = structuredClone(previous);
  next.pendingTrade = { from: 0, to: 1, give: { ...emptyHand(), wood: 1 }, receive: { ...emptyHand(), ore: 1 } };
  assert.deepEqual(gameSounds(previous, next, 1), ['offer']);
  assert.deepEqual(gameSounds(previous, next, 0), []);
  assert.deepEqual(gameSounds(previous, next, null), []);
  assert.deepEqual(gameSounds(next, structuredClone(next), 1), []);
});

test('committed builds, rolls, turns and victory produce the corresponding audio cues', () => {
  const previous = newGame([{ name: 'Uno', bot: false }, { name: 'Dos', bot: false }, { name: 'Tres', bot: true }]);
  const build = structuredClone(previous); build.vertices[0].owner = 0;
  assert.deepEqual(gameSounds(previous, build, 0), ['build']);
  const roll = structuredClone(previous); roll.phase = 'action'; roll.dice = [3, 4];
  assert.deepEqual(gameSounds(previous, roll, 0), ['dice']);
  const turn = structuredClone(previous); turn.current = 1;
  assert.deepEqual(gameSounds(previous, turn, 1), ['turn']);
  assert.deepEqual(gameSounds(previous, turn, 0), []);
  const victory = structuredClone(previous); victory.phase = 'finished'; victory.winner = 0;
  assert.deepEqual(gameSounds(previous, victory, 0), ['victory']);
  assert.deepEqual(gameSounds(victory, structuredClone(victory), 0), []);
});
