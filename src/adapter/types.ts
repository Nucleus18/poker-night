/**
 * Adapter 抽象接口
 *
 * - LocalAdapter（一期）：本地引擎 + AI，hero 永远在座位 0
 * - SocketAdapter（二期）：连 PartyKit 服务端，hero 座位由服务器分配
 *
 * RoomPage 只依赖此接口，UI 完全不感知是本地还是联机
 */
import type { GameState, ActionKind, RunItCount } from '@/engine/types';

export type Listener = (state: GameState) => void;

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface IAdapter {
  /** 当前 hero 在桌上的座位（本地恒为 0；联机由服务器分配） */
  readonly mySeatIdx: number;

  /** 当前连接状态（本地永远是 'open'） */
  getConnectionStatus(): ConnectionStatus;

  /** 当前游戏状态 */
  getState(): GameState | null;

  /** 订阅状态变化 */
  subscribe(fn: Listener): () => void;

  /** 主动开新一手（仅 host / 本地） */
  startHand(): void;

  /** Hero 行动 */
  hero(kind: ActionKind, amount?: number): void;

  /** Hero 切换秀牌偏好 */
  toggleShowCards(): void;

  /** Hero 切换"准备"状态（仅在线房间有意义） */
  toggleReady(): void;

  /** 跑马投票（1/2/3 次） */
  runItVote(count: RunItCount): void;

  /** Hero 补码 */
  rebuy(): void;

  /** 主动离开房间（联机：通知服务端清座；本地：no-op） */
  leave?(): void;

  /** 清理资源（取消订阅、关闭连接、清定时器） */
  destroy(): void;
}
