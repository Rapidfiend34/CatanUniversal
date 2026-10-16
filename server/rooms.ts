import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { type Game, type Variant, type Command, type Hand, RESOURCES, COLORS, DEV_NAMES, emptyHand, total, points, newGame, execute, bankSize, validPlayerCount, BOT_NAMES } from '../src/engine.js';
import { botCommand } from '../src/bot.js';
import type { RoomView, RoomMode } from '../src/online/types.js';
import { type Store, Conflict } from './store.js';

interface Seat { name: string; hash: string; ready: boolean }
export interface Room { code: string; mode: RoomMode; variant?: Variant; capacity: number; version: number; gameVersion: number; createdAt: number; expiresAt: number; hostHash: string; seats: Seat[]; game: Game | null; requests: string[]; preview: RoomView['preview'] }
export class RoomError extends Error { constructor(message: string, public status = 400) { super(message); } }
const check = (ok: unknown, message: string, status = 400) => { if (!ok) throw new RoomError(message, status); };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const rng = () => randomInt(0, 0x100000000) / 0x100000000;
function validCode(value: unknown): string { check(typeof value === 'string' && /^[A-Z2-9]{7}$/.test(value), 'El código de sala debe tener 7 letras o números.'); return value as string; }
function validToken(value: unknown): string { check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'La sesión no es válida. Vuelve a unirte a la sala.', 401); return value as string; }
function name(value: unknown): string { check(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 22, 'Escribe un nombre de entre 1 y 22 caracteres.'); return (value as string).trim(); }
function identity(room: Room, token: string) {
  const digest = hash(validToken(token)), index = room.seats.findIndex(s => same(s.hash, digest));
  const host = same(room.hostHash, digest); check(index >= 0 || host, 'No tienes acceso a esta sala. Usa el dispositivo con el que te uniste.', 401);
  return { index, host, digest };
}
function expired(room: Room) { check(room.expiresAt > Date.now(), 'Esta sala ha caducado. Crea otra para seguir jugando.', 410); }
export function projectRoom(room: Room, token: string): RoomView {
  expired(room); const me = identity(room, token), g = room.game ? structuredClone(room.game) : null;
  const cardCounts = g?.players.map(p => total(p.hand)) || [], devCounts = g?.players.map(p => p.dev.length) || [], deckCount = g?.deck.length || 0, scores = g?.players.map((_, i) => points(g, i, g.phase === 'finished' || i === me.index)) || [];
  if (g) { g.deck = []; g.players.forEach((p, i) => { if (i !== me.index) { p.hand = emptyHand(); p.dev = []; } }); }
  return { code: room.code, mode: room.mode, variant: room.variant || 'classic', capacity: room.capacity, version: room.version, gameVersion: room.gameVersion, expiresAt: room.expiresAt, isHost: me.host, self: me.index >= 0 ? me.index : null, screen: me.index < 0, seats: room.seats.map((s, i) => ({ name: s.name, ready: s.ready, color: COLORS[i] })), game: g, cardCounts, devCounts, deckCount, scores, preview: room.preview };
}
function autoPlay(room: Room): boolean {
  let changed = false;
  for (let n = 0; n < 80 && room.game && room.game.phase !== 'finished'; n++) {
    const g = room.game, actor = g.pendingTrade ? g.pendingTrade.to : g.phase === 'discard' ? g.discards.findIndex(Boolean) : g.current;
    if (actor < 0 || !g.players[actor].bot) break;
    room.game = execute(g, botCommand(g), rng); room.gameVersion++; changed = true;
  }
  return changed;
}
export function parseCommand(raw: unknown, game?: Game): Command {
  check(raw && typeof raw === 'object' && !Array.isArray(raw), 'Acción no válida.'); const c = raw as Record<string, unknown>;
  const integer = (x: unknown, max = 100) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max;
  const maxPlayer = game ? game.players.length - 1 : 3, maxCards = game ? bankSize(game) : 19;
  const hand = (h: unknown) => h && typeof h === 'object' && RESOURCES.every(r => integer((h as Hand)[r], maxCards));
  const cleanHand = (h: unknown): Hand => Object.fromEntries(RESOURCES.map(r => [r, (h as Hand)[r]])) as Hand;
  switch (c.type) {
    case 'roll': case 'end': case 'buy': return { type: c.type };
    case 'road': case 'settlement': case 'city': check(integer(c.id, c.type === 'road' ? (game?.edges.length || 72) - 1 : (game?.vertices.length || 54) - 1), 'Ubicación no válida.'); return { type: c.type, id: c.id as number };
    case 'robber': check(integer(c.tile, (game?.tiles.length || 19) - 1), 'Parcela no válida.'); return { type: 'robber', tile: c.tile as number };
    case 'steal': check(integer(c.player, maxPlayer) && integer(c.card, maxCards * 5 - 1), 'Elige un rival y una carta boca abajo.'); return { type: 'steal', player: c.player as number, card: c.card as number };
    case 'discard': check(integer(c.player, maxPlayer) && hand(c.cards), 'Descarte no válido.'); return { type: 'discard', player: c.player as number, cards: cleanHand(c.cards) };
    case 'trade': check(RESOURCES.includes(c.give as any) && RESOURCES.includes(c.receive as any), 'Recursos no válidos.'); return { type: 'trade', give: c.give as any, receive: c.receive as any };
    case 'offer': check(integer(c.player, maxPlayer) && hand(c.give) && hand(c.receive), 'Oferta no válida.'); return { type: 'offer', player: c.player as number, give: cleanHand(c.give), receive: cleanHand(c.receive) };
    case 'respond': check(integer(c.player, maxPlayer) && typeof c.accept === 'boolean', 'Respuesta no válida.'); return { type: 'respond', player: c.player as number, accept: c.accept as boolean };
    case 'dev': check(typeof c.card === 'string' && Object.hasOwn(DEV_NAMES, c.card), 'Carta no válida.'); check(c.resources === undefined || Array.isArray(c.resources) && c.resources.length <= 2 && c.resources.every(r => RESOURCES.includes(r)), 'Recursos no válidos.'); check(c.targets === undefined || Array.isArray(c.targets) && c.targets.length <= 3 && c.targets.every(i => integer(i, maxPlayer)), 'Rivales no válidos.'); return { type: 'dev', card: c.card as any, resources: c.resources as any, targets: c.targets as number[] | undefined };
    default: throw new RoomError('Acción desconocida.');
  }
}
export class Rooms {
  constructor(public store: Store) {}
  private async load(code: string) { const record = await this.store.read<Room>(validCode(code)); check(record, 'No existe una sala con ese código.', 404); expired(record!.value); return record!; }
  private async mutate(code: string, fn: (room: Room) => boolean): Promise<Room> {
    for (let n = 0; n < 8; n++) {
      const record = await this.load(code), room = record.value;
      const changed = fn(room); if (!changed) return room; room.version++;
      try { await this.store.write(code, room, record.etag); return room; } catch (e) { if (!(e instanceof Conflict)) throw e; await new Promise(resolve => setTimeout(resolve, 30 + n * 40)); }
    }
    throw new RoomError('La sala está actualizándose. Vuelve a intentarlo.', 409);
  }
  async create(input: Record<string, unknown>) {
    const code = validCode(input.code), token = validToken(input.token), owner = name(input.name);
    check(input.mode === 'online' || input.mode === 'party', 'Modo no válido.'); const variant = input.variant ?? 'classic'; check(variant === 'classic' || variant === 'expanded', 'Variante no válida.'); check(validPlayerCount(input.capacity as number, variant as Variant), 'Elige 3–4 plazas en Clásico o 5–10 en Ampliado.');
    const room: Room = { code, mode: input.mode as RoomMode, variant: variant as Variant, capacity: input.capacity as number, version: 1, gameVersion: 0, createdAt: Date.now(), expiresAt: Date.now() + 48 * 3600_000, hostHash: hash(token), seats: input.mode === 'online' ? [{ name: owner, hash: hash(token), ready: false }] : [], game: null, requests: [], preview: 'inspect' };
    const existing = await this.store.read<Room>(code); if (existing) { check(same(existing.value.hostHash, room.hostHash), 'Ese código ya está ocupado. Crea otra sala.', 409); return projectRoom(existing.value, token); }
    try { await this.store.write(code, room, null); } catch (e) { if (e instanceof Conflict) throw new RoomError('Ese código ya está ocupado. Crea otra sala.', 409); throw e; }
    return projectRoom(room, token);
  }
  async join(code: string, token: string, displayName: unknown) {
    const digest = hash(validToken(token)), playerName = name(displayName);
    const room = await this.mutate(code, r => {
      if (r.seats.some(s => same(s.hash, digest))) return false;
      check(!r.game, 'La partida ya ha empezado. Solo pueden volver los participantes originales.', 409); check(r.seats.length < r.capacity, 'La sala está completa.', 409);
      check(!same(r.hostHash, digest), 'La pantalla de televisión no ocupa una plaza de jugador.');
      r.seats.push({ name: playerName, hash: digest, ready: false }); return true;
    }); return projectRoom(room, token);
  }
  async sync(code: string, token: string) {
    const room = await this.mutate(code, r => { identity(r, token); return autoPlay(r); }); return projectRoom(room, token);
  }
  async update(code: string, token: string, input: Record<string, unknown>) {
    const room = await this.mutate(code, r => {
      const me = identity(r, token);
      if (input.op === 'ready') { check(!r.game && me.index >= 0, 'No puedes cambiar tu estado ahora.'); check(typeof input.ready === 'boolean', 'Estado no válido.'); if (r.seats[me.index].ready === input.ready) return false; r.seats[me.index].ready = input.ready as boolean; return true; }
      if (input.op === 'start') { check(me.host, 'Solo el anfitrión puede iniciar la partida.', 403); if (r.game) return false; check(r.seats.length >= 2 && r.seats.every(s => s.ready), 'Se necesitan al menos dos jugadores y todos deben estar listos.'); const config = r.seats.map(s => ({ name: s.name, bot: false })); while (config.length < r.capacity) config.push({ name: BOT_NAMES[config.length], bot: true }); r.game = newGame(config, rng, r.variant || 'classic'); r.gameVersion++; autoPlay(r); return true; }
      check(r.game && me.index >= 0, 'Solo los jugadores pueden realizar acciones.', 403); const g = r.game!;
      if (input.op === 'preview') { check(me.index === g.current && ['action', 'setup-road', 'setup-settlement', 'robber'].includes(g.phase) && !g.pendingTrade, 'Espera tu turno.', 403); check(['inspect', 'road', 'settlement', 'city'].includes(input.mode as string), 'Vista no válida.'); if (r.preview === input.mode) return false; r.preview = input.mode as RoomView['preview']; return true; }
      check(input.op === 'command', 'Operación desconocida.'); check(typeof input.requestId === 'string' && /^[a-f0-9-]{36}$/.test(input.requestId), 'Identificador de acción no válido.');
      const requestKey = me.digest + ':' + input.requestId; if (r.requests.includes(requestKey)) return false;
      check(Number.isInteger(input.gameVersion) && input.gameVersion === r.gameVersion, 'La partida se ha actualizado. Revisa el tablero y vuelve a intentarlo.', 409);
      const command = parseCommand(input.command, g);
      if (command.type === 'discard') check(g.phase === 'discard' && command.player === me.index && g.discards[me.index] > 0, 'Solo puedes descartar tus propias cartas.', 403);
      else if (command.type === 'respond') check(g.pendingTrade?.to === me.index && command.player === me.index, 'Solo el destinatario puede responder.', 403);
      else check(g.current === me.index, 'Espera tu turno.', 403);
      try { r.game = execute(g, command, rng); } catch (e) { throw new RoomError((e as Error).message); }
      r.gameVersion++; r.preview = 'inspect'; r.requests = [...r.requests, requestKey].slice(-64); autoPlay(r); return true;
    }); return projectRoom(room, token);
  }
}
