import { useMemo, useState } from 'react';
import { Hand } from 'pokersolver';
import type { Card } from '@/engine/types';
import { cardToStr } from '@/engine/deck';

interface BestHandProps {
  holeCards: Card[];
  community: Card[];
}

const RED = new Set(['h', 'd']);
const SUIT_SYM: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };

export default function BestHand({ holeCards, community }: BestHandProps) {
  const [expanded, setExpanded] = useState(false);
  const result = useMemo(() => {
    if (holeCards.length < 2) return null;
    const all = [...holeCards, ...community];
    if (all.length < 5) {
      return { cards: holeCards, descr: '等待翻牌' };
    }
    try {
      const hand = (Hand as any).solve(all.map(cardToStr));
      const usedStrs: string[] = (hand.cards || []).map((c: any) => `${c.value}${c.suit.toLowerCase()}`);
      const used: Card[] = usedStrs.map((s) => ({ rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] }));
      return { cards: used, descr: hand.descr || hand.name || '高牌' };
    } catch {
      return { cards: holeCards, descr: '—' };
    }
  }, [holeCards, community]);

  if (!result) return null;

  return (
    <div
      className={`best-hand-card fixed left-4 z-[35] rounded-lg ${expanded ? 'is-expanded' : ''}`}
      style={{
        bottom: 200,
        background: 'linear-gradient(180deg, rgba(20,30,25,0.9), rgba(10,20,15,0.9))',
        border: '1px solid rgba(16, 185, 129, 0.3)',
      }}
    >
      <button
        type="button"
        className="best-hand-compact hidden items-center gap-2 px-3 py-1.5 text-[11px] text-emerald-100/85"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-emerald-300/80 tracking-[1px]">最佳牌型</span>
        <span className="font-semibold text-white max-w-[130px] truncate">{result.descr}</span>
        <span className="text-emerald-100/40">{expanded ? '收起' : '展开'}</span>
      </button>

      <div className="best-hand-detail px-3.5 py-2 min-w-[180px]">
        <div className="text-[10px] tracking-[1.5px] text-emerald-100/70 text-center">CURRENT BEST</div>
        <div className="flex gap-[3px] justify-center my-1">
          {result.cards.map((c, i) => (
            <div
              key={i}
              className="w-[22px] h-[30px] rounded-[3px] bg-white flex flex-col items-center pt-0.5 leading-none"
            >
              <span
                className="font-cinzel text-[10px]"
                style={{ color: RED.has(c.suit) ? '#d12d2d' : '#1a1a1a' }}
              >
                {c.rank}
              </span>
              <span
                className="text-[11px] mt-px"
                style={{ color: RED.has(c.suit) ? '#d12d2d' : '#1a1a1a' }}
              >
                {SUIT_SYM[c.suit]}
              </span>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-white text-center">{result.descr}</div>
      </div>
    </div>
  );
}
