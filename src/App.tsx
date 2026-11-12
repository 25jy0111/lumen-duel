import { useEffect, useState } from 'react';
import { applyAction, createGame, getActingPlayer, LIMITS, validateAction } from './game/engine';
import { getCard } from './game/cards';
import { chooseCpuAction } from './game/cpu';
import type { CardDefinition, CardKind, GameAction, GameState, PlayerState } from './game/types';
import './App.css';

const KIND_LABEL: Record<CardKind, string> = {
  weapon: '通常武器', extra: '追加武器', armor: '防具', miracle: '奇跡', item: '雑貨',
};

function CardIcon({ kind }: { kind: CardKind }) {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="card-icon">
    {kind === 'weapon' && <><path d="m22 39 28-28 1 14-20 21-9-7Z" fill="currentColor" opacity=".18"/><path d="m23 40 27-29 1 14-20 21M18 34l16 16M12 51l12-12M10 48l6 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}
    {kind === 'extra' && <><path d="m36 9-17 26h13l-4 20 19-29H34l2-17Z" fill="currentColor" opacity=".18"/><path d="m36 9-17 26h13l-4 20 19-29H34l2-17Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/></>}
    {kind === 'armor' && <><path d="m32 9 20 8v16c0 11-20 22-20 22S12 44 12 33V17l20-8Z" fill="currentColor" opacity=".16"/><path d="m32 9 20 8v16c0 11-20 22-20 22S12 44 12 33V17l20-8Z" stroke="currentColor" strokeWidth="3"/><path d="M32 20v23M22 31h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></>}
    {kind === 'miracle' && <><path d="m32 10 6 16 16 6-16 6-6 16-6-16-16-6 16-6 6-16Z" fill="currentColor" opacity=".18"/><path d="m32 10 6 16 16 6-16 6-6 16-6-16-16-6 16-6 6-16Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M50 8v8M46 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></>}
    {kind === 'item' && <><path d="M25 11h14v13l9 12v11a7 7 0 0 1-7 7H23a7 7 0 0 1-7-7V36l9-12V11Z" fill="currentColor" opacity=".16"/><path d="M25 11h14v13l9 12v11a7 7 0 0 1-7 7H23a7 7 0 0 1-7-7V36l9-12V11ZM22 11h20M18 37h28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}
  </svg>;
}

function cardValue(card: CardDefinition) {
  if (card.effect.type === 'attack') return `${card.kind === 'extra' ? '攻撃 +' : '攻撃 '}${card.effect.power}`;
  if (card.effect.type === 'defend') return `防御 ${card.effect.power}`;
  return `${card.effect.resource.toUpperCase()} +${card.effect.amount}`;
}

function Status({ player, active, cpu }: { player: PlayerState; active: boolean; cpu?: boolean }) {
  return <section className={`player-status ${active ? 'is-active' : ''}`} aria-label={`${player.name}のステータス`}>
    <div className={`avatar ${cpu ? 'cpu-avatar' : ''}`} aria-hidden="true">{cpu ? '◇' : '✦'}</div>
    <div className="player-info">
      <div className="player-name"><h2>{player.name}</h2><span>{cpu ? 'CPU' : 'YOU'}</span>{active && <span className="active-dot">行動中</span>}</div>
      <div className="health-row"><span>HP</span><strong>{player.hp}<small> / {LIMITS.hp}</small></strong><div className="health-track" role="meter" aria-label={`${player.name}のHP`} aria-valuemin={0} aria-valuemax={LIMITS.hp} aria-valuenow={player.hp}><div style={{ width: `${player.hp / LIMITS.hp * 100}%` }} /></div></div>
      <div className="other-stats"><span><i className="mp-dot" />MP <b>{player.mp}</b><small> / {LIMITS.mp}</small></span><span><i className="gold-dot" />所持金 <b>{player.gold}</b></span><span>手札 <b>{player.hand.length}</b>枚</span></div>
    </div>
  </section>;
}

function newGame() {
  return createGame(crypto.getRandomValues(new Uint32Array(1))[0]);
}

export default function App() {
  const [game, setGame] = useState<GameState>(newGame);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'play' | 'discard'>('play');
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);
  const actor = getActingPlayer(game);
  const isHumanTurn = game.phase !== 'finished' && actor === 'human';
  const isDefense = game.phase === 'defense';
  const selected = game.players.human.hand.filter(card => selectedIds.includes(card.uid));
  const definitions = selected.map(getCard);
  const attackPower = definitions.reduce((sum, card) => sum + (card.effect.type === 'attack' ? card.effect.power : 0), 0);
  const defensePower = definitions.reduce((sum, card) => sum + (card.effect.type === 'defend' ? card.effect.power : 0), 0);
  const isItem = definitions.length === 1 && definitions[0].kind === 'item';
  const action: GameAction = isDefense ? { type: 'defend', cardIds: selectedIds }
    : mode === 'discard' ? { type: 'discard', cardIds: selectedIds }
    : isItem ? { type: 'use', cardId: selectedIds[0] }
    : { type: 'attack', cardIds: selectedIds };
  const actionError = validateAction(game, 'human', action);
  const prayError = validateAction(game, 'human', { type: 'pray' });

  useEffect(() => {
    if (game.phase === 'finished' || getActingPlayer(game) !== 'cpu') return;
    const timer = window.setTimeout(() => {
      const result = applyAction(game, 'cpu', chooseCpuAction(game));
      if (result.ok) setGame(result.state);
      else setError(`CPUの行動エラー：${result.error}`);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [game]);

  function submit(nextAction: GameAction) {
    const result = applyAction(game, 'human', nextAction);
    if (!result.ok) { setError(result.error); return; }
    setGame(result.state);
    setSelectedIds([]);
    setMode('play');
    setError('');
  }

  function restart() {
    setGame(newGame());
    setSelectedIds([]);
    setMode('play');
    setError('');
  }

  function toggleCard(uid: string) {
    setError('');
    const card = getCard(game.players.human.hand.find(item => item.uid === uid)!);
    setSelectedIds(current => {
      if (current.includes(uid)) return current.filter(id => id !== uid);
      if (isDefense || mode === 'discard') return [...current, uid];
      if (card.kind === 'miracle' || card.kind === 'item') return [uid];
      return [...current.filter(id => {
        const existing = getCard(game.players.human.hand.find(item => item.uid === id)!);
        return existing.kind === 'extra' || (card.kind === 'extra' && existing.kind === 'weapon');
      }), uid];
    });
  }

  function cardDisabled(card: CardDefinition) {
    if (!isHumanTurn) return true;
    if (isDefense) return card.kind !== 'armor';
    if (mode === 'discard') return false;
    if (card.kind === 'armor') return true;
    if (card.mpCost > game.players.human.mp) return true;
    if (card.effect.type === 'restore') return game.players.human[card.effect.resource] >= LIMITS[card.effect.resource];
    return false;
  }

  const phaseTitle = game.phase === 'finished' ? '対戦終了'
    : isHumanTurn ? (isDefense ? 'あなたの防御' : 'あなたのターン') : (isDefense ? 'CPUが防御中' : 'CPUのターン');
  const instruction = game.phase === 'finished' ? 'もう一度、光を手に。新しい対戦を始められます。'
    : !isHumanTurn ? 'CPUが行動を選んでいます…'
    : isDefense ? '防具を選んで防御。選ばずにダメージを受けることもできます。'
    : mode === 'discard' ? '捨てるカードを選択してください。補充はなく、ターンを終了します。'
    : !prayError ? '使える攻撃・回復がありません。「祈る」でカードを1枚引けます。'
    : '武器＋追加武器で攻撃。奇跡や回復アイテムは1枚で使います。';
  const actionLabel = isDefense ? (selectedIds.length ? `防御する · ${defensePower}` : '防御せず受ける')
    : mode === 'discard' ? `${selectedIds.length}枚捨てる` : isItem ? '回復する'
    : definitions.some(card => card.kind === 'miracle') ? `奇跡を使う · ${attackPower}` : `攻撃する${attackPower ? ` · ${attackPower}` : ''}`;

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="./" aria-label="ルーメンデュエル ホーム"><span className="brand-mark" aria-hidden="true">✦</span><span>LUMEN <b>DUEL</b><small>ルーメンデュエル</small></span></a>
      <div className="header-actions"><span className="edition">HUMAN vs CPU</span><button className="button button-quiet" onClick={() => setShowRules(value => !value)} aria-expanded={showRules}>遊び方</button><button className="button button-outline" onClick={restart}>新しいゲーム</button></div>
    </header>

    {showRules && <section className="rules-panel" aria-label="遊び方"><h2>光を重ねて、相手のHPを0に。</h2><div className="rules-grid"><p><strong>攻撃</strong>通常武器1枚に追加武器を好きな枚数組み合わせます。奇跡は1枚で使い、MPを消費します。</p><p><strong>防御と補充</strong>防具は複数選択可能。ダメージは攻撃−防御、最低0。消費したカードは同じ枚数補充します。</p><p><strong>奇跡と回復</strong>奇跡のカードは残り、使用時に1枚引きます。回復は自分に使用。HP上限40、MP上限10、手札上限18枚です。</p><p><strong>祈る・捨てる</strong>使える攻撃・回復がない時だけ祈れます。上限時は引かずにターン終了。「捨てる」は補充なしでターン終了です。</p></div><p className="rules-note">各行動でターンが終了します。先攻はランダム。所持金は第一段階では変動しません。</p></section>}

    <main className="game-layout">
      <div className="play-area">
        <Status player={game.players.cpu} active={actor === 'cpu' && game.phase !== 'finished'} cpu />

        <section className={`battlefield ${isDefense ? 'under-attack' : ''}`} aria-label="対戦状況">
          <div className="turn-label">TURN <strong>{String(game.turn).padStart(2, '0')}</strong><span>{game.phase === 'finished' ? 'FINISHED' : isDefense ? 'DEFENSE' : 'ACTION'}</span></div>
          {game.phase === 'finished' ? <div className="winner-content" role="status"><span className="arena-symbol" aria-hidden="true">{game.winner === 'human' ? '✦' : '◇'}</span><p className="eyebrow">{game.winner === 'human' ? 'VICTORY' : 'DEFEAT'}</p><h1>{game.winner === 'human' ? 'あなたの勝利！' : 'CPUの勝利'}</h1><p>第{game.turn}ターンで決着</p><button className="button button-primary" onClick={restart}>もう一度対戦する <span aria-hidden="true">↗</span></button></div>
            : game.pendingAttack ? <div className="attack-content" role="status"><span className="eyebrow">{game.players[game.pendingAttack.attacker].name} の攻撃</span><div className="attack-number">{game.pendingAttack.power}<span>ATK</span></div><p className="attack-cards">{game.pendingAttack.cardNames.join(' ＋ ')}</p><div className="damage-preview">{isHumanTurn ? <>防御 <b>{defensePower}</b><span aria-hidden="true">→</span>受けるダメージ <strong>{Math.max(0, game.pendingAttack.power - defensePower)}</strong></> : 'CPUが防具を選んでいます…'}</div></div>
              : <div className="idle-content"><div className="arena-emblem" aria-hidden="true"><span>✦</span></div><p className="eyebrow">THE LIGHT IS IN YOUR HANDS</p><h1>{phaseTitle}</h1><p>{isHumanTurn ? 'カードを選んで、次の一手を。' : '少しお待ちください…'}</p></div>}
        </section>

        <Status player={game.players.human} active={isHumanTurn} />

        <section className="hand-panel" aria-label="あなたの手札">
          <div className="hand-heading"><div><p className="eyebrow">YOUR HAND</p><h2>あなたの手札 <span>{game.players.human.hand.length}<small> / {LIMITS.hand}</small></span></h2></div><div className="hand-tabs" aria-label="カードの操作"><button className={mode === 'play' ? 'selected-tab' : ''} disabled={!isHumanTurn || isDefense} aria-pressed={mode === 'play'} onClick={() => { setMode('play'); setSelectedIds([]); setError(''); }}>使う</button><button className={mode === 'discard' ? 'selected-tab' : ''} disabled={!isHumanTurn || isDefense} aria-pressed={mode === 'discard'} onClick={() => { setMode('discard'); setSelectedIds([]); setError(''); }}>捨てる</button></div></div>
          <p className="hand-instruction" role="status">{instruction}</p>
          <div className="card-grid">
            {game.players.human.hand.map(instance => {
              const card = getCard(instance);
              const picked = selectedIds.includes(instance.uid);
              const disabled = cardDisabled(card);
              const detail = disabled && isHumanTurn && !isDefense && mode === 'play' ? card.kind === 'armor' ? '防御時に使えます。捨てる場合は「捨てる」に切り替えます。' : card.mpCost > game.players.human.mp ? 'MPが足りません。' : '現在は回復が不要です。' : card.description;
              return <button key={instance.uid} type="button" className={`game-card kind-${card.kind} ${picked ? 'picked' : ''}`} disabled={disabled} aria-pressed={picked} aria-label={`${card.name}、${KIND_LABEL[card.kind]}、${cardValue(card)}${card.mpCost ? `、消費MP ${card.mpCost}` : ''}`} title={detail} onClick={() => toggleCard(instance.uid)}>
                <span className="card-topline"><span>{KIND_LABEL[card.kind]}</span><span className="card-check" aria-hidden="true">{picked ? '✓' : '+'}</span></span>
                <span className="card-art"><CardIcon kind={card.kind} /></span>
                <span className="card-name">{card.name}</span><span className="card-value">{cardValue(card)}</span><span className="card-description">{card.description}</span><span className="card-foot">{card.mpCost ? `MP ${card.mpCost} · 消費なし` : card.kind === 'extra' ? '武器と一緒に使用' : card.kind === 'armor' ? '攻撃された時に使用' : '使用後に1枚補充'}</span>
              </button>;
            })}
          </div>
          {!game.players.human.hand.length && <p className="empty-hand">手札がありません。自分のターンに「祈る」でカードを引きましょう。</p>}
          <div className="action-bar"><div className="selection-info"><strong>{selectedIds.length ? `${selectedIds.length}枚 選択中` : isDefense && isHumanTurn ? '防具を選択できます' : 'カードを選択'}</strong><span>{error || (isHumanTurn && selectedIds.length && actionError ? actionError : isDefense ? '防御は任意です' : '選択したカードはもう一度押すと解除')}</span></div><div className="action-buttons"><button className="button button-quiet clear-button" disabled={!selectedIds.length} onClick={() => { setSelectedIds([]); setError(''); }}>解除</button>{!isDefense && <button className="button button-outline" disabled={!!prayError} title={prayError || '1枚引いてターンを終了'} onClick={() => submit({ type: 'pray' })}>祈る</button>}<button className={`button button-primary ${mode === 'discard' && !isDefense ? 'button-discard' : ''}`} disabled={!isHumanTurn || !!actionError} onClick={() => submit(action)}>{actionLabel}<span aria-hidden="true">→</span></button></div></div>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
      </div>

      <aside className="battle-log" aria-label="戦闘ログ"><div className="log-heading"><span className="eyebrow">BATTLE LOG</span><h2>対戦の記録<span className="live-dot" aria-hidden="true" /></h2></div><ol aria-live="polite" aria-relevant="additions">{[...game.log].reverse().map(entry => <li key={entry.id}><span className="log-turn">T{String(entry.turn).padStart(2, '0')}</span><p>{entry.text}</p></li>)}</ol></aside>
    </main>
    <footer className="app-footer"><span>LUMEN DUEL</span><p>ひとりで遊べる、光のカードバトル。</p><span>PHASE 01</span></footer>
  </div>;
}
