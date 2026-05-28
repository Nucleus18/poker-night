import type { Card } from '@/engine/types';

const SUIT_SYMBOL: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
const RED_SUITS = new Set(['h', 'd']);

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  glow?: boolean;
  size?: 'sm' | 'md' | 'lg';
  rotate?: number;
}

export default function PlayingCard({ card, faceDown, glow, size = 'md', rotate = 0 }: PlayingCardProps) {
  const dim = size === 'lg' ? { w: 64, h: 92, r: 22, s: 32 } : size === 'sm' ? { w: 22, h: 30, r: 10, s: 11 } : { w: 60, h: 86, r: 21, s: 32 };
  const isRed = card ? RED_SUITS.has(card.suit) : false;

  if (faceDown || !card) {
    return (
      <div
        style={{ width: dim.w, height: dim.h, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
        className="relative rounded-md border border-white/5 shadow-[0_6px_14px_rgba(0,0,0,0.6),0_2px_4px_rgba(0,0,0,0.4)]"
      >
        <div className="absolute inset-0 rounded-md" style={{ background: 'linear-gradient(135deg, #1e3a5f, #0c1a2e)' }}></div>
        <div
          className="absolute inset-1 rounded border border-blue-400/40"
          style={{ background: 'repeating-linear-gradient(45deg, rgba(74,122,184,0.15) 0 2px, transparent 2px 5px)' }}
        ></div>
      </div>
    );
  }

  const cardShadow = glow
    ? '0 6px 14px rgba(0,0,0,0.6), 0 0 16px rgba(16, 185, 129, 0.5), inset 0 1px 0 rgba(255,255,255,0.8)'
    : '0 6px 14px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8)';

  return (
    <div
      style={{
        width: dim.w,
        height: dim.h,
        background: 'linear-gradient(180deg, #fff, #f0f0f0)',
        boxShadow: cardShadow,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
      }}
      className="relative rounded-md border border-black/15 flex flex-col items-center pt-1 pb-1"
    >
      <span
        className="font-cinzel font-semibold leading-none self-start ml-1"
        style={{ fontSize: dim.r, color: isRed ? '#d12d2d' : '#1a1a1a' }}
      >
        {card.rank}
      </span>
      <span
        className="leading-none mt-1.5"
        style={{ fontSize: dim.s, color: isRed ? '#d12d2d' : '#1a1a1a' }}
      >
        {SUIT_SYMBOL[card.suit]}
      </span>
    </div>
  );
}
