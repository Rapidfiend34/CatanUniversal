import type { Game } from './engine';

type Channel = 'effects' | 'music';
export type Sound = 'click' | 'build' | 'dice' | 'trade' | 'card' | 'robber' | 'offer' | 'turn' | 'victory';
interface Preferences { effects: boolean; music: boolean; effectsVolume: number; musicVolume: number }
const KEY = 'isla-audio-v1';
const defaults: Preferences = { effects: false, music: false, effectsVolume: .5, musicVolume: .25 };
const melodies: Record<Sound, number[]> = {
  click: [720], build: [262, 330, 392], dice: [180, 260, 210, 340, 290, 440],
  trade: [392, 523, 659], card: [440, 659], robber: [220, 196, 147],
  offer: [523, 659, 523], turn: [392, 523], victory: [262, 330, 392, 523, 659, 784],
};

/** Original synthesized effects and a quiet pentatonic island soundtrack; no downloads. */
export class IslandAudio {
  readonly preferences: Preferences = { ...defaults };
  private context: AudioContext | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private timer = 0;
  private nextBeat = 0;
  private beat = 0;
  private unlocked = false;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      for (const channel of ['effects', 'music'] as const) {
        if (typeof saved?.[channel] === 'boolean') this.preferences[channel] = saved[channel];
        const volume = saved?.[`${channel}Volume`];
        if (typeof volume === 'number' && Number.isFinite(volume)) this.preferences[`${channel}Volume`] = Math.max(0, Math.min(1, volume));
      }
    } catch { /* Storage may be unavailable. */ }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { window.clearTimeout(this.timer); void this.context?.suspend().catch(() => {}); }
      else if (this.unlocked) this.activate();
    });
  }

  /** Call from a user gesture; loading saved preferences never starts playback. */
  activate() {
    this.unlocked = true;
    if (document.hidden || (!this.preferences.effects && !this.preferences.music)) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.effects = this.context.createGain(); this.effects.connect(this.context.destination);
        this.music = this.context.createGain(); this.music.connect(this.context.destination);
      }
      this.updateGains();
      void this.context.resume().then(() => { if (!document.hidden) this.scheduleMusic(); }).catch(() => {});
    } catch { /* The game remains usable without Web Audio. */ }
  }

  setEnabled(channel: Channel, enabled: boolean) {
    this.preferences[channel] = enabled; this.persist(); this.updateGains(); this.activate();
    if (!this.preferences.music) window.clearTimeout(this.timer);
  }

  setVolume(channel: Channel, volume: number) {
    if (!Number.isFinite(volume)) return;
    this.preferences[`${channel}Volume`] = Math.max(0, Math.min(1, volume)); this.persist(); this.updateGains();
  }

  private persist() { try { localStorage.setItem(KEY, JSON.stringify(this.preferences)); } catch { /* Optional storage. */ } }
  private updateGains() {
    if (!this.context) return;
    this.effects?.gain.setTargetAtTime(this.preferences.effects ? this.preferences.effectsVolume : 0, this.context.currentTime, .03);
    this.music?.gain.setTargetAtTime(this.preferences.music ? this.preferences.musicVolume : 0, this.context.currentTime, .15);
  }

  private note(frequency: number, at: number, duration: number, output: GainNode, volume: number, type: OscillatorType = 'sine') {
    const ctx = this.context!;
    const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + .015);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(output);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(at); oscillator.stop(at + duration + .02);
  }

  play(sound: Sound = 'click') {
    if (!this.preferences.effects || document.hidden || this.context?.state !== 'running' || !this.effects) return;
    const step = sound === 'dice' ? .045 : sound === 'click' ? .03 : .11;
    melodies[sound].forEach((frequency, i) => this.note(frequency, this.context!.currentTime + i * step, sound === 'click' ? .06 : .22, this.effects!, sound === 'click' ? .045 : .09, sound === 'dice' || sound === 'build' ? 'triangle' : 'sine'));
  }

  private scheduleMusic() {
    window.clearTimeout(this.timer);
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || document.hidden || !this.preferences.music) return;
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + .05;
    // A slow original 32-beat melody over four warm chords, scheduled ahead without drift.
    const melody = [0, 7, 12, 7, 4, 7, 9, 7, 2, 7, 14, 12, 9, 7, 4, 2, 0, 4, 7, 12, 9, 7, 4, 7, 2, 4, 9, 7, 4, 2, 0, 7];
    const chords = [[0, 4, 7], [-3, 0, 4], [-5, 0, 4], [-7, -3, 2]];
    while (this.nextBeat < ctx.currentTime + .3) {
      const step = this.beat % 32;
      this.note(261.63 * 2 ** (melody[step] / 12), this.nextBeat, 1.3, this.music!, .045);
      if (step % 8 === 0) for (const pitch of chords[Math.floor(step / 8)]) this.note(130.81 * 2 ** (pitch / 12), this.nextBeat, 5.2, this.music!, .025);
      this.nextBeat += .75; this.beat++;
    }
    this.timer = window.setTimeout(() => this.scheduleMusic(), 150);
  }
}

/** Compare committed states so online polling and local play share the same cues. */
export function gameSounds(previous: Game, next: Game, self: number | null): Sound[] {
  if (previous.phase !== 'finished' && next.phase === 'finished') return ['victory'];
  const sounds: Sound[] = [];
  if (next.pendingTrade && next.pendingTrade.to === self && JSON.stringify(next.pendingTrade) !== JSON.stringify(previous.pendingTrade)) sounds.push('offer');
  if (next.current === self && (previous.current !== next.current || previous.turn !== next.turn)) sounds.push('turn');
  if (next.dice && (previous.phase === 'roll' && next.phase !== 'roll' || JSON.stringify(previous.dice) !== JSON.stringify(next.dice))) sounds.push('dice');
  if (previous.robber !== next.robber || previous.phase !== 'steal' && next.phase === 'steal') sounds.push('robber');
  if (next.edges.some((edge, i) => edge.owner !== previous.edges[i]?.owner) || next.vertices.some((vertex, i) => vertex.owner !== previous.vertices[i]?.owner || vertex.city !== previous.vertices[i]?.city)) sounds.push('build');
  if (next.players.some((player, i) => player.dev.length !== previous.players[i]?.dev.length || player.knights !== previous.players[i]?.knights)) sounds.push('card');
  if (next.log[0] !== previous.log[0] && /intercambia|acepta:|comercia con el banco/.test(next.log[0] || '')) sounds.push('trade');
  return sounds;
}
