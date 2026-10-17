import { historyEntries } from '../history';
import type { RoomView } from './types';

/** New public events only: reconnects and unchanged polls must not replay the history. */
export function roomNotice(previous: RoomView | null, next: RoomView): string | null {
  if (!previous || previous.code !== next.code) return null;
  if (!next.game) {
    if (previous.seats.length < next.capacity && next.seats.length === next.capacity) return `Sala completa. Los ${next.capacity} jugadores ya tienen plaza.`;
    const joined = next.seats.filter((_, i) => i >= previous.seats.length && i !== next.self);
    if (joined.length) return `${joined.map(s => s.name).join(', ')} se ha unido a la sala.`;
    const changed = next.seats.findIndex((seat, i) => i !== next.self && previous.seats[i] && previous.seats[i].ready !== seat.ready);
    return changed >= 0 ? `${next.seats[changed].name} ${next.seats[changed].ready ? 'está listo para empezar' : 'aún no está listo'}.` : null;
  }
  if (!previous.game) return 'La partida ha comenzado. ¡La isla os espera!';
  if (next.gameVersion <= previous.gameVersion) return null;
  if (next.self !== null && next.game.current === next.self && (previous.game.current !== next.self || previous.game.turn !== next.game.turn)) return 'Es tu turno. La isla espera tu próxima jugada.';
  const before = previous.game.log, after = next.game.log;
  const overlap = after.findIndex((_, index) => after.slice(index).every((text, i) => text === before[i]));
  if (overlap <= 0) return null;
  const events = historyEntries({ players: next.game.players, log: after.slice(0, overlap) })
    .filter(event => event.players.length > 0 && event.players[0] !== next.self);
  if (!events.length) return null;
  return events[0].text + (events.length > 1 ? ` · ${events.length - 1} eventos más en el historial` : '');
}
