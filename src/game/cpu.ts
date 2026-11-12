import { getCard } from './cards';
import { getActingPlayer, hasPlayableAction, LIMITS } from './engine';
import type { CardInstance, GameAction, GameState, PlayerId } from './types';

const attackPower = (instance: CardInstance): number => {
  const effect = getCard(instance).effect;
  return effect.type === 'attack' ? effect.power : 0;
};

/** A deterministic policy; legality and all mutations belong to the shared engine. */
export function chooseCpuAction(state: GameState, actor: PlayerId = 'cpu'): GameAction {
  if (state.phase === 'finished' || getActingPlayer(state) !== actor) {
    throw new Error('CPUの行動を選べる局面ではありません。');
  }
  const player = state.players[actor];
  if (state.phase === 'defense') {
    const armors = player.hand.filter(card => getCard(card).kind === 'armor');
    // Small subset-sum search: minimize over-defense, then consumed card count.
    // Powers are small, so the map stays small even at the 18-card hand limit.
    const subsets = new Map<number, string[]>([[0, []]]);
    for (const armor of armors) {
      const effect = getCard(armor).effect;
      if (effect.type !== 'defend') continue;
      for (const [power, ids] of [...subsets]) {
        const sum = power + effect.power;
        const candidate = [...ids, armor.uid];
        if (!subsets.has(sum) || candidate.length < subsets.get(sum)!.length) subsets.set(sum, candidate);
      }
    }
    const incoming = state.pendingAttack!.power;
    const sufficient = [...subsets.keys()].filter(power => power >= incoming);
    const best = sufficient.length ? Math.min(...sufficient) : Math.max(...subsets.keys());
    return { type: 'defend', cardIds: subsets.get(best)! };
  }

  const items = player.hand.filter(instance => {
    const card = getCard(instance);
    return card.kind === 'item' && card.mpCost <= player.mp;
  });
  const hpItem = items.find(instance => {
    const effect = getCard(instance).effect;
    return effect.type === 'restore' && effect.resource === 'hp';
  });
  if (hpItem && player.hp <= LIMITS.hp - 10) return { type: 'use', cardId: hpItem.uid };

  const weapons = player.hand.filter(card => getCard(card).kind === 'weapon')
    .sort((a, b) => attackPower(b) - attackPower(a));
  const extras = player.hand.filter(card => getCard(card).kind === 'extra');
  const miracles = player.hand.filter(card => getCard(card).kind === 'miracle' && getCard(card).mpCost <= player.mp)
    .sort((a, b) => attackPower(b) - attackPower(a));
  const weaponPower = weapons.length ? attackPower(weapons[0]) + extras.reduce((sum, card) => sum + attackPower(card), 0) : 0;
  if (weapons.length && (!miracles.length || weaponPower >= attackPower(miracles[0]))) {
    return { type: 'attack', cardIds: [weapons[0].uid, ...extras.map(card => card.uid)] };
  }
  if (miracles.length) return { type: 'attack', cardIds: [miracles[0].uid] };

  const recovery = items.find(instance => {
    const effect = getCard(instance).effect;
    return effect.type === 'restore' && player[effect.resource] < LIMITS[effect.resource];
  });
  if (recovery) return { type: 'use', cardId: recovery.uid };
  if (!hasPlayableAction(state, actor) && player.hand.length < LIMITS.hand) return { type: 'pray' };
  // Full non-actionable hands must be reduced without a replacement draw.
  return { type: 'discard', cardIds: player.hand.map(card => card.uid) };
}
