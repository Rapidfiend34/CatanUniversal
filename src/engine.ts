export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type Resource = typeof RESOURCES[number];
export type Hand = Record<Resource, number>;
export const NAMES: Record<Resource, string> = { wood: 'Madera', brick: 'Arcilla', sheep: 'Lana', wheat: 'Trigo', ore: 'Mineral' };
export const COLORS = ['#d46d49', '#5299ad', '#a79b58', '#a581b3'];
export const emptyHand = (): Hand => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const total = (h: Hand) => RESOURCES.reduce((n, r) => n + h[r], 0);
export type Dev = 'knight' | 'victory' | 'roads' | 'monopoly' | 'plenty';
export const DEV_NAMES: Record<Dev, string> = { knight: 'Caballero', victory: 'Punto de victoria', roads: 'Construcción de carreteras', monopoly: 'Monopolio', plenty: 'Año de abundancia' };
export interface Tile { id: number; q: number; r: number; x: number; z: number; resource: Resource | 'desert'; number: number; vertices: number[] }
export interface Vertex { id: number; x: number; z: number; tiles: number[]; edges: number[]; owner: number | null; city: boolean; port?: Resource | 'any' }
export interface Edge { id: number; a: number; b: number; tiles: number[]; owner: number | null }
export interface Player { name: string; bot: boolean; color: string; hand: Hand; dev: { type: Dev; turn: number }[]; knights: number; played: boolean }
export interface TradeOffer { from: number; to: number; give: Hand; receive: Hand }
export type Phase = 'setup-settlement' | 'setup-road' | 'roll' | 'discard' | 'robber' | 'steal' | 'action' | 'finished';
export interface Game { version: 1; tiles: Tile[]; vertices: Vertex[]; edges: Edge[]; players: Player[]; bank: Hand; deck: Dev[]; current: number; phase: Phase; setup: number; anchor: number | null; turn: number; dice: [number, number] | null; robber: number; discards: number[]; resume: 'roll' | 'action'; victims: number[]; freeRoads: number; longest: number | null; army: number | null; winner: number | null; log: string[]; lastProduction: number[]; pendingTrade?: TradeOffer | null; tradeAttempts?: number[] }
export const COSTS: Record<'road' | 'settlement' | 'city' | 'dev', Partial<Hand>> = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, dev: { sheep: 1, wheat: 1, ore: 1 } };
export function shuffle<T>(items: T[], rng = Math.random): T[] { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function newGame(config: { name: string; bot: boolean }[], rng = Math.random): Game {
  if (config.length < 3 || config.length > 4) throw new Error('La partida necesita 3 o 4 jugadores.');
  const tiles: Tile[] = [], vertices: Vertex[] = [], edges: Edge[] = [];
  const vs = new Map<string, number>(), es = new Map<string, number>();
  const terrain = shuffle<Resource | 'desert'>([...Array(4).fill('wood'), ...Array(4).fill('sheep'), ...Array(4).fill('wheat'), ...Array(3).fill('brick'), ...Array(3).fill('ore'), 'desert'], rng);
  // Backtracking distributes the standard tokens without adjacent sixes/eights.
  const numbers = shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12], rng);
  for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) {
    if (Math.abs(q + r) > 2) continue;
    const id = tiles.length, x = Math.sqrt(3) * (q + r / 2), z = 1.5 * r;
    const tile: Tile = { id, q, r, x, z, resource: terrain[id], number: 0, vertices: [] };
    for (let k = 0; k < 6; k++) {
      const a = (30 + k * 60) * Math.PI / 180, vx = x + Math.cos(a), vz = z + Math.sin(a);
      const key = `${vx.toFixed(4)},${vz.toFixed(4)}`.replace(/-0\.0000/g, '0.0000');
      let v = vs.get(key);
      if (v === undefined) { v = vertices.length; vs.set(key, v); vertices.push({ id: v, x: vx, z: vz, tiles: [], edges: [], owner: null, city: false }); }
      vertices[v].tiles.push(id); tile.vertices.push(v);
    }
    for (let k = 0; k < 6; k++) {
      const a = tile.vertices[k], b = tile.vertices[(k + 1) % 6], key = [a, b].sort((a, b) => a - b).join(',');
      let e = es.get(key);
      if (e === undefined) { e = edges.length; es.set(key, e); edges.push({ id: e, a, b, tiles: [], owner: null }); vertices[a].edges.push(e); vertices[b].edges.push(e); }
      edges[e].tiles.push(id);
    }
    tiles.push(tile);
  }
  const land = tiles.filter(t => t.resource !== 'desert');
  function assign(i: number, remaining: number[]): boolean {
    if (i === land.length) return true;
    const t = land[i];
    for (const n of new Set(remaining)) {
      if ((n === 6 || n === 8) && land.slice(0, i).some(o => (o.number === 6 || o.number === 8) && Math.max(Math.abs(o.q - t.q), Math.abs(o.r - t.r), Math.abs(o.q + o.r - t.q - t.r)) === 1)) continue;
      t.number = n; const rest = [...remaining]; rest.splice(rest.indexOf(n), 1);
      if (assign(i + 1, rest)) return true;
    }
    t.number = 0; return false;
  }
  assign(0, numbers);
  const coast = edges.filter(e => e.tiles.length === 1).sort((a, b) => Math.atan2(vertices[a.a].z + vertices[a.b].z, vertices[a.a].x + vertices[a.b].x) - Math.atan2(vertices[b.a].z + vertices[b.b].z, vertices[b.a].x + vertices[b.b].x));
  const ports = shuffle<Resource | 'any'>(['any', 'any', 'any', 'any', ...RESOURCES], rng);
  ports.forEach((p, i) => { const e = coast[Math.floor(i * coast.length / 9)]; vertices[e.a].port = p; vertices[e.b].port = p; });
  return { version: 1, tiles, vertices, edges, players: config.map((p, i) => ({ ...p, name: p.name.trim().slice(0, 22) || `Jugador ${i + 1}`, color: COLORS[i], hand: emptyHand(), dev: [], knights: 0, played: false })), bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 }, deck: shuffle<Dev>([...Array(14).fill('knight'), ...Array(5).fill('victory'), 'roads', 'roads', 'monopoly', 'monopoly', 'plenty', 'plenty'], rng), current: 0, phase: 'setup-settlement', setup: 0, anchor: null, turn: 0, dice: null, robber: tiles.find(t => t.resource === 'desert')!.id, discards: config.map(() => 0), resume: 'action', victims: [], freeRoads: 0, longest: null, army: null, winner: null, log: ['Una nueva isla. Una historia por construir.'], lastProduction: [] };
}
export const canAfford = (g: Game, cost: Partial<Hand>, p = g.current) => RESOURCES.every(r => g.players[p].hand[r] >= (cost[r] || 0));
export const countBuildings = (g: Game, p: number, city: boolean) => g.vertices.filter(v => v.owner === p && v.city === city).length;
export function legalSettlements(g: Game, setup = g.phase === 'setup-settlement', p = g.current): number[] {
  if (countBuildings(g, p, false) >= 5) return [];
  return g.vertices.filter(v => v.owner === null && v.edges.every(e => g.vertices[g.edges[e].a === v.id ? g.edges[e].b : g.edges[e].a].owner === null) && (setup || v.edges.some(e => g.edges[e].owner === p))).map(v => v.id);
}
export function legalRoads(g: Game, setup = g.phase === 'setup-road', p = g.current): number[] {
  if (g.edges.filter(e => e.owner === p).length >= 15) return [];
  return g.edges.filter(e => e.owner === null && (setup ? e.a === g.anchor || e.b === g.anchor : [e.a, e.b].some(id => { const v = g.vertices[id]; return v.owner === p || (v.owner === null && v.edges.some(n => g.edges[n].owner === p)); }))).map(e => e.id);
}
export function longestLength(g: Game, p: number): number {
  let best = 0;
  function walk(v: number, used: Set<number>): void {
    best = Math.max(best, used.size);
    if (used.size && g.vertices[v].owner !== null && g.vertices[v].owner !== p) return;
    for (const e of g.vertices[v].edges) if (g.edges[e].owner === p && !used.has(e)) { used.add(e); walk(g.edges[e].a === v ? g.edges[e].b : g.edges[e].a, used); used.delete(e); }
  }
  const starts = new Set(g.edges.filter(e => e.owner === p).flatMap(e => [e.a, e.b]));
  starts.forEach(v => walk(v, new Set())); return best;
}
export function points(g: Game, p: number, hidden = true): number { return g.vertices.filter(v => v.owner === p).reduce((n, v) => n + (v.city ? 2 : 1), 0) + (g.longest === p ? 2 : 0) + (g.army === p ? 2 : 0) + (hidden ? g.players[p].dev.filter(d => d.type === 'victory').length : 0); }
export function tradeRatio(g: Game, r: Resource, p = g.current): number { const ports = g.vertices.filter(v => v.owner === p).map(v => v.port); return ports.includes(r) ? 2 : ports.includes('any') ? 3 : 4; }
export function robberyVictims(g: Game, tile = g.robber): number[] {
  return [...new Set(g.tiles[tile].vertices.map(v => g.vertices[v].owner).filter((i): i is number => i !== null && i !== g.current && total(g.players[i].hand) > 0))];
}
function awards(g: Game) {
  for (const kind of ['longest', 'army'] as const) {
    const scores = g.players.map((p, i) => kind === 'longest' ? longestLength(g, i) : p.knights), max = Math.max(...scores), candidates = scores.map((n, i) => n === max ? i : -1).filter(i => i >= 0);
    if (max < (kind === 'longest' ? 5 : 3)) g[kind] = null;
    else if (candidates.length === 1) g[kind] = candidates[0];
    else if (g[kind] === null || !candidates.includes(g[kind]!)) g[kind] = null;
  }
}
export type Command = { type: 'settlement' | 'city' | 'road'; id: number } | { type: 'roll' } | { type: 'end' } | { type: 'robber'; tile: number } | { type: 'steal'; player: number; card?: number } | { type: 'discard'; player: number; cards: Hand } | { type: 'trade'; give: Resource; receive: Resource } | { type: 'offer'; player: number; give: Hand; receive: Hand } | { type: 'respond'; player: number; accept: boolean; reason?: string } | { type: 'buy' } | { type: 'dev'; card: Dev; resources?: Resource[] };
export class RuleError extends Error {}
const requireRule = (ok: unknown, message: string): void => { if (!ok) throw new RuleError(message); };
export function validateTrade(g: Game, offer: TradeOffer, requireBothHands = false): void {
  requireRule(offer.from === g.current && Number.isInteger(offer.to) && g.players[offer.to] && offer.to !== offer.from, 'Elige otro jugador.');
  requireRule(offer.give && offer.receive && RESOURCES.every(r => Number.isInteger(offer.give[r]) && Number.isInteger(offer.receive[r]) && offer.give[r] >= 0 && offer.receive[r] >= 0 && offer.receive[r] <= 19 && (!offer.give[r] || !offer.receive[r])) && total(offer.give) > 0 && total(offer.receive) > 0, 'La oferta debe intercambiar recursos distintos y cantidades válidas.');
  requireRule(RESOURCES.every(r => g.players[offer.from].hand[r] >= offer.give[r]), 'No tienes los recursos que ofreces.');
  if (requireBothHands) requireRule(RESOURCES.every(r => g.players[offer.to].hand[r] >= offer.receive[r]), 'El destinatario no tiene los recursos solicitados.');
}
export function execute(state: Game, cmd: Command, rng = Math.random): Game {
  const g = structuredClone(state), p = g.players[g.current];
  requireRule(g.phase !== 'finished', 'La partida ha terminado.');
  requireRule(!g.pendingTrade || cmd.type === 'respond', 'Responde al intercambio pendiente antes de continuar.');
  const say = (s: string) => { g.log.unshift(s); g.log = g.log.slice(0, 70); };
  const pay = (cost: Partial<Hand>) => { requireRule(canAfford(g, cost), 'No tienes suficientes recursos.'); RESOURCES.forEach(r => { const n = cost[r] || 0; p.hand[r] -= n; g.bank[r] += n; }); };
  const action = () => requireRule(g.phase === 'action' && !g.freeRoads, 'Completa la acción pendiente primero.');
  const finishRobber = () => { g.phase = g.resume; g.victims = []; };
  const steal = (victim: number, card?: number) => {
    const pool = RESOURCES.flatMap(r => Array(g.players[victim].hand[r]).fill(r) as Resource[]);
    requireRule(pool.length > 0 && (card === undefined || Number.isInteger(card) && card >= 0 && card < pool.length), 'Elige una carta boca abajo disponible.');
    // Shuffle only at the draw so a slot never corresponds to a known resource order.
    const r = card === undefined ? pool[Math.floor(rng() * pool.length)] : shuffle(pool, rng)[card];
    g.players[victim].hand[r]--; p.hand[r]++;
    say(`${p.name} roba una carta a ${g.players[victim].name}.`); finishRobber();
  };
  switch (cmd.type) {
    case 'settlement': {
      const setup = g.phase === 'setup-settlement'; if (!setup) action();
      requireRule(legalSettlements(g, setup).includes(cmd.id), 'Este cruce no permite construir un poblado.');
      if (!setup) pay(COSTS.settlement);
      g.vertices[cmd.id].owner = g.current; say(`${p.name} funda un poblado.`);
      if (setup) { g.anchor = cmd.id; g.phase = 'setup-road'; if (g.setup >= g.players.length) for (const t of g.vertices[cmd.id].tiles) { const r = g.tiles[t].resource; if (r !== 'desert' && g.bank[r]) { p.hand[r]++; g.bank[r]--; } } }
      break;
    }
    case 'road': {
      const setup = g.phase === 'setup-road'; requireRule(setup || g.phase === 'action', 'Ahora no puedes construir.');
      requireRule(legalRoads(g, setup).includes(cmd.id), 'La carretera debe conectar con tu red.');
      if (!setup && !g.freeRoads) pay(COSTS.road);
      g.edges[cmd.id].owner = g.current; say(`${p.name} construye una carretera.`);
      if (g.freeRoads) { g.freeRoads--; if (!legalRoads(g, false).length) g.freeRoads = 0; if (!g.freeRoads) g.phase = g.resume; }
      if (setup) { g.setup++; g.anchor = null; const n = g.players.length; if (g.setup === n * 2) { g.current = 0; g.phase = 'roll'; g.turn = 1; say('Comienza la partida. ¡A por los 10 puntos!'); } else { g.current = g.setup < n ? g.setup : n * 2 - 1 - g.setup; g.phase = 'setup-settlement'; } }
      break;
    }
    case 'city':
      action(); requireRule(g.vertices[cmd.id]?.owner === g.current && !g.vertices[cmd.id].city && countBuildings(g, g.current, true) < 4, 'Elige uno de tus poblados para mejorarlo.');
      pay(COSTS.city); g.vertices[cmd.id].city = true; say(`${p.name} convierte un poblado en ciudad.`); break;
    case 'roll': {
      requireRule(g.phase === 'roll', 'Ya has lanzado los dados.');
      g.dice = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)]; const sum = g.dice[0] + g.dice[1];
      say(`${p.name} lanza los dados: ${sum}.`); g.lastProduction = [];
      if (sum === 7) { g.discards = g.players.map(p => total(p.hand) > 7 ? Math.floor(total(p.hand) / 2) : 0); g.resume = 'action'; g.phase = g.discards.some(Boolean) ? 'discard' : 'robber'; }
      else {
        const pending = g.players.map(() => emptyHand());
        for (const t of g.tiles) if (t.number === sum && t.id !== g.robber && t.resource !== 'desert') { g.lastProduction.push(t.id); for (const v of t.vertices) { const vertex = g.vertices[v]; if (vertex.owner !== null) pending[vertex.owner][t.resource] += vertex.city ? 2 : 1; } }
        for (const r of RESOURCES) {
          const demand = pending.reduce((n, h) => n + h[r], 0), recipients = pending.map((h, i) => h[r] ? i : -1).filter(i => i >= 0);
          if (demand <= g.bank[r]) pending.forEach((h, i) => { g.players[i].hand[r] += h[r]; g.bank[r] -= h[r]; });
          else if (recipients.length === 1) { const i = recipients[0]; g.players[i].hand[r] += g.bank[r]; g.bank[r] = 0; }
        }
        g.phase = 'action';
      } break;
    }
    case 'discard': {
      requireRule(g.phase === 'discard' && g.discards[cmd.player] > 0, 'No debes descartar ahora.'); const h = g.players[cmd.player].hand;
      requireRule(RESOURCES.every(r => Number.isInteger(cmd.cards[r]) && cmd.cards[r] >= 0 && cmd.cards[r] <= h[r]) && total(cmd.cards) === g.discards[cmd.player], 'Selecciona exactamente las cartas indicadas.');
      RESOURCES.forEach(r => { h[r] -= cmd.cards[r]; g.bank[r] += cmd.cards[r]; }); say(`${g.players[cmd.player].name} descarta ${g.discards[cmd.player]} cartas.`); g.discards[cmd.player] = 0;
      if (!g.discards.some(Boolean)) g.phase = 'robber'; break;
    }
    case 'robber':
      requireRule(g.phase === 'robber' && g.tiles[cmd.tile] && cmd.tile !== g.robber, 'Mueve el ladrón a otra parcela.'); g.robber = cmd.tile;
      g.victims = robberyVictims(g);
      say(`${p.name} mueve el ladrón.`); if (!g.victims.length) { say('No hay rivales con cartas de recursos para robar en esta parcela.'); finishRobber(); } else g.phase = 'steal'; break;
    case 'steal': requireRule(g.phase === 'steal' && g.victims.includes(cmd.player) && robberyVictims(g).includes(cmd.player), 'Elige un rival junto al ladrón.'); steal(cmd.player, cmd.card); break;
    case 'trade': {
      action(); const ratio = tradeRatio(g, cmd.give); requireRule(RESOURCES.includes(cmd.give) && RESOURCES.includes(cmd.receive) && cmd.give !== cmd.receive && p.hand[cmd.give] >= ratio && g.bank[cmd.receive] > 0, 'El banco no puede realizar ese intercambio.');
      p.hand[cmd.give] -= ratio; g.bank[cmd.give] += ratio; p.hand[cmd.receive]++; g.bank[cmd.receive]--; say(`${p.name} comercia con el banco (${ratio}:1).`); break;
    }
    case 'offer': {
      action(); const offer: TradeOffer = { from: g.current, to: cmd.player, give: cmd.give, receive: cmd.receive }; validateTrade(g, offer);
      if (p.bot) { requireRule(!g.tradeAttempts?.includes(cmd.player), 'Ya has propuesto un trato a este jugador durante este turno.'); g.tradeAttempts = [...(g.tradeAttempts || []), cmd.player]; }
      g.pendingTrade = offer; say(`${p.name} propone un intercambio a ${g.players[cmd.player].name}.`); break;
    }
    case 'respond': {
      const offer = g.pendingTrade;
      requireRule(offer && cmd.player === offer.to && typeof cmd.accept === 'boolean', 'Solo el destinatario puede responder a esta oferta.');
      const other = g.players[offer!.to];
      if (cmd.accept) { validateTrade(g, offer!, true); RESOURCES.forEach(r => { p.hand[r] += offer!.receive[r] - offer!.give[r]; other.hand[r] += offer!.give[r] - offer!.receive[r]; }); say(`${other.name} acepta: ${p.name} intercambia recursos con ${other.name}.`); }
      else say(`${other.name} rechaza el intercambio de ${p.name}.${cmd.reason ? ' ' + cmd.reason.slice(0, 180) : ''}`);
      g.pendingTrade = null; break;
    }
    case 'buy': action(); requireRule(g.deck.length > 0, 'No quedan cartas de desarrollo.'); pay(COSTS.dev); p.dev.push({ type: g.deck.pop()!, turn: g.turn }); say(`${p.name} compra una carta de desarrollo.`); break;
    case 'dev': {
      requireRule((g.phase === 'action' || g.phase === 'roll') && !g.freeRoads && !p.played, 'Solo puedes jugar una carta de desarrollo por turno.');
      const i = p.dev.findIndex(d => d.type === cmd.card && d.turn < g.turn); requireRule(i >= 0 && cmd.card !== 'victory', 'Esta carta no puede jugarse este turno.');
      if (cmd.card === 'roads') { requireRule(legalRoads(g, false).length, 'No tienes carreteras disponibles.'); g.resume = g.phase as 'roll' | 'action'; g.phase = 'action'; g.freeRoads = Math.min(2, 15 - g.edges.filter(e => e.owner === g.current).length); }
      if (cmd.card === 'knight') { p.knights++; g.resume = g.phase as 'roll' | 'action'; g.phase = 'robber'; }
      if (cmd.card === 'monopoly') { const r = cmd.resources?.[0]; requireRule(r && RESOURCES.includes(r), 'Elige un recurso.'); for (let j = 0; j < g.players.length; j++) if (j !== g.current) { p.hand[r!] += g.players[j].hand[r!]; g.players[j].hand[r!] = 0; } }
      if (cmd.card === 'plenty') { const rs = cmd.resources || []; requireRule(rs.length === 2 && rs.every(r => RESOURCES.includes(r)), 'Elige dos recursos.'); const h = emptyHand(); rs.forEach(r => h[r]++); requireRule(RESOURCES.every(r => g.bank[r] >= h[r]), 'El banco no tiene esos recursos.'); RESOURCES.forEach(r => { g.bank[r] -= h[r]; p.hand[r] += h[r]; }); }
      p.dev.splice(i, 1); p.played = true; say(`${p.name} juega ${DEV_NAMES[cmd.card]}.`); break;
    }
    case 'end': action(); g.current = (g.current + 1) % g.players.length; g.turn++; g.players[g.current].played = false; g.phase = 'roll'; g.dice = null; g.lastProduction = []; g.tradeAttempts = []; say(`Turno de ${g.players[g.current].name}.`); break;
  }
  awards(g);
  if (g.turn && points(g, g.current) >= 10) { g.winner = g.current; g.phase = 'finished'; say(`${g.players[g.current].name} gana con ${points(g, g.current)} puntos.`); }
  return g;
}
