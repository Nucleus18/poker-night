/**
 * Socket Adapter：连 PartyKit 服务端
 * - 服务端权威：所有动作发到服务端，等服务端广播 state 回来才更新本地
 * - 自动重连
 * - 服务端给每个玩家发 per-player view（手牌防作弊）
 */
import PartySocket from 'partysocket';
import type { GameState, ActionKind, RoomConfig, RunItCount } from '@/engine/types';
import type { IAdapter, Listener, ConnectionStatus } from './types';

export interface SocketAdapterParams {
  host: string;          // 例如 'localhost:1999' 或 'poker-party.xxx.partykit.dev'
  roomCode: string;      // 6 位房间码
  user: { id: string; name: string; avatar: string; colorPair: [string, string] };
  config?: RoomConfig;   // 仅 host 携带（创建房间）
  soundCb?: (event: string) => void;
}

interface ServerStateMsg { type: 'state'; state: GameState; mySeatIdx: number }
interface ServerErrorMsg { type: 'error'; message: string }
type ServerMsg = ServerStateMsg | ServerErrorMsg;

export class SocketAdapter implements IAdapter {
  mySeatIdx: number = -1;
  private state: GameState | null = null;
  private prevStreet: string | null = null;
  private listeners: Set<Listener> = new Set();
  private status: ConnectionStatus = 'connecting';
  private socket: PartySocket;
  private soundCb?: (e: string) => void;
  private joinPayload: SocketAdapterParams;
  private statusListeners: Set<(s: ConnectionStatus) => void> = new Set();
  private errorListeners: Set<(msg: string) => void> = new Set();

  constructor(params: SocketAdapterParams) {
    this.joinPayload = params;
    this.soundCb = params.soundCb;

    this.socket = new PartySocket({
      host: params.host,
      room: params.roomCode,
      party: 'poker',
    });

    this.socket.addEventListener('open', () => {
      this.setStatus('open');
      // 连上立刻发 join
      this.socket.send(JSON.stringify({
        type: 'join',
        user: params.user,
        config: params.config,
      }));
    });

    this.socket.addEventListener('message', (ev) => {
      try {
        const msg: ServerMsg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
        this.handleServerMsg(msg);
      } catch { /* ignore */ }
    });

    this.socket.addEventListener('close', () => this.setStatus('reconnecting'));
    this.socket.addEventListener('error', () => this.setStatus('reconnecting'));
  }

  getConnectionStatus(): ConnectionStatus { return this.status; }
  getState(): GameState | null { return this.state; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.state) fn(this.state);
    return () => this.listeners.delete(fn);
  }

  /** 监听连接状态变化（UI 用） */
  onStatusChange(fn: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  onError(fn: (msg: string) => void): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  private emit() { if (this.state) this.listeners.forEach((l) => l(this.state!)); }

  private handleServerMsg(msg: ServerMsg) {
    if (msg.type === 'error') {
      this.errorListeners.forEach((l) => l(msg.message));
      return;
    }
    if (msg.type === 'state') {
      this.mySeatIdx = msg.mySeatIdx;
      const prev = this.state;
      this.state = msg.state;

      // 触发音效（基于 state 变化）
      if (this.soundCb && prev) {
        const newAction = msg.state.players[msg.state.toActSeat]?.lastAction
          || msg.state.players.find((p) => p.lastAction && Date.now() - p.lastAction.ts < 500)?.lastAction;
        // 简单做法：检测 street 变化触发发牌音
        if (msg.state.street !== this.prevStreet) {
          if (msg.state.street === 'preflop' || msg.state.street === 'flop' || msg.state.street === 'turn' || msg.state.street === 'river') {
            this.soundCb('deal');
          } else if (msg.state.street === 'showdown') {
            this.soundCb('win');
          }
        }
      }
      this.prevStreet = msg.state.street;
      this.emit();
    }
  }

  startHand() {
    this.socket.send(JSON.stringify({ type: 'startHand' }));
  }

  toggleReady() {
    this.socket.send(JSON.stringify({ type: 'toggleReady' }));
  }

  hero(kind: ActionKind, amount?: number) {
    if (!this.state || this.state.toActSeat !== this.mySeatIdx) return;
    this.socket.send(JSON.stringify({ type: 'action', kind, amount }));
  }

  toggleShowCards() {
    this.socket.send(JSON.stringify({ type: 'toggleShow' }));
  }

  runItVote(count: RunItCount) {
    this.socket.send(JSON.stringify({ type: 'runItVote', count }));
  }

  rebuy() {
    this.socket.send(JSON.stringify({ type: 'rebuy' }));
  }

  leave() {
    try { this.socket.send(JSON.stringify({ type: 'leave' })); } catch { /* ignore */ }
  }

  destroy() {
    this.socket.close();
    this.listeners.clear();
    this.statusListeners.clear();
    this.errorListeners.clear();
  }
}
