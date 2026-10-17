export const HISTORY_CATEGORIES = {
  all: { label: 'Todo', icon: 'compass' },
  build: { label: 'Construcciones', icon: 'settlement' },
  trade: { label: 'Intercambios', icon: 'trade' },
  important: { label: 'Importantes', icon: 'trophy' },
  cards: { label: 'Desarrollo', icon: 'dev' },
  dice: { label: 'Dados', icon: 'dice' },
  turns: { label: 'Turnos', icon: 'person' },
} as const;
export type HistoryFilter = keyof typeof HISTORY_CATEGORIES;
export interface HistoryEntry {
  text: string;
  category: HistoryFilter;
  players: number[];
  important: boolean;
}

/** Read only public log text, including older saves; never inspect private hands. */
export function historyEntries(game: { log: readonly string[]; players: readonly { name: string }[] }): HistoryEntry[] {
  return game.log.slice(0, 70).map(text => {
    const entry: HistoryEntry = { text, category: 'all', players: [], important: false };
    const tag = (category: HistoryFilter, players: number[], important = category === 'important') => {
      entry.category = category; entry.important = important;
      entry.players = [...new Set([...entry.players, ...players])];
    };
    game.players.forEach((player, i) => {
      // Match complete action templates, not arbitrary occurrences of a player's name.
      const action = text.startsWith(player.name + ' ') ? text.slice(player.name.length + 1) : '';
      if (/^(funda un poblado|construye una carretera|convierte un poblado en ciudad)\.$/.test(action)) tag('build', [i]);
      if (/^comercia con el banco \([234]:1\)\.$/.test(action)) tag('trade', [i]);
      if (/^(compra una carta de desarrollo|juega (Caballero|Construcción de carreteras|Monopolio|Año de abundancia))\.$/.test(action)) tag('cards', [i]);
      const dice = /^lanza los dados: (\d+)\.$/.exec(action);
      if (dice) tag('dice', [i], Number(dice[1]) === 7);
      if (/^(mueve el ladrón|descarta \d+ cartas|gana con \d+ puntos)\.$/.test(action)) tag('important', [i]);
      if (text === `Turno de ${player.name}.` || text === `Construcción intermedia de ${player.name}: construye, compra desarrollo o pasa.`) tag('turns', [i]);
      game.players.forEach((other, j) => {
        if (i === j) return;
        if (text === `${player.name} propone un intercambio a ${other.name}.`) tag('trade', [i, j]);
        if (text === `${other.name} acepta: ${player.name} intercambia recursos con ${other.name}.` ||
            text === `${other.name} rechaza el intercambio de ${player.name}.` ||
            text.startsWith(`${other.name} rechaza el intercambio de ${player.name}. `)) tag('trade', [j, i]);
        if (text === `${player.name} roba una carta a ${other.name}.`) tag('important', [i, j]);
      });
    });
    if (text === 'Una nueva isla. Una historia por construir.' || text.startsWith('Comienza la partida.') || text.startsWith('Escasez de ') || text === 'No hay rivales con cartas de recursos para robar en esta parcela.') tag('important', []);
    return entry;
  });
}

export function filterHistory(entries: HistoryEntry[], category: HistoryFilter, player = -1): HistoryEntry[] {
  return entries.filter(entry => (player === -1 || entry.players.includes(player)) &&
    (category === 'all' || (category === 'important' ? entry.important : entry.category === category)));
}
