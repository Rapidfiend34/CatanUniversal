export type IslandKind = 'junction' | 'settlement' | 'city';
export type Point = { x: number; z: number };
export type Polygon = Point[];

// The same cells drive the visible islands and the bridge cut-outs.
export function islandCells(kind: IslandKind) {
  const cells: { x: number; z: number; size: number }[] = [];
  const radius = kind === 'junction' ? 1 : 2, size = kind === 'junction' ? .10 : .09;
  for (let x = -radius; x <= (kind === 'city' ? 3 : radius); x++) for (let z = -radius; z <= radius; z++) {
    if (kind !== 'junction' && (Math.abs(x) === 2 && Math.abs(z) === 2 || x === 3 && Math.abs(z) > 1)) continue;
    cells.push({ x: x * size, z: z * size, size });
  }
  return cells;
}

export function landingCutouts(angle: number, ends: readonly [IslandKind, IslandKind], supports = false): Polygon[] {
  return ends.flatMap((kind, end) => {
    const rotation = angle + (kind === 'junction' ? 0 : Math.PI / 6), c = Math.cos(rotation), s = Math.sin(rotation);
    const cells = islandCells(kind).map(cell => ({ x: cell.x, z: cell.z, w: cell.size, d: cell.size }));
    if (supports && kind !== 'junction') {
      const columns = kind === 'city' ? 5 : 4;
      for (let x = 0; x < columns; x++) for (let z = 0; z < 4; z++) cells.push({ x: (x - (columns - 1) / 2) * .09 + (kind === 'city' ? .025 : 0), z: (z - 1.5) * .09, w: .09, d: .09 });
      cells.push({ x: -.175, z: .09, w: .07, d: .09 });
    }
    return cells.map(cell => {
      // A hairline clearance prevents touching faces flickering at grazing angles.
      const w = cell.w / 2 + .001, d = cell.d / 2 + .001;
      return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => ({
        x: (cell.x + x) * c + (cell.z + z) * s + (end ? .5 : -.5),
        z: -(cell.x + x) * s + (cell.z + z) * c,
      }));
    });
  });
}

export function polygonArea(polygon: Polygon) {
  return Math.abs(polygon.reduce((area, p, i) => {
    const q = polygon[(i + 1) % polygon.length]; return area + p.x * q.z - q.x * p.z;
  }, 0)) / 2;
}

function halfPlane(polygon: Polygon, a: Point, b: Point, inside: boolean): Polygon {
  const distance = (p: Point) => ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) * (inside ? 1 : -1);
  const result: Polygon = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = distance(p), dq = distance(q);
    if (dp >= 0) result.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq); result.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
    }
  }
  return result;
}

// Subtract convex cell footprints, retaining disjoint convex pieces. This cuts
// the actual timber geometry, not just its depth buffer or drawing order.
export function cutLanding(polygon: Polygon, cutouts: Polygon[]): Polygon[] {
  let pieces = [polygon];
  for (const mask of cutouts) {
    const next: Polygon[] = [];
    for (const piece of pieces) {
      let inside = piece;
      const outside: Polygon[] = [];
      for (let i = 0; i < mask.length && inside.length; i++) {
        const a = mask[i], b = mask[(i + 1) % mask.length];
        const fragment = halfPlane(inside, a, b, false);
        if (polygonArea(fragment) > 1e-10) outside.push(fragment);
        inside = halfPlane(inside, a, b, true);
      }
      // Keep the original polygon when the cell does not intersect it. This
      // avoids unnecessary fragmentation and preserves instanced full boards.
      next.push(...(polygonArea(inside) > 1e-10 ? outside : [piece]));
    }
    pieces = next;
  }
  return pieces;
}
