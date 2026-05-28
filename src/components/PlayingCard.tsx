import type { Card, Rank, Suit } from '@/engine/types';

const RANK_FILE: Record<Rank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

const SUIT_FILE: Record<Suit, string> = {
  c: 'C',
  d: 'D',
  h: 'H',
  s: 'S',
};

function cardAssetPath(card: Card) {
  return `/cards/${SUIT_FILE[card.suit]}${RANK_FILE[card.rank]}.svg`;
}

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  glow?: boolean;
  size?: 'sm' | 'seat' | 'table' | 'md' | 'lg' | 'hero';
  rotate?: number;
  /** 发牌动画：先飞入，再由牌背翻成牌面 */
  deal?: boolean;
  /** 动画延迟（ms） */
  dealDelay?: number;
}

export default function PlayingCard({ card, faceDown, glow, size = 'md', rotate = 0, deal, dealDelay = 0 }: PlayingCardProps) {
  const dim = size === 'hero'
    ? { w: 78, h: 112 }
    : size === 'lg'
    ? { w: 64, h: 92 }
    : size === 'table'
    ? { w: 46, h: 66 }
    : size === 'seat'
    ? { w: 34, h: 48 }
    : size === 'sm'
    ? { w: 24, h: 36 }
    : { w: 60, h: 86 };

  const isFaceDown = faceDown || !card;
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
          <img className="card-back-img" src="/cards/BACK.svg?v=red-white-grid" alt="牌背" draggable={false} />
        </div>

        <div className="playing-card-face playing-card-front playing-card-front-asset" style={{ boxShadow: outerShadow }}>
          {card && <img className="card-asset-img" src={cardAssetPath(card)} alt={`${card.rank}${card.suit}`} draggable={false} />}
        </div>
      </div>
    </div>
  );
}
