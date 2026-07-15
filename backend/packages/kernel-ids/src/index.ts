// @linx/kernel-ids — UUIDv7 生成 + 前缀化 typed-id 工厂（修 P6：替代 makeId 的 process-counter+base36）。
// UUIDv7 = 48bit 毫秒时间戳（时间有序，利于 DB 主键/keyset 分页）+ 版本/变体位 + 随机。
import { randomFillSync } from 'node:crypto'
import type { Brand } from '@linx/kernel-types'

export type Uuid = Brand<string, 'Uuid'>

const HEX: string[] = []
for (let i = 0; i < 256; i++) HEX.push(i.toString(16).padStart(2, '0'))

/**
 * 生成 UUIDv7。
 * @param now 毫秒时间戳，默认当前时间；显式注入以便测试确定化。
 */
export function uuidv7(now: number = Date.now()): Uuid {
  const bytes = new Uint8Array(16)
  randomFillSync(bytes)

  const ts = BigInt(now)
  bytes[0] = Number((ts >> 40n) & 0xffn)
  bytes[1] = Number((ts >> 32n) & 0xffn)
  bytes[2] = Number((ts >> 24n) & 0xffn)
  bytes[3] = Number((ts >> 16n) & 0xffn)
  bytes[4] = Number((ts >> 8n) & 0xffn)
  bytes[5] = Number(ts & 0xffn)
  // version 7（高 4 位）
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  // variant 10xx
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  let s = ''
  for (let i = 0; i < 16; i++) {
    s += HEX[bytes[i]!]!
    if (i === 3 || i === 5 || i === 7 || i === 9) s += '-'
  }
  return s as Uuid
}

/**
 * 前缀化 typed-id 工厂：`makePrefixedId('task')` → `(now?) => 'task_<uuidv7>'`。
 * 兼具可读前缀（调试/日志）与 UUIDv7 时间有序性。
 */
export function makePrefixedId<P extends string>(prefix: P): (now?: number) => `${P}_${string}` {
  return (now?: number) => `${prefix}_${uuidv7(now)}`
}
