/**
 * Presence Server：全局账号在线注册表（单例 Durable Object）
 *
 * 用途：保证一个 accountId 在全网任意时刻最多只有一个 session 在线。
 * 后登录的客户端会顶替前一个，前一个会收到 kicked 消息并被强制登出。
 *
 * 路由：所有客户端都连同一个房间 ID（"global"），通过 PartyKit 的命名空间
 *       /parties/presence/global 访问。
 */

import type * as Party from 'partykit/server';

interface ClaimMsg {
  type: 'claim';
  accountId: string;
  sessionId: string;        // 客户端 tab 唯一 id
}

interface ServerMsg {
  type: 'claimed' | 'kicked' | 'pong';
  reason?: string;
}

export default class PresenceServer implements Party.Server {
  /** accountId → 当前持有者的连接 id */
  private holders = new Map<string, string>();
  /** connId → accountId（反向索引，用于断线清理） */
  private connToAccount = new Map<string, string>();

  constructor(readonly room: Party.Room) {}

  onConnect(_conn: Party.Connection) {
    // 不做任何事，等客户端发 claim
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: ClaimMsg;
    try { msg = JSON.parse(message); } catch { return; }
    if (msg.type !== 'claim') return;
    if (!msg.accountId) return;

    const prevHolder = this.holders.get(msg.accountId);

    // 该账号已经被别人持有 → 踢前一个
    if (prevHolder && prevHolder !== sender.id) {
      for (const conn of this.room.getConnections()) {
        if (conn.id === prevHolder) {
          try {
            this.send(conn, { type: 'kicked', reason: '账号在别处登录' });
            conn.close();
          } catch { /* ignore */ }
          this.connToAccount.delete(prevHolder);
          break;
        }
      }
    }

    // 该连接之前持有别的 accountId（不太常见，登录切账号场景）→ 释放旧的
    const prevAccount = this.connToAccount.get(sender.id);
    if (prevAccount && prevAccount !== msg.accountId) {
      if (this.holders.get(prevAccount) === sender.id) {
        this.holders.delete(prevAccount);
      }
    }

    // 占据
    this.holders.set(msg.accountId, sender.id);
    this.connToAccount.set(sender.id, msg.accountId);
    this.send(sender, { type: 'claimed' });
  }

  onClose(conn: Party.Connection) {
    const account = this.connToAccount.get(conn.id);
    if (account && this.holders.get(account) === conn.id) {
      this.holders.delete(account);
    }
    this.connToAccount.delete(conn.id);
  }

  private send(conn: Party.Connection, msg: ServerMsg) {
    try { conn.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }
}
