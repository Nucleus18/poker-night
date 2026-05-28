/**
 * Local Adapter：把引擎和 AI 串起来，提供给 React 订阅。
 * 二期联机时换成 SocketAdapter，UI 不动。
 */
import type { GameState, ActionKind, Player } from '@/engine/types';
import { applyAction, startNewHand, createInitialState, rebuyPlayer } from '@/engine/engine';
import { AI_PERSONALITIES, decideAI } from '@/ai/decide';
import type { RoomConfig } from '@/engine/types';

type Listener = (state: GameState) => void;

export class LocalAdapter {
  private state: GameState;
  private listeners: Set<Listener> = new Set();
  private aiTimer: number | null = null;
  private soundCb?: (event: string) => void;

  constructor(players: Player[], config: RoomConfig, soundCb?: (e: string) => void) {
    this.state = createInitialState(players, config);
    this.soundCb = soundCb;
  }

  getState(): GameState { return this.state; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit() { this.listeners.forEach((l) => l(this.state)); }

  private setState(s: GameState) {
    this.state = s;
    this.emit();
    this.scheduleAI();
  }

  /** 主动开新一手 */
  startHand() {
    const next = startNewHand(this.state);
    this.soundCb?.('deal');
    this.setState(next);
  }

  /** Hero 行动入口 */
  hero(kind: ActionKind, amount?: number) {
    if (this.state.toActSeat !== 0) return;
    this.dispatch(0, kind, amount);
  }

  /** 通用行动派发（AI/Hero 共用） */
  private dispatch(seatIdx: number, kind: ActionKind, amount?: number) {
    const next = applyAction(this.state, seatIdx, kind, amount);
    if (kind === 'fold') this.soundCb?.('fold');
    else if (kind === 'bet' || kind === 'raise' || kind === 'allin') this.soundCb?.('chip');
    else if (kind === 'call') this.soundCb?.('chip');
    else if (kind === 'check') this.soundCb?.('check');
    this.setState(next);

    // 摊牌
    if (next.street === 'showdown' && next.winners) {
      this.soundCb?.('win');
    }
  }

  /** 检查是否轮到 AI；若是则延迟思考后行动 */
  private scheduleAI() {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    const seat = this.state.toActSeat;
    if (seat < 0) return;
    const player = this.state.players[seat];
    if (!player.isAI) return;
    const delay = 600 + Math.random() * 900;
    this.aiTimer = window.setTimeout(() => {
      const personality = AI_PERSONALITIES[seat % AI_PERSONALITIES.length];
      const decision = decideAI(this.state, seat, personality);
      this.dispatch(seat, decision.kind, decision.amount);
    }, delay);
  }

  /** Hero 切换"秀牌"偏好（整局有效） */
  toggleShowCards() {
    const next = { ...this.state, players: this.state.players.map((p) => ({ ...p })) };
    next.players[0] = { ...next.players[0], showCardsEnabled: !next.players[0].showCardsEnabled };
    this.state = next;
    this.emit();
  }

  rebuy(seatIdx: number) {
    this.setState(rebuyPlayer(this.state, seatIdx));
  }

  destroy() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.listeners.clear();
  }
}

/** 工厂：根据房间配置 + 当前用户构造 9 个座位 */
export function buildPlayers(
  config: RoomConfig,
  hero: { id: string; name: string; avatar: string; colorPair: [string, string] },
): Player[] {
  const aiNames = ['Felix_Aces', 'TheArchitect', 'CaptainM', 'Vegas_Vixen', 'AceWolf', 'PoolShark', 'BluffKing', 'RiverRat'];
  const aiColors: [string, string][] = [
    ['#5a3a4a', '#2a1a26'],
    ['#4a3a5a', '#1a1a3a'],
    ['#3a5e8a', '#1a2e4a'],
    ['#8a3a5a', '#4a1a2a'],
    ['#5a4a3a', '#2a1a0a'],
    ['#3a5a4a', '#1a2a1a'],
    ['#5a3a3a', '#2a1a1a'],
    ['#3a3a5a', '#1a1a2a'],
  ];

  const players: Player[] = [];
  // 0 号位 = hero
  players.push({
    seatIdx: 0,
    accountId: hero.id,
    name: hero.name,
    avatar: hero.avatar,
    colorPair: hero.colorPair,
    isAI: false,
    isHero: true,
    stack: config.startingStack,
    holeCards: [],
    hasFolded: false,
    isAllIn: false,
    betThisRound: 0,
    totalBetThisHand: 0,
    outOfChips: false,
    isSittingOut: false,
    rebuysLeft: config.maxRebuys,
    showCardsEnabled: false,
    revealCards: false,
  });

  // 1..8 = AI 或空位
  for (let i = 1; i <= 8; i++) {
    if (i <= config.aiCount) {
      const idx = i - 1;
      // AI 玩家：随机一半秀，一半藏（增加观感多样性）
      const aiShows = Math.random() < 0.4;
      players.push({
        seatIdx: i,
        accountId: `ai_${i}`,
        name: aiNames[idx],
        avatar: `preset:${idx}`,
        colorPair: aiColors[idx],
        isAI: true,
        isHero: false,
        stack: config.startingStack,
        holeCards: [],
        hasFolded: false,
        isAllIn: false,
        betThisRound: 0,
        totalBetThisHand: 0,
        outOfChips: false,
        isSittingOut: false,
        rebuysLeft: config.maxRebuys,
        showCardsEnabled: aiShows,
        revealCards: false,
      });
    } else {
      players.push({
        seatIdx: i,
        accountId: '',
        name: '',
        avatar: '',
        colorPair: ['#333', '#222'],
        isAI: false,
        isHero: false,
        stack: 0,
        holeCards: [],
        hasFolded: false,
        isAllIn: false,
        betThisRound: 0,
        totalBetThisHand: 0,
        outOfChips: false,
        isSittingOut: true,
        rebuysLeft: 0,
        showCardsEnabled: false,
        revealCards: false,
      });
    }
  }
  return players;
}
