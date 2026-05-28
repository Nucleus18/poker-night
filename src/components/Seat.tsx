import type { Player } from '@/engine/types';

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
}

export default function Seat({ player, isEmpty, active, showCards, revealCards, isWinner, handLabel, position, rebuyAmount, rebuysLeft, onRebuy, payoutAmount, payoutActive }: SeatProps) {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: 'translate(-50%, -50%)',
    width: 'var(--seat-width, 96px)',
    zIndex: 4,
  };

  if (isEmpty || !player) {
    return (
      <div style={style} className="seat-root empty-seat-root">
        <div className="flex flex-col items-center">
          <div
            className="seat-avatar empty-seat-avatar w-[72px] h-[72px] rounded-full flex items-center justify-center"
            style={{ border: '1.5px dashed rgba(255,255,255,0.15)', opacity: 0.4 }}
          >
            <span className="text-xl text-emerald-100/30">+</span>
          </div>
          <div
            className="seat-tag -mt-2.5 px-2.5 py-1 text-center min-w-[96px] rounded-md"
            style={{ border: '1px dashed rgba(255,255,255,0.1)' }}
          >
            <div className="text-[11px] text-emerald-100/40">空位</div>
          </div>
        </div>
      </div>
    );
  }

  const [c1, c2] = player.colorPair;
  const ringClass = active ? 'animate-breathe' : '';
  const payoutClass = payoutActive ? 'payout-seat-highlight' : '';
  const tagClass = active
    ? 'border-emerald-500 bg-gradient-to-b from-[#0e2820] to-[#051a13] shadow-[0_0_12px_rgba(16,185,129,0.4)]'
    : 'border-white/8 bg-gradient-to-b from-[#1e1e1e] to-[#0a0a0a]';

  const lastAction = player.lastAction && Date.now() - player.lastAction.ts < 2500 ? player.lastAction : null;
  const actionLabel = lastAction
    ? lastAction.kind === 'fold' ? 'FOLD'
    : lastAction.kind === 'check' ? 'CHECK'
    : lastAction.kind === 'call' ? `CALL${lastAction.amount ? ' $' + lastAction.amount.toLocaleString() : ''}`
    : lastAction.kind === 'bet' ? `BET $${(lastAction.amount || 0).toLocaleString()}`
    : lastAction.kind === 'raise' ? `RAISE $${(lastAction.amount || 0).toLocaleString()}`
    : lastAction.kind === 'allin' ? 'ALL-IN'
    : ''
    : null;
  const actionColorCls = lastAction?.kind === 'fold'
    ? 'border-red-500 text-red-300'
    : lastAction?.kind === 'raise' || lastAction?.kind === 'allin'
    ? 'border-amber-400 text-amber-300'
    : 'border-emerald-500 text-emerald-300';

  return (
    <div style={style} className={`seat-root ${player.hasFolded ? 'opacity-40 grayscale' : ''}`}>
      <div className="flex flex-col items-center relative">
        {actionLabel && (
          <div
            className={`absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-bold tracking-widest rounded border bg-[rgba(8,18,14,0.95)] whitespace-nowrap z-30 ${actionColorCls}`}
          >
            {actionLabel}
          </div>
        )}

        {/* 对手手牌：peek from BEHIND avatar，z 比头像低；reveal 时放大 */}
        {showCards && player.holeCards.length === 2 && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 flex z-0 ${revealCards ? '-top-12' : '-top-3'}`}
          >
            {[0, 1].map((i) => {
              const card = player.holeCards[i];
              const rot = i === 0 ? -10 : 10;
              const tx = i === 0 ? 10 : -10;
              const isRed = revealCards && (card.suit === 'h' || card.suit === 'd');

              if (revealCards) {
                // 翻开后大尺寸：44 × 60，便于看清
                return (
                  <div
                    key={i}
                    style={{ transform: `rotate(${rot}deg) translateX(${tx}px)`, transition: 'transform 0.4s' }}
                    className="relative"
                  >
                    <div
                      className="opponent-card-reveal w-[44px] h-[60px] rounded-md bg-white border border-black/15 flex flex-col items-center justify-start pt-1 leading-none"
                      style={{
                        boxShadow: '0 6px 14px rgba(0,0,0,0.6), 0 0 12px rgba(212,175,55,0.4)',
                        animation: 'cardFlip 0.5s ease-out',
                      }}
                    >
                      <span className="font-cinzel text-[16px] font-semibold self-start ml-1" style={{ color: isRed ? '#d12d2d' : '#1a1a1a' }}>
                        {card.rank}
                      </span>
                      <span className="text-[22px] mt-1" style={{ color: isRed ? '#d12d2d' : '#1a1a1a' }}>
                        {card.suit === 'h' ? '♥' : card.suit === 'd' ? '♦' : card.suit === 'c' ? '♣' : '♠'}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                  <div
                    key={i}
                    style={{
                      transform: `rotate(${rot}deg) translateX(${tx}px)`,
                      transition: 'transform 0.4s',
                      animationDelay: `${i * 120}ms`,
                    }}
                    className="opponent-card-back relative"
                  >
                    <div className="w-6 h-9 rounded bg-gradient-to-br from-[#1e3a5f] to-[#0c1a2e] border border-white/10 shadow-md"></div>
                  </div>
              );
            })}
          </div>
        )}

        <div
          className={`seat-avatar relative w-[72px] h-[72px] rounded-full p-[3px] z-10 ${ringClass} ${payoutClass}`}
          style={{
            background: 'linear-gradient(180deg, #2a2a2a, #0a0a0a)',
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

          {/* WINNER 徽章（贴在头像右上） */}
          {isWinner && (
            <div
              className="absolute -top-3 -right-4 z-30 px-2.5 py-1 rounded-md text-[10px] font-extrabold tracking-[2px]"
              style={{
                background: 'linear-gradient(180deg, #fff4b8, #d4af37)',
                color: '#16110a',
                border: '2px solid #fff',
                boxShadow: '0 0 16px rgba(244,217,122,0.95), 0 3px 7px rgba(0,0,0,0.6)',
                animation: 'winnerBanner 0.4s ease-out',
              }}
            >
              WINNER
            </div>
          )}
        </div>
        {payoutActive && payoutAmount && payoutAmount > 0 && (
          <div className="payout-float pointer-events-none absolute left-1/2 top-[54px] z-40 -translate-x-1/2 rounded-full border border-amber-200/80 bg-black/90 px-3 py-1.5 text-[13px] font-extrabold text-amber-200 shadow-[0_0_18px_rgba(244,217,122,0.75)]">
            +${payoutAmount.toLocaleString()}
          </div>
        )}
        <div className={`seat-tag -mt-2.5 px-2.5 py-1 text-center min-w-[96px] rounded-md border shadow-[0_4px_10px_rgba(0,0,0,0.5)] relative z-10 ${tagClass}`}>
          <div className="text-[11px] font-medium truncate max-w-[92px]">{player.name}</div>
          <div className={`text-[13px] font-semibold leading-none mt-0.5 ${player.stack === 0 ? 'text-gray-500' : 'text-amber-200'}`}>
            ${player.stack.toLocaleString()}
          </div>
          {player.hasFolded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-black/70 text-gray-400 text-[9px] tracking-widest px-1.5 py-0.5 rounded">FOLDED</span>
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
              title={`补 $${rebuyAmount.toLocaleString()} 继续${typeof rebuysLeft === 'number' ? ` · 剩余 ${rebuysLeft} 次` : ''}`}
            >
              补码
            </button>
          )}
        </div>

        {/* 摊牌时的大字牌型标签（头像 + name 标签下方） */}
        {handLabel && (
          <div
            className="absolute z-20 px-2 py-0.5 rounded whitespace-nowrap pointer-events-none"
            style={{
              top: 'calc(100% + 3px)',
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
