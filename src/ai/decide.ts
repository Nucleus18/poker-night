/**
 * 简单 AI 决策器（三阈值）
 * 一期：根据手牌和场上信息打分 → 折/跟/加
 * 二期可替换为更复杂策略
 */
import { Hand } from 'pokersolver';
import type { GameState, Player, ActionKind } from '@/engine/types';
import { cardToStr } from '@/engine/deck';
import { getToCall, getMinRaiseTo } from '@/engine/engine';

export interface AIPersonality {
  name: string;
  foldThreshold: number;   // 牌力低于此 → 倾向 fold（0-1）
  raiseThreshold: number;  // 牌力高于此 → 倾向 raise
  bluffRate: number;       // 偶尔诈唬
  aggression: number;      // 加注幅度倍数
}

export const AI_PERSONALITIES: AIPersonality[] = [
  { name: 'TightNick',   foldThreshold: 0.45, raiseThreshold: 0.75, bluffRate: 0.05, aggression: 1.5 },
  { name: 'CallStation', foldThreshold: 0.15, raiseThreshold: 0.85, bluffRate: 0.0,  aggression: 1.0 },
  { name: 'Maniac',      foldThreshold: 0.20, raiseThreshold: 0.50, bluffRate: 0.20, aggression: 2.5 },
  { name: 'PoolShark',   foldThreshold: 0.35, raiseThreshold: 0.65, bluffRate: 0.10, aggression: 1.8 },
  { name: 'BluffKing',   foldThreshold: 0.30, raiseThreshold: 0.60, bluffRate: 0.25, aggression: 2.0 },
  { name: 'RiverRat',    foldThreshold: 0.25, raiseThreshold: 0.70, bluffRate: 0.08, aggression: 1.4 },
  { name: 'AceWolf',     foldThreshold: 0.40, raiseThreshold: 0.65, bluffRate: 0.12, aggression: 1.6 },
  { name: 'Felix',       foldThreshold: 0.50, raiseThreshold: 0.80, bluffRate: 0.03, aggression: 1.2 },
];

export interface AIDecision {
  kind: ActionKind;
  amount?: number;
}

/** 估算一只手的牌力（0-1） */
function estimateHandStrength(player: Player, community: string[]): number {
  const hole = player.holeCards.map(cardToStr);
  if (community.length === 0) {
    // preflop：粗略估计
    const r1 = player.holeCards[0].rank;
    const r2 = player.holeCards[1].rank;
    const order = '23456789TJQKA';
    const v1 = order.indexOf(r1), v2 = order.indexOf(r2);
    const pair = r1 === r2;
    const suited = player.holeCards[0].suit === player.holeCards[1].suit;
    let score = (Math.max(v1, v2) + Math.min(v1, v2) * 0.6) / 24;
    if (pair) score += 0.25;
    if (suited) score += 0.05;
    return Math.max(0, Math.min(1, score));
  }
  // postflop：用 pokersolver 取手牌等级
  try {
    const all = [...hole, ...community];
    const hand = (Hand as any).solve(all);
    // hand.rank 1=高牌, 9=皇家同花顺
    const rank = hand.rank || 1;
    return Math.min(1, rank / 9 + 0.1);
  } catch {
    return 0.3;
  }
}

export function decideAI(state: GameState, seatIdx: number, personality: AIPersonality): AIDecision {
  const player = state.players[seatIdx];
  const toCall = getToCall(state, seatIdx);
  const community = state.community.map(cardToStr);
  const strength = estimateHandStrength(player, community);

  const bigBlind = state.config.bigBlind;
  const pot = state.pots.reduce((a, p) => a + p.amount, 0)
    + state.players.reduce((a, p) => a + p.betThisRound, 0);

  // 是否诈唬
  const bluffing = Math.random() < personality.bluffRate;
  const effectiveStrength = bluffing ? Math.max(strength, 0.7) : strength;

  // 决策
  if (toCall === 0) {
    // 没人下注：CHECK 或 BET
    if (effectiveStrength > personality.raiseThreshold) {
      const target = Math.min(player.stack, Math.round(pot * personality.aggression * 0.6) || bigBlind * 3);
      return { kind: 'bet', amount: Math.max(bigBlind, target) };
    }
    return { kind: 'check' };
  }

  // 有人下注
  const callRatio = toCall / Math.max(1, pot);

  if (effectiveStrength < personality.foldThreshold && callRatio > 0.2) {
    return { kind: 'fold' };
  }

  if (effectiveStrength > personality.raiseThreshold && Math.random() < 0.5) {
    const minRaise = getMinRaiseTo(state, seatIdx);
    const target = Math.min(player.stack + player.betThisRound, Math.max(minRaise, Math.round(pot * personality.aggression * 0.5)));
    return { kind: 'raise', amount: target };
  }

  // 跟注
  if (toCall >= player.stack) return { kind: 'allin' };
  return { kind: 'call' };
}
