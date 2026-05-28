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
  { id: 'player01', password: 'poker01', defaultName: '金勾勾' },
  { id: 'player02', password: 'poker02', defaultName: '刘强东' },
  { id: 'player03', password: 'poker03', defaultName: '动感超人' },
  { id: 'player04', password: 'poker04', defaultName: 'DWan' },
  { id: 'player05', password: 'poker05', defaultName: '释永信' },
  { id: 'player06', password: 'poker06', defaultName: '清爽' },
  { id: 'player07', password: 'poker07', defaultName: '奋斗一个亿' },
  { id: 'player08', password: 'poker08', defaultName: '曾经的王king' },
  { id: 'player09', password: 'poker09', defaultName: '不让人在我目前梭哈' },
  { id: 'player10', password: 'poker10', defaultName: '真正的man' },
];

export function findAccount(id: string, password: string): BuiltinAccount | undefined {
  return BUILTIN_ACCOUNTS.find((a) => a.id === id && a.password === password);
}
