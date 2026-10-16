import type { Game, Variant } from '../engine.js';
export type RoomMode = 'online' | 'party';
export interface RoomView {
  code: string; mode: RoomMode; variant?: Variant; capacity: number; version: number; gameVersion: number;
  expiresAt: number; isHost: boolean; self: number | null; screen: boolean;
  seats: { name: string; ready: boolean; color: string }[];
  game: Game | null; cardCounts: number[]; devCounts: number[]; deckCount: number; scores: number[];
  preview: 'inspect' | 'road' | 'settlement' | 'city';
}
