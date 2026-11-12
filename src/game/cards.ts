import type { CardDefinition, CardInstance } from './types';

// Relative weights, not hardcoded percentages: add entries without changing the draw code.
export const CARDS: readonly CardDefinition[] = [
  { id: 'spark-blade', name: '灯火の小剣', kind: 'weapon', weight: 24, mpCost: 0,
    description: '攻撃6。追加武器と組み合わせられる。', symbol: '✦', effect: { type: 'attack', power: 6 } },
  { id: 'dusk-axe', name: '黄昏の斧', kind: 'weapon', weight: 13, mpCost: 0,
    description: '攻撃9。追加武器と組み合わせられる。', symbol: '✧', effect: { type: 'attack', power: 9 } },
  { id: 'comet-shard', name: '彗星のかけら', kind: 'extra', weight: 12, mpCost: 0,
    description: '攻撃+3。通常武器に何枚でも追加できる。単独使用不可。', symbol: '☄', effect: { type: 'attack', power: 3 } },
  { id: 'reed-guard', name: '葦編みの盾', kind: 'armor', weight: 15, mpCost: 0,
    description: '防御4。ほかの防具と組み合わせられる。', symbol: '◇', effect: { type: 'defend', power: 4 } },
  { id: 'orbit-shield', name: '環月の盾', kind: 'armor', weight: 8, mpCost: 0,
    description: '防御7。ほかの防具と組み合わせられる。', symbol: '◈', effect: { type: 'defend', power: 7 } },
  { id: 'starfall', name: '星降りの詠唱', kind: 'miracle', weight: 6, mpCost: 3,
    description: 'MP3で攻撃8。カードは残り、1枚引く。防具で防げる。', symbol: '✺', effect: { type: 'attack', power: 8 } },
  { id: 'dew-flask', name: '朝露の小瓶', kind: 'item', weight: 12, mpCost: 0,
    description: 'HPを10回復する。上限40。', symbol: '❋', effect: { type: 'restore', resource: 'hp', amount: 10 } },
  { id: 'ether-drop', name: '夜光のしずく', kind: 'item', weight: 10, mpCost: 0,
    description: 'MPを4回復する。上限10。', symbol: '◉', effect: { type: 'restore', resource: 'mp', amount: 4 } },
];

const BY_ID = new Map(CARDS.map(card => [card.id, card]));

export function getCard(instance: CardInstance): CardDefinition {
  const definition = BY_ID.get(instance.definitionId);
  if (!definition) throw new Error(`未知のカード定義: ${instance.definitionId}`);
  return definition;
}
