import { describe, expect, it } from 'vitest';
import { getCard } from '../game/cards';
import { chooseCpuAction } from '../game/cpu';
import { applyAction, createGame, getActingPlayer, LIMITS, validateAction } from '../game/engine';
import type { GameState, PlayerId } from '../game/types';

function fixture(cards: string[], hp = 40): GameState {
  const state = createGame(12345);
  state.activePlayer = 'cpu';
  state.phase = 'main';
  state.pendingAttack = null;
  state.winner = null;
  state.players.cpu.hp = hp;
  state.players.cpu.hand = cards.map((definitionId, index) => ({ uid: `cpu-fixture-${index}`, definitionId }));
  return state;
}

function expectLegalCpuAction(state: GameState, actor: PlayerId = 'cpu') {
  const action = chooseCpuAction(state, actor);
  expect(validateAction(state, actor, action)).toBeNull();
  expect(applyAction(state, actor, action).ok).toBe(true);
  return action;
}

describe('CPU decisions', () => {
  it('attacks with available normal and additional weapons', () => {
    const state = fixture(['spark-blade', 'comet-shard']);
    const action = expectLegalCpuAction(state);
    expect(action.type).toBe('attack');
    if (action.type === 'attack') expect(action.cardIds).toContain('cpu-fixture-0');
  });

  it('considers healing at low HP', () => {
    const state = fixture(['spark-blade', 'dew-flask'], 10);
    const action = expectLegalCpuAction(state);
    expect(action).toEqual({ type: 'use', cardId: 'cpu-fixture-1' });
  });

  it('does not waste healing when HP is full', () => {
    const state = fixture(['spark-blade', 'dew-flask']);
    expect(expectLegalCpuAction(state).type).toBe('attack');
  });

  it('uses a miracle when that is its available attack', () => {
    const state = fixture(['starfall']);
    expect(expectLegalCpuAction(state)).toEqual({ type: 'attack', cardIds: ['cpu-fixture-0'] });
  });

  it('does not use an unaffordable miracle', () => {
    const state = fixture(['starfall']);
    state.players.cpu.mp = 0;
    expect(expectLegalCpuAction(state).type).not.toBe('attack');
  });

  it('can restore MP to unlock future miracles', () => {
    const state = fixture(['starfall', 'ether-drop']);
    state.players.cpu.mp = 0;
    expect(expectLegalCpuAction(state)).toEqual({ type: 'use', cardId: 'cpu-fixture-1' });
  });

  it('prays when it has no cards', () => {
    expect(expectLegalCpuAction(fixture([]))).toEqual({ type: 'pray' });
  });

  it('has a legal fallback for a full hand of unusable cards', () => {
    expectLegalCpuAction(fixture(Array<string>(18).fill('comet-shard')));
  });

  it('selects armor when attacked', () => {
    const state = fixture(['reed-guard', 'orbit-shield', 'spark-blade']);
    state.activePlayer = 'human';
    state.phase = 'defense';
    state.pendingAttack = { attacker: 'human', defender: 'cpu', power: 10, cardNames: ['test attack'] };
    const action = expectLegalCpuAction(state);
    expect(action.type).toBe('defend');
    if (action.type === 'defend') {
      expect(action.cardIds.length).toBeGreaterThan(0);
      expect(action.cardIds.every(uid => {
        const card = state.players.cpu.hand.find(instance => instance.uid === uid);
        return card && getCard(card).kind === 'armor';
      })).toBe(true);
    }
  });

  it('accepts damage when there is no armor', () => {
    const state = fixture(['spark-blade']);
    state.activePlayer = 'human';
    state.phase = 'defense';
    state.pendingAttack = { attacker: 'human', defender: 'cpu', power: 10, cardNames: ['test attack'] };
    expect(expectLegalCpuAction(state)).toEqual({ type: 'defend', cardIds: [] });
  });

  it('runs the same decision policy for the human side in simulations', () => {
    const state = createGame(55);
    state.activePlayer = 'human';
    expectLegalCpuAction(state, 'human');
  });
});

describe('complete seeded games', () => {
  it('completes 120 matches without illegal actions or stalled phases', () => {
    const winners = new Set<PlayerId>();
    for (let seed = 1; seed <= 120; seed += 1) {
      let state = createGame(seed);
      let steps = 0;
      while (state.phase !== 'finished' && steps < 1000) {
        const actor = getActingPlayer(state);
        const action = chooseCpuAction(state, actor);
        const result = applyAction(state, actor, action);
        if (!result.ok) throw new Error(`seed=${seed}, step=${steps}: ${result.error}; action=${JSON.stringify(action)}`);
        state = result.state;
        for (const player of Object.values(state.players)) {
          expect(player.hp).toBeGreaterThanOrEqual(0);
          expect(player.hp).toBeLessThanOrEqual(LIMITS.hp);
          expect(player.mp).toBeGreaterThanOrEqual(0);
          expect(player.mp).toBeLessThanOrEqual(LIMITS.mp);
          expect(player.gold).toBe(20);
          expect(player.hand.length).toBeLessThanOrEqual(LIMITS.hand);
          expect(new Set(player.hand.map(card => card.uid)).size).toBe(player.hand.length);
        }
        if (state.phase === 'defense') {
          expect(state.pendingAttack).not.toBeNull();
          expect(getActingPlayer(state)).toBe(state.pendingAttack?.defender);
        }
        steps += 1;
      }
      expect(state.phase, `seed=${seed} failed to finish in ${steps} actions`).toBe('finished');
      expect(state.winner).not.toBeNull();
      if (state.winner) {
        winners.add(state.winner);
        const loser = state.winner === 'human' ? 'cpu' : 'human';
        expect(state.players[loser].hp).toBe(0);
        expect(state.players[state.winner].hp).toBeGreaterThan(0);
      }
    }
    expect(winners).toEqual(new Set(['human', 'cpu']));
  }, 30_000);
});
