/**
 * 内置 10 个账号 + 默认昵称。
 * 一期写在前端，二期挪到服务器。
 * 资料（昵称/头像）可在登录后修改，按账号 ID 持久化到 localStorage。
 */
export interface BuiltinAccount {
  id: string;          // 登录用的账号 ID
  password: string;    // 登录密码
  defaultName: string; // 默认昵称
}

export const BUILTIN_ACCOUNTS: BuiltinAccount[] = [
  { id: 'player01', password: 'poker01', defaultName: 'Ace' },
  { id: 'player02', password: 'poker02', defaultName: 'King' },
  { id: 'player03', password: 'poker03', defaultName: 'Queen' },
  { id: 'player04', password: 'poker04', defaultName: 'Jack' },
  { id: 'player05', password: 'poker05', defaultName: 'Ten' },
  { id: 'player06', password: 'poker06', defaultName: 'Nine' },
  { id: 'player07', password: 'poker07', defaultName: 'Eight' },
  { id: 'player08', password: 'poker08', defaultName: 'Seven' },
  { id: 'player09', password: 'poker09', defaultName: 'Six' },
  { id: 'player10', password: 'poker10', defaultName: 'Five' },
];

export function findAccount(id: string, password: string): BuiltinAccount | undefined {
  return BUILTIN_ACCOUNTS.find((a) => a.id === id && a.password === password);
}
