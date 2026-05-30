/**
 * PartyKit 服务端：每个房间一个 Server 实例
 *
 * 设计原则：
 * - 服务端权威，跑同一份 engine（保证客户端代码和服务端一致）
 * - 客户端只发动作（fold/check/call/bet/raise/allin/start/rebuy/toggleShow）
 * - 服务端跑 reducer → 给每个连接发 per-player view（手牌防作弊）
 * - 房主创建房间时携带 RoomConfig；后续加入者复用同一份配置
 */
import type * as Party from 'partykit/server';
import type { GameState, Player, RoomConfig, ActionKind, RunItCount, Card } from '../src/engine/types';
import { applyAction, startNewHand, createInitialState, rebuyPlayer, voteRunIt } from '../src/engine/engine';
import { AI_PERSONALITIES, decideAI } from '../src/ai/decide';

const HIDDEN_HOLE_CARDS: Card[] = [
  { rank: 'A', suit: 's' },
  { rank: 'A', suit: 's' },
];

interface JoinPayload {
  type: 'join';
  user: { id: string; name: string; avatar: string; colorPair: [string, string] };
  config?: RoomConfig; // 仅 host 携带
}

interface ActionPayload {
  type: 'action';
  kind: ActionKind;
  amount?: number;
}

type ClientMsg =
  | JoinPayload
  | ActionPayload
  | { type: 'startHand' }
  | { type: 'toggleReady' }
  | { type: 'rebuy' }
  | { type: 'runItVote'; count: RunItCount }
  | { type: 'toggleShow' }
  | { type: 'reaction'; reactionId: string }
  | { type: 'tomato'; targetSeatIdx: number }
  | { type: 'leave' };

type ServerMsg =
  | { type: 'state'; state: GameState; mySeatIdx: number }
  | { type: 'reaction'; seatIdx: number; reactionId: string }
  | { type: 'tomato'; fromSeatIdx: number; targetSeatIdx: number }
  | { type: 'error'; message: string };

const PRESET_AI_NAMES = ['Felix_Aces', 'TheArchitect', 'CaptainM', 'Vegas_Vixen', 'AceWolf', 'PoolShark', 'BluffKing', 'RiverRat'];
const PRESET_AI_COLORS: [string, string][] = [
  ['#5a3a4a', '#2a1a26'],
  ['#4a3a5a', '#1a1a3a'],
  ['#3a5e8a', '#1a2e4a'],
  ['#8a3a5a', '#4a1a2a'],
  ['#5a4a3a', '#2a1a0a'],
  ['#3a5a4a', '#1a2a1a'],
  ['#5a3a3a', '#2a1a1a'],
  ['#3a3a5a', '#1a1a2a'],
];

const TURN_TIMEOUT_MS = 30_000;

export default class PokerRoom implements Party.Server {
  private state: GameState | null = null;
  /** connId → seatIdx */
  private connToSeat = new Map<string, number>();
  /** seatIdx → connId（反查） */
  private seatToConn = new Map<number, string>();
  /** seatIdx → accountId（用于重连） */
  private seatToAccount = new Map<number, string>();
  private hostAccountId: string | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  /** 断线宽限期定时器：seatIdx → timer。在窗口内重连可避免被标 sittingOut */
  private disconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(readonly room: Party.Room) {}

  /** 创建初始 9 人座位（全部空位），等真人加入 */
  private buildEmptyPlayers(_config: RoomConfig): Player[] {
    const players: Player[] = [];
    for (let i = 0; i < 9; i++) {
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
        totalBuyIn: 0,
        handsPlayed: 0,
        showCardsEnabled: false,
        revealCards: false,
        ready: false,
      });
    }
    return players;
  }

  /** 找一个空座位给真人；优先非 hero 的低号 */
  private findEmptySeat(): number {
    if (!this.state) return -1;
    // 0 号位是 host 默认入座点；其他真人从 1 开始挤进 AI 之间未占用的位置
    for (let i = 0; i < 9; i++) {
      const p = this.state.players[i];
      if (p.isSittingOut && !p.isAI) return i;
    }
    return -1;
  }

  onConnect(conn: Party.Connection) {
    // 客户端连上后等 join 消息，不立刻发 state
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMsg;
    try { msg = JSON.parse(message); } catch { return; }

    if (msg.type === 'join') {
      this.handleJoin(msg, sender);
      return;
    }

    if (!this.state) {
      this.send(sender, { type: 'error', message: '房间未初始化' });
      return;
    }

    const seat = this.connToSeat.get(sender.id);
    if (seat === undefined) {
      this.send(sender, { type: 'error', message: '未入座' });
      return;
    }

    switch (msg.type) {
      case 'action': {
        if (this.state.toActSeat !== seat) return;
        this.dispatch(seat, msg.kind, msg.amount);
        break;
      }
      case 'startHand': {
        // 仅 host 能开新一手
        const acct = this.seatToAccount.get(seat);
        if (acct !== this.hostAccountId) return;
        // 必须至少 2 个真人座位 ready
        const realPlayers = this.state.players.filter((p) => !p.isSittingOut && !p.isAI && p.accountId);
        if (realPlayers.length < 2) {
          this.send(sender, { type: 'error', message: '至少需要 2 个真人玩家' });
          return;
        }
        const allReady = realPlayers.every((p) => p.ready);
        if (!allReady) {
          this.send(sender, { type: 'error', message: '还有玩家未准备' });
          return;
        }
        this.state = startNewHand(this.state);
        this.broadcastState();
        this.scheduleAI();
        this.scheduleTurnTimeout();
        break;
      }
      case 'toggleReady': {
        const p = this.state.players[seat];
        const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
        next.players[seat] = { ...p, ready: !p.ready };
        this.state = next;
        this.broadcastState();
        break;
      }
      case 'rebuy': {
        const before = this.state.players[seat]?.stack ?? 0;
        this.state = rebuyPlayer(this.state, seat);
        this.broadcastState();
        const after = this.state.players[seat]?.stack ?? 0;
        // 已开局后没有“重新准备/开始”流程：如果当前因人数不足或破产处于等待，
        // 补码成功后立即尝试自动续下一手。
        if (after > before && this.state.handNumber > 0 && (this.state.street === 'idle' || (this.state.street as any) === 'paused')) {
          this.tryStartNextHand();
        }
        break;
      }
      case 'runItVote': {
        const next = voteRunIt(this.state, seat, msg.count);
        this.state = next;
        this.broadcastState();
        if (next.street === 'showdown' && next.winners) {
          this.scheduleNextHandAfterShowdown(next);
        }
        break;
      }
      case 'toggleShow': {
        const p = this.state.players[seat];
        const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
        next.players[seat] = { ...p, showCardsEnabled: !p.showCardsEnabled };
        this.state = next;
        this.broadcastState();
        break;
      }
      case 'reaction': {
        this.broadcastReaction(seat, msg.reactionId || 'wink');
        break;
      }
      case 'tomato': {
        if (this.isValidTomatoTarget(msg.targetSeatIdx)) {
          this.broadcastTomato(seat, msg.targetSeatIdx);
        }
        break;
      }
      case 'leave': {
        // 主动离开：保留 stack/name 用于积分榜（hasLeft 标记），不再参与发牌
        if (this.state.toActSeat === seat) {
          this.dispatch(seat, 'fold');
        }
        const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
        next.players[seat] = {
          ...next.players[seat],
          hasLeft: true,
          isSittingOut: true,
          ready: false,
          // stack/name/accountId 保留：积分榜结算时仍能显示离开者最终筹码
        };

        // 房主转移：如果是房主离开，立即把房主权移给下一个仍在场的真人
        if (seat === next.hostSeatIdx) {
          const newHost = next.players.find((p) =>
            p.accountId && !p.hasLeft && !p.isSittingOut && !p.isAI && p.seatIdx !== seat,
          );
          if (newHost) {
            next.hostSeatIdx = newHost.seatIdx;
            this.hostAccountId = newHost.accountId;
          }
        }

        this.state = next;
        this.connToSeat.delete(sender.id);
        this.seatToConn.delete(seat);
        // 主动离开是显式行为，立刻取消可能存在的断线宽限定时器
        const pendingTimer = this.disconnectTimers.get(seat);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          this.disconnectTimers.delete(seat);
        }
        // 不删 seatToAccount：保留账号绑定，避免重连时被识别成新人占别的位置
        this.broadcastState();

        // 离开后人数不足 → 进入暂停等待（如果当前在牌局中且只剩 1 人，等当前手 finalize 后会自然走 tryStartNextHand）
        // 如果当前已经是 idle / 等待中，立即评估
        if (this.state.street === 'idle' || this.state.street === 'paused') {
          this.tryStartNextHand();
        }
        break;
      }
    }
  }

  onClose(conn: Party.Connection) {
    const seat = this.connToSeat.get(conn.id);
    if (seat === undefined) return;
    this.connToSeat.delete(conn.id);
    this.seatToConn.delete(seat);
    if (!this.state) return;

    // 若当前正轮到他行动 → 立即自动 fold，避免阻塞牌局
    if (this.state.toActSeat === seat) {
      this.dispatch(seat, 'fold');
    }

    // 断线宽限期：不立刻 isSittingOut，给玩家短暂窗口重连。
    // 这样 showdown→tryStartNextHand 间隙的瞬时断线 / 切换网络 不会让"还能继续打"被误判为离场，
    // 进而导致整桌进入 paused 并清空 ready 状态。
    const GRACE_MS = 8000;
    const existing = this.disconnectTimers.get(seat);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(seat);
      // 真的没回来：标 sittingOut（下一手不发牌；保留账号绑定，未来仍可重连）
      if (!this.state) return;
      // 如果这期间该 seat 已被新连接占用（重连成功），就不标
      if (this.seatToConn.has(seat)) return;
      const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
      next.players[seat] = { ...next.players[seat], isSittingOut: true };
      this.state = next;
      this.broadcastState();

      if (this.state.street === 'idle' || (this.state.street as any) === 'paused') {
        this.tryStartNextHand();
      }
    }, GRACE_MS);
    this.disconnectTimers.set(seat, timer);
  }

  // ============ 内部 ============

  private handleJoin(msg: JoinPayload, sender: Party.Connection) {
    // 第一个 join 的人是 host：创建状态
    if (!this.state) {
      if (!msg.config) {
        this.send(sender, { type: 'error', message: '房间不存在，需要 host 创建' });
        return;
      }
      const players = this.buildEmptyPlayers(msg.config);
      // host 占 0 号位，默认未准备（host 也要点准备）
      players[0] = {
        ...players[0],
        accountId: msg.user.id,
        name: msg.user.name,
        avatar: msg.user.avatar,
        colorPair: msg.user.colorPair,
        isAI: false,
        isHero: false,
        stack: msg.config.startingStack,
        rebuysLeft: msg.config.maxRebuys,
        totalBuyIn: msg.config.startingStack,
        handsPlayed: 0,
        isSittingOut: false,
        ready: false,
      };
      this.state = createInitialState(players, msg.config, 0);
      this.hostAccountId = msg.user.id;
      this.connToSeat.set(sender.id, 0);
      this.seatToConn.set(0, sender.id);
      this.seatToAccount.set(0, msg.user.id);
      // host 进来不自动开手；等所有人准备后房主点开始
      this.send(sender, { type: 'state', state: this.viewFor(0), mySeatIdx: 0 });
      return;
    }

    // 后续加入者：检查是否已有该 accountId（重连 / 同账号挤占场景）
    let assignedSeat = -1;
    for (const [seat, acct] of this.seatToAccount) {
      if (acct === msg.user.id) {
        assignedSeat = seat;
        break;
      }
    }

    // 同账号已经在线 → 挤占：关闭旧连接
    if (assignedSeat !== -1) {
      const oldConnId = this.seatToConn.get(assignedSeat);
      if (oldConnId && oldConnId !== sender.id) {
        for (const conn of this.room.getConnections()) {
          if (conn.id === oldConnId) {
            try {
              this.send(conn, { type: 'error', message: '账号在别处登录' });
              conn.close();
            } catch { /* ignore */ }
            this.connToSeat.delete(oldConnId);
            break;
          }
        }
      }
    }

    if (assignedSeat === -1) {
      // 找空位
      assignedSeat = this.findEmptySeat();
      if (assignedSeat === -1) {
        this.send(sender, { type: 'error', message: '房间已满' });
        return;
      }
      // 占座
      // 一旦房间开过局（handNumber > 0），新人不再走"准备/开始"流程：
      // 直接以 ready=true 入场，由服务端尽可能自动接续下一手。
      const gameAlreadyStarted = this.state.handNumber > 0;
      const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
      next.players[assignedSeat] = {
        ...next.players[assignedSeat],
        accountId: msg.user.id,
        name: msg.user.name,
        avatar: msg.user.avatar,
        colorPair: msg.user.colorPair,
        stack: this.state.config.startingStack,
        rebuysLeft: this.state.config.maxRebuys,
        totalBuyIn: this.state.config.startingStack,
        handsPlayed: 0,
        isAI: false,
        isSittingOut: false,
        ready: gameAlreadyStarted ? true : false,
      };
      this.state = next;
      this.seatToAccount.set(assignedSeat, msg.user.id);
    } else {
      // 重连，恢复 isSittingOut=false，并取消断线宽限定时器
      const pendingTimer = this.disconnectTimers.get(assignedSeat);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.disconnectTimers.delete(assignedSeat);
      }
      const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
      next.players[assignedSeat] = { ...next.players[assignedSeat], isSittingOut: false };
      this.state = next;
    }

    this.connToSeat.set(sender.id, assignedSeat);
    this.seatToConn.set(assignedSeat, sender.id);

    this.send(sender, { type: 'state', state: this.viewFor(assignedSeat), mySeatIdx: assignedSeat });
    this.broadcastState();

    // 如果房间已经开过局且当前处于暂停（人不够），新人加入 / 重连后立即尝试自动续局。
    if (this.state.handNumber > 0 && (this.state.street === 'idle' || (this.state.street as any) === 'paused')) {
      this.tryStartNextHand();
    }
  }

  private dispatch(seatIdx: number, kind: ActionKind, amount?: number) {
    if (!this.state) return;
    const next = applyAction(this.state, seatIdx, kind, amount);
    this.state = next;
    this.broadcastState();

    if (next.street === 'showdown' && next.winners) {
      this.scheduleNextHandAfterShowdown(next);
    } else {
      this.scheduleAI();
      this.scheduleTurnTimeout();
    }
  }

  private scheduleNextHandAfterShowdown(state: GameState) {
    const isMultiway = state.players.filter((p) => !p.hasFolded).length > 1;
    const runCount = state.runIt?.status === 'complete' ? (state.runIt.runCount || 1) : 1;
    const remainingRunCards = Math.max(0, 5 - (state.runIt?.baseCommunity.length ?? state.community.length));
    // 必须和前端逐条 RUN / 逐张牌展示节奏保持一致，否则服务端会过早开下一手，
    // 看起来就像跑马没有多次发牌、直接结算。
    const runExtra = runCount > 1 ? runCount * (remainingRunCards * 420 + 1300) + 700 : 0;
    const dur = (isMultiway ? 5000 : 4000) + runExtra;
    setTimeout(() => {
      if (!this.state) return;
      if (this.state.handNumber !== state.handNumber) return;
      if (this.state.endingAfterHand) return;
      this.tryStartNextHand();
    }, dur);
  }

  /**
   * 尝试开新一手；当前能立刻参与发牌的玩家不足 2 人时进入 paused 等待状态。
   *
   * 注意："能立刻参与发牌"的判定与 engine.startNewHand 中的 eligible 保持一致：
   *   p.stack > 0 && !p.outOfChips && !p.isSittingOut
   * 已经破产但还能补码的玩家虽然没"离场"，但本手发牌时不会被发到，
   * 因此不算"立刻能玩的"。这样可以避免 startNewHand 内部因 eligible<2 默默回到
   * idle 但 waitingToStart 没被正确设置的尴尬状态。
   */
  private tryStartNextHand() {
    if (!this.state) return;
    const eligible = this.state.players.filter(
      (p) => p.accountId && !p.hasLeft && !p.isSittingOut && !p.outOfChips && p.stack > 0,
    );

    if (eligible.length < 2) {
      // 暂停等待新人加入 / 已破产玩家补码
      this.enterPaused();
      return;
    }

    // 自动开下一手
    this.state = startNewHand(this.state);
    this.broadcastState();
    this.scheduleAI();
    this.scheduleTurnTimeout();
  }

  /** 进入暂停等待状态 */
  private enterPaused() {
    if (!this.state) return;
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    const next = { ...this.state, players: this.state.players.map((p) => ({ ...p })) };
    next.street = 'paused' as any;
    next.waitingToStart = true;
    next.toActSeat = -1;
    // 注意：保留每个真人原有的 ready 状态。
    // ready 表示"愿意继续在房间里玩"，并非"愿意打这一局"。
    // 上局结束后人数恰好不足时，玩家不应该被迫重新点一次准备（尤其不应被瞬时断线/重连误清除）。
    // 一旦人数重新凑齐（>=2 且都 ready），tryStartNextHand 会自然驱动下一手。
    // 房主转移：若当前 host 已离场或不在线，找第一个仍在场的真人当 host
    const currentHost = next.players[next.hostSeatIdx];
    if (!currentHost || currentHost.hasLeft || currentHost.isSittingOut || !currentHost.accountId) {
      const newHost = next.players.find((p) => p.accountId && !p.hasLeft && !p.isSittingOut && !p.isAI);
      if (newHost) {
        next.hostSeatIdx = newHost.seatIdx;
        this.hostAccountId = newHost.accountId;
      }
    }
    this.state = next;
    this.broadcastState();
  }

  private dispatchOld(seatIdx: number, kind: ActionKind, amount?: number) {
    // legacy placeholder (unused)
    void seatIdx; void kind; void amount;
  }

  private scheduleAI() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
    if (!this.state) return;
    const seat = this.state.toActSeat;
    if (seat < 0) return;
    const player = this.state.players[seat];
    if (!player.isAI) return;
    const delay = 600 + Math.random() * 900;
    this.aiTimer = setTimeout(() => {
      if (!this.state || this.state.toActSeat !== seat) return;
      const personality = AI_PERSONALITIES[seat % AI_PERSONALITIES.length];
      const decision = decideAI(this.state, seat, personality);
      this.dispatch(seat, decision.kind, decision.amount);
    }, delay);
  }

  private scheduleTurnTimeout() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    if (!this.state) return;
    const seat = this.state.toActSeat;
    if (seat < 0) return;
    const player = this.state.players[seat];
    if (player.isAI) return; // AI 自带思考延迟
    this.turnTimer = setTimeout(() => {
      if (!this.state || this.state.toActSeat !== seat) return;
      // 真人超时：能 check 就 check，不能 check 就 fold
      const toCall = this.state.currentBet - player.betThisRound;
      this.dispatch(seat, toCall > 0 ? 'fold' : 'check');
    }, TURN_TIMEOUT_MS);
  }

  /** 给指定座位生成 per-player view（隐藏其他人手牌） */
  private viewFor(seatIdx: number): GameState {
    if (!this.state) return null as any;
    const players = this.state.players.map((p) => {
      // 自己始终可见；其他玩家只有引擎明确 revealCards 时才发送真牌。
      // 多人摊牌会在 revealShowdownCards 中把未弃牌玩家置为 reveal；一人收池则尊重秀牌开关。
      const canSeeCards = p.seatIdx === seatIdx || p.revealCards;
      if (canSeeCards) return p;
      return p.holeCards.length === 2
        ? { ...p, holeCards: HIDDEN_HOLE_CARDS.map((card) => ({ ...card })) }
        : { ...p, holeCards: [] as any };
    });
    return { ...this.state, players };
  }

  private broadcastState() {
    if (!this.state) return;
    for (const conn of this.room.getConnections()) {
      const seat = this.connToSeat.get(conn.id);
      if (seat === undefined) continue;
      this.send(conn, { type: 'state', state: this.viewFor(seat), mySeatIdx: seat });
    }
  }

  private broadcastReaction(seatIdx: number, reactionId: string) {
    for (const conn of this.room.getConnections()) {
      if (!this.connToSeat.has(conn.id)) continue;
      this.send(conn, { type: 'reaction', seatIdx, reactionId });
    }
  }

  private isValidTomatoTarget(targetSeatIdx: number) {
    if (!this.state) return false;
    const p = this.state.players[targetSeatIdx];
    return !!p && !!p.accountId && !p.isSittingOut && !p.hasLeft;
  }

  private broadcastTomato(fromSeatIdx: number, targetSeatIdx: number) {
    for (const conn of this.room.getConnections()) {
      if (!this.connToSeat.has(conn.id)) continue;
      this.send(conn, { type: 'tomato', fromSeatIdx, targetSeatIdx });
    }
  }

  private send(conn: Party.Connection, msg: ServerMsg) {
    try { conn.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }
}
