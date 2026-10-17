import test from 'node:test';
import assert from 'node:assert/strict';
import { cutLanding, landingCutouts, polygonArea, type IslandKind, type Polygon } from '../src/skyblock-connections.ts';

const rectangle = (x: number, z: number, w: number, d: number): Polygon => [
  { x: x - w / 2, z: z - d / 2 }, { x: x + w / 2, z: z - d / 2 },
  { x: x + w / 2, z: z + d / 2 }, { x: x - w / 2, z: z + d / 2 },
];

// Independent separating-axis check: touching boundaries are not intersections.
function overlaps(a: Polygon, b: Polygon) {
  return [a, b].every(polygon => polygon.every((p, i) => {
    const q = polygon[(i + 1) % polygon.length], length = Math.hypot(q.x - p.x, q.z - p.z);
    if (length < 1e-10) return true;
    const project = (shape: Polygon) => shape.map(v => ((q.z - p.z) * v.x - (q.x - p.x) * v.z) / length);
    const pa = project(a), pb = project(b);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > 1e-8;
  }));
}

test('landing cuts retain untouched boards and remove fully covered boards', () => {
  const board = rectangle(0, 0, .1, .22);
  assert.deepEqual(cutLanding(board, [rectangle(1, 0, .3, .3)]), [board]);
  assert.deepEqual(cutLanding(board, [rectangle(0, 0, .3, .3)]), []);
  const half = cutLanding(board, [rectangle(.05, 0, .1, .3)]);
  assert.ok(Math.abs(half.reduce((area, p) => area + polygonArea(p), 0) - .011) < 1e-10);
});

test('bridge decks and beams never overlap any landing at all six edge orientations', () => {
  const kinds: IslandKind[] = ['junction', 'settlement', 'city'];
  for (let direction = 0; direction < 6; direction++) for (const start of kinds) for (const end of kinds) for (const supports of [false, true]) {
    const masks = landingCutouts(direction * Math.PI / 3, [start, end], supports);
    const boards = supports ? [-.077, .077].map(z => rectangle(0, z, 1, .030)) : Array.from({ length: 9 }, (_, i) => rectangle(-4 / 9 + i / 9, 0, 1 / 9 - .002, .22));
    let area = 0;
    for (const board of boards) {
      const pieces = cutLanding(board, masks);
      for (const piece of pieces) {
        assert.ok(polygonArea(piece) > 1e-10);
        assert.ok(masks.every(mask => !overlaps(piece, mask)), `${direction}: ${start}/${end}, supports=${supports}`);
        area += polygonArea(piece);
      }
      // Cutting again must not shrink or fragment the already fitted boards.
      assert.deepEqual(pieces.flatMap(piece => cutLanding(piece, masks)), pieces);
    }
    assert.ok(area > (supports ? .018 : .065), 'The walkable bridge must not disappear');
  }
});

test('diagonal landings reach the grass instead of leaving fixed-length gaps', () => {
  const masks = landingCutouts(Math.PI / 3, ['junction', 'junction']);
  const pieces = cutLanding(rectangle(0, 0, 1, .22), masks);
  const contains = (polygon: Polygon, x: number, z: number) => polygon.every((p, i) => {
    const q = polygon[(i + 1) % polygon.length]; return (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x) >= -1e-10;
  });
  // At this edge the square landing ends beyond the old fixed bridge length.
  assert.ok(pieces.some(piece => contains(piece, .37, .10)));
  assert.ok(!pieces.some(piece => contains(piece, .45, .10)));
});
