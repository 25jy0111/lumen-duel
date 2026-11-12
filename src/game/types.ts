export type PlayerId = 'human' | 'cpu';
export type CardKind = 'weapon' | 'extra' | 'armor' | 'miracle' | 'item';
export type CardEffect =
  | { type: 'attack'; power: number }
  | { type: 'defend'; power: number }
  | { type: 'restore'; resource: 'hp' | 'mp'; amount: number };
export interface CardDefinition {
  id: string;
  name: string;
  kind: CardKind;
  description: string;
  weight: number;
  mpCost: number;
  effect: CardEffect;
  symbol: string;
}
export interface CardInstance { uid: string; definitionId: string }
export interface PlayerState {
  id: PlayerId;
  name: string;
  hp: number;
  mp: number;
  gold: number;
  hand: CardInstance[];
}
export interface PendingAttack {
  attacker: PlayerId;
  defender: PlayerId;
  power: number;
  cardNames: string[];
}
export interface LogEntry { id: number; turn: number; text: string }
export interface GameState {
  players: Record<PlayerId, PlayerState>;
  activePlayer: PlayerId;
  phase: 'main' | 'defense' | 'finished';
  turn: number;
  pendingAttack: PendingAttack | null;
  winner: PlayerId | null;
  log: LogEntry[];
  rngState: number;
  nextCardId: number;
  nextLogId: number;
}
export type GameAction =
  | { type: 'attack'; cardIds: string[] }
  | { type: 'defend'; cardIds: string[] }
  | { type: 'use'; cardId: string }
  | { type: 'pray' }
  | { type: 'discard'; cardIds: string[] };
export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; error: string };
