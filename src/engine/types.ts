/** 扑克核心类型定义（被引擎、UI、Adapter 共用） */

export type Suit = 'h' | 'd' | 'c' | 's'; // hearts diamonds clubs spades
export type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'idle' | 'paused' | 'runout-voting';

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
export type RunItCount = 1 | 2 | 3;

export interface PlayerAction {
  kind: ActionKind;
  amount?: number; // 对 bet/raise 是目标到达额；对 call/allin 是 to call 量
}

export interface Player {
  seatIdx: number;       // 0..8（0 是 hero）
  accountId: string;     // 'player01' or 'ai_xxx'
  name: string;
  avatar: string;        // preset:N or data:url
  colorPair: [string, string];
  isAI: boolean;
  isHero: boolean;       // 是否是当前登录用户

  stack: number;         // 当前筹码
  holeCards: Card[];     // 手牌（hero 全部可见，非 hero 仅在 showdown 可见）
  hasFolded: boolean;
  isAllIn: boolean;
  betThisRound: number;  // 本轮已投入
  totalBetThisHand: number; // 本手累计投入（用于边池）

  // 引擎行动状态：用于判断本轮是否行动过
  lastAction?: { kind: ActionKind; amount?: number; ts: number };
  // UI 短期标签：跨街保留最后一个下注/跟注动作，避免最后一个 call 被立刻清掉看不到筹码动画
  visualAction?: { kind: ActionKind; amount?: number; ts: number };

  // 破产 / 离场
  outOfChips: boolean;   // 真正的"破产，等补码或离场"标记
  isSittingOut: boolean; // 离场状态（不发牌）
  rebuysLeft: number;
  totalBuyIn: number;    // 累计购入筹码（起始 + 所有补码），用于战绩盈亏
  handsPlayed: number;   // 累计参与过的手数（用于战绩"局数"）

  // 秀牌开关（持久玩家偏好）
  showCardsEnabled: boolean;
  // 本手结束时是否展示牌（引擎在 finalizeHand 时设置；新一手重置）
  revealCards: boolean;
  // 准备状态（仅在线房间使用：等待房主开始时每个真人需要点准备）
  ready: boolean;
  // 主动离开房间标记：保留 stack 和 name 用于积分榜，但不再发牌、不再行动
  hasLeft?: boolean;
}

export interface Pot {
  amount: number;
  eligible: number[]; // 有资格争夺的 player seatIdx
}

export interface Winner {
  seatIdx: number;
  amount: number;
  handDescription?: string;
}

export interface RunItRun {
  index: number;
  community: Card[];
  winners: Winner[];
}

export interface RunItState {
  status: 'voting' | 'complete';
  eligibleSeats: number[];
  votes: Record<number, RunItCount>;
  runCount?: RunItCount;
  baseCommunity: Card[];
  runs: RunItRun[];
}

export interface RoomConfig {
  name: string;
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  rebuyAmount: number;
  maxRebuys: number;
  durationMin: number;
  aiCount: number;
  step: number; // 下注最小步进
}

export interface GameState {
  config: RoomConfig;
  players: Player[];
  deck: Card[];
  community: Card[];      // 0/3/4/5
  street: Street;
  pots: Pot[];
  currentBet: number;     // 当前轮最高下注额
  minRaise: number;       // 最小加注幅度
  buttonSeat: number;     // dealer 位
  toActSeat: number;      // 当前要行动的座位（-1 表示无）
  handNumber: number;
  startedAt: number;      // ms：房间创建时间
  gameStartedAt?: number; // ms：第一手真正发牌的时间（用于倒计时基准）
  endingAfterHand: boolean; // 限时到了，本手打完结束
  finished: boolean;
  // 等待房主开始游戏阶段（仅在线房间）：true 表示还没开第一手
  waitingToStart: boolean;
  hostSeatIdx: number;    // 房主座位（仅在线房间，本地恒为 0）
  winners?: Winner[];
  runIt?: RunItState;
}
