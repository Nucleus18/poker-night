import type { Card } from '@/engine/types';

const SUIT_SYMBOL: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
const RED_SUITS = new Set(['h', 'd']);

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  glow?: boolean;
  size?: 'sm' | 'table' | 'md' | 'lg';
  rotate?: number;
  /** 发牌动画：先飞入，再由牌背翻成牌面 */
  deal?: boolean;
  /** 动画延迟（ms） */
  dealDelay?: number;
}

export default function PlayingCard({ card, faceDown, glow, size = 'md', rotate = 0, deal, dealDelay = 0 }: PlayingCardProps) {
  const dim = size === 'lg'
    ? { w: 64, h: 92, corner: 13, rank: 18, suit: 28, center: 33 }
    : size === 'table'
    ? { w: 46, h: 66, corner: 9, rank: 13, suit: 18, center: 24 }
    : size === 'sm'
    ? { w: 22, h: 30, corner: 5, rank: 8, suit: 10, center: 12 }
    : { w: 60, h: 86, corner: 12, rank: 17, suit: 28, center: 32 };

  const isFaceDown = faceDown || !card;
  const isRed = card ? RED_SUITS.has(card.suit) : false;
  const suit = card ? SUIT_SYMBOL[card.suit] : '';
  const ink = isRed ? '#c82632' : '#141414';
  const outerShadow = glow
    ? '0 9px 18px rgba(0,0,0,0.62), 0 0 18px rgba(16,185,129,0.55)'
    : '0 9px 18px rgba(0,0,0,0.58), 0 2px 5px rgba(0,0,0,0.35)';

  const wrapperStyle = {
    width: dim.w,
    height: dim.h,
    ['--card-rotate' as any]: `${rotate}deg`,
    ['--card-delay' as any]: `${dealDelay}ms`,
    animationDelay: deal ? `${dealDelay}ms` : undefined,
    transform: `rotate(${rotate}deg)`,
    filter: glow ? 'drop-shadow(0 0 8px rgba(16,185,129,0.38))' : undefined,
  } as React.CSSProperties;

  return (
    <div
      style={wrapperStyle}
      className={`playing-card ${deal ? 'playing-card-deal' : ''} ${isFaceDown ? 'is-facedown' : 'is-faceup'}`}
    >
      <div className={`playing-card-inner ${deal && !isFaceDown ? 'playing-card-flip' : ''}`}>
        <div className="playing-card-face playing-card-back" style={{ boxShadow: outerShadow }}>
          <div className="card-back-panel" />
          <div className="card-back-diamond" />
        </div>

        <div className="playing-card-face playing-card-front" style={{ boxShadow: outerShadow }}>
          {card && (
            <>
              <div className="card-corner card-corner-tl" style={{ color: ink, fontSize: dim.corner }}>
                <span className="card-rank" style={{ fontSize: dim.rank }}>{card.rank}</span>
                <span style={{ fontSize: dim.corner }}>{suit}</span>
              </div>
              <div className="card-corner card-corner-br" style={{ color: ink, fontSize: dim.corner }}>
                <span className="card-rank" style={{ fontSize: dim.rank }}>{card.rank}</span>
                <span style={{ fontSize: dim.corner }}>{suit}</span>
              </div>
              <div className="card-center-mark" style={{ color: ink, fontSize: dim.center }}>
                {suit}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
