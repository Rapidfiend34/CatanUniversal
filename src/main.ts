import './style.css';
import { Board, type Mode } from './board';
import { type Game, type Variant, type Command, type Hand, type Dev, type Resource, newGame, execute, RESOURCES, NAMES, DEV_NAMES, COSTS, total, points, legalRoads, legalSettlements, longestLength, tradeRatio, canAfford, countBuildings, emptyHand, BOT_NAMES, bankSize, isSecondary, secondaryPlayer } from './engine';
import { validateSave } from './save';
import { botCommand } from './bot';
import { icon } from './icons';
import QRCode from 'qrcode';
import { RoomClient } from './online/client';
import type { RoomView, RoomMode } from './online/types';
import { IslandAudio, gameSounds } from './audio';

const SAVE_KEY = 'isla-universal-v1';
const network = new RoomClient();
let receivedGameVersion = -1, receivedRoomCode = '', roomOpening = false, controllerFocus = true;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
let game: Game;
try { const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); validateSave(saved); game = saved; } catch { game = newGame([{ name: 'Tú', bot: false }, { name: 'Olivia', bot: true }, { name: 'Nicolás', bot: true }]); }
let mode: Mode = 'inspect', activeModal = '', botTimer = 0, toastTimer = 0, passTo: number | null = null;
let selectedVictim: number | null = null;
const audio = new IslandAudio();
document.addEventListener('pointerdown', e => { if (e.isTrusted) audio.activate(); }, { capture: true });
document.addEventListener('keydown', e => { if (e.isTrusted) audio.activate(); }, { capture: true });
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Isla Universal, inicio"><span class="brand-mark">${icon('island', 29)}</span><span>ISLA<span class="brand-bottom">UNIVERSAL</span></span></a>
    <span class="header-divider"></span><div class="game-label">El comienzo de una aventura <span>EDICIÓN BASE · 3D</span></div>
    <div class="header-right"><span class="save-indicator"><i></i> Guardado local</span><button class="text-button room-entry" data-act="rooms" aria-label="Salas online">${icon('person', 18)}<span>Salas online</span></button><button class="text-button" data-act="help" aria-label="Cómo jugar">${icon('help', 18)}<span>Cómo jugar</span></button><button class="mobile-settings icon-plain" data-act="settings" aria-label="Ajustes">${icon('settings', 18)}</button><button class="outline-button small" data-act="new">${icon('plus', 16)} Nueva partida</button></div>
  </header>
  <div id="network-bar" class="network-bar" hidden></div>
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

function toast(message: string) { const el = document.querySelector<HTMLDivElement>('#toast')!; el.textContent = message; el.hidden = false; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el.hidden = true; }, 4200); }
function save() { if (network.session) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { toast('No se puede guardar en este navegador. Exporta tu partida desde el menú.'); } }
function isHuman() { return (!network.session || network.view?.self === game.current) && !game.players[game.current].bot && passTo === null && game.phase !== 'finished' && !game.pendingTrade; }
function handCount(i: number) { return network.view?.game ? network.view.cardCounts[i] : total(game.players[i].hand); }
function devCount(i: number) { return network.view?.game ? network.view.devCounts[i] : game.players[i].dev.length; }
function deckCount() { return network.view?.game ? network.view.deckCount : game.deck.length; }
function playerPoints(i: number) { return network.view?.game ? network.view.scores[i] : points(game, i, i === humanViewIndex() || game.phase === 'finished'); }
function dispatch(command: Command, automated = false) {
  if (network.session) { if (!network.connected || network.busy) { if (!network.connected) toast('Reconectando con la sala. Espera un momento.'); return; } void network.command(command); return; }
  try {
    const previous = game, old = game.current, previousOffer = game.pendingTrade; game = execute(game, command); mode = 'inspect';
    if (command.type === 'robber') { selectedVictim = null; if (!automated && game.phase !== 'steal') toast('No hay rivales con cartas de recursos para robar en esta parcela.'); }
    if (command.type === 'steal') { selectedVictim = null; if (activeModal === 'robbery') closeModal(); if (!automated) toast(game.log[0]); }
    if (command.type === 'respond') { if (activeModal === 'offer-pending') closeModal(); if (previousOffer && (!game.players[previousOffer.from].bot || !game.players[previousOffer.to].bot)) toast(game.log[0]); }
    const cues = gameSounds(previous, game, humanViewIndex());
    if (command.type === 'dev' && !cues.includes('card')) cues.push('card');
    cues.forEach(cue => audio.play(cue));
    if (!automated && command.type === 'end' || old !== game.current) { if (!game.players[game.current].bot && game.players.filter(p => !p.bot).length > 1 && old !== game.current) passTo = game.current; }
    save(); render(); scheduleBot();
  } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo completar la acción.'); if (automated) { window.clearTimeout(botTimer); console.error('AI error', e); toast('El rival automático se ha detenido. Exporta la partida para conservarla.'); } }
}
function humanViewIndex() { if (network.session) return network.view?.self ?? game.current; if (game.pendingTrade && !game.players[game.pendingTrade.to].bot) return game.pendingTrade.to; return game.players[game.current].bot ? Math.max(0, game.players.findIndex(p => !p.bot)) : game.current; }
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
  if (isSecondary(game)) return { tag: `CONSTRUCCIÓN INTERMEDIA · ${name.toUpperCase()}`, title: 'Tu isla sigue creciendo.', text: `${name}, puedes construir y comprar desarrollo, sin dados, comercio ni jugar cartas. Después jugará ${esc(game.players[(game.primary! + 1) % game.players.length].name)}.` };
  if (mode !== 'inspect') return { tag: 'CONSTRUCCIÓN', title: mode === 'road' ? 'Un camino por recorrer.' : mode === 'city' ? 'Tu isla crece contigo.' : 'Un lugar para quedarse.', text: 'Selecciona una ubicación iluminada en el tablero para construir.' };
  return { tag: `TURNO ${game.turn} · ${name.toUpperCase()}`, title: 'Haz crecer tu isla.', text: 'Construye, intercambia recursos o descubre una carta. Cada decisión cuenta.' };
}
function render() {
  document.body.classList.toggle('expanded-game', game.variant === 'expanded');
  document.querySelector('.game-label span')!.textContent = game.variant === 'expanded' ? 'AMPLIADO · ' + game.players.length + ' JUGADORES' : 'EDICIÓN BASE · 3D';
  const g = game, active = g.players[g.current], human = isHuman(), view = humanViewIndex(), player = g.players[view], info = phaseText();
  document.querySelector('#sidebar')!.innerHTML = `
    <div class="section-label">LA EXPEDICIÓN <span>${g.players.length} JUGADORES</span></div>
    <div class="players">${g.players.map((p, i) => `<div class="player ${i === g.current ? 'active' : ''}" style="--player:${p.color}"><div class="player-avatar"><span class="player-number">${i + 1}</span>${icon(p.bot ? 'bot' : 'person', 22)}</div><div class="player-name">${esc(p.name)} ${i === view && !p.bot && !network.view?.screen ? '<span class="you-tag">TÚ</span>' : ''}<small>${i === g.current ? '<span class="turn-dot"></span> ' + (p.bot ? 'Pensando…' : network.session && network.view?.self !== i ? 'Jugando' : 'Tu turno') : p.bot ? 'Rival automático' : network.session ? 'En la sala' : 'Jugador local'}</small></div><div class="player-points">${playerPoints(i)}<span>PV</span></div><div class="player-meta"><span title="Cartas de recursos">${icon('dev', 12)} ${handCount(i)}</span><span title="Cartas de desarrollo">${icon('leaf', 12)} ${devCount(i)}</span><span title="Caballeros jugados">${icon('knight', 12)} ${p.knights}</span><span title="Longitud de carretera">${icon('road', 12)} ${longestLength(g, i)}</span></div></div>`).join('')}</div>
    <div class="goal-card"><span class="goal-icon">${icon('trophy', 24)}</span><div><strong>Un destino. 10 puntos.</strong><p>Construye tu camino a la victoria.</p></div><div class="goal-progress"><i style="width:${Math.min(100, playerPoints(view) * 10)}%"></i></div><span class="goal-count">${playerPoints(view)} <span>/ 10 PV</span></span></div>
    <div class="section-label awards-label">GRANDES LOGROS</div>
    <div class="award"><span>${icon('road', 20)}</span><div>Carretera más larga<small>${g.longest === null ? 'Conecta al menos 5 tramos' : esc(g.players[g.longest].name)}</small></div><b>+2</b></div>
    <div class="award"><span>${icon('knight', 20)}</span><div>Mayor ejército<small>${g.army === null ? 'Juega al menos 3 caballeros' : esc(g.players[g.army].name)}</small></div><b>+2</b></div>
    <div class="sidebar-bottom"><div class="section-label">CUADERNO DE BITÁCORA <button class="icon-plain" data-act="log" aria-label="Ver historial completo">${icon('arrow', 15)}</button></div><div class="mini-log">${g.log.slice(0, 3).map((s, i) => `<p class="${i === 0 ? 'latest' : ''}">${i === 0 ? '<i></i>' : ''}${esc(s)}</p>`).join('')}</div><div class="sidebar-foot"><span>ESTRATEGIA EN ESTADO PURO</span><button class="icon-plain" data-act="settings" aria-label="Opciones de partida">${icon('settings', 17)}</button></div></div>`;
  document.querySelector('#phase-panel')!.innerHTML = `<span class="eyebrow">${info.tag}</span><h2>${info.title}</h2><p>${info.text}</p>${network.view?.screen ? `<div class="public-bank" aria-label="Banco común"><span>BANCO</span>${RESOURCES.map(r => `<span title="${NAMES[r]}">${resourceIcon(r, 14)} ${g.bank[r]}</span>`).join('')}</div>` : ''}${human && (['setup-settlement', 'setup-road', 'robber'].includes(g.phase) || mode !== 'inspect' || g.freeRoads) ? `<button class="phase-link" data-act="locations">Ver ubicaciones ${icon('arrow', 14)}</button>` : ''}${human && mode !== 'inspect' && !g.freeRoads ? '<button class="phase-link muted" data-act="cancel-build">Cancelar</button>' : ''}${g.phase === 'steal' && human ? `<div class="victim-buttons">${g.victims.map(i => `<button class="outline-button small" data-victim="${i}">${esc(g.players[i].name)}</button>`).join('')}</div>` : ''}`;
  const actionable = human && g.phase === 'action' && !g.freeRoads;
  document.querySelector('#bottom-panel')!.innerHTML = `
    <div class="inventory-panel"><div class="inventory-heading"><div class="section-label">${network.session || view === g.current ? 'TUS RECURSOS' : 'RECURSOS DE ' + esc(player.name.toUpperCase())}<span>${handCount(view)} CARTAS</span></div><button class="dev-link" data-act="cards">${icon('dev', 15)} Desarrollo <span>${player.dev.length}</span></button></div>
      <div class="resource-hand">${RESOURCES.map(r => `<div class="resource-card ${r}" title="${NAMES[r]} · Banco: ${g.bank[r]}">${resourceIcon(r, 28)}<strong>${passTo === null ? player.hand[r] : '—'}</strong><span>${NAMES[r]}</span><small class="bank-stock">Banco: ${g.bank[r]}</small><i></i></div>`).join('')}</div>
      <div class="build-toolbar">${(['road', 'settlement', 'city', 'dev'] as const).map(kind => {
        const enabled = actionable && canAfford(g, COSTS[kind]) && (kind === 'road' ? legalRoads(g).length > 0 : kind === 'settlement' ? legalSettlements(g).length > 0 : kind === 'city' ? countBuildings(g, g.current, false) > 0 && countBuildings(g, g.current, true) < 4 : deckCount() > 0);
        return `<button class="build-button ${mode === kind ? 'selected' : ''}" data-build="${kind}" ${enabled ? '' : 'disabled'} title="${!enabled ? 'Necesitas recursos, una ubicación válida y estar en fase de construcción.' : 'Construir'}">${icon(kind, 20)}<span><b>${{ road: 'Carretera', settlement: 'Poblado', city: 'Ciudad', dev: 'Desarrollo' }[kind]}</b><span class="cost">${costHtml(COSTS[kind])}</span></span></button>`;
      }).join('')}<button class="trade-button" data-act="trade" ${actionable && !isSecondary(g) ? '' : 'disabled'}>${icon('trade', 20)}<span>Comerciar</span></button></div>
    </div>
    <div class="turn-panel"><div class="dice-area">${g.dice ? g.dice.map(n => `<div class="die" aria-label="Dado ${n}">${Array.from({ length: 9 }, (_, i) => `<i class="${diceDots(n).includes(i) ? 'dot' : ''}"></i>`).join('')}</div>`).join('') : `<div class="die waiting">${icon('dice', 28)}</div><div class="die waiting">${icon('dice', 28)}</div>`}<span class="dice-total">${g.dice ? g.dice[0] + g.dice[1] : '–'}<small>${g.dice ? 'RESULTADO' : 'DADOS'}</small></span></div>
      <button class="primary-button turn-button" data-act="${g.phase === 'finished' ? 'results' : g.phase === 'roll' ? 'roll' : g.phase === 'steal' ? 'robbery' : g.phase === 'action' ? 'end' : 'locations'}" ${human && (g.phase === 'roll' || actionable || ['setup-settlement', 'setup-road', 'robber', 'steal'].includes(g.phase) || g.freeRoads) || g.phase === 'finished' ? '' : 'disabled'}>${g.phase === 'finished' ? 'Ver resultados' : !human ? 'Turno del rival…' : g.phase === 'roll' ? 'Lanzar dados' : g.phase === 'steal' ? 'Elegir carta' : g.phase === 'action' && !g.freeRoads ? isSecondary(g) ? 'Terminar construcción' : 'Terminar turno' : 'Elegir ubicación'} ${icon(g.phase === 'roll' ? 'dice' : 'arrow', 18)}</button><span class="turn-hint">${g.phase.startsWith('setup') ? 'Colocación inicial · Sin coste' : g.phase === 'roll' ? 'Que la isla esté de tu lado.' : g.variant === 'expanded' && !isSecondary(g) ? 'Después construye ' + esc(g.players[secondaryPlayer(g)].name) : 'Lo que construyes, permanece.'}</span>
    </div>`;
  board?.update(g, network.view?.screen ? network.view.preview : mode, human || !!network.view?.screen, !!network.view?.screen);
  if (passTo !== null) showPass();
  else if (g.pendingTrade && (network.session ? network.view?.self === g.pendingTrade.from || network.view?.self === g.pendingTrade.to : !g.players[g.pendingTrade.from].bot || !g.players[g.pendingTrade.to].bot)) showPendingTrade();
  else if (g.phase === 'steal' && human) showRobbery();
  else if (g.phase === 'discard' && (network.session ? network.view?.self !== null && g.discards[network.view!.self!] > 0 : !g.players[g.discards.findIndex(Boolean)]?.bot) && !(network.session && activeModal === 'discard')) showDiscard();
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
  if (network.session) return;
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
function rulesFields(countName: string) {
  return `<label class="field-label">REGLAS<select name="variant"><option value="classic">Clásico · 3–4 jugadores</option><option value="expanded">Ampliado · 5–10 jugadores</option></select></label><label class="field-label">JUGADORES<select name="${countName}"><option value="3">3 jugadores</option><option value="4">4 jugadores</option></select></label><p class="form-note rules-summary">Clásico: isla de 19 parcelas y banco de 19 cartas por recurso.</p>`;
}
function updateRulesForm(form: HTMLFormElement) {
  const expanded = new FormData(form).get('variant') === 'expanded';
  const count = form.querySelector<HTMLSelectElement>('[name="count"], [name="capacity"]')!;
  count.innerHTML = (expanded ? [5, 6, 7, 8, 9, 10] : [3, 4]).map(n => `<option value="${n}" ${expanded && n === 10 ? 'selected' : ''}>${n} jugadores</option>`).join('');
  form.querySelector('.rules-summary')!.textContent = expanded ? 'Ampliado: isla y banco mayores, construcción intermedia sin comercio y Monopolio sobre hasta 3 rivales. Puedes probarlo solo contra la IA.' : 'Clásico: isla de 19 parcelas y banco de 19 cartas por recurso.';
}
function showNew() {
  modal('new', 'Una nueva aventura.', 'Juega a tu ritmo, con amigos a distancia o con todos alrededor del televisor.', `<form id="new-game-form"><label class="field-label">TU NOMBRE<input name="name" maxlength="22" value="Explorador" required></label><label class="field-label">MODO DE PARTIDA<select name="mode"><option value="solo">Un jugador + rivales automáticos</option><option value="local">Multijugador local (mismo dispositivo)</option><option value="online">Online · Crear sala con código</option><option value="party">Party · Pantalla de televisión + móviles</option></select></label>${rulesFields('count')}<p class="form-note">Las salas online necesitan al menos dos personas. Las plazas libres se pueden completar con IA. Tu partida local se conserva al entrar online.</p><button class="primary-button full" type="submit">Descubrir mi isla ${icon('arrow', 18)}</button></form><button class="text-button full" data-act="join-room">Tengo un código · Unirme a una sala</button>`);
}
function showHelp() {
  modal('help', 'Tu primera travesía.', 'Una adaptación independiente del juego base, con arte y modelos originales.', `<div class="rules-grid"><article><span>01</span><h3>Funda tu expedición</h3><p>Coloca 2 poblados y 2 carreteras gratis. El orden es de ida y vuelta. El segundo poblado recibe los recursos de sus parcelas vecinas.</p></article><article><span>02</span><h3>Deja que la isla produzca</h3><p>Lanza 2 dados. Las parcelas con ese número entregan 1 recurso por poblado y 2 por ciudad a todos sus propietarios.</p></article><article><span>03</span><h3>Construye y comercia</h3><p>Conecta carreteras, funda poblados y mejóralos. Debe quedar un cruce libre entre poblados. Comercia 4:1 con el banco, 3:1 en puerto general o 2:1 en el especializado.</p></article><article><span>04</span><h3>Gana con 10 puntos</h3><p>Poblado: 1 PV. Ciudad: 2 PV. Carretera más larga (5+) y mayor ejército (3+): 2 PV cada uno. Algunas cartas suman puntos secretos.</p></article></div><div class="rule-note">${icon('knight', 25)}<p><strong>Un 7 trae al ladrón.</strong> Con más de 7 recursos, descarta la mitad. Mueve el ladrón, bloquea una parcela y roba a un vecino. Los caballeros también lo mueven.</p></div>${game.variant === 'expanded' ? '<p class="form-note">AMPLIADO: banco de ' + bankSize(game) + ' cartas por recurso. Tras cada turno, construye el jugador situado media vuelta más adelante, sin comerciar ni jugar desarrollo. También puede ganar con 10 PV. Monopolio afecta a un máximo de 3 rivales.</p>' : ''}<p class="form-note">Solo puedes jugar una carta de desarrollo por turno, nunca en el turno en que la compraste. Los puntos de victoria cuentan automáticamente. Las carreteras representan los caminos del juego base; los puentes marítimos pertenecen a expansiones.</p><button class="primary-button full" data-act="close-modal">¡Vamos a construir! ${icon('arrow', 18)}</button>`, true);
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
  const i = network.session ? network.view?.self ?? -1 : game.discards.findIndex(Boolean); if (i < 0) return;
  modal('discard', `${esc(game.players[i].name)}, aligera tu equipaje.`, `Devuelve exactamente ${game.discards[i]} recursos al banco.${network.session ? ' Solo tú puedes elegir qué cartas descartar.' : ' Pasa el dispositivo a este jugador.'}`, `<form id="discard-form" data-player="${i}"><div class="resource-inputs">${RESOURCES.map(r => `<label>${resourceIcon(r)}<span>${NAMES[r]}<small>Tienes ${game.players[i].hand[r]}</small></span><input type="number" name="${r}" min="0" max="${game.players[i].hand[r]}" value="0" required></label>`).join('')}</div><button class="primary-button full" type="submit">Devolver recursos ${icon('arrow', 18)}</button></form>`, false, true);
}
function showRobbery() {
  if (game.phase !== 'steal' || !isHuman()) return;
  if (selectedVictim === null || !game.victims.includes(selectedVictim)) selectedVictim = game.victims.length === 1 ? game.victims[0] : null;
  const victim = selectedVictim === null ? null : game.players[selectedVictim], count = victim ? handCount(selectedVictim!) : 0;
  modal('robbery', victim ? `Elige una carta de ${esc(victim.name)}.` : 'Elige a quién robar.', 'Solo puedes robar a rivales con un poblado o ciudad junto al ladrón y cartas de recursos en su mano.', `
    <div class="robbery-victims" role="group" aria-label="Rivales afectados por el ladrón">${game.victims.map(i => `<button class="robbery-victim ${selectedVictim === i ? 'selected' : ''}" data-victim="${i}" aria-pressed="${selectedVictim === i}" style="--player:${game.players[i].color}"><span class="robbery-avatar">${icon(game.players[i].bot ? 'bot' : 'person', 22)}</span><span><strong>${esc(game.players[i].name)}</strong><small>${handCount(i)} cartas de recursos</small></span>${icon('arrow', 16)}</button>`).join('')}</div>
    ${victim ? `<div class="robbery-hand" role="group" aria-label="Cartas boca abajo de ${esc(victim.name)}">${Array.from({ length: count }, (_, i) => `<button class="hidden-card" data-steal-card="${i}" aria-label="Robar carta oculta ${i + 1} de ${esc(victim.name)}"><span class="card-back-art">${icon('island', 28)}<span>ISLA</span></span><small>${i + 1}</small></button>`).join('')}</div><p class="robbery-note">${icon('dev', 17)} Toca una carta boca abajo. Su recurso no se revela antes de elegir; las cartas de desarrollo no se pueden robar.</p>` : '<p class="robbery-note">Selecciona un rival para ver sus cartas boca abajo. Ninguna carta se robará hasta que la elijas.</p>'}`, count > 8, true);
}
function showTrade() {
  if (!isHuman() || game.phase !== 'action' || game.freeRoads || isSecondary(game)) return;
  const opts = RESOURCES.map(r => `<option value="${r}">${NAMES[r]}</option>`).join('');
  modal('trade', 'Un buen trato lo cambia todo.', 'Negocia con personas y rivales automáticos, o intercambia con el banco.', `
    <div class="tabs"><button class="tab active" data-trade-tab="bank">Banco y puertos</button><button class="tab" data-trade-tab="players">Entre jugadores</button></div>
    <form id="trade-form"><div class="trade-fields"><label class="field-label">ENTREGAS<select name="give">${opts}</select></label><span>${icon('trade', 25)}</span><label class="field-label">RECIBES<select name="receive">${opts}</select></label></div><div class="trade-ratio" id="trade-ratio"></div><p class="form-note">Los puertos se activan al construir en sus extremos. El banco tiene ${RESOURCES.map(r => `${game.bank[r]} ${NAMES[r].toLowerCase()}`).join(', ')}.</p><button class="primary-button full" type="submit">Realizar intercambio ${icon('trade', 18)}</button></form>
    <form id="offer-form" hidden><label class="field-label">COMERCIAR CON<select name="player">${game.players.map((p, i) => i !== game.current ? `<option value="${i}">${esc(p.name)}${p.bot ? ' · IA' : ''}</option>` : '').join('')}</select></label><div class="offer-head"><span>RECURSO</span><span>ENTREGAS</span><span>PIDES</span></div>${RESOURCES.map(r => `<div class="offer-row"><span>${resourceIcon(r, 17)} ${NAMES[r]}</span><input type="number" name="give-${r}" aria-label="Entregar ${NAMES[r]}" value="0" min="0" max="${game.players[game.current].hand[r]}"><input type="number" name="receive-${r}" aria-label="Pedir ${NAMES[r]}" value="0" min="0" max="${bankSize(game)}"></div>`).join('')}
    <p class="form-note">La IA valorará si el trato le ayuda a construir y te responderá. También puede proponerte intercambios durante su turno. Las cartas solo se entregan tras aceptar la oferta.</p><button class="primary-button full" type="submit">Proponer intercambio ${icon('arrow', 18)}</button></form>`);
  updateRatio();
}
function showPendingTrade() {
  const offer = game.pendingTrade!;
  const from = game.players[offer.from], recipient = game.players[offer.to], waiting = recipient.bot || !!network.session && network.view?.self === offer.from;
  const incoming = waiting ? offer.receive : offer.give, outgoing = waiting ? offer.give : offer.receive;
  const describe = (cards: Hand) => RESOURCES.filter(r => cards[r]).map(r => `<span class="trade-chip">${resourceIcon(r, 19)} <b>${cards[r]}</b> ${NAMES[r]}</span>`).join('');
  const affordable = RESOURCES.every(r => recipient.hand[r] >= offer.receive[r]);
  modal('offer-pending', waiting ? `${esc(recipient.name)} está valorando tu oferta.` : `${esc(recipient.name)}, ¿cerramos el trato?`, waiting ? recipient.bot ? 'El rival decide según sus recursos, sus posibilidades de construir y la situación de la partida.' : 'La oferta ha llegado a su dispositivo. La partida espera su respuesta.' : `${esc(from.name)} te propone este intercambio. ${from.bot || network.session ? 'La partida espera tu decisión.' : 'Pasa el dispositivo al destinatario.'}`, `
    <div class="offer-preview"><h3>Recibes</h3><div class="trade-chips">${describe(incoming)}</div><h3>Entregas</h3><div class="trade-chips">${describe(outgoing)}</div></div>
    ${!waiting ? `<section class="offer-hand" aria-label="Tus recursos disponibles"><h3>Tus recursos disponibles</h3><div class="trade-chips">${RESOURCES.map(r => `<span class="trade-chip">${resourceIcon(r, 19)} <b>${recipient.hand[r]}</b> ${NAMES[r]}</span>`).join('')}</div></section>` : ''}
    ${waiting ? `<p class="trade-waiting" role="status">${icon(recipient.bot ? 'bot' : 'person', 20)} Esperando respuesta…</p>` : `${!affordable ? '<p class="form-note">No tienes todos los recursos solicitados. Puedes rechazar esta oferta.</p>' : ''}<button class="primary-button full" data-act="accept-offer" ${affordable ? '' : 'disabled'}>Aceptar intercambio ${icon('trade', 18)}</button><button class="text-button full" data-act="reject-offer">Rechazar oferta</button>`}`, false, true);
}
function updateRatio() { const form = document.querySelector<HTMLFormElement>('#trade-form'); if (!form) return; const r = new FormData(form).get('give') as Resource; document.querySelector('#trade-ratio')!.innerHTML = `<b>${tradeRatio(game, r)} : 1</b><span>Entregas ${tradeRatio(game, r)} de ${NAMES[r].toLowerCase()} por 1 recurso a tu elección.</span>`; }
function showCards() {
  const i = humanViewIndex(), p = game.players[i], types = [...new Set(p.dev.map(d => d.type))];
  modal('cards', 'Una carta puede cambiarlo todo.', 'Las cartas nuevas esperan un turno. Los puntos de victoria permanecen secretos.', `<div class="development-list">${types.length ? types.map(type => {
    const ready = i === game.current && isHuman() && !p.played && !game.freeRoads && !isSecondary(game) && ['action', 'roll'].includes(game.phase) && p.dev.some(d => d.type === type && d.turn < game.turn) && type !== 'victory' && (type !== 'roads' || legalRoads(game, false).length > 0);
    const desc: Record<Dev, string> = { knight: 'Mueve el ladrón y roba un recurso. Suma a tu ejército.', roads: 'Construye hasta 2 carreteras sin gastar recursos.', plenty: 'Obtén 2 recursos del banco a tu elección.', monopoly: game.variant === 'expanded' ? 'Elige hasta 3 rivales: te entregan sus cartas del recurso elegido.' : 'Todos tus rivales te entregan sus cartas del recurso elegido.', victory: '+1 punto secreto. Se cuenta automáticamente para ganar.' };
    return `<div class="development-card"><div class="dev-art">${icon(type === 'knight' ? 'knight' : type === 'roads' ? 'road' : type === 'victory' ? 'trophy' : type === 'plenty' ? 'wheat' : 'trade', 34)}</div><div><h3>${DEV_NAMES[type]} <small>×${p.dev.filter(d => d.type === type).length}</small></h3><p>${desc[type]}</p><button class="outline-button small" data-dev="${type}" ${ready ? '' : 'disabled'}>${type === 'victory' ? 'Punto permanente' : ready ? 'Jugar carta' : 'No disponible este turno'}</button></div></div>`;
  }).join('') : `<div class="empty-state">${icon('dev', 48)}<h3>Tu próxima gran oportunidad.</h3><p>Compra cartas de desarrollo con 1 lana, 1 trigo y 1 mineral.</p><div class="cost">${costHtml(COSTS.dev)}</div></div>`}</div><p class="form-note">Quedan ${deckCount()} cartas en el mazo. Caballeros jugados: ${p.knights}.</p>`);
}
function playDev(card: Dev) {
  if (card === 'monopoly' || card === 'plenty') {
    const opts = RESOURCES.map(r => `<option value="${r}">${NAMES[r]} · Banco: ${game.bank[r]}</option>`).join('');
    modal('dev-choice', DEV_NAMES[card], card === 'plenty' ? 'Elige dos recursos disponibles en el banco.' : game.variant === 'expanded' ? 'Elige un recurso y entre 1 y 3 rivales. Sus manos siguen ocultas.' : 'Elige el recurso que todos tus rivales te entregarán.', `<form id="dev-form" data-card="${card}"><label class="field-label">RECURSO<select name="first">${opts}</select></label>${card === 'monopoly' && game.variant === 'expanded' ? `<fieldset class="monopoly-targets"><legend>RIVALES · MÁXIMO 3</legend>${game.players.map((p, i) => i === game.current ? '' : `<label><input type="checkbox" name="target" value="${i}"> ${i + 1}. ${esc(p.name)} · ${handCount(i)} cartas</label>`).join('')}</fieldset>` : ''}${card === 'plenty' ? `<label class="field-label">SEGUNDO RECURSO<select name="second">${opts}</select></label>` : ''}<button class="primary-button full" type="submit">Jugar carta ${icon('arrow', 18)}</button></form>`);
  } else { closeModal(); dispatch({ type: 'dev', card }); }
}
function showResults() { if (game.winner === null) return; const w = game.players[game.winner]; modal('results', `La isla es tuya, ${esc(w.name)}.`, `Una expedición inolvidable. Victoria con ${playerPoints(game.winner)} puntos en el turno ${game.turn}.`, `<div class="winner-art" style="color:${w.color}">${icon('trophy', 72)}</div><div class="results-list">${game.players.map((p, i) => ({ p, i })).sort((a, b) => playerPoints(b.i) - playerPoints(a.i)).map(({ p, i }) => `<div><span style="color:${p.color}">${icon('person', 20)} ${esc(p.name)}</span><b>${playerPoints(i)} PV</b></div>`).join('')}</div><button class="primary-button full" data-act="new">Otra isla, otra historia ${icon('arrow', 18)}</button>`); }
function audioSettings() {
  return `<section class="audio-settings" aria-label="Sonido y música"><h3>Sonido y música</h3>${(['effects', 'music'] as const).map(channel => {
    const enabled = audio.preferences[channel], volume = Math.round(audio.preferences[`${channel}Volume`] * 100);
    const label = channel === 'effects' ? 'Efectos de sonido' : 'Música ambiental';
    return `<button class="setting-row" data-act="${channel === 'effects' ? 'sound' : 'music'}" aria-pressed="${enabled}">${icon('sound', 23)}<span>${label}<small>${channel === 'effects' ? 'Dados, construcciones, intercambios y avisos' : 'Una melodía suave para acompañar la partida'}</small></span><b>${enabled ? 'Activado' : 'Activar'}</b></button><label class="audio-volume"><span>Volumen de ${channel === 'effects' ? 'efectos' : 'música'}</span><input type="range" min="0" max="100" step="1" value="${volume}" data-audio-volume="${channel}" aria-label="Volumen de ${channel === 'effects' ? 'efectos' : 'música'}"><output>${volume}%</output></label>`;
  }).join('')}<p class="form-note">El audio comienza al interactuar y se pausa al ocultar la pestaña. Tus preferencias se guardan en este navegador.</p></section>`;
}
function showSettings() {
  if (network.session) {
    modal('settings', 'Tu expedición está conectada.', 'La sala se guarda en el servidor. Este dispositivo conserva tu acceso para volver al recargar.', `${audioSettings()}<div class="settings-actions"><button class="setting-row" data-act="show-invite">${icon('person', 23)}<span>Invitar a la sala<small>Código ${network.session.code}</small></span></button><button class="setting-row" data-act="leave-room">${icon('arrow', 23)}<span>Volver al juego local<small>La sala seguirá disponible durante 48 horas desde su creación</small></span></button></div>`);
    return;
  }
  modal('settings', 'A tu manera.', 'La partida se guarda en este navegador después de cada acción.', `${audioSettings()}<div class="settings-actions"><button class="setting-row" data-act="export">${icon('save', 23)}<span>Exportar partida<small>Descarga una copia en formato JSON</small></span>${icon('arrow', 18)}</button><label class="setting-row import-label">${icon('dev', 23)}<span>Importar partida<small>Continúa una partida exportada</small></span><input type="file" id="import-game" accept="application/json,.json">${icon('arrow', 18)}</label></div><p class="form-note">Partida local. No requiere cuenta ni conexión una vez cargada. También puedes crear salas online desde la barra superior.</p>`);
}

const qrCache = new Map<string, string>();
function inviteURL() { return location.origin + location.pathname + '?room=' + network.view!.code; }
function fillQR(code: string) {
  const putImage = (url: string) => document.querySelectorAll<HTMLImageElement>('.room-qr').forEach(img => { if (img.dataset.room === code) img.src = url; });
  if (qrCache.has(code)) { putImage(qrCache.get(code)!); return; }
  void QRCode.toDataURL(inviteURL(), { width: 240, margin: 2, color: { dark: '#244e40', light: '#fffef8' } }).then(url => { qrCache.set(code, url); putImage(url); });
}
function roomStatus() {
  const view = network.view, bar = document.querySelector<HTMLElement>('#network-bar')!;
  document.body.classList.toggle('network-busy', network.busy); document.body.classList.toggle('room-disconnected', !!network.session && !network.connected);
  app.setAttribute('aria-busy', String(network.busy));
  if (!view) { bar.hidden = true; return; } bar.hidden = false;
  bar.innerHTML = `<div class="room-status"><i class="${network.connected ? 'live' : ''}"></i>${network.connected ? network.busy ? 'Sincronizando…' : 'Sala conectada' : 'Reconectando…'}</div><button class="room-code-pill" data-act="show-invite">${view.mode === 'party' ? 'PARTY' : 'ONLINE'} <b>${view.code}</b></button><span class="network-turn">${view.game ? ` ${isSecondary(view.game) ? 'Construye' : 'Turno de'} ${esc(view.game.players[view.game.current].name)}` : `${view.seats.length} de ${view.capacity} jugadores`}</span><div class="network-tools">${view.mode === 'party' && !view.screen ? `<button data-act="controller-view">${controllerFocus ? 'Ver tablero' : 'Solo mando'}</button>` : ''}${view.screen ? '<button data-act="fullscreen">Pantalla completa</button>' : ''}<button data-act="leave-room">Salir</button></div>`;
}
function showRooms() {
  modal('rooms', 'La isla se disfruta en compañía.', 'Elige cómo reuniros. Una sala, un código y vuestras propias cartas.', `<div class="room-mode-cards"><button data-act="create-online"><span class="room-mode-icon">${icon('person', 32)}</span><strong>Online</strong><p>Crea una sala y juega con amigos desde cualquier lugar.</p><span>Crear sala ${icon('arrow', 16)}</span></button><button data-act="create-party"><span class="room-mode-icon">${icon('island', 32)}</span><strong>Party · TV</strong><p>El tablero en la televisión. Cada móvil es un mando privado.</p><span>Preparar televisión ${icon('arrow', 16)}</span></button></div><button class="primary-button full" data-act="join-room">Tengo un código · Unirme a una sala ${icon('arrow', 18)}</button>`, true);
}
function showCreateRoom(mode: RoomMode) { modal('create-room', mode === 'party' ? 'La televisión es vuestra mesa.' : 'Prepara vuestra expedición.', mode === 'party' ? 'Abre esta pantalla en el televisor, o compártela por HDMI o duplicación de pantalla. Los jugadores entrarán desde sus móviles.' : 'Comparte el código con tus amigos. Cada uno verá el tablero y solo sus propias cartas.', `<form id="create-room-form" data-room-mode="${mode}"><label class="field-label">${mode === 'party' ? 'NOMBRE DEL ANFITRIÓN' : 'TU NOMBRE'}<input name="name" value="Explorador" maxlength="22" required></label>${rulesFields('capacity')}<p class="form-note">Se necesitan al menos dos personas. Las plazas libres se completan con IA al empezar. Las salas duran 48 horas.</p><button type="submit" class="primary-button full">Crear ${mode === 'party' ? 'sala Party' : 'sala online'} ${icon('arrow', 18)}</button></form>`); }
function showJoinRoom(code = '') { modal('join-room', 'Tu sitio en la isla te espera.', 'Introduce el código compartido por tu amigo o por la pantalla de televisión.', `<form id="join-room-form"><label class="field-label">CÓDIGO DE LA SALA<input class="room-code-input" name="code" value="${esc(code)}" maxlength="7" minlength="7" pattern="[A-Za-z2-9]{7}" autocomplete="off" autocapitalize="characters" required placeholder="ABC2345"></label><label class="field-label">TU NOMBRE<input name="name" maxlength="22" autocomplete="nickname" required placeholder="¿Cómo te llamas?"></label><button class="primary-button full" type="submit">Unirme a la sala ${icon('arrow', 18)}</button></form>`); }
async function openRoom(form: HTMLFormElement, fn: () => Promise<unknown>) {
  if (roomOpening) return; roomOpening = true; const button = form.querySelector<HTMLButtonElement>('button[type="submit"]'); if (button) button.disabled = true;
  try { await fn(); } catch (e) { toast((e as Error).message); } finally { roomOpening = false; if (button) button.disabled = false; }
}
function showLobby(view: RoomView) {
  const self = view.self === null ? null : view.seats[view.self], canStart = view.seats.length >= 2 && view.seats.every(s => s.ready);
  modal('lobby', view.mode === 'party' ? 'Todos al sofá. La isla os espera.' : 'Vuestra próxima aventura empieza aquí.', view.screen ? 'Escanead el QR con vuestros móviles. La televisión muestra el tablero; las cartas se quedan en cada dispositivo.' : 'Comparte el código. Cuando estéis todos, marcaos como listos para comenzar.', `
    <div class="lobby-grid"><div class="lobby-invite"><span class="eyebrow">CÓDIGO DE LA SALA</span><strong class="lobby-code" data-room-code="${view.code}">${view.code}</strong><img class="room-qr" data-room="${view.code}" alt="QR para unirse a la sala ${view.code}" width="210" height="210"><button class="outline-button small" data-act="copy-invite">Copiar invitación ${icon('arrow', 14)}</button><p>Sin instalar aplicaciones.<br>Abre la invitación en tu navegador.</p></div><div class="lobby-players"><div class="section-label">${view.variant === 'expanded' ? 'EXPEDICIÓN AMPLIADA' : 'VUESTRA EXPEDICIÓN'} <span>${view.seats.length} / ${view.capacity}</span></div>${Array.from({ length: view.capacity }, (_, i) => { const s = view.seats[i]; return `<div class="lobby-seat"><span style="color:${s?.color || '#a1ac94'}">${icon(s ? 'person' : 'bot', 23)}</span><div><strong>${s ? esc(s.name) : 'Plaza libre'}</strong><small>${s ? s.ready ? 'Listo para zarpar' : 'Preparándose…' : 'Se completará con IA si queda libre'}</small></div><i class="${s?.ready ? 'ready' : ''}">${s ? s.ready ? '✓' : '·' : '+'}</i></div>`; }).join('')}${self ? `<button class="${self.ready ? 'outline-button' : 'primary-button'} full" data-act="room-ready">${self.ready ? 'Ya estás listo · Cambiar' : 'Estoy listo'} ${icon('arrow', 17)}</button>` : ''}${view.isHost ? `<button class="primary-button full" data-act="room-start" ${canStart ? '' : 'disabled'}>Empezar partida ${icon('arrow', 18)}</button>` : '<p class="form-note">El anfitrión empezará cuando estéis listos.</p>'}<p class="form-note">Mínimo dos personas. Las plazas se cierran al comenzar. Puedes recargar este mismo navegador para recuperar tu sitio.</p></div></div><div class="lobby-footer">${view.screen ? '<button class="text-button" data-act="fullscreen">Pantalla completa</button>' : ''}<button class="text-button" data-act="leave-room">Volver al juego local</button></div>`, true, true);
  fillQR(view.code);
}
function showInvite() { if (!network.view) return; modal('invite', 'Un código. Una misma isla.', 'Comparte la invitación con tus amigos. Si la partida ya ha comenzado, solo pueden volver los participantes originales.', `<div class="lobby-invite"><strong class="lobby-code">${network.view.code}</strong><img class="room-qr" data-room="${network.view.code}" alt="QR de invitación" width="220" height="220"><button class="primary-button full" data-act="copy-invite">Copiar invitación ${icon('arrow', 16)}</button></div>`); fillQR(network.view.code); }
function leaveRoom() {
  network.leave(); receivedRoomCode = ''; receivedGameVersion = -1; passTo = null; selectedVictim = null; mode = 'inspect';
  document.body.classList.remove('network-room', 'tv-screen', 'controller-focus', 'network-busy', 'room-disconnected'); history.replaceState(null, '', location.pathname); roomStatus(); closeModal();
  try { const local = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); validateSave(local); game = local; } catch { game = newGame([{ name: 'Tú', bot: false }, { name: 'Olivia', bot: true }, { name: 'Nicolás', bot: true }]); }
  board?.create(game); render(); scheduleBot();
}
network.onStatus = roomStatus;
network.onError = message => { toast(message); void network.sync(); };
network.onUpdate = (view: RoomView) => {
  const different = receivedRoomCode !== view.code; document.body.classList.add('network-room'); document.body.classList.toggle('tv-screen', view.screen); document.body.classList.toggle('controller-focus', view.mode === 'party' && !view.screen && controllerFocus);
  window.clearTimeout(botTimer); passTo = null; roomStatus();
  if (different) {
    receivedRoomCode = view.code; receivedGameVersion = -1; selectedVictim = null; mode = 'inspect';
    // Reconnecting to a started room already supplies the real board below.
    if (!view.game) { game = newGame(Array.from({ length: view.capacity }, (_, i) => ({ name: view.seats[i]?.name || `Explorador ${i + 1}`, bot: false })), Math.random, view.variant || 'classic'); board?.create(game); render(); }
  }
  if (!view.game) { showLobby(view); return; }
  if (receivedGameVersion !== view.gameVersion) {
    const previous = game, first = receivedGameVersion < 0; game = view.game; receivedGameVersion = view.gameVersion; mode = 'inspect';
    if (previous.phase !== 'steal' || game.phase !== 'steal') selectedVictim = null;
    const keepDiscard = activeModal === 'discard' && view.self !== null && game.phase === 'discard' && game.discards[view.self] > 0;
    if (!keepDiscard && ['lobby', 'locations', 'trade', 'cards', 'dev-choice', 'offer-pending', 'discard', 'robbery'].includes(activeModal)) closeModal();
    if (first) { closeModal(); board?.create(game); }
    if (previous.pendingTrade && !game.pendingTrade && [previous.pendingTrade.from, previous.pendingTrade.to].includes(view.self!)) { const message = game.log.find(s => /acepta:|rechaza el intercambio/.test(s)); if (message) toast(message); }
    if (!first) gameSounds(previous, game, view.self).forEach(cue => audio.play(cue));
    render();
  } else if (view.screen) board?.update(game, view.preview, true, true);
};

app.addEventListener('click', e => {
  const button = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-build], [data-location], [data-victim], [data-steal-card], [data-dev], [data-trade-tab]');
  if (!button || button.hasAttribute('disabled')) return;
  audio.play();
  if (button.dataset.build) { const kind = button.dataset.build; if (kind === 'dev') dispatch({ type: 'buy' }); else { mode = kind as Mode; render(); if (network.session) void network.send({ op: 'preview', mode }); } return; }
  if (button.dataset.location) { const id = Number(button.dataset.location), kind = button.dataset.kind!; closeModal(); selectBoard(kind, id); return; }
  if (button.dataset.victim) { const id = Number(button.dataset.victim); if (game.phase === 'steal' && isHuman() && game.victims.includes(id)) { selectedVictim = id; showRobbery(); } return; }
  if (button.dataset.stealCard !== undefined) { if (selectedVictim !== null && isHuman()) dispatch({ type: 'steal', player: selectedVictim, card: Number(button.dataset.stealCard) }); return; }
  if (button.dataset.dev) { playDev(button.dataset.dev as Dev); return; }
  if (button.dataset.tradeTab) { const bank = button.dataset.tradeTab === 'bank'; document.querySelector<HTMLFormElement>('#trade-form')!.hidden = !bank; document.querySelector<HTMLFormElement>('#offer-form')!.hidden = bank; document.querySelectorAll('[data-trade-tab]').forEach(b => b.classList.toggle('active', b === button)); return; }
  switch (button.dataset.act) {
    case 'rooms': showRooms(); break;
    case 'create-online': showCreateRoom('online'); break;
    case 'create-party': showCreateRoom('party'); break;
    case 'join-room': showJoinRoom(); break;
    case 'room-ready': if (network.view?.self !== null && network.view) void network.send({ op: 'ready', ready: !network.view.seats[network.view.self!].ready }); break;
    case 'room-start': void network.send({ op: 'start' }); break;
    case 'show-invite': showInvite(); break;
    case 'leave-room': leaveRoom(); break;
    case 'copy-invite': if (network.view) { if (navigator.clipboard) void navigator.clipboard.writeText(inviteURL()).then(() => toast('Invitación copiada. Compártela con tus amigos.')).catch(() => toast(inviteURL())); else toast(inviteURL()); } break;
    case 'fullscreen': if (document.fullscreenElement) void document.exitFullscreen(); else if (document.documentElement.requestFullscreen) void document.documentElement.requestFullscreen().catch(() => toast('Usa el modo de pantalla completa de tu navegador.')); break;
    case 'controller-view': controllerFocus = !controllerFocus; document.body.classList.toggle('controller-focus', controllerFocus); roomStatus(); break;
    case 'help': showHelp(); break;
    case 'new': showNew(); break;
    case 'settings': showSettings(); break;
    case 'close-modal': if (network.session ? activeModal !== 'lobby' && activeModal !== 'robbery' && activeModal !== 'discard' && activeModal !== 'offer-pending' : passTo === null && game.phase !== 'discard' && game.phase !== 'steal' && !game.pendingTrade) closeModal(); break;
    case 'robbery': showRobbery(); break;
    case 'close-tile': document.querySelector<HTMLElement>('#tile-info')!.hidden = true; break;
    case 'cancel-build': mode = 'inspect'; render(); if (network.session) void network.send({ op: 'preview', mode }); break;
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
    case 'sound': audio.setEnabled('effects', !audio.preferences.effects); audio.play('turn'); showSettings(); break;
    case 'music': audio.setEnabled('music', !audio.preferences.music); showSettings(); break;
    case 'export': { const url = URL.createObjectURL(new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `isla-universal-turno-${game.turn}.json`; a.click(); URL.revokeObjectURL(url); toast('Partida exportada.'); break; }
    case 'accept-offer':
    case 'reject-offer': if (game.pendingTrade && !game.players[game.pendingTrade.to].bot && (!network.session || network.view?.self === game.pendingTrade.to)) dispatch({ type: 'respond', player: game.pendingTrade.to, accept: button.dataset.act === 'accept-offer' }); break;
  }
});
app.addEventListener('submit', e => {
  e.preventDefault(); const form = e.target as HTMLFormElement, data = new FormData(form);
  if (form.id === 'create-room-form') { void openRoom(form, () => network.create(form.dataset.roomMode as RoomMode, String(data.get('name')), Number(data.get('capacity')), data.get('variant') as Variant)); return; }
  if (form.id === 'join-room-form') { void openRoom(form, () => network.join(String(data.get('code')), String(data.get('name')))); return; }
  if (form.id === 'new-game-form') { const selected = data.get('mode'), n = Number(data.get('count')); if (selected === 'online' || selected === 'party') { void openRoom(form, () => network.create(selected, String(data.get('name')), n, data.get('variant') as Variant)); return; } if (network.session) leaveRoom(); const local = selected === 'local'; game = newGame(Array.from({ length: n }, (_, i) => ({ name: i === 0 ? String(data.get('name')) : local ? `Jugador ${i + 1}` : BOT_NAMES[i - 1], bot: i > 0 && !local })), Math.random, data.get('variant') as Variant); passTo = null; mode = 'inspect'; closeModal(); board?.create(game); save(); render(); scheduleBot(); }
  if (form.id === 'trade-form') { const prev = game; dispatch({ type: 'trade', give: data.get('give') as Resource, receive: data.get('receive') as Resource }); if (prev !== game) showTrade(); }
  if (form.id === 'discard-form') { const cards = emptyHand(); RESOURCES.forEach(r => cards[r] = Number(data.get(r))); if (network.session) { dispatch({ type: 'discard', player: Number(form.dataset.player), cards }); return; } const prev = game; closeModal(); dispatch({ type: 'discard', player: Number(form.dataset.player), cards }); if (prev === game) showDiscard(); }
  if (form.id === 'dev-form') { const resources = [data.get('first') as Resource]; if (data.get('second')) resources.push(data.get('second') as Resource); const prev = game; dispatch({ type: 'dev', card: form.dataset.card as Dev, resources, targets: form.dataset.card === 'monopoly' && game.variant === 'expanded' ? data.getAll('target').map(Number) : undefined }); if (prev !== game) closeModal(); }
  if (form.id === 'offer-form') {
    const give = emptyHand(), receive = emptyHand(); RESOURCES.forEach(r => { give[r] = Number(data.get(`give-${r}`)); receive[r] = Number(data.get(`receive-${r}`)); }); const cmd: Command = { type: 'offer', player: Number(data.get('player')), give, receive };
    dispatch(cmd);
  }
});
app.addEventListener('input', e => {
  const target = e.target as HTMLInputElement, channel = target.dataset.audioVolume;
  if (channel !== 'effects' && channel !== 'music') return;
  audio.setVolume(channel, Number(target.value) / 100);
  const output = target.parentElement?.querySelector('output'); if (output) output.value = `${target.value}%`;
});
app.addEventListener('change', async e => {
  const target = e.target as HTMLInputElement;
  if (target.name === 'variant' && target.form) updateRulesForm(target.form);
  if (target.closest('#trade-form')) updateRatio();
  if (target.id === 'import-game' && target.files?.[0]) {
    try { const file = target.files[0]; if (file.size > 1_000_000) throw new Error('Archivo demasiado grande.'); const next: Game = JSON.parse(await file.text()); validateSave(next); window.clearTimeout(botTimer); game = next; passTo = null; selectedVictim = null; mode = 'inspect'; closeModal(); board?.create(game); save(); render(); scheduleBot(); toast('Partida recuperada. ¡Bienvenido de nuevo!'); }
    catch { toast('El archivo no contiene una partida válida de Isla Universal.'); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && activeModal !== 'lobby' && passTo === null && game.phase !== 'discard' && game.phase !== 'steal' && !game.pendingTrade) { closeModal(); mode = 'inspect'; render(); }
  if (e.key === 'Tab' && activeModal) { const root = document.querySelector('.modal')!; const elements = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([hidden]), select, [tabindex="0"]')].filter(el => el.offsetParent !== null); const first = elements[0], last = elements.at(-1); if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
});
// A read-only diagnostic surface also enables real pointer-based browser tests.
Object.defineProperty(window, '__isla', { value: { get state() { return structuredClone(game); }, get room() { return network.view ? structuredClone(network.view) : null; }, project: (kind: string, id: number) => board?.project(kind, id) } });
render(); scheduleBot();
const requestedRoom = new URL(location.href).searchParams.get('room');
if (requestedRoom) { if (new URL(location.href).searchParams.get('screen') === 'tv') document.body.classList.add('tv-screen'); void network.restore(requestedRoom.toUpperCase(), new URL(location.href).searchParams.get('screen') === 'tv').then(restored => { if (!restored) showJoinRoom(requestedRoom); }).catch(e => { toast((e as Error).message); showJoinRoom(requestedRoom); }); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && network.session) void network.sync(); });
window.addEventListener('online', () => { if (network.session) void network.sync(); });
