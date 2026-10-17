import type { Command, Variant } from '../engine';
import type { RoomMode, RoomView } from './types';
export interface Session { code: string; token: string; screen: boolean }
export class RoomRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
export const roomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(7)), n => alphabet[n % alphabet.length]).join('');
const key = (code: string, screen: boolean) => `isla-room-${screen ? 'screen' : 'player'}-${code}`;
export class RoomClient {
  session: Session | null = null;
  view: RoomView | null = null;
  connected = false;
  busy = false;
  connection: 'connected' | 'reconnecting' | 'offline' | 'unavailable' = 'reconnecting';
  connectionMessage = '';
  retryAttempt = 0;
  lastSyncedAt = 0;
  onUpdate: (view: RoomView, previous: RoomView | null) => void = () => {};
  onStatus: () => void = () => {};
  onRecovered: () => void = () => {};
  onError: (message: string) => void = () => {};
  private timer = 0;
  private polling = false;
  private generation = 0;
  constructor() {
    window.addEventListener('offline', () => { if (this.session) this.connectionFailure('Sin conexión a internet.', this.session, this.generation); });
    window.addEventListener('online', () => { if (this.session) void this.sync(); });
  }
  get syncing() { return this.polling || this.busy; }
  private connectionFailure(message: string, session: Session | null, generation: number) {
    if (!session || generation !== this.generation || this.session?.token !== session.token || this.session.code !== session.code) return;
    this.connected = false; this.connection = navigator.onLine ? 'reconnecting' : 'offline'; this.connectionMessage = message; this.onStatus();
  }
  private unavailable(error: unknown) {
    if (!(error instanceof RoomRequestError) || ![401, 404, 410].includes(error.status)) return false;
    this.connected = false; this.connection = 'unavailable'; this.connectionMessage = error.message; this.retryAttempt = 0; this.onStatus(); return true;
  }
  private remember(session: Session) { localStorage.setItem(key(session.code, session.screen), JSON.stringify(session)); }
  private accept(view: RoomView) {
    const recovered = !this.connected && this.lastSyncedAt > 0;
    this.connected = true; this.connection = 'connected'; this.connectionMessage = ''; this.retryAttempt = 0; this.lastSyncedAt = Date.now();
    if (!this.view || view.version > this.view.version || view.code !== this.view.code) { const previous = this.view; this.view = view; this.onUpdate(view, previous); }
    this.onStatus();
    if (recovered) this.onRecovered();
  }
  private async request(input?: unknown, session = this.session): Promise<RoomView> {
    const generation = this.generation;
    const url = '/api/rooms' + (input ? '' : '?code=' + session!.code), body = input ? JSON.stringify(input) : undefined;
    // Retry the same command identifier/session: a lost response must not spend cards twice.
    for (let attempt = 0; ; attempt++) {
      if (generation !== this.generation) throw new DOMException('La sesión ha cambiado.', 'AbortError');
      let response: Response;
      const slow = window.setTimeout(() => this.connectionFailure('El servidor está tardando. Estamos comprobando tu sala.', session, generation), 3500);
      try { response = await fetch(url, { method: input ? 'POST' : 'GET', headers: { ...(session ? { Authorization: 'Bearer ' + session.token } : {}), ...(input ? { 'Content-Type': 'application/json' } : {}) }, body, cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
      catch (e) {
        if (generation === this.generation && this.session?.token === session?.token) this.retryAttempt = attempt + 1;
        this.connectionFailure('No se pudo contactar con la sala. Volveremos a intentarlo automáticamente.', session, generation);
        if (attempt >= 2) throw e; await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); continue;
      } finally { window.clearTimeout(slow); }
      if (generation !== this.generation) throw new DOMException('La sesión ha cambiado.', 'AbortError');
      if (response.status >= 500 || response.status === 429) {
        if (this.session?.token === session?.token) this.retryAttempt = attempt + 1;
        this.connectionFailure('El servidor no está disponible temporalmente. Reintentando…', session, generation);
        if (attempt < 2) { await response.body?.cancel(); await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); continue; }
      }
      const result = await response.json().catch(() => ({ error: 'No se pudo conectar con la sala. Inténtalo de nuevo.' }));
      if (generation !== this.generation) throw new DOMException('La sesión ha cambiado.', 'AbortError');
      if (!response.ok) throw new RoomRequestError(result.error || 'No se pudo conectar con la sala.', response.status); return result;
    }
  }
  private attach(session: Session, view: RoomView) {
    this.leave(); this.session = session; this.view = null; this.remember(session);
    const url = new URL(location.href); url.search = ''; url.searchParams.set('room', session.code); if (session.screen) url.searchParams.set('screen', 'tv'); history.replaceState(null, '', url);
    this.accept(view); this.schedule();
  }
  async create(mode: RoomMode, name: string, capacity: number, variant: Variant = 'classic') {
    const session = { code: roomCode(), token: secret(), screen: mode === 'party' }; this.remember(session);
    const view = await this.request({ op: 'create', ...session, mode, name, capacity, variant }, session); this.attach(session, view);
  }
  async join(code: string, name: string) {
    code = code.toUpperCase().replace(/\s/g, '');
    const saved = this.saved(code, false), session = saved || { code, token: secret(), screen: false }; this.remember(session);
    const view = await this.request({ op: 'join', code, token: session.token, name }, session); this.attach(session, view);
  }
  saved(code: string, screen: boolean): Session | null { try { const s = JSON.parse(localStorage.getItem(key(code, screen)) || 'null'); return s?.code === code && /^[a-f0-9]{64}$/.test(s.token) ? s : null; } catch { return null; } }
  async restore(code: string, screen: boolean): Promise<boolean> {
    const session = this.saved(code, screen); if (!session) return false;
    this.leave(); this.session = session; this.connection = navigator.onLine ? 'reconnecting' : 'offline'; this.onStatus();
    await this.sync(); return true;
  }
  private schedule() { window.clearTimeout(this.timer); if (!this.session || this.connection === 'unavailable') return; this.timer = window.setTimeout(() => { void this.sync(); }, document.hidden ? 5000 : 1400); }
  async sync() {
    if (!this.session || this.polling || this.busy) { this.schedule(); return; }
    this.polling = true; const generation = this.generation; if (!this.connected) this.onStatus();
    try { const view = await this.request(); if (generation === this.generation) this.accept(view); }
    catch (e) { if (generation === this.generation && !this.unavailable(e)) this.connectionFailure('No se pudo sincronizar la sala. Tu acceso se conserva; seguiremos reintentando.', this.session, generation); }
    finally { if (generation === this.generation) { this.polling = false; this.onStatus(); this.schedule(); } }
  }
  async send(input: Record<string, unknown>): Promise<boolean> {
    if (!this.session || !this.connected || this.busy) return false; this.busy = true; this.onStatus(); const generation = this.generation;
    try { const view = await this.request({ code: this.session.code, ...input }); if (generation !== this.generation) return false; this.accept(view); return true; }
    catch (e) { if (generation === this.generation && !this.unavailable(e)) this.onError((e as Error).name === 'TimeoutError' ? 'La conexión está tardando. Sincronizaremos la sala antes de volver a intentarlo.' : (e as Error).message); return false; }
    finally { if (generation === this.generation) { this.busy = false; this.onStatus(); this.schedule(); } }
  }
  async command(command: Command) { const id = secret(); return this.send({ op: 'command', command, gameVersion: this.view?.gameVersion, requestId: `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20,32)}` }); }
  leave() { this.generation++; window.clearTimeout(this.timer); this.session = null; this.view = null; this.connected = false; this.busy = false; this.polling = false; this.connection = 'reconnecting'; this.connectionMessage = ''; this.retryAttempt = 0; this.lastSyncedAt = 0; }
}
