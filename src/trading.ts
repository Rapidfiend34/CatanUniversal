import { type Game, type Hand, type TradeOffer, type Command, RESOURCES, COSTS, emptyHand, total, points, legalRoads, legalSettlements, countBuildings, tradeRatio, validateTrade, isSecondary } from './engine.js';

interface Target { cost: Partial<Hand>; priority: number }
export function tradeTargets(g: Game, player: number): Target[] {
  const targets: Target[] = [];
  if (countBuildings(g, player, false) && countBuildings(g, player, true) < 4) targets.push({ cost: COSTS.city, priority: 5 });
  if (legalSettlements(g, false, player).length) targets.push({ cost: COSTS.settlement, priority: 4.5 });
  if (legalRoads(g, false, player).length) targets.push({ cost: COSTS.road, priority: 2 });
  if (g.deck.length) targets.push({ cost: COSTS.dev, priority: 2.5 });
  return targets;
}
function production(g: Game, player: number): Hand {
  const result = emptyHand();
  for (const v of g.vertices) if (v.owner === player) for (const id of v.tiles) { const t = g.tiles[id]; if (t.resource !== 'desert') result[t.resource] += (6 - Math.abs(7 - t.number)) * (v.city ? 2 : 1); }
  return result;
}
// Only the evaluating player's hand and public board information affect value.
export function tradeHandValue(g: Game, player: number, hand: Hand): number {
  const output = production(g, player);
  const resources = RESOURCES.reduce((value, r) => {
    const scarcity = 1 + 1 / (1 + output[r] / 4);
    return value + scarcity * (.55 * Math.min(hand[r], 3) + .3 * Math.min(Math.max(hand[r] - 3, 0), 3) + .1 * Math.max(hand[r] - 6, 0));
  }, 0);
  const progress = Math.max(0, ...tradeTargets(g, player).map(({ cost, priority }) => {
    const needed = RESOURCES.reduce((n, r) => n + (cost[r] || 0), 0);
    const missing = RESOURCES.reduce((n, r) => n + Math.max(0, (cost[r] || 0) - hand[r]), 0);
    return priority * Math.pow(1 - missing / needed, 2) + (missing === 0 ? priority * .4 : 0);
  }));
  return resources + progress;
}
export function assessTrade(g: Game, offer: TradeOffer): { accept: boolean; reason: string } {
  try { validateTrade(g, offer, true); } catch { return { accept: false, reason: 'No dispongo de los recursos para completar ese trato.' }; }
  const hand = g.players[offer.to].hand;
  if (total(offer.give) < total(offer.receive)) return { accept: false, reason: 'Pido al menos tantas cartas como entrego.' };
  if (points(g, offer.from, false) >= 9 && points(g, offer.to, false) < 8 && total(offer.give) <= total(offer.receive)) return { accept: false, reason: 'Prefiero no reforzar a un rival tan cerca de ganar.' };
  const after = { ...hand }; RESOURCES.forEach(r => { after[r] += offer.give[r] - offer.receive[r]; });
  const gain = tradeHandValue(g, offer.to, after) - tradeHandValue(g, offer.to, hand);
  return gain > .12 ? { accept: true, reason: 'El trato me ayuda a conseguir recursos para construir.' } : { accept: false, reason: 'Prefiero conservar esos recursos para mis construcciones.' };
}
export function botTradeProposal(g: Game): Extract<Command, { type: 'offer' }> | null {
  if (g.phase !== 'action' || g.freeRoads || g.pendingTrade || isSecondary(g) || g.variant === 'expanded' && (g.tradeAttempts?.length || 0) >= 2) return null;
  const me = g.current, hand = g.players[me].hand, before = tradeHandValue(g, me, hand);
  let selected: Extract<Command, { type: 'offer' }> | null = null, best = .12;
  for (const { cost } of tradeTargets(g, me)) for (const receive of RESOURCES) {
    if (hand[receive] >= (cost[receive] || 0)) continue;
    for (const give of RESOURCES) {
      if (give === receive) continue;
      for (const amount of [1, 2]) {
        if (hand[give] - (cost[give] || 0) < amount || amount >= tradeRatio(g, give)) continue;
        const after = { ...hand }; after[give] -= amount; after[receive]++;
        const gain = tradeHandValue(g, me, after) - before;
        if (gain <= .12) continue;
        for (let partner = 0; partner < g.players.length; partner++) {
          // Hand sizes are public; never inspect a partner's resource types to propose.
          if (partner === me || g.tradeAttempts?.includes(partner) || total(g.players[partner].hand) === 0) continue;
          if (points(g, partner, false) >= 9 && points(g, me, false) < 8) continue;
          const output = production(g, partner);
          const score = gain + .15 / (1 + output[give]) + Math.min(output[receive], 10) * .015;
          if (score > best) { const giveHand = emptyHand(), receiveHand = emptyHand(); giveHand[give] = amount; receiveHand[receive] = 1; selected = { type: 'offer', player: partner, give: giveHand, receive: receiveHand }; best = score; }
        }
      }
    }
  }
  return selected;
}
