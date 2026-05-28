import type { Card, Rank, Suit } from './types';

const RANKS: Rank[] = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS: Suit[] = ['h','d','c','s'];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push({ rank: r, suit: s });
  return deck;
}

/** 安全洗牌：crypto.getRandomValues 优先，回退到 Math.random */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  const cryptoObj = (typeof crypto !== 'undefined' ? crypto : undefined);
  for (let i = a.length - 1; i > 0; i--) {
    let j: number;
    if (cryptoObj?.getRandomValues) {
      const r = new Uint32Array(1);
      cryptoObj.getRandomValues(r);
      j = r[0] % (i + 1);
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardToStr(c: Card): string {
  return `${c.rank}${c.suit}`;
}
