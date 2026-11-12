import { describe, expect, it } from 'vitest';
import { CARDS } from '../game/cards';
import { applyAction, createGame, getActingPlayer, hasPlayableAction, LIMITS, validateAction } from '../game/engine';
import type { CardInstance, GameAction, GameState, PlayerId } from '../game/types';

function hand(definitionIds: string[], owner = 'human'): CardInstance[] {
  return definitionIds.map((definitionId, index) => ({ uid: `fixture-${owner}-${index}`, definitionId }));
}

function fixture(human: string[] = [], cpu: string[] = []): GameState {
  const state = createGame(12345);
  state.players.human.hand = hand(human);
  state.players.cpu.hand = hand(cpu, 'cpu');
  state.activePlayer = 'human';
  state.phase = 'main';
  state.turn = 1;
  state.pendingAttack = null;
  state.winner = null;
  return state;
}

function act(state: GameState, actor: PlayerId, action: GameAction): GameState {
  const result = applyAction(state, actor, action);
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

const ids = (state: GameState, actor: PlayerId) => state.players[actor].hand.map(card => card.uid);

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
}

describe('initial state and reproducible card draws', () => {
  it('starts two players with the requested stats and nine cards', () => {
    const state = createGame(1);
    expect(state.phase).toBe('main');
    expect(state.turn).toBe(1);
    expect(state.winner).toBeNull();
    expect(state.pendingAttack).toBeNull();
    expect(['human', 'cpu']).toContain(state.activePlayer);
    for (const player of Object.values(state.players)) {
      expect(player.hp).toBe(40);
      expect(player.mp).toBe(10);
      expect(player.gold).toBe(20);
      expect(player.hand).toHaveLength(9);
    }
    const cards = [...state.players.human.hand, ...state.players.cpu.hand];
    expect(new Set(cards.map(card => card.uid)).size).toBe(18);
    expect(cards.every(card => CARDS.some(definition => definition.id === card.definitionId))).toBe(true);
  });

  it('uses card data with all five categories and positive draw weights', () => {
    expect(CARDS).toHaveLength(8);
    expect(new Set(CARDS.map(card => card.id)).size).toBe(CARDS.length);
    expect(new Set(CARDS.map(card => card.kind))).toEqual(new Set(['weapon', 'extra', 'armor', 'miracle', 'item']));
    expect(CARDS.every(card => Number.isFinite(card.weight) && card.weight > 0)).toBe(true);
  });

  it('replays the same initial state from the same random seed', () => {
    expect(createGame(8675309)).toEqual(createGame(8675309));
    expect(createGame(42)).not.toEqual(createGame(43));
  });

  it('can give either player the first turn across seeded games', () => {
    const starters = new Set(Array.from({ length: 100 }, (_, seed) => createGame(seed).activePlayer));
    expect(starters).toEqual(new Set(['human', 'cpu']));
  });

  it('produces identical replacement cards after the same seeded actions', () => {
    const first = fixture(['spark-blade', 'comet-shard']);
    const second = fixture(['spark-blade', 'comet-shard']);
    const action: GameAction = { type: 'attack', cardIds: ids(first, 'human') };
    expect(act(first, 'human', action)).toEqual(act(second, 'human', action));
  });
});

describe('combat and turn progression', () => {
  it('combines a weapon and multiple extra weapons and waits for defense', () => {
    const state = fixture(['spark-blade', 'comet-shard', 'comet-shard']);
    const next = act(state, 'human', { type: 'attack', cardIds: ids(state, 'human') });
    expect(next.pendingAttack?.power).toBe(12);
    expect(next.pendingAttack?.attacker).toBe('human');
    expect(next.pendingAttack?.defender).toBe('cpu');
    expect(next.phase).toBe('defense');
    expect(next.turn).toBe(1);
    expect(getActingPlayer(next)).toBe('cpu');
    expect(next.players.cpu.hp).toBe(40);
    expect(next.players.human.hand).toHaveLength(3);
    expect(next.players.human.hand.every(card => !ids(state, 'human').includes(card.uid))).toBe(true);
  });

  it('adds multiple armor cards and subtracts total defense from attack', () => {
    let state = fixture(['dusk-axe', 'comet-shard'], ['reed-guard', 'orbit-shield']);
    state = act(state, 'human', { type: 'attack', cardIds: ids(state, 'human') });
    const beforeDefense = [...state.players.cpu.hand];
    const next = act(state, 'cpu', { type: 'defend', cardIds: ids(state, 'cpu') });
    expect(next.players.cpu.hp).toBe(39); // 9 + 3 - 4 - 7
    expect(next.players.cpu.hand).toHaveLength(2);
    expect(next.players.cpu.hand.every(card => !beforeDefense.some(old => old.uid === card.uid))).toBe(true);
    expect(next.phase).toBe('main');
    expect(next.activePlayer).toBe('cpu');
    expect(next.turn).toBe(2);
    expect(next.pendingAttack).toBeNull();
  });

  it('never heals the defender when defense exceeds attack', () => {
    let state = fixture(['spark-blade'], ['orbit-shield']);
    state.players.cpu.hp = 24;
    state = act(state, 'human', { type: 'attack', cardIds: ids(state, 'human') });
    state = act(state, 'cpu', { type: 'defend', cardIds: ids(state, 'cpu') });
    expect(state.players.cpu.hp).toBe(24);
  });

  it('allows the defender to take the hit without selecting armor', () => {
    let state = fixture(['dusk-axe'], ['reed-guard']);
    state = act(state, 'human', { type: 'attack', cardIds: ids(state, 'human') });
    const retained = [...state.players.cpu.hand];
    state = act(state, 'cpu', { type: 'defend', cardIds: [] });
    expect(state.players.cpu.hp).toBe(31);
    expect(state.players.cpu.hand).toEqual(retained);
    expect(state.activePlayer).toBe('cpu');
  });

  it('consumes MP, retains a miracle, and draws one extra card', () => {
    const initial = fixture(['starfall']);
    const miracle = initial.players.human.hand[0];
    const next = act(initial, 'human', { type: 'attack', cardIds: [miracle.uid] });
    expect(next.players.human.mp).toBe(7);
    expect(next.players.human.hand).toHaveLength(2);
    expect(next.players.human.hand).toContainEqual(miracle);
    expect(next.pendingAttack?.power).toBe(8);
    expect(next.players.human.gold).toBe(20);
  });

  it('can reuse the same miracle on a later turn while paying MP again', () => {
    let state = fixture(['starfall'], []);
    const miracleId = state.players.human.hand[0].uid;
    state = act(state, 'human', { type: 'attack', cardIds: [miracleId] });
    state = act(state, 'cpu', { type: 'defend', cardIds: [] });
    state = act(state, 'cpu', { type: 'pray' });
    state = act(state, 'human', { type: 'attack', cardIds: [miracleId] });
    expect(state.players.human.mp).toBe(4);
    expect(state.players.human.hand).toHaveLength(3);
    expect(state.players.human.hand.some(card => card.uid === miracleId)).toBe(true);
  });

  it('does not exceed 18 cards when a miracle is used at the hand cap', () => {
    const state = fixture(['starfall', ...Array<string>(17).fill('reed-guard')]);
    const next = act(state, 'human', { type: 'attack', cardIds: [state.players.human.hand[0].uid] });
    expect(next.players.human.hand).toHaveLength(LIMITS.hand);
    expect(next.players.human.hand).toEqual(state.players.human.hand);
    expect(next.players.human.mp).toBe(7);
  });

  it('clamps lethal damage to zero HP and declares the attacker the winner', () => {
    let state = fixture(['dusk-axe'], []);
    state.players.cpu.hp = 3;
    state = act(state, 'human', { type: 'attack', cardIds: ids(state, 'human') });
    state = act(state, 'cpu', { type: 'defend', cardIds: [] });
    expect(state.players.cpu.hp).toBe(0);
    expect(state.winner).toBe('human');
    expect(state.phase).toBe('finished');
    expect(state.pendingAttack).toBeNull();
    expect(state.log.some(entry => entry.text.includes(state.players.human.name))).toBe(true);
    const rejected = applyAction(state, 'human', { type: 'pray' });
    expect(rejected.ok).toBe(false);
    expect(rejected.state).toEqual(state);
  });

  it('can declare CPU victory using the same engine path', () => {
    let state = fixture([], ['dusk-axe']);
    state.activePlayer = 'cpu';
    state.players.human.hp = 9;
    state = act(state, 'cpu', { type: 'attack', cardIds: ids(state, 'cpu') });
    state = act(state, 'human', { type: 'defend', cardIds: [] });
    expect(state.winner).toBe('cpu');
    expect(state.players.human.hp).toBe(0);
  });
});

describe('restoration, prayer, and discard', () => {
  it.each([
    { card: 'dew-flask', resource: 'hp' as const, before: 35, after: 40 },
    { card: 'ether-drop', resource: 'mp' as const, before: 9, after: 10 },
    { card: 'dew-flask', resource: 'hp' as const, before: 12, after: 22 },
    { card: 'ether-drop', resource: 'mp' as const, before: 2, after: 6 },
  ])('restores $resource with $card and caps the resource', ({ card, resource, before, after }) => {
    const state = fixture([card]);
    state.players.human[resource] = before;
    const oldUid = state.players.human.hand[0].uid;
    const next = act(state, 'human', { type: 'use', cardId: oldUid });
    expect(next.players.human[resource]).toBe(after);
    expect(next.players.human.hand).toHaveLength(1);
    expect(next.players.human.hand[0].uid).not.toBe(oldUid);
    expect(next.activePlayer).toBe('cpu');
    expect(next.turn).toBe(2);
  });

  it('draws one card by prayer only when there is no playable action', () => {
    const state = fixture(['comet-shard', 'reed-guard', 'dew-flask', 'starfall']);
    state.players.human.mp = 0;
    expect(hasPlayableAction(state, 'human')).toBe(false);
    const next = act(state, 'human', { type: 'pray' });
    expect(next.players.human.hand).toHaveLength(5);
    expect(next.players.human.hand.slice(0, 4)).toEqual(state.players.human.hand);
    expect(next.activePlayer).toBe('cpu');
    expect(next.turn).toBe(2);
  });

  it('treats a usable recovery item as an action that prevents prayer', () => {
    const state = fixture(['dew-flask']);
    state.players.human.hp = 30;
    expect(hasPlayableAction(state, 'human')).toBe(true);
    expect(applyAction(state, 'human', { type: 'pray' }).ok).toBe(false);
  });

  it('passes without exchanging anything when praying with 18 unusable cards', () => {
    const state = fixture(Array<string>(18).fill('reed-guard'));
    const next = act(state, 'human', { type: 'pray' });
    expect(next.players.human.hand).toEqual(state.players.human.hand);
    expect(next.activePlayer).toBe('cpu');
    expect(next.turn).toBe(2);
  });

  it('discards selected cards without replacements and ends the turn', () => {
    const state = fixture(['spark-blade', 'reed-guard', 'starfall']);
    const next = act(state, 'human', { type: 'discard', cardIds: [state.players.human.hand[0].uid, state.players.human.hand[2].uid] });
    expect(next.players.human.hand).toEqual([state.players.human.hand[1]]);
    expect(next.rngState).toBe(state.rngState);
    expect(next.activePlayer).toBe('cpu');
    expect(next.turn).toBe(2);
  });

  it('can recover from an empty hand through prayer', () => {
    const state = fixture();
    expect(hasPlayableAction(state, 'human')).toBe(false);
    const next = act(state, 'human', { type: 'pray' });
    expect(next.players.human.hand).toHaveLength(1);
    expect(next.phase).toBe('main');
    expect(next.activePlayer).toBe('cpu');
  });
});

describe('illegal actions and immutable transitions', () => {
  it.each([
    { label: 'no attacking card', cards: [], action: { type: 'attack', cardIds: [] } },
    { label: 'extra weapon alone', cards: ['comet-shard'], action: { type: 'attack', cardIds: ['fixture-human-0'] } },
    { label: 'two normal weapons', cards: ['spark-blade', 'dusk-axe'], action: { type: 'attack', cardIds: ['fixture-human-0', 'fixture-human-1'] } },
    { label: 'normal weapon plus armor', cards: ['spark-blade', 'reed-guard'], action: { type: 'attack', cardIds: ['fixture-human-0', 'fixture-human-1'] } },
    { label: 'miracle plus extra weapon', cards: ['starfall', 'comet-shard'], action: { type: 'attack', cardIds: ['fixture-human-0', 'fixture-human-1'] } },
    { label: 'two miracles', cards: ['starfall', 'starfall'], action: { type: 'attack', cardIds: ['fixture-human-0', 'fixture-human-1'] } },
    { label: 'duplicate selection', cards: ['spark-blade'], action: { type: 'attack', cardIds: ['fixture-human-0', 'fixture-human-0'] } },
    { label: 'unknown card', cards: ['spark-blade'], action: { type: 'attack', cardIds: ['missing'] } },
    { label: 'weapon as recovery', cards: ['spark-blade'], action: { type: 'use', cardId: 'fixture-human-0' } },
    { label: 'HP recovery at full HP', cards: ['dew-flask'], action: { type: 'use', cardId: 'fixture-human-0' } },
    { label: 'MP recovery at full MP', cards: ['ether-drop'], action: { type: 'use', cardId: 'fixture-human-0' } },
    { label: 'praying with an attack available', cards: ['spark-blade'], action: { type: 'pray' } },
    { label: 'empty discard', cards: ['spark-blade'], action: { type: 'discard', cardIds: [] } },
    { label: 'defending in main phase', cards: ['reed-guard'], action: { type: 'defend', cardIds: ['fixture-human-0'] } },
  ] satisfies { label: string; cards: string[]; action: GameAction }[])('rejects $label without modifying state', ({ cards, action }) => {
    const state = fixture(cards);
    const snapshot = structuredClone(state);
    const result = applyAction(state, 'human', action);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    expect(validateAction(state, 'human', action)).not.toBeNull();
    expect(result.state).toEqual(snapshot);
    expect(state).toEqual(snapshot);
  });

  it('rejects a miracle when MP is insufficient', () => {
    const state = fixture(['starfall']);
    state.players.human.mp = 2;
    const result = applyAction(state, 'human', { type: 'attack', cardIds: ids(state, 'human') });
    expect(result.ok).toBe(false);
    expect(state.players.human.mp).toBe(2);
    expect(result.state.players.human.hand).toHaveLength(1);
  });

  it('rejects acting for the other player or selecting the other hand', () => {
    const state = fixture(['spark-blade'], ['dusk-axe']);
    expect(applyAction(state, 'cpu', { type: 'attack', cardIds: ids(state, 'cpu') }).ok).toBe(false);
    expect(applyAction(state, 'human', { type: 'attack', cardIds: ids(state, 'cpu') }).ok).toBe(false);
  });

  it('rejects all main actions while a defense response is pending', () => {
    let state = fixture(['spark-blade'], ['dusk-axe', 'dew-flask']);
    state.players.cpu.hp = 20;
    state = act(state, 'human', { type: 'attack', cardIds: ids(state, 'human') });
    const actions: GameAction[] = [
      { type: 'attack', cardIds: [state.players.cpu.hand[0].uid] },
      { type: 'use', cardId: state.players.cpu.hand[1].uid },
      { type: 'pray' },
      { type: 'discard', cardIds: ids(state, 'cpu') },
    ];
    for (const action of actions) expect(applyAction(state, 'cpu', action).ok).toBe(false);
    expect(applyAction(state, 'human', { type: 'defend', cardIds: [] }).ok).toBe(false);
    expect(applyAction(state, 'cpu', { type: 'defend', cardIds: [state.players.cpu.hand[0].uid] }).ok).toBe(false);
  });

  it('does not mutate the caller state on a successful action', () => {
    const state = fixture(['spark-blade', 'comet-shard']);
    const snapshot = structuredClone(state);
    deepFreeze(state);
    const next = act(state, 'human', { type: 'attack', cardIds: ids(state, 'human') });
    expect(state).toEqual(snapshot);
    expect(next).not.toBe(state);
    expect(next.players).not.toBe(state.players);
    expect(next.log.length).toBeGreaterThan(state.log.length);
  });
});
