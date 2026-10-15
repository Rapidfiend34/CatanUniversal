import { type Game, type Command, type Resource, RESOURCES, COSTS, canAfford, legalSettlements, legalRoads, countBuildings, tradeRatio, emptyHand, points } from './engine.js';
import { assessTrade, botTradeProposal } from './trading.js';

export function siteScore(g: Game, id: number, p = g.current): number {
  const v = g.vertices[id];
  const owned = new Set(g.vertices.filter(v => v.owner === p).flatMap(v => v.tiles.map(t => g.tiles[t].resource)));
  return v.tiles.reduce((s, t) => { const tile = g.tiles[t]; return s + (tile.number ? 6 - Math.abs(7 - tile.number) : 0) * (tile.resource === 'ore' || tile.resource === 'wheat' ? 1.15 : 1) + (owned.has(tile.resource) ? 0 : 1.1); }, 0) + (v.port ? 1 : 0);
}
function best<T>(items: T[], score: (a: T) => number): T { return [...items].sort((a, b) => score(b) - score(a))[0]; }
export function botCommand(g: Game): Command {
  if (g.pendingTrade) { const decision = assessTrade(g, g.pendingTrade); return { type: 'respond', player: g.pendingTrade.to, ...decision }; }
  const p = g.players[g.current];
  switch (g.phase) {
    case 'setup-settlement': return { type: 'settlement', id: best(legalSettlements(g), id => siteScore(g, id)) };
    case 'setup-road': return { type: 'road', id: best(legalRoads(g), id => { const e = g.edges[id]; const v = e.a === g.anchor ? e.b : e.a; return siteScore(g, v); }) };
    case 'roll': return { type: 'roll' };
    case 'discard': {
      const i = g.discards.findIndex(Boolean), cards = emptyHand(), available = { ...g.players[i].hand };
      for (let n = 0; n < g.discards[i]; n++) { const r = best([...RESOURCES], r => available[r]); cards[r]++; available[r]--; }
      return { type: 'discard', player: i, cards };
    }
    case 'robber': return { type: 'robber', tile: best(g.tiles.filter(t => t.id !== g.robber), t => t.vertices.reduce((s, id) => { const v = g.vertices[id]; return s + (v.owner === g.current ? -15 : v.owner !== null ? (v.city ? 4 : 2) + points(g, v.owner, false) : 0); }, 0) + (t.number ? (6 - Math.abs(7 - t.number)) * .3 : 0)).id };
    case 'steal': return { type: 'steal', player: best(g.victims, i => points(g, i, false)) };
    default: break;
  }
  const roads = legalRoads(g, false), settlements = legalSettlements(g, false);
  const road = () => best(roads, id => {
    const e = g.edges[id];
    // Prefer roads leading to unoccupied, valuable settlement locations.
    return Math.max(...[e.a, e.b].map(v => g.vertices[v].owner === null ? siteScore(g, v) - g.vertices[v].edges.filter(i => g.edges[i].owner === g.current).length * 3 : -20));
  });
  if (g.freeRoads) return { type: 'road', id: road() };
  const dev = p.dev.find(d => d.turn < g.turn && d.type !== 'victory' && !p.played);
  if (dev) {
    if (dev.type === 'knight' || (dev.type === 'roads' && roads.length)) return { type: 'dev', card: dev.type };
    if (dev.type === 'monopoly') return { type: 'dev', card: 'monopoly', resources: [best([...RESOURCES], r => g.players.reduce((n, o, i) => n + (i !== g.current ? o.hand[r] : 0), 0))] };
    if (dev.type === 'plenty' && RESOURCES.some(r => g.bank[r] >= 2)) { const r = best(RESOURCES.filter(r => g.bank[r] >= 2), r => 5 - p.hand[r] + (r === 'ore' ? 1 : 0)); return { type: 'dev', card: 'plenty', resources: [r, r] }; }
  }
  const city = g.vertices.find(v => v.owner === g.current && !v.city);
  if (city && countBuildings(g, g.current, true) < 4 && canAfford(g, COSTS.city)) return { type: 'city', id: best(g.vertices.filter(v => v.owner === g.current && !v.city), v => siteScore(g, v.id)).id };
  if (settlements.length && canAfford(g, COSTS.settlement)) return { type: 'settlement', id: best(settlements, id => siteScore(g, id)) };
  if (roads.length && canAfford(g, COSTS.road)) return { type: 'road', id: road() };
  const offer = botTradeProposal(g);
  if (offer) return offer;
  // After negotiations, use the bank toward a specific purchase.
  const targets = [city && countBuildings(g, g.current, true) < 4 ? COSTS.city : null, settlements.length ? COSTS.settlement : null, roads.length ? COSTS.road : null, g.deck.length ? COSTS.dev : null].filter(Boolean) as Partial<Record<Resource, number>>[];
  for (const cost of targets) {
    const missing = RESOURCES.find(r => p.hand[r] < (cost[r] || 0) && g.bank[r]);
    if (missing) { const surplus = RESOURCES.find(r => r !== missing && p.hand[r] - (cost[r] || 0) >= tradeRatio(g, r)); if (surplus) return { type: 'trade', give: surplus, receive: missing }; }
  }
  if (g.deck.length && canAfford(g, COSTS.dev)) return { type: 'buy' };
  return { type: 'end' };
}
