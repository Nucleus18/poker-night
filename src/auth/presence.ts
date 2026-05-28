/**
 * Presence Client：维护账号全局在线唯一性
 * - 登录后 connect()：连到 PartyKit 单例 room "global"，发 claim 消息
 * - 收到 kicked → 调用 onKicked 回调（auth store 触发强制登出）
 * - 登出 / 切账号 → disconnect()
 */
import PartySocket from 'partysocket';

let socket: PartySocket | null = null;
let currentAccountId: string | null = null;

const SESSION_ID = (() => {
  // 每个 tab 一个 sessionId（不持久化，关闭就丢）
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
})();

export function connectPresence(accountId: string, onKicked: (reason: string) => void) {
  // 同一账号重复 connect，直接复用
  if (socket && currentAccountId === accountId) return;
  // 切换账号：先关闭旧连接
  if (socket) {
    try { socket.close(); } catch { /* ignore */ }
    socket = null;
  }
  currentAccountId = accountId;

  const host = (import.meta as any).env?.VITE_PARTYKIT_HOST || 'localhost:1999';
  const ps = new PartySocket({
    host,
    party: 'presence',
    room: 'global',
  });

  ps.addEventListener('open', () => {
    ps.send(JSON.stringify({ type: 'claim', accountId, sessionId: SESSION_ID }));
  });

  ps.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data as string);
      if (msg.type === 'kicked') {
        onKicked(msg.reason || '账号在别处登录');
      }
    } catch { /* ignore */ }
  });

  socket = ps;
}

export function disconnectPresence() {
  if (socket) {
    try { socket.close(); } catch { /* ignore */ }
    socket = null;
  }
  currentAccountId = null;
}
