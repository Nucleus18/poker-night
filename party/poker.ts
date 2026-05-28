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
import type { GameState, Player, RoomConfig, ActionKind } from '../src/engine/types';
import { applyAction, startNewHand, createInitialState, rebuyPlayer } from '../src/engine/engine';
import { AI_PERSONALITIES, decideAI } from '../src/ai/decide';

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
  | { type: 'toggleShow' }
  | { type: 'leave' };

type ServerMsg =
  | { type: 'state'; state: GameState; mySeatIdx: number }
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
        this.state = rebuyPlayer(this.state, seat);
        this.broadcastState();
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
        this.state = next;
        this.connToSeat.delete(sender.id);
        this.seatToConn.delete(seat);
        // 不删 seatToAccount：保留账号绑定，避免重连时被识别成新人占别的位置
        this.broadcastState();
        break;
      }
    }
  }

  onClose(conn: Party.Connection) {
    const seat = this.connToSeat.get(conn.id);
    if (seat === undefined) return;
    this.connToSeat.delete(conn.id);
    this.seatToConn.delete(seat);
    // 不立刻 remove player：保留座位等他重连。如果当前是他的回合，标 sittingOut → 引擎兜底跳过
    // 简单做法：把他变成 isSittingOut=true，下手不再发牌
    if (this.state) {
      const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
      // 若当前正轮到他行动 → 自动 fold
      if (this.state.toActSeat === seat) {
        this.dispatch(seat, 'fold');
      }
      // 标记离场（下一手不发牌；如果他重连可恢复）
      next.players[seat] = { ...next.players[seat], isSittingOut: true };
      this.state = next;
      this.broadcastState();
    }
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
      // 占座（默认未准备，需要手动点准备）
      const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
      next.players[assignedSeat] = {
        ...next.players[assignedSeat],
        accountId: msg.user.id,
        name: msg.user.name,
        avatar: msg.user.avatar,
        colorPair: msg.user.colorPair,
        stack: this.state.config.startingStack,
        rebuysLeft: this.state.config.maxRebuys,
        isAI: false,
        isSittingOut: false,
        ready: false,
      };
      this.state = next;
      this.seatToAccount.set(assignedSeat, msg.user.id);
    } else {
      // 重连，恢复 isSittingOut=false
      const next = { ...this.state, players: this.state.players.map((pp) => ({ ...pp })) };
      next.players[assignedSeat] = { ...next.players[assignedSeat], isSittingOut: false };
      this.state = next;
    }

    this.connToSeat.set(sender.id, assignedSeat);
    this.seatToConn.set(assignedSeat, sender.id);

    this.send(sender, { type: 'state', state: this.viewFor(assignedSeat), mySeatIdx: assignedSeat });
    this.broadcastState();
  }

  private dispatch(seatIdx: number, kind: ActionKind, amount?: number) {
    if (!this.state) return;
    const next = applyAction(this.state, seatIdx, kind, amount);
    this.state = next;
    this.broadcastState();

    if (next.street === 'showdown' && next.winners) {
      // 自动开下一手（4-5s 给客户端展示）
      const isMultiway = next.players.filter((p) => !p.hasFolded).length > 1;
      const dur = isMultiway ? 5000 : 4000;
      setTimeout(() => {
        if (!this.state) return;
        if (this.state.endingAfterHand) return;
        // 开新一手前清理破产但不补码的人（保持座位但 isSittingOut）
        this.state = startNewHand(this.state);
        this.broadcastState();
        this.scheduleAI();
        this.scheduleTurnTimeout();
      }, dur);
    } else {
      this.scheduleAI();
      this.scheduleTurnTimeout();
    }
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
    const isShowdown = this.state.street === 'showdown';
    const players = this.state.players.map((p) => {
      // 自己 / showdown reveal / 已主动 reveal 的玩家：发完整手牌
      const canSeeCards = p.seatIdx === seatIdx
        || (isShowdown && (!p.hasFolded || p.revealCards))
        || p.revealCards;
      return canSeeCards ? p : { ...p, holeCards: [] as any };
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

  private send(conn: Party.Connection, msg: ServerMsg) {
    try { conn.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }
}
