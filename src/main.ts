import './style.css';
import { Board, type Mode } from './board';
import { type Game, type Command, type Hand, type Dev, type Resource, newGame, execute, RESOURCES, NAMES, DEV_NAMES, COSTS, COLORS, total, points, legalRoads, legalSettlements, longestLength, tradeRatio, canAfford, countBuildings, emptyHand, validateTrade, robberyVictims } from './engine';
import { botCommand } from './bot';
import { icon } from './icons';

const SAVE_KEY = 'isla-universal-v1';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
let game: Game;
try { const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); validateSave(saved); game = saved; } catch { game = newGame([{ name: 'Tú', bot: false }, { name: 'Olivia', bot: true }, { name: 'Nicolás', bot: true }]); }
let mode: Mode = 'inspect', muted = true, activeModal = '', botTimer = 0, toastTimer = 0, passTo: number | null = null;
let selectedVictim: number | null = null;
let audio: AudioContext | null = null;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Isla Universal, inicio"><span class="brand-mark">${icon('island', 29)}</span><span>ISLA<span class="brand-bottom">UNIVERSAL</span></span></a>
    <span class="header-divider"></span><div class="game-label">El comienzo de una aventura <span>EDICIÓN BASE · 3D</span></div>
    <div class="header-right"><span class="save-indicator"><i></i> Guardado local</span><button class="text-button" data-act="help" aria-label="Cómo jugar">${icon('help', 18)}<span>Cómo jugar</span></button><button class="mobile-settings icon-plain" data-act="settings" aria-label="Ajustes">${icon('settings', 18)}</button><button class="outline-button small" data-act="new">${icon('plus', 16)} Nueva partida</button></div>
  </header>
  <main class="game-layout">
    <aside class="sidebar" id="sidebar" aria-label="Jugadores y objetivos"></aside>
    <section class="table" aria-label="Mesa de juego">
      <div id="board" class="board"></div>
      <div class="board-title"><div class="eyebrow"><span class="tiny-diamond"></span> EL ARCHIPIÉLAGO TE ESPERA</div><h1>Una isla.<br><em>Infinitas posibilidades.</em></h1><p>Explora. Comercia. Construye tu historia.</p></div>
      <div id="phase-panel" class="phase-panel" aria-live="polite"></div>
      <div class="map-controls"><button data-act="zoom-in" aria-label="Acercar tablero">${icon('plus', 17)}</button><button data-act="zoom-out" aria-label="Alejar tablero">${icon('minus', 17)}</button><span></span><button data-act="home" aria-label="Restablecer vista isométrica">${icon('compass', 19)}</button></div>
      <div class="map-caption">${icon('compass', 15)} VISTA ISOMÉTRICA <span>Arrastra para explorar · Rueda para acercar</span></div>
      <div id="tile-info" class="tile-info" hidden></div>
      <div class="bottom-panel" id="bottom-panel"></div>
      <div class="render-error" id="render-error" hidden></div>
    </section>
  </main>
  <div class="toast" id="toast" role="status" hidden></div>
  <div id="modal-root"></div>`;
let board: Board | null = null;
try { board = new Board(document.querySelector('#board')!); board.create(game); board.onSelect = selectBoard; }
catch { const error = document.querySelector<HTMLDivElement>('#render-error')!; error.hidden = false; error.innerHTML = `${icon('island', 40)}<h2>Tu tablero necesita WebGL</h2><p>Activa la aceleración gráfica del navegador. Puedes continuar con «Ver ubicaciones» para construir.</p>`; }

function sound(kind = 'click') {
  if (muted) return;
  try { audio ||= new AudioContext(); void audio.resume(); const osc = audio.createOscillator(), gain = audio.createGain(); osc.connect(gain); gain.connect(audio.destination); osc.type = 'sine'; osc.frequency.value = kind === 'build' ? 660 : kind === 'dice' ? 320 : 440; gain.gain.setValueAtTime(.055, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .18); osc.start(); osc.stop(audio.currentTime + .2); } catch { /* Audio is optional. */ }
}
function toast(message: string) { const el = document.querySelector<HTMLDivElement>('#toast')!; el.textContent = message; el.hidden = false; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el.hidden = true; }, 4200); }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { toast('No se puede guardar en este navegador. Exporta tu partida desde el menú.'); } }
function isHuman() { return !game.players[game.current].bot && passTo === null && game.phase !== 'finished' && !game.pendingTrade; }
function dispatch(command: Command, automated = false) {
  try {
    const old = game.current, previousOffer = game.pendingTrade; game = execute(game, command); mode = 'inspect';
    if (command.type === 'robber') { selectedVictim = null; if (!automated && game.phase !== 'steal') toast('No hay rivales con cartas de recursos para robar en esta parcela.'); }
    if (command.type === 'steal') { selectedVictim = null; if (activeModal === 'robbery') closeModal(); if (!automated) toast(game.log[0]); }
    if (command.type === 'respond') { if (activeModal === 'offer-pending') closeModal(); if (previousOffer && (!game.players[previousOffer.from].bot || !game.players[previousOffer.to].bot)) toast(game.log[0]); }
    if (command.type === 'road' || command.type === 'settlement' || command.type === 'city') sound('build'); else if (command.type === 'roll') sound('dice');
    if (!automated && command.type === 'end' || old !== game.current) { if (!game.players[game.current].bot && game.players.filter(p => !p.bot).length > 1 && old !== game.current) passTo = game.current; }
    save(); render(); scheduleBot();
  } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo completar la acción.'); if (automated) { window.clearTimeout(botTimer); console.error('AI error', e); toast('El rival automático se ha detenido. Exporta la partida para conservarla.'); } }
}
function humanViewIndex() { if (game.pendingTrade && !game.players[game.pendingTrade.to].bot) return game.pendingTrade.to; return game.players[game.current].bot ? Math.max(0, game.players.findIndex(p => !p.bot)) : game.current; }
function resourceIcon(r: Resource, size = 22) { return `<span class="resource-symbol ${r}">${icon(r, size)}</span>`; }
function costHtml(cost: Partial<Hand>) { return Object.entries(cost).map(([r, n]) => `<span class="cost-item ${r}" title="${n} ${NAMES[r as Resource]}">${icon(r, 13)}${n! > 1 ? n : ''}</span>`).join(''); }
function phaseText() {
  const name = esc(game.players[game.current].name);
  if (game.pendingTrade) return { tag: 'UN TRATO SOBRE LA MESA', title: 'El comercio nos conecta.', text: `${esc(game.players[game.pendingTrade.to].name)} debe responder antes de continuar el turno.` };
  if (game.phase === 'finished') return { tag: 'UNA HISTORIA PARA RECORDAR', title: `¡${esc(game.players[game.winner!].name)} gana!`, text: 'La isla tiene un nuevo referente. Empieza otra aventura cuando quieras.' };
  if (game.phase === 'setup-settlement') return { tag: `FUNDACIÓN · RONDA ${game.setup < game.players.length ? '1' : '2'} DE 2`, title: 'Todo empieza aquí.', text: `${name}, elige un cruce iluminado para fundar tu ${game.setup < game.players.length ? 'primer' : 'segundo'} poblado.` };
  if (game.phase === 'setup-road') return { tag: 'TRAZA TU CAMINO', title: 'Conecta con el futuro.', text: `${name}, construye una carretera junto a tu nuevo poblado. Es gratuita.` };
  if (game.phase === 'roll') return { tag: `TURNO ${game.turn} · ${name.toUpperCase()}`, title: 'La suerte está echada.', text: 'Lanza los dados para producir recursos. Después podrás comerciar y construir.' };
  if (game.phase === 'discard') return { tag: 'HA SALIDO UN 7', title: 'Viaja más ligero.', text: 'Quien tenga más de 7 recursos debe devolver la mitad al banco (redondeando hacia abajo).' };
  if (game.phase === 'robber') return { tag: 'EL LADRÓN SE MUEVE', title: 'Cambia las reglas.', text: `${name}, elige otra parcela: bloquearás su producción y podrás robar una carta a un rival.` };
  if (game.phase === 'steal') return { tag: 'UNA CARTA, UNA OPORTUNIDAD', title: 'Una pequeña ventaja.', text: 'Elige un rival afectado por el ladrón y una de sus cartas boca abajo.' };
  if (game.freeRoads) return { tag: `CARRETERAS GRATUITAS · ${game.freeRoads}`, title: 'Abre nuevos caminos.', text: 'Elige un tramo iluminado. Estas carreteras no cuestan recursos.' };
  if (mode !== 'inspect') return { tag: 'CONSTRUCCIÓN', title: mode === 'road' ? 'Un camino por recorrer.' : mode === 'city' ? 'Tu isla crece contigo.' : 'Un lugar para quedarse.', text: 'Selecciona una ubicación iluminada en el tablero para construir.' };
  return { tag: `TURNO ${game.turn} · ${name.toUpperCase()}`, title: 'Haz crecer tu isla.', text: 'Construye, intercambia recursos o descubre una carta. Cada decisión cuenta.' };
}
function render() {
  const g = game, active = g.players[g.current], human = isHuman(), view = humanViewIndex(), player = g.players[view], info = phaseText();
  document.querySelector('#sidebar')!.innerHTML = `
    <div class="section-label">LA EXPEDICIÓN <span>${g.players.length} JUGADORES</span></div>
    <div class="players">${g.players.map((p, i) => `<div class="player ${i === g.current ? 'active' : ''}" style="--player:${p.color}"><div class="player-avatar">${icon(p.bot ? 'bot' : 'person', 22)}</div><div class="player-name">${esc(p.name)} ${i === view && !p.bot ? '<span class="you-tag">TÚ</span>' : ''}<small>${i === g.current ? '<span class="turn-dot"></span> ' + (p.bot ? 'Pensando…' : 'Tu turno') : p.bot ? 'Rival automático' : 'Jugador local'}</small></div><div class="player-points">${points(g, i, i === view || g.phase === 'finished')}<span>PV</span></div><div class="player-meta"><span title="Cartas de recursos">${icon('dev', 12)} ${total(p.hand)}</span><span title="Cartas de desarrollo">${icon('leaf', 12)} ${p.dev.length}</span><span title="Caballeros jugados">${icon('knight', 12)} ${p.knights}</span><span title="Longitud de carretera">${icon('road', 12)} ${longestLength(g, i)}</span></div></div>`).join('')}</div>
    <div class="goal-card"><span class="goal-icon">${icon('trophy', 24)}</span><div><strong>Un destino. 10 puntos.</strong><p>Construye tu camino a la victoria.</p></div><div class="goal-progress"><i style="width:${Math.min(100, points(g, view) * 10)}%"></i></div><span class="goal-count">${points(g, view)} <span>/ 10 PV</span></span></div>
    <div class="section-label awards-label">GRANDES LOGROS</div>
    <div class="award"><span>${icon('road', 20)}</span><div>Carretera más larga<small>${g.longest === null ? 'Conecta al menos 5 tramos' : esc(g.players[g.longest].name)}</small></div><b>+2</b></div>
    <div class="award"><span>${icon('knight', 20)}</span><div>Mayor ejército<small>${g.army === null ? 'Juega al menos 3 caballeros' : esc(g.players[g.army].name)}</small></div><b>+2</b></div>
    <div class="sidebar-bottom"><div class="section-label">CUADERNO DE BITÁCORA <button class="icon-plain" data-act="log" aria-label="Ver historial completo">${icon('arrow', 15)}</button></div><div class="mini-log">${g.log.slice(0, 3).map((s, i) => `<p class="${i === 0 ? 'latest' : ''}">${i === 0 ? '<i></i>' : ''}${esc(s)}</p>`).join('')}</div><div class="sidebar-foot"><span>ESTRATEGIA EN ESTADO PURO</span><button class="icon-plain" data-act="settings" aria-label="Opciones de partida">${icon('settings', 17)}</button></div></div>`;
  document.querySelector('#phase-panel')!.innerHTML = `<span class="eyebrow">${info.tag}</span><h2>${info.title}</h2><p>${info.text}</p>${human && (['setup-settlement', 'setup-road', 'robber'].includes(g.phase) || mode !== 'inspect' || g.freeRoads) ? `<button class="phase-link" data-act="locations">Ver ubicaciones ${icon('arrow', 14)}</button>` : ''}${human && mode !== 'inspect' && !g.freeRoads ? '<button class="phase-link muted" data-act="cancel-build">Cancelar</button>' : ''}${g.phase === 'steal' && human ? `<div class="victim-buttons">${g.victims.map(i => `<button class="outline-button small" data-victim="${i}">${esc(g.players[i].name)}</button>`).join('')}</div>` : ''}`;
  const actionable = human && g.phase === 'action' && !g.freeRoads;
  document.querySelector('#bottom-panel')!.innerHTML = `
    <div class="inventory-panel"><div class="inventory-heading"><div class="section-label">${view === g.current ? 'TUS RECURSOS' : 'RECURSOS DE ' + esc(player.name.toUpperCase())}<span>${total(player.hand)} CARTAS</span></div><button class="dev-link" data-act="cards">${icon('dev', 15)} Desarrollo <span>${player.dev.length}</span></button></div>
      <div class="resource-hand">${RESOURCES.map(r => `<div class="resource-card ${r}" title="${NAMES[r]} · Banco: ${g.bank[r]}">${resourceIcon(r, 28)}<strong>${passTo === null ? player.hand[r] : '—'}</strong><span>${NAMES[r]}</span><i></i></div>`).join('')}</div>
      <div class="build-toolbar">${(['road', 'settlement', 'city', 'dev'] as const).map(kind => {
        const enabled = actionable && canAfford(g, COSTS[kind]) && (kind === 'road' ? legalRoads(g).length > 0 : kind === 'settlement' ? legalSettlements(g).length > 0 : kind === 'city' ? countBuildings(g, g.current, false) > 0 && countBuildings(g, g.current, true) < 4 : g.deck.length > 0);
        return `<button class="build-button ${mode === kind ? 'selected' : ''}" data-build="${kind}" ${enabled ? '' : 'disabled'} title="${!enabled ? 'Necesitas recursos, una ubicación válida y estar en fase de construcción.' : 'Construir'}">${icon(kind, 20)}<span><b>${{ road: 'Carretera', settlement: 'Poblado', city: 'Ciudad', dev: 'Desarrollo' }[kind]}</b><span class="cost">${costHtml(COSTS[kind])}</span></span></button>`;
      }).join('')}<button class="trade-button" data-act="trade" ${actionable ? '' : 'disabled'}>${icon('trade', 20)}<span>Comerciar</span></button></div>
    </div>
    <div class="turn-panel"><div class="dice-area">${g.dice ? g.dice.map(n => `<div class="die" aria-label="Dado ${n}">${Array.from({ length: 9 }, (_, i) => `<i class="${diceDots(n).includes(i) ? 'dot' : ''}"></i>`).join('')}</div>`).join('') : `<div class="die waiting">${icon('dice', 28)}</div><div class="die waiting">${icon('dice', 28)}</div>`}<span class="dice-total">${g.dice ? g.dice[0] + g.dice[1] : '–'}<small>${g.dice ? 'RESULTADO' : 'DADOS'}</small></span></div>
      <button class="primary-button turn-button" data-act="${g.phase === 'finished' ? 'results' : g.phase === 'roll' ? 'roll' : g.phase === 'steal' ? 'robbery' : g.phase === 'action' ? 'end' : 'locations'}" ${human && (g.phase === 'roll' || actionable || ['setup-settlement', 'setup-road', 'robber', 'steal'].includes(g.phase) || g.freeRoads) || g.phase === 'finished' ? '' : 'disabled'}>${g.phase === 'finished' ? 'Ver resultados' : !human ? 'Turno del rival…' : g.phase === 'roll' ? 'Lanzar dados' : g.phase === 'steal' ? 'Elegir carta' : g.phase === 'action' && !g.freeRoads ? 'Terminar turno' : 'Elegir ubicación'} ${icon(g.phase === 'roll' ? 'dice' : 'arrow', 18)}</button><span class="turn-hint">${g.phase.startsWith('setup') ? 'Colocación inicial · Sin coste' : g.phase === 'roll' ? 'Que la isla esté de tu lado.' : 'Lo que construyes, permanece.'}</span>
    </div>`;
  board?.update(g, mode, human);
  if (passTo !== null) showPass();
  else if (g.pendingTrade && (!g.players[g.pendingTrade.from].bot || !g.players[g.pendingTrade.to].bot)) showPendingTrade();
  else if (g.phase === 'steal' && human) showRobbery();
  else if (g.phase === 'discard' && !g.players[g.discards.findIndex(Boolean)]?.bot) showDiscard();
  else if (g.phase === 'finished' && activeModal !== 'results') showResults();
}
function diceDots(n: number) { return [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]][n]; }
function selectBoard(kind: string, id: number) {
  if (kind === 'port') { const v = game.vertices[id], type = v.port!; modal('port', type === 'any' ? 'Un puerto abierto al mundo.' : `Puerto de ${NAMES[type].toLowerCase()}.`, type === 'any' ? 'Entrega 3 recursos iguales a cambio de 1 de tu elección.' : `Entrega 2 de ${NAMES[type].toLowerCase()} a cambio de 1 recurso de tu elección.`, `<div class="empty-state">${icon(type === 'any' ? 'trade' : type, 48)}<p>Construye un poblado o una ciudad en cualquiera de los dos extremos de este muelle para usar su tarifa al comerciar con el banco.</p></div>`); return; }
  if (kind === 'tile' && game.phase !== 'robber') { showTile(id); return; }
  if (!isHuman()) return;
  if (game.phase === 'robber' && kind === 'tile') dispatch({ type: 'robber', tile: id });
  else if (kind === 'road' || kind === 'settlement' || kind === 'city') dispatch({ type: kind, id });
}
function showTile(id: number) {
  const t = game.tiles[id], el = document.querySelector<HTMLDivElement>('#tile-info')!;
  el.hidden = false; el.innerHTML = `<button class="icon-plain" data-act="close-tile" aria-label="Cerrar">${icon('close', 15)}</button><span class="eyebrow">PARCELA ${id + 1}</span><strong>${t.resource === 'desert' ? 'Desierto' : NAMES[t.resource]}</strong><p>${t.number ? `Produce con ${t.number} · ${6 - Math.abs(7 - t.number)} de 36 combinaciones` : 'Sin producción de recursos.'}${t.id === game.robber ? '<br>El ladrón bloquea esta parcela.' : ''}</p>`;
}
function scheduleBot() {
  window.clearTimeout(botTimer); if (game.phase === 'finished' || passTo !== null) return;
  const actor = game.pendingTrade ? game.pendingTrade.to : game.phase === 'discard' ? game.discards.findIndex(Boolean) : game.current;
  if (!game.players[actor]?.bot) return;
  botTimer = window.setTimeout(() => { dispatch(botCommand(game), true); }, game.phase.startsWith('setup') ? 750 : 800);
}
function modal(name: string, title: string, subtitle: string, body: string, wide = false, mandatory = false) {
  activeModal = name; const root = document.querySelector('#modal-root')!;
  root.innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">${!mandatory ? `<button class="modal-close icon-plain" data-act="close-modal" aria-label="Cerrar ventana">${icon('close', 23)}</button>` : ''}<span class="eyebrow">ISLA UNIVERSAL</span><h2 id="modal-title">${title}</h2><p class="modal-subtitle">${subtitle}</p>${body}</section></div>`;
  (root.querySelector('.modal') as HTMLElement).focus();
}
function closeModal() { activeModal = ''; document.querySelector('#modal-root')!.innerHTML = ''; }
function showNew() {
  modal('new', 'Una nueva aventura.', 'Elige tu expedición. Las partidas se guardan automáticamente en este navegador.', `<form id="new-game-form"><label class="field-label">TU NOMBRE<input name="name" maxlength="22" value="Explorador" required></label><label class="field-label">MODO DE PARTIDA<select name="mode"><option value="solo">Un jugador + rivales automáticos</option><option value="local">Multijugador local (mismo dispositivo)</option></select></label><label class="field-label">JUGADORES<select name="count"><option value="3">3 jugadores</option><option value="4">4 jugadores</option></select></label><p class="form-note">La partida actual se reemplazará. Puedes exportarla antes en las opciones.</p><button class="primary-button full" type="submit">Descubrir mi isla ${icon('arrow', 18)}</button></form>`);
}
function showHelp() {
  modal('help', 'Tu primera travesía.', 'Una adaptación independiente del juego base, con arte y modelos originales.', `<div class="rules-grid"><article><span>01</span><h3>Funda tu expedición</h3><p>Coloca 2 poblados y 2 carreteras gratis. El orden es de ida y vuelta. El segundo poblado recibe los recursos de sus parcelas vecinas.</p></article><article><span>02</span><h3>Deja que la isla produzca</h3><p>Lanza 2 dados. Las parcelas con ese número entregan 1 recurso por poblado y 2 por ciudad a todos sus propietarios.</p></article><article><span>03</span><h3>Construye y comercia</h3><p>Conecta carreteras, funda poblados y mejóralos. Debe quedar un cruce libre entre poblados. Comercia 4:1 con el banco, 3:1 en puerto general o 2:1 en el especializado.</p></article><article><span>04</span><h3>Gana con 10 puntos</h3><p>Poblado: 1 PV. Ciudad: 2 PV. Carretera más larga (5+) y mayor ejército (3+): 2 PV cada uno. Algunas cartas suman puntos secretos.</p></article></div><div class="rule-note">${icon('knight', 25)}<p><strong>Un 7 trae al ladrón.</strong> Con más de 7 recursos, descarta la mitad. Mueve el ladrón, bloquea una parcela y roba a un vecino. Los caballeros también lo mueven.</p></div><p class="form-note">Solo puedes jugar una carta de desarrollo por turno, nunca en el turno en que la compraste. Los puntos de victoria cuentan automáticamente. Las carreteras representan los caminos del juego base; los puentes marítimos pertenecen a expansiones.</p><button class="primary-button full" data-act="close-modal">¡Vamos a construir! ${icon('arrow', 18)}</button>`, true);
}
function showLocations() {
  if (!isHuman()) return;
  const kind = game.phase === 'robber' ? 'tile' : game.phase === 'setup-road' || game.freeRoads ? 'road' : game.phase === 'setup-settlement' ? 'settlement' : mode;
  let ids: number[] = [];
  if (kind === 'tile') ids = game.tiles.filter(t => t.id !== game.robber).map(t => t.id);
  if (kind === 'road') ids = legalRoads(game);
  if (kind === 'settlement') ids = legalSettlements(game);
  if (kind === 'city') ids = game.vertices.filter(v => v.owner === game.current && !v.city).map(v => v.id);
  modal('locations', 'Elige tu próximo paso.', 'También puedes cerrar esta ventana y seleccionar directamente en el tablero 3D.', `<div class="locations-list">${ids.length ? ids.map(id => {
    const tiles = kind === 'tile' ? [game.tiles[id]] : kind === 'road' ? game.edges[id].tiles.map(i => game.tiles[i]) : game.vertices[id].tiles.map(i => game.tiles[i]);
    const port = (kind === 'settlement' || kind === 'city') ? game.vertices[id].port : undefined;
    return `<button class="location-row" data-location="${id}" data-kind="${kind}"><b>${kind === 'tile' ? 'Parcela' : kind === 'road' ? 'Tramo' : 'Cruce'} ${id + 1}</b><span>${tiles.map(t => `${t.resource === 'desert' ? 'Desierto' : NAMES[t.resource]}${t.number ? ` (${t.number})` : ''}`).join(' · ')}${port ? `<br>⚓ Puerto ${port === 'any' ? 'general 3:1' : `${NAMES[port]} 2:1`}` : ''}</span>${icon('arrow', 15)}</button>`;
  }).join('') : '<p>No hay ubicaciones disponibles para esta acción.</p>'}</div>`);
}
function showPass() { modal('pass', `Turno de ${esc(game.players[passTo!].name)}.`, 'Pasa el dispositivo al siguiente jugador antes de revelar sus recursos.', `<div class="pass-illustration" style="color:${game.players[passTo!].color}">${icon('person', 58)}</div><button class="primary-button full" data-act="reveal">Estoy listo · Ver mis cartas ${icon('arrow', 18)}</button>`, false, true); }
function showDiscard() {
  const i = game.discards.findIndex(Boolean); if (i < 0) return;
  modal('discard', `${esc(game.players[i].name)}, aligera tu equipaje.`, `Devuelve exactamente ${game.discards[i]} recursos al banco. Pasa el dispositivo a este jugador.`, `<form id="discard-form" data-player="${i}"><div class="resource-inputs">${RESOURCES.map(r => `<label>${resourceIcon(r)}<span>${NAMES[r]}<small>Tienes ${game.players[i].hand[r]}</small></span><input type="number" name="${r}" min="0" max="${game.players[i].hand[r]}" value="0" required></label>`).join('')}</div><button class="primary-button full" type="submit">Devolver recursos ${icon('arrow', 18)}</button></form>`, false, true);
}
function showRobbery() {
  if (game.phase !== 'steal' || !isHuman()) return;
  if (selectedVictim === null || !game.victims.includes(selectedVictim)) selectedVictim = game.victims.length === 1 ? game.victims[0] : null;
  const victim = selectedVictim === null ? null : game.players[selectedVictim], count = victim ? total(victim.hand) : 0;
  modal('robbery', victim ? `Elige una carta de ${esc(victim.name)}.` : 'Elige a quién robar.', 'Solo puedes robar a rivales con un poblado o ciudad junto al ladrón y cartas de recursos en su mano.', `
    <div class="robbery-victims" role="group" aria-label="Rivales afectados por el ladrón">${game.victims.map(i => `<button class="robbery-victim ${selectedVictim === i ? 'selected' : ''}" data-victim="${i}" aria-pressed="${selectedVictim === i}" style="--player:${game.players[i].color}"><span class="robbery-avatar">${icon(game.players[i].bot ? 'bot' : 'person', 22)}</span><span><strong>${esc(game.players[i].name)}</strong><small>${total(game.players[i].hand)} cartas de recursos</small></span>${icon('arrow', 16)}</button>`).join('')}</div>
    ${victim ? `<div class="robbery-hand" role="group" aria-label="Cartas boca abajo de ${esc(victim.name)}">${Array.from({ length: count }, (_, i) => `<button class="hidden-card" data-steal-card="${i}" aria-label="Robar carta oculta ${i + 1} de ${esc(victim.name)}"><span class="card-back-art">${icon('island', 28)}<span>ISLA</span></span><small>${i + 1}</small></button>`).join('')}</div><p class="robbery-note">${icon('dev', 17)} Toca una carta boca abajo. Su recurso no se revela antes de elegir; las cartas de desarrollo no se pueden robar.</p>` : '<p class="robbery-note">Selecciona un rival para ver sus cartas boca abajo. Ninguna carta se robará hasta que la elijas.</p>'}`, count > 8, true);
}
function showTrade() {
  if (!isHuman() || game.phase !== 'action' || game.freeRoads) return;
  const opts = RESOURCES.map(r => `<option value="${r}">${NAMES[r]}</option>`).join('');
  modal('trade', 'Un buen trato lo cambia todo.', 'Negocia con personas y rivales automáticos, o intercambia con el banco.', `
    <div class="tabs"><button class="tab active" data-trade-tab="bank">Banco y puertos</button><button class="tab" data-trade-tab="players">Entre jugadores</button></div>
    <form id="trade-form"><div class="trade-fields"><label class="field-label">ENTREGAS<select name="give">${opts}</select></label><span>${icon('trade', 25)}</span><label class="field-label">RECIBES<select name="receive">${opts}</select></label></div><div class="trade-ratio" id="trade-ratio"></div><p class="form-note">Los puertos se activan al construir en sus extremos. El banco tiene ${RESOURCES.map(r => `${game.bank[r]} ${NAMES[r].toLowerCase()}`).join(', ')}.</p><button class="primary-button full" type="submit">Realizar intercambio ${icon('trade', 18)}</button></form>
    <form id="offer-form" hidden><label class="field-label">COMERCIAR CON<select name="player">${game.players.map((p, i) => i !== game.current ? `<option value="${i}">${esc(p.name)}${p.bot ? ' · IA' : ''}</option>` : '').join('')}</select></label><div class="offer-head"><span>RECURSO</span><span>ENTREGAS</span><span>PIDES</span></div>${RESOURCES.map(r => `<div class="offer-row"><span>${resourceIcon(r, 17)} ${NAMES[r]}</span><input type="number" name="give-${r}" aria-label="Entregar ${NAMES[r]}" value="0" min="0" max="${game.players[game.current].hand[r]}"><input type="number" name="receive-${r}" aria-label="Pedir ${NAMES[r]}" value="0" min="0" max="19"></div>`).join('')}
    <p class="form-note">La IA valorará si el trato le ayuda a construir y te responderá. También puede proponerte intercambios durante su turno. Las cartas solo se entregan tras aceptar la oferta.</p><button class="primary-button full" type="submit">Proponer intercambio ${icon('arrow', 18)}</button></form>`);
  updateRatio();
}
function showPendingTrade() {
  const offer = game.pendingTrade!;
  const from = game.players[offer.from], recipient = game.players[offer.to], waiting = recipient.bot;
  const incoming = waiting ? offer.receive : offer.give, outgoing = waiting ? offer.give : offer.receive;
  const describe = (cards: Hand) => RESOURCES.filter(r => cards[r]).map(r => `<span class="trade-chip">${resourceIcon(r, 19)} <b>${cards[r]}</b> ${NAMES[r]}</span>`).join('');
  const affordable = RESOURCES.every(r => recipient.hand[r] >= offer.receive[r]);
  modal('offer-pending', waiting ? `${esc(recipient.name)} está valorando tu oferta.` : `${esc(recipient.name)}, ¿cerramos el trato?`, waiting ? 'El rival decide según sus recursos, sus posibilidades de construir y la situación de la partida.' : `${esc(from.name)} te propone este intercambio. ${from.bot ? 'La partida espera tu decisión.' : 'Pasa el dispositivo al destinatario.'}`, `
    <div class="offer-preview"><h3>Recibes</h3><div class="trade-chips">${describe(incoming)}</div><h3>Entregas</h3><div class="trade-chips">${describe(outgoing)}</div></div>
    ${waiting ? `<p class="trade-waiting" role="status">${icon('bot', 20)} Preparando respuesta…</p>` : `${!affordable ? '<p class="form-note">No tienes todos los recursos solicitados. Puedes rechazar esta oferta.</p>' : ''}<button class="primary-button full" data-act="accept-offer" ${affordable ? '' : 'disabled'}>Aceptar intercambio ${icon('trade', 18)}</button><button class="text-button full" data-act="reject-offer">Rechazar oferta</button>`}`, false, true);
}
function updateRatio() { const form = document.querySelector<HTMLFormElement>('#trade-form'); if (!form) return; const r = new FormData(form).get('give') as Resource; document.querySelector('#trade-ratio')!.innerHTML = `<b>${tradeRatio(game, r)} : 1</b><span>Entregas ${tradeRatio(game, r)} de ${NAMES[r].toLowerCase()} por 1 recurso a tu elección.</span>`; }
function showCards() {
  const i = humanViewIndex(), p = game.players[i], types = [...new Set(p.dev.map(d => d.type))];
  modal('cards', 'Una carta puede cambiarlo todo.', 'Las cartas nuevas esperan un turno. Los puntos de victoria permanecen secretos.', `<div class="development-list">${types.length ? types.map(type => {
    const ready = i === game.current && isHuman() && !p.played && !game.freeRoads && ['action', 'roll'].includes(game.phase) && p.dev.some(d => d.type === type && d.turn < game.turn) && type !== 'victory' && (type !== 'roads' || legalRoads(game, false).length > 0);
    const desc: Record<Dev, string> = { knight: 'Mueve el ladrón y roba un recurso. Suma a tu ejército.', roads: 'Construye hasta 2 carreteras sin gastar recursos.', plenty: 'Obtén 2 recursos del banco a tu elección.', monopoly: 'Todos tus rivales te entregan sus cartas del recurso elegido.', victory: '+1 punto secreto. Se cuenta automáticamente para ganar.' };
    return `<div class="development-card"><div class="dev-art">${icon(type === 'knight' ? 'knight' : type === 'roads' ? 'road' : type === 'victory' ? 'trophy' : type === 'plenty' ? 'wheat' : 'trade', 34)}</div><div><h3>${DEV_NAMES[type]} <small>×${p.dev.filter(d => d.type === type).length}</small></h3><p>${desc[type]}</p><button class="outline-button small" data-dev="${type}" ${ready ? '' : 'disabled'}>${type === 'victory' ? 'Punto permanente' : ready ? 'Jugar carta' : 'No disponible este turno'}</button></div></div>`;
  }).join('') : `<div class="empty-state">${icon('dev', 48)}<h3>Tu próxima gran oportunidad.</h3><p>Compra cartas de desarrollo con 1 lana, 1 trigo y 1 mineral.</p><div class="cost">${costHtml(COSTS.dev)}</div></div>`}</div><p class="form-note">Quedan ${game.deck.length} cartas en el mazo. Caballeros jugados: ${p.knights}.</p>`);
}
function playDev(card: Dev) {
  if (card === 'monopoly' || card === 'plenty') {
    const opts = RESOURCES.map(r => `<option value="${r}">${NAMES[r]} · Banco: ${game.bank[r]}</option>`).join('');
    modal('dev-choice', DEV_NAMES[card], card === 'plenty' ? 'Elige dos recursos disponibles en el banco.' : 'Elige el recurso que todos tus rivales te entregarán.', `<form id="dev-form" data-card="${card}"><label class="field-label">RECURSO<select name="first">${opts}</select></label>${card === 'plenty' ? `<label class="field-label">SEGUNDO RECURSO<select name="second">${opts}</select></label>` : ''}<button class="primary-button full" type="submit">Jugar carta ${icon('arrow', 18)}</button></form>`);
  } else { closeModal(); dispatch({ type: 'dev', card }); }
}
function showResults() { if (game.winner === null) return; const w = game.players[game.winner]; modal('results', `La isla es tuya, ${esc(w.name)}.`, `Una expedición inolvidable. Victoria con ${points(game, game.winner)} puntos en el turno ${game.turn}.`, `<div class="winner-art" style="color:${w.color}">${icon('trophy', 72)}</div><div class="results-list">${game.players.map((p, i) => ({ p, i })).sort((a, b) => points(game, b.i) - points(game, a.i)).map(({ p, i }) => `<div><span style="color:${p.color}">${icon('person', 20)} ${esc(p.name)}</span><b>${points(game, i)} PV</b></div>`).join('')}</div><button class="primary-button full" data-act="new">Otra isla, otra historia ${icon('arrow', 18)}</button>`); }
function showSettings() { modal('settings', 'A tu manera.', 'La partida se guarda en este navegador después de cada acción.', `<div class="settings-actions"><button class="setting-row" data-act="sound">${icon('sound', 23)}<span>Sonidos sutiles<small>${muted ? 'Desactivados' : 'Activados'}</small></span><b>${muted ? 'Activar' : 'Silenciar'}</b></button><button class="setting-row" data-act="export">${icon('save', 23)}<span>Exportar partida<small>Descarga una copia en formato JSON</small></span>${icon('arrow', 18)}</button><label class="setting-row import-label">${icon('dev', 23)}<span>Importar partida<small>Continúa una partida exportada</small></span><input type="file" id="import-game" accept="application/json,.json">${icon('arrow', 18)}</label></div><p class="form-note">Partida local. No requiere cuenta ni conexión una vez cargada. El modo online y las expansiones no forman parte de esta versión.</p>`); }

app.addEventListener('click', e => {
  const button = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-build], [data-location], [data-victim], [data-steal-card], [data-dev], [data-trade-tab]');
  if (!button || button.hasAttribute('disabled')) return;
  sound();
  if (button.dataset.build) { const kind = button.dataset.build; if (kind === 'dev') dispatch({ type: 'buy' }); else { mode = kind as Mode; render(); } return; }
  if (button.dataset.location) { const id = Number(button.dataset.location), kind = button.dataset.kind!; closeModal(); selectBoard(kind, id); return; }
  if (button.dataset.victim) { const id = Number(button.dataset.victim); if (game.phase === 'steal' && isHuman() && game.victims.includes(id)) { selectedVictim = id; showRobbery(); } return; }
  if (button.dataset.stealCard !== undefined) { if (selectedVictim !== null && isHuman()) dispatch({ type: 'steal', player: selectedVictim, card: Number(button.dataset.stealCard) }); return; }
  if (button.dataset.dev) { playDev(button.dataset.dev as Dev); return; }
  if (button.dataset.tradeTab) { const bank = button.dataset.tradeTab === 'bank'; document.querySelector<HTMLFormElement>('#trade-form')!.hidden = !bank; document.querySelector<HTMLFormElement>('#offer-form')!.hidden = bank; document.querySelectorAll('[data-trade-tab]').forEach(b => b.classList.toggle('active', b === button)); return; }
  switch (button.dataset.act) {
    case 'help': showHelp(); break;
    case 'new': showNew(); break;
    case 'settings': showSettings(); break;
    case 'close-modal': if (passTo === null && game.phase !== 'discard' && game.phase !== 'steal' && !game.pendingTrade) closeModal(); break;
    case 'robbery': showRobbery(); break;
    case 'close-tile': document.querySelector<HTMLElement>('#tile-info')!.hidden = true; break;
    case 'cancel-build': mode = 'inspect'; render(); break;
    case 'roll': dispatch({ type: 'roll' }); break;
    case 'end': dispatch({ type: 'end' }); break;
    case 'trade': showTrade(); break;
    case 'cards': showCards(); break;
    case 'locations': showLocations(); break;
    case 'results': showResults(); break;
    case 'reveal': passTo = null; closeModal(); render(); scheduleBot(); break;
    case 'home': board?.home(); break;
    case 'zoom-in': board?.zoom(.15); break;
    case 'zoom-out': board?.zoom(-.15); break;
    case 'log': modal('log', 'Historias de la isla.', 'Las últimas 70 acciones de esta expedición.', `<div class="full-log">${game.log.map(s => `<p>${esc(s)}</p>`).join('')}</div>`); break;
    case 'sound': muted = !muted; sound(); showSettings(); break;
    case 'export': { const url = URL.createObjectURL(new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `isla-universal-turno-${game.turn}.json`; a.click(); URL.revokeObjectURL(url); toast('Partida exportada.'); break; }
    case 'accept-offer':
    case 'reject-offer': if (game.pendingTrade && !game.players[game.pendingTrade.to].bot) dispatch({ type: 'respond', player: game.pendingTrade.to, accept: button.dataset.act === 'accept-offer' }); break;
  }
});
app.addEventListener('submit', e => {
  e.preventDefault(); const form = e.target as HTMLFormElement, data = new FormData(form);
  if (form.id === 'new-game-form') { const local = data.get('mode') === 'local', n = Number(data.get('count')); game = newGame(Array.from({ length: n }, (_, i) => ({ name: i === 0 ? String(data.get('name')) : local ? `Jugador ${i + 1}` : ['Olivia', 'Nicolás', 'Valeria'][i - 1], bot: i > 0 && !local }))); passTo = null; mode = 'inspect'; closeModal(); board?.create(game); save(); render(); scheduleBot(); }
  if (form.id === 'trade-form') { const prev = game; dispatch({ type: 'trade', give: data.get('give') as Resource, receive: data.get('receive') as Resource }); if (prev !== game) showTrade(); }
  if (form.id === 'discard-form') { const cards = emptyHand(); RESOURCES.forEach(r => cards[r] = Number(data.get(r))); const prev = game; closeModal(); dispatch({ type: 'discard', player: Number(form.dataset.player), cards }); if (prev === game) showDiscard(); }
  if (form.id === 'dev-form') { const resources = [data.get('first') as Resource]; if (data.get('second')) resources.push(data.get('second') as Resource); const prev = game; dispatch({ type: 'dev', card: form.dataset.card as Dev, resources }); if (prev !== game) closeModal(); }
  if (form.id === 'offer-form') {
    const give = emptyHand(), receive = emptyHand(); RESOURCES.forEach(r => { give[r] = Number(data.get(`give-${r}`)); receive[r] = Number(data.get(`receive-${r}`)); }); const cmd: Command = { type: 'offer', player: Number(data.get('player')), give, receive };
    dispatch(cmd);
  }
});
app.addEventListener('change', async e => {
  const target = e.target as HTMLInputElement;
  if (target.closest('#trade-form')) updateRatio();
  if (target.id === 'import-game' && target.files?.[0]) {
    try { const file = target.files[0]; if (file.size > 1_000_000) throw new Error('Archivo demasiado grande.'); const next: Game = JSON.parse(await file.text()); validateSave(next); window.clearTimeout(botTimer); game = next; passTo = null; selectedVictim = null; mode = 'inspect'; closeModal(); board?.create(game); save(); render(); scheduleBot(); toast('Partida recuperada. ¡Bienvenido de nuevo!'); }
    catch { toast('El archivo no contiene una partida válida de Isla Universal.'); }
  }
});
function validateSave(g: Game) {
  if (g.version !== 1 || !Array.isArray(g.players) || g.players.length < 3 || g.players.length > 4 || g.tiles?.length !== 19 || g.vertices?.length !== 54 || g.edges?.length !== 72 || !Number.isInteger(g.current) || !g.players[g.current] || !['setup-settlement', 'setup-road', 'roll', 'discard', 'robber', 'steal', 'action', 'finished'].includes(g.phase)) throw new Error('Invalid save');
  if (!Number.isInteger(g.robber) || !g.tiles[g.robber] || !Array.isArray(g.log) || !g.log.every(s => typeof s === 'string') || !Array.isArray(g.deck) || !g.deck.every(d => d in DEV_NAMES)) throw new Error('Invalid save');
  if (!Number.isInteger(g.turn) || g.turn < 0 || !Number.isInteger(g.setup) || g.setup < 0 || g.setup > g.players.length * 2 || !Number.isInteger(g.freeRoads) || g.freeRoads < 0 || g.freeRoads > 2 || !['roll', 'action'].includes(g.resume) || !Array.isArray(g.discards) || g.discards.length !== g.players.length || !g.discards.every(n => Number.isInteger(n) && n >= 0) || !Array.isArray(g.victims) || !g.victims.every(i => Number.isInteger(i) && !!g.players[i]) || !Array.isArray(g.lastProduction)) throw new Error('Invalid phase state');
  if ([g.longest, g.army, g.winner].some(i => i !== null && (!Number.isInteger(i) || !g.players[i])) || g.phase === 'finished' && g.winner === null || g.phase === 'setup-road' && (g.anchor === null || !g.vertices[g.anchor]) || g.dice !== null && (!Array.isArray(g.dice) || g.dice.length !== 2 || !g.dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6))) throw new Error('Invalid turn state');
  for (const r of RESOURCES) { if (!Number.isInteger(g.bank[r]) || g.bank[r] < 0 || g.bank[r] > 19 || g.players.some(p => !Number.isInteger(p.hand[r]) || p.hand[r] < 0) || g.bank[r] + g.players.reduce((n, p) => n + p.hand[r], 0) !== 19) throw new Error('Invalid resource balance'); }
  for (const p of g.players) if (typeof p.name !== 'string' || typeof p.bot !== 'boolean' || !/^#[0-9a-f]{6}$/i.test(p.color) || !p.dev.every(d => d.type in DEV_NAMES && Number.isInteger(d.turn))) throw new Error('Invalid player');
  for (const [i, v] of g.vertices.entries()) if (v.id !== i || !Number.isFinite(v.x) || !Number.isFinite(v.z) || !v.edges.every(e => !!g.edges[e]) || !v.tiles.every(t => !!g.tiles[t]) || v.owner !== null && !g.players[v.owner]) throw new Error('Invalid graph');
  for (const [i, e] of g.edges.entries()) if (e.id !== i || !g.vertices[e.a] || !g.vertices[e.b] || e.owner !== null && !g.players[e.owner]) throw new Error('Invalid graph');
  for (const [i, t] of g.tiles.entries()) if (t.id !== i || !Number.isFinite(t.x) || !Number.isFinite(t.z) || ![...RESOURCES, 'desert'].includes(t.resource) || !t.vertices.every(v => !!g.vertices[v])) throw new Error('Invalid graph');
  if (g.tradeAttempts !== undefined && (!Array.isArray(g.tradeAttempts) || g.tradeAttempts.length > g.players.length - 1 || new Set(g.tradeAttempts).size !== g.tradeAttempts.length || !g.tradeAttempts.every(i => Number.isInteger(i) && !!g.players[i] && i !== g.current))) throw new Error('Invalid trade attempts');
  if (g.pendingTrade !== undefined && g.pendingTrade !== null) { if (g.phase !== 'action' || g.freeRoads) throw new Error('Invalid pending trade phase'); validateTrade(g, g.pendingTrade); }
  if (g.phase === 'steal') { const eligible = robberyVictims(g); if (!eligible.length || new Set(g.victims).size !== g.victims.length || eligible.length !== g.victims.length || !eligible.every(i => g.victims.includes(i))) throw new Error('Invalid robbery victims'); }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && passTo === null && game.phase !== 'discard' && game.phase !== 'steal' && !game.pendingTrade) { closeModal(); mode = 'inspect'; render(); }
  if (e.key === 'Tab' && activeModal) { const root = document.querySelector('.modal')!; const elements = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([hidden]), select, [tabindex="0"]')].filter(el => el.offsetParent !== null); const first = elements[0], last = elements.at(-1); if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
});
// A read-only diagnostic surface also enables real pointer-based browser tests.
Object.defineProperty(window, '__isla', { value: { get state() { return structuredClone(game); }, project: (kind: string, id: number) => board?.project(kind, id) } });
render(); scheduleBot();
