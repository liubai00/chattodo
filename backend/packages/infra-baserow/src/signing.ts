import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export interface SignedRequestInput {
  readonly method: string
  readonly path: string
  readonly timestamp: string
  readonly nonce: string
  readonly body: unknown
}

function canonicalValue(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(object[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(null)
}

export function canonicalJson(value: unknown): string {
  return canonicalValue(value)
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function requestSignature(secret: string, input: SignedRequestInput): string {
  const canonical = [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    sha256(canonicalJson(input.body)),
  ].join('\n')
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')
}

export function secureHex(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}

export function safeHexEqual(actual: string, expected: string): boolean {
  try {
    const a = Buffer.from(actual, 'hex')
    const b = Buffer.from(expected, 'hex')
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
