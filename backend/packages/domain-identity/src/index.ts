// @linx/domain-identity — 账户模型 + 仓储端口（承接 users 表 / services/auth.js 的用户管理部分）。
// 密码哈希/校验与会话由 platform-auth 提供；本 BC 只管 users 行本身。

export interface IdentityUser {
  id: string
  name: string
  accountName: string
  email: string
  role: string
  createdAt: string
}

/** 含密码哈希的原始行（仅登录校验用，绝不出接口）。 */
export interface IdentityUserRow extends IdentityUser {
  passwordHash: string
}

export interface IdentityRepo {
  /** 用户总数（首个注册者成为 admin）。 */
  countAll(): Promise<number>
  /** 按邮箱（小写）查原始行（含密码哈希）。 */
  findByEmail(emailLower: string): Promise<IdentityUserRow | undefined>
  get(id: string): Promise<IdentityUser | undefined>
  /** 建账号（account_name 默认取 name）。返回 id。 */
  create(input: { id?: string; name: string; email: string; passwordHash: string; role: string }): Promise<string>
  /** 分别更新称呼/账户名（仅非空键）。 */
  updateProfile(id: string, patch: { name?: string; accountName?: string }): Promise<IdentityUser | undefined>
  setPasswordHash(id: string, passwordHash: string): Promise<void>
}
