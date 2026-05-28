import type { Player } from '@/engine/types';
import PlayingCard from '@/components/PlayingCard';

const REACTIONS: Record<string, { alt: string; code: string }> = {
  wink: { alt: '😉', code: '1f609' },
  angry: { alt: '😡', code: '1f621' },
  shake: { alt: '🙂', code: '1f642_200d_2194_fe0f' },
  party: { alt: '🥳', code: '1f973' },
};
const TOMATO = { alt: '🍅', code: '1f345' };
const reactionWebp = (code: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
const reactionGif = (code: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif`;

interface SeatProps {
  player?: Player;
  isEmpty?: boolean;
  active?: boolean;
  showCards?: boolean;          // 显示牌背（对手 alive 状态）
  revealCards?: boolean;        // 翻开真牌（showdown / 主动秀）
  isWinner?: boolean;           // 是否是当前结算聚焦赢家（贴 WINNER 徽章）
  handLabel?: string;           // 本手摊牌时的牌型描述（在头像下方大字显示）
  position: { x: number; y: number };
  /** 仅在 hero 自己破产 (stack === 0) 且仍可补码时由父级传入；点击后立即补码 */
  rebuyAmount?: number;         // > 0 时显示补码按钮
  rebuysLeft?: number;          // 剩余补码次数（用于 tooltip / 文案）
  onRebuy?: () => void;
  /** 当前结算/跑马分条播放时的本次收益 */
  payoutAmount?: number;
  payoutActive?: boolean;
  /** 快捷表情展示时间戳，用于重复点击重新触发动画 */
  reactionTs?: number;
  reactionId?: string;
  /** 被番茄砸中的展示时间戳 */
  tomatoTs?: number;
  /** 当前玩家秀牌开关状态 */
  showCardsEnabled?: boolean;
  onToggleShowCards?: () => void;
  /** 当前是否处于番茄选人模式 */
  tomatoTargetable?: boolean;
  onTomatoTarget?: () => void;
}

export default function Seat({ player, isEmpty, active, showCards, revealCards, isWinner, handLabel, position, rebuyAmount, rebuysLeft, onRebuy, payoutAmount, payoutActive, reactionTs, reactionId, tomatoTs, showCardsEnabled, onToggleShowCards, tomatoTargetable, onTomatoTarget }: SeatProps) {
  const reaction = REACTIONS[reactionId || 'wink'] || REACTIONS.wink;
  const seatScale = player
    ? position.y > 78 ? 1.06
    : position.y < 24 ? 0.86
    : position.y < 42 ? 0.92
    : 0.98
    : 1;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: `translate(-50%, -50%) scale(${seatScale})`,
    transformOrigin: 'center center',
    width: 'var(--seat-width, 116px)',
    zIndex: position.y > 72 ? 8 : 4,
  };

  if (isEmpty || !player) {
    return (
      <div style={style} className="seat-root empty-seat-root">
        <div className="flex flex-col items-center">
          <div
            className="seat-avatar empty-seat-avatar flex h-[78px] w-[78px] items-center justify-center rounded-full"
            style={{ border: '1.5px dashed rgba(255,255,255,0.15)', opacity: 0.34 }}
          >
            <span className="text-xl text-emerald-100/30">+</span>
          </div>
          <div
            className="seat-tag -mt-3 min-w-[86px] rounded-full px-3 py-1 text-center"
            style={{ border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(8,18,28,0.42)' }}
          >
            <div className="text-[10px] text-emerald-100/40">空位</div>
          </div>
        </div>
      </div>
    );
  }

  const [c1, c2] = player.colorPair;
  const ringClass = active ? 'animate-breathe' : '';
  const payoutClass = payoutActive ? 'payout-seat-highlight' : '';
  const tagClass = active
    ? 'border-cyan-300/65 bg-gradient-to-b from-[#183955]/92 to-[#071827]/96 shadow-[0_0_18px_rgba(56,189,248,0.36),0_8px_16px_rgba(0,0,0,0.55)]'
    : 'border-white/10 bg-gradient-to-b from-[#16263b]/88 to-[#08111d]/94 shadow-[0_8px_16px_rgba(0,0,0,0.52)]';

  const moneyKinds = new Set(['call', 'bet', 'raise', 'allin']);
  const freshLastAction = player.lastAction && Date.now() - player.lastAction.ts < 2500 ? player.lastAction : null;
  const activeMoneyAction = player.betThisRound > 0
    ? (player.lastAction && moneyKinds.has(player.lastAction.kind) ? player.lastAction
      : player.visualAction && moneyKinds.has(player.visualAction.kind) ? player.visualAction
      : { kind: 'bet' as const, amount: player.betThisRound, ts: Date.now() })
    : null;
  const displayAction = activeMoneyAction || freshLastAction;
  const actionAmount = activeMoneyAction ? (player.betThisRound || activeMoneyAction.amount || 0) : (displayAction?.amount || 0);
  const actionLabel = displayAction
    ? displayAction.kind === 'fold' ? 'FOLD'
    : displayAction.kind === 'check' ? 'CHECK'
    : displayAction.kind === 'call' ? `CALL${actionAmount ? ' ' + actionAmount.toLocaleString() : ''}`
    : displayAction.kind === 'bet' ? `BET ${actionAmount.toLocaleString()}`
    : displayAction.kind === 'raise' ? `RAISE ${actionAmount.toLocaleString()}`
    : displayAction.kind === 'allin' ? `ALL-IN${actionAmount ? ' ' + actionAmount.toLocaleString() : ''}`
    : ''
    : null;
  const actionColorCls = displayAction?.kind === 'fold'
    ? 'border-red-500/75 text-red-200 bg-red-950/80'
    : displayAction?.kind === 'raise' || displayAction?.kind === 'allin'
    ? 'border-amber-300/80 text-amber-100 bg-amber-950/75'
    : 'border-cyan-300/70 text-cyan-100 bg-slate-950/78';
  const cardsOnRight = player.isHero || position.x <= 50;
  const cardSideGap = player.isHero ? 12 : 9;
  const holeCardsStyle = (cardsOnRight
    ? { left: `calc(100% + ${cardSideGap}px)` }
    : { right: `calc(100% + ${cardSideGap}px)` }
  ) as React.CSSProperties;

  return (
    <div
      style={style}
      className={`seat-root ${tomatoTargetable ? 'tomato-targetable cursor-pointer' : ''}`}
      onClick={tomatoTargetable ? onTomatoTarget : undefined}
    >
      {reactionTs && (
        <div key={reactionTs} className="seat-reaction pointer-events-none absolute left-1/2 z-40 -translate-x-1/2">
          <picture>
            <source srcSet={reactionWebp(reaction.code)} type="image/webp" />
            <img src={reactionGif(reaction.code)} alt={reaction.alt} width="88" height="88" className="h-[88px] w-[88px] object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.65)]" />
          </picture>
        </div>
      )}
      {tomatoTs && (
        <div key={tomatoTs} className="seat-tomato pointer-events-none absolute left-1/2 z-50 -translate-x-1/2">
          <picture>
            <source srcSet={reactionWebp(TOMATO.code)} type="image/webp" />
            <img src={reactionGif(TOMATO.code)} alt={TOMATO.alt} width="72" height="72" className="h-[72px] w-[72px] object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)]" />
          </picture>
        </div>
      )}
      <div className={`flex flex-col items-center relative ${player.hasFolded ? 'opacity-40 grayscale' : ''}`}>
        <div
          className={`seat-avatar relative z-10 h-[82px] w-[82px] rounded-full p-[4px] ${ringClass} ${payoutClass}`}
          style={{
            background: 'linear-gradient(180deg, rgba(239,246,255,0.9), rgba(30,41,59,0.95) 34%, rgba(2,6,23,0.98))',
            boxShadow: payoutActive
              ? '0 0 0 3px #f4d97a, 0 0 38px rgba(244,217,122,0.95), 0 8px 18px rgba(0,0,0,0.65)'
              : isWinner
              ? '0 0 0 2px #d4af37, 0 0 28px rgba(212,175,55,0.85), 0 6px 14px rgba(0,0,0,0.6)'
              : active
              ? '0 0 0 2px #10b981, 0 0 20px rgba(16,185,129,0.7), 0 6px 14px rgba(0,0,0,0.6)'
              : '0 6px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
            animation: payoutActive ? 'payoutPulse 1.15s ease-out' : isWinner ? 'winnerHaloPulse 1.4s ease-in-out infinite' : undefined,
          }}
        >
          {active && (
            <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="3" />
              <circle
                cx="40" cy="40" r="36" fill="none" stroke="#10b981" strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="226"
                style={{
                  strokeDashoffset: 0,
                  animation: 'timer 12s linear forwards',
                  filter: 'drop-shadow(0 0 4px #10b981)',
                }}
              />
            </svg>
          )}
          <div
            className="w-full h-full rounded-full flex items-center justify-center font-semibold text-white text-xl border-[1.5px] border-white/10 overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
          >
            {player.avatar?.startsWith('data:')
              ? <img src={player.avatar} className="w-full h-full object-cover rounded-full" alt="" />
              : player.name[0]?.toUpperCase()
            }
          </div>

          {/* 手牌固定在头像正左 / 正右，垂直居中 */}
          {showCards && player.holeCards.length === 2 && (
            <div
              className="seat-hole-cards absolute top-1/2 z-20 flex -translate-y-1/2"
              style={holeCardsStyle}
            >
              {[0, 1].map((i) => {
                const card = player.holeCards[i];
                const faceUp = player.isHero || !!revealCards;
                const rot = i === 0 ? -6 : 6;

                return (
                  <div
                    key={i}
                    style={{
                      transform: `rotate(${rot}deg)`,
                      transition: 'transform 0.4s',
                      animationDelay: `${i * 120}ms`,
                    }}
                    className={faceUp ? 'opponent-card-reveal relative' : 'opponent-card-back relative'}
                  >
                    <PlayingCard card={faceUp ? card : undefined} faceDown={!faceUp} size={player.isHero ? 'hero' : 'seat'} />
                  </div>
                );
              })}

              {player.isHero && onToggleShowCards && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleShowCards(); }}
                  className={`hero-show-toggle absolute left-1/2 top-full mt-[-4px] flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border shadow-[0_8px_18px_rgba(0,0,0,0.58)] backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95 ${showCardsEnabled ? 'border-sky-200/75 bg-sky-400/24 text-sky-50' : 'border-white/15 bg-black/62 text-slate-200/90'}`}
                  title={showCardsEnabled ? '结算时秀牌' : '结算时藏牌'}
                  aria-label={showCardsEnabled ? '结算时秀牌' : '结算时藏牌'}
                >
                  {showCardsEnabled ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          )}

          {/* WINNER 徽章（贴在头像右上） */}
          {isWinner && (
            <div
              className="absolute -top-3 -right-4 z-30 px-2.5 py-1 rounded-md text-[10px] font-extrabold tracking-[2px]"
              style={{
                background: 'linear-gradient(180deg, #fff4b8, #d4af37)',
                color: '#16110a',
                border: '2px solid #fff',
                boxShadow: '0 0 16px rgba(244,217,122,0.95), 0 3px 7px rgba(0,0,0,0.6)',
                transformOrigin: 'center',
                animation: 'winnerBadgePop 0.28s ease-out both',
              }}
            >
              WINNER
            </div>
          )}
        </div>
        {payoutActive && payoutAmount && payoutAmount > 0 && (
          <div className="payout-float pointer-events-none absolute left-1/2 top-[54px] z-40 -translate-x-1/2 rounded-full border border-amber-200/80 bg-black/90 px-3 py-1.5 text-[13px] font-extrabold text-amber-200 shadow-[0_0_18px_rgba(244,217,122,0.75)]">
            +{payoutAmount.toLocaleString()}
          </div>
        )}
        <div className={`seat-tag relative z-10 -mt-3 min-w-[104px] rounded-xl border px-3 py-1.5 text-center backdrop-blur-md ${tagClass}`}>
          <div className={`text-[14px] font-extrabold leading-none ${player.stack === 0 ? 'text-slate-500' : 'text-cyan-50'}`}>
            {player.stack.toLocaleString()}
          </div>
          <div className="mt-0.5 max-w-[98px] truncate text-[10px] font-semibold leading-none text-sky-200/90">{player.name}</div>
          {player.hasFolded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/70 px-2 py-0.5 text-[8px] tracking-widest text-gray-300">FOLDED</span>
            </div>
          )}
          {/* 补码按钮：仅当父级传入 rebuyAmount/onRebuy 时渲染（即 hero 自己破产且仍有补码次数）
              位置：紧贴 seat-tag 右侧。点击后立即补码继续打。 */}
          {rebuyAmount && rebuyAmount > 0 && onRebuy && (
            <button
              onClick={(e) => { e.stopPropagation(); onRebuy(); }}
              className="rebuy-seat-btn absolute left-full top-1/2 -translate-y-1/2 ml-1.5 px-2 py-1 rounded-md text-[11px] font-bold tracking-wide whitespace-nowrap z-20 transition-all hover:brightness-110 active:scale-95"
              style={{
                background: 'linear-gradient(180deg, #10b981, #0e8e6c)',
                border: '1px solid #34d399',
                color: '#fff',
                boxShadow: '0 0 12px rgba(16,185,129,0.55), 0 2px 6px rgba(0,0,0,0.5)',
              }}
              title={`补 ${rebuyAmount.toLocaleString()} 继续${typeof rebuysLeft === 'number' ? ` · 剩余 ${rebuysLeft} 次` : ''}`}
            >
              补码
            </button>
          )}
        </div>

        {actionLabel && (
          <div className={`mt-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-extrabold tracking-[1.5px] shadow-[0_5px_12px_rgba(0,0,0,0.55)] backdrop-blur-sm ${actionColorCls}`}>
            {actionLabel}
          </div>
        )}

        {/* 摊牌时的大字牌型标签（头像 + name 标签下方） */}
        {handLabel && (
          <div
            className="absolute z-20 px-2 py-0.5 rounded whitespace-nowrap pointer-events-none"
            style={{
              top: actionLabel ? 'calc(100% + 24px)' : 'calc(100% + 3px)',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'linear-gradient(180deg, rgba(212,175,55,0.9), rgba(138,111,26,0.9))',
              border: '1px solid #f4d97a',
              boxShadow: '0 0 8px rgba(212,175,55,0.55), 0 3px 6px rgba(0,0,0,0.55)',
              animation: 'handLabelPop 0.35s ease-out',
            }}
          >
            <div
              className="text-[9px] font-bold tracking-[1.2px] text-center"
              style={{
                color: '#1a1a1a',
                textShadow: '0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              {handLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const css = `@keyframes timer { to { stroke-dashoffset: 226; } }`;
if (typeof document !== 'undefined' && !document.getElementById('seat-keyframes')) {
  const tag = document.createElement('style');
  tag.id = 'seat-keyframes';
  tag.textContent = css;
  document.head.appendChild(tag);
}
