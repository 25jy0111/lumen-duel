import { CARDS, getCard } from './cards';
import type {
  ActionResult, CardInstance, GameAction, GameState, PlayerId, PlayerState,
} from './types';

export const LIMITS = { hp: 40, mp: 10, gold: 20, hand: 18, initialHand: 9 } as const;
export const otherPlayer = (id: PlayerId): PlayerId => id === 'human' ? 'cpu' : 'human';

// Mulberry32: all random state is serialized in GameState, so transitions can be replayed.
function random(state: GameState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let value = state.rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function draw(state: GameState, player: PlayerState, count: number): number {
  const total = CARDS.reduce((sum, card) => sum + card.weight, 0);
  const actual = Math.min(count, LIMITS.hand - player.hand.length);
  for (let i = 0; i < actual; i++) {
    let roll = random(state) * total;
    const definition = CARDS.find(card => (roll -= card.weight) < 0) ?? CARDS[CARDS.length - 1];
    player.hand.push({ uid: `card-${state.nextCardId++}`, definitionId: definition.id });
  }
  return actual;
}

function log(state: GameState, text: string): void {
  state.log.push({ id: state.nextLogId++, turn: state.turn, text });
}

function consumeAndRefill(state: GameState, player: PlayerState, cards: CardInstance[]): void {
  const consumed = new Set(cards.map(card => card.uid));
  player.hand = player.hand.filter(card => !consumed.has(card.uid));
  const count = draw(state, player, consumed.size);
  if (count) log(state, `${player.name}は${count}枚補充した。`);
}

function endTurn(state: GameState): void {
  state.activePlayer = otherPlayer(state.activePlayer);
  state.phase = 'main';
  state.pendingAttack = null;
  state.turn++;
  log(state, `${state.players[state.activePlayer].name}のターン。`);
}

export function createGame(seed: number = Date.now()): GameState {
  const player = (id: PlayerId, name: string): PlayerState => ({
    id, name, hp: LIMITS.hp, mp: LIMITS.mp, gold: LIMITS.gold, hand: [],
  });
  const state: GameState = {
    players: { human: player('human', 'あなた'), cpu: player('cpu', 'CPU') },
    activePlayer: 'human', phase: 'main', turn: 1, pendingAttack: null, winner: null,
    log: [], rngState: seed >>> 0, nextCardId: 1, nextLogId: 1,
  };
  state.activePlayer = random(state) < 0.5 ? 'human' : 'cpu';
  draw(state, state.players.human, LIMITS.initialHand);
  draw(state, state.players.cpu, LIMITS.initialHand);
  log(state, `決闘開始。${state.players[state.activePlayer].name}が先攻。`);
  return state;
}

export function getActingPlayer(state: GameState): PlayerId {
  return state.phase === 'defense' && state.pendingAttack
    ? state.pendingAttack.defender : state.activePlayer;
}

export function hasPlayableAction(state: GameState, actor: PlayerId): boolean {
  const player = state.players[actor];
  return player.hand.some(instance => {
    const card = getCard(instance);
    if (card.mpCost > player.mp) return false;
    if (card.kind === 'weapon' || card.kind === 'miracle') return card.effect.type === 'attack';
    return card.kind === 'item' && card.effect.type === 'restore'
      && player[card.effect.resource] < LIMITS[card.effect.resource];
  });
}

function selectCards(player: PlayerState, ids: string[]): CardInstance[] | string {
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) return 'カードの指定が不正です。';
  if (new Set(ids).size !== ids.length) return '同じカードを複数回は使えません。';
  const cards: CardInstance[] = [];
  for (const id of ids) {
    const card = player.hand.find(instance => instance.uid === id);
    if (!card) return '自分の手札にないカードは使えません。';
    cards.push(card);
  }
  return cards;
}

/** All actions, including CPU actions, must pass this boundary. No state is mutated here. */
export function validateAction(state: GameState, actor: PlayerId, action: GameAction): string | null {
  if (state.phase === 'finished') return 'この試合は終了しています。';
  if (actor !== getActingPlayer(state)) return '今はあなたの操作する番ではありません。';
  if (!action || typeof action !== 'object') return '不正な行動です。';
  const player = state.players[actor];
  if (state.phase === 'defense') {
    if (action.type !== 'defend') return '攻撃を受けています。防具を選ぶか、そのまま受けてください。';
    const cards = selectCards(player, action.cardIds);
    if (typeof cards === 'string') return cards;
    return cards.every(instance => getCard(instance).kind === 'armor') ? null : '防御には防具だけを使えます。';
  }
  switch (action.type) {
    case 'attack': {
      const cards = selectCards(player, action.cardIds);
      if (typeof cards === 'string') return cards;
      if (cards.length === 0) return '攻撃カードを選んでください。';
      const definitions = cards.map(getCard);
      const isMiracle = definitions.length === 1 && definitions[0].kind === 'miracle';
      const isWeapon = definitions.filter(card => card.kind === 'weapon').length === 1
        && definitions.every(card => card.kind === 'weapon' || card.kind === 'extra');
      if (!isMiracle && !isWeapon) return '通常武器1枚と追加武器、または奇跡1枚を選んでください。';
      if (definitions.some(card => card.effect.type !== 'attack')) return '攻撃効果のないカードです。';
      if (definitions.reduce((cost, card) => cost + card.mpCost, 0) > player.mp) return 'MPが足りません。';
      return null;
    }
    case 'use': {
      const cards = selectCards(player, [action.cardId]);
      if (typeof cards === 'string') return cards;
      const card = getCard(cards[0]);
      if (card.kind !== 'item' || card.effect.type !== 'restore') return '回復する雑貨を1枚選んでください。';
      if (card.mpCost > player.mp) return 'MPが足りません。';
      if (player[card.effect.resource] >= LIMITS[card.effect.resource]) return 'すでに上限まで回復しています。';
      return null;
    }
    case 'pray':
      return hasPlayableAction(state, actor) ? '攻撃か回復ができる間は祈れません。' : null;
    case 'discard': {
      const cards = selectCards(player, action.cardIds);
      if (typeof cards === 'string') return cards;
      return cards.length > 0 ? null : '捨てるカードを選んでください。';
    }
    case 'defend': return '防御は攻撃を受けているときだけ行えます。';
    default: return '不正な行動です。';
  }
}

/** Pure state transition. Rejected actions preserve the exact input state and RNG. */
export function applyAction(state: GameState, actor: PlayerId, action: GameAction): ActionResult {
  const error = validateAction(state, actor, action);
  if (error) return { ok: false, state, error };
  const next: GameState = {
    ...state,
    players: {
      human: { ...state.players.human, hand: [...state.players.human.hand] },
      cpu: { ...state.players.cpu, hand: [...state.players.cpu.hand] },
    },
    log: [...state.log],
  };
  const player = next.players[actor];
  switch (action.type) {
    case 'attack': {
      const cards = player.hand.filter(card => action.cardIds.includes(card.uid));
      const definitions = cards.map(getCard);
      const power = definitions.reduce((sum, card) => sum + (card.effect.type === 'attack' ? card.effect.power : 0), 0);
      player.mp -= definitions.reduce((sum, card) => sum + card.mpCost, 0);
      log(next, `${player.name}は${definitions.map(card => card.name).join('＋')}で攻撃！ 攻撃力${power}。`);
      if (definitions[0].kind === 'miracle') {
        const count = draw(next, player, 1);
        log(next, `${player.name}はMPを${definitions[0].mpCost}消費。奇跡は残り、${count}枚引いた${count === 0 ? '（手札上限）' : ''}。`);
      } else consumeAndRefill(next, player, cards);
      next.pendingAttack = {
        attacker: actor, defender: otherPlayer(actor), power,
        cardNames: definitions.map(card => card.name),
      };
      next.phase = 'defense';
      break;
    }
    case 'defend': {
      const attack = next.pendingAttack!;
      const cards = player.hand.filter(card => action.cardIds.includes(card.uid));
      const defense = cards.reduce((sum, instance) => {
        const effect = getCard(instance).effect;
        return sum + (effect.type === 'defend' ? effect.power : 0);
      }, 0);
      const damage = Math.max(0, attack.power - defense);
      player.hp = Math.max(0, player.hp - damage);
      log(next, `${player.name}は${cards.length ? cards.map(card => getCard(card).name).join('＋') : '防具なし'}で防御。攻撃${attack.power} − 防御${defense} → ${damage}ダメージ（HP ${player.hp}）。`);
      consumeAndRefill(next, player, cards);
      if (player.hp === 0) {
        next.phase = 'finished';
        next.winner = attack.attacker;
        next.pendingAttack = null;
        log(next, `${next.players[attack.attacker].name}の勝利！`);
      } else endTurn(next);
      break;
    }
    case 'use': {
      const instance = player.hand.find(card => card.uid === action.cardId)!;
      const card = getCard(instance);
      if (card.effect.type === 'restore') {
        const { resource, amount } = card.effect;
        const before = player[resource];
        player.mp -= card.mpCost;
        player[resource] = Math.min(LIMITS[resource], player[resource] + amount);
        log(next, `${player.name}は${card.name}を使用。${resource.toUpperCase()}が${player[resource] - before}回復した。`);
      }
      consumeAndRefill(next, player, [instance]);
      endTurn(next);
      break;
    }
    case 'pray': {
      const count = draw(next, player, 1);
      log(next, `${player.name}は祈った。${count ? 'カードを1枚引いた。' : '手札上限のため補充せずターン終了。不要な札は自分のターンに捨てられます。'}`);
      endTurn(next);
      break;
    }
    case 'discard': {
      const ids = new Set(action.cardIds);
      player.hand = player.hand.filter(card => !ids.has(card.uid));
      log(next, `${player.name}は${ids.size}枚捨てた。補充はない。`);
      endTurn(next);
      break;
    }
  }
  return { ok: true, state: next };
}
