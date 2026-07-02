import crypto from 'node:crypto'
import { makeId, nowIso, daysFromNow } from '../lib/ids.js'

// Password hashing via Node's built-in scrypt (no extra dependency).
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  const h = crypto.scryptSync(String(pw), salt, 64)
  const expect = Buffer.from(hash, 'hex')
  return h.length === expect.length && crypto.timingSafeEqual(h, expect)
}

const SESSION_DAYS = 30

const DEFAULT_AGENT = {
  soul: '冷静、主动、尊重用户注意力。默认行动导向，不把参考信息伪装成任务。先给判断，再给下一步，回复简洁。',
  memory: '',
  preferences: '输出简洁；任务按截止时间和优先级排序；一次只追问一个最关键的问题。',
  workingStyle: 'GTD + 时间块。两小时为一个工作段，先难后易。',
  privacyRules: '工作 / 个人严格分离。隐私模式开启时，制定计划不读取个人范围数据。',
  followup: '任务不清楚时，只问一个最关键的问题：目标或完成标准。',
}

const toUser = (r) => r && { id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at }

export function makeAuth(db) {
  return {
    findByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase())
    },
    get(id) {
      return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
    },
    // Create the account plus its per-user defaults (agent profile, app
    // settings, welcome chat). First registered account becomes admin.
    register({ name, email, password }) {
      const normEmail = String(email).trim().toLowerCase()
      const first = db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0
      const id = makeId('u')
      const ts = nowIso()
      const tx = db.transaction(() => {
        db.prepare('INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)')
          .run(id, name, normEmail, hashPassword(password), first ? 'admin' : 'member', ts)
        db.prepare(`INSERT INTO agent_profile (user_id,soul,memory,preferences,working_style,privacy_rules,default_followup_strategy,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .run(id, DEFAULT_AGENT.soul, DEFAULT_AGENT.memory, DEFAULT_AGENT.preferences, DEFAULT_AGENT.workingStyle, DEFAULT_AGENT.privacyRules, DEFAULT_AGENT.followup, ts)
        db.prepare(`INSERT INTO app_settings (user_id,workspace_mode,privacy_mode,default_view,ai_visibility,updated_at) VALUES (?,?,?,?,?,?)`)
          .run(id, 'work', 0, 'chat', 'visible_scope_only', ts)
        db.prepare(`INSERT INTO chat_messages (id,user_id,role,text,is_error,created_at) VALUES (?,?,?,?,0,?)`)
          .run(makeId('msg'), id, 'agent', '欢迎使用 LinX 灵信。把任何想法丢给我，我会判断它是任务、待澄清想法，还是非 todo 信息。', ts)
      })
      tx()
      return this.get(id)
    },
    verifyLogin(email, password) {
      const row = this.findByEmail(email || '')
      if (!row || !verifyPassword(password || '', row.password_hash)) return null
      return toUser(row)
    },
    updateName(id, name) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
      return this.get(id)
    },
    // Verify the old password, then set the new one. Returns false on mismatch.
    changePassword(id, oldPassword, newPassword) {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      if (!row || !verifyPassword(oldPassword || '', row.password_hash)) return false
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), id)
      return true
    },
    createSession(userId) {
      const token = crypto.randomBytes(32).toString('hex')
      db.prepare('INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)')
        .run(token, userId, nowIso(), daysFromNow(SESSION_DAYS))
      return token
    },
    resolve(token) {
      const row = db.prepare(`
        SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?`).get(token, nowIso())
      return toUser(row)
    },
    logout(token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    },
  }
}
