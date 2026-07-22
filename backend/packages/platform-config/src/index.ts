// @linx/platform-config — Zod env schema，boot fail-fast（修 P8：config.js 读 process.env 无校验）。
// 字段对齐现网 server/src/config.js，便于 P1 兼容；URL 形态初筛（SSRF 深检在 platform-llm）。
import { z } from 'zod'
import { AppError } from '@linx/kernel-errors'

const httpUrlOrEmpty = z
  .string()
  .refine((v) => v === '' || /^https?:\/\//i.test(v), { message: '必须是 http(s):// URL 或空串' })

const redisUrlOrEmpty = z
  .string()
  .refine((v) => v === '' || /^rediss?:\/\//i.test(v), { message: '必须是 redis(s):// URL 或空串' })

export const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(8787),
    HOST: z.string().min(1).default('127.0.0.1'),
    DATABASE_URL: z.string().default(''),
    PGLITE_DIR: z.string().default('./data/pgdata'),
    DEFAULT_USER_ID: z.string().min(1).default('u_default'),
    REDIS_URL: redisUrlOrEmpty.default(''),
    CORS_ORIGIN: z.string().default(''),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    AI_PROVIDER: z.enum(['rule', 'openai', 'anthropic']).default('rule'),
    AI_BASE_URL: httpUrlOrEmpty.default(''),
    AI_MODEL: z.string().default(''),
    AI_API_KEY: z.string().default(''),
    AI_FALLBACK_TO_RULE: z.enum(['true', 'false']).default('true'),
    TASK_BACKEND: z.enum(['legacy', 'baserow']).default('legacy'),
    BASEROW_INTERNAL_URL: httpUrlOrEmpty.default(''),
    BASEROW_PUBLIC_URL: httpUrlOrEmpty.default(''),
    BASEROW_SHARED_SECRET: z.string().default(''),
    LINX_PUBLIC_URL: httpUrlOrEmpty.default(''),
  })
  .superRefine((env, ctx) => {
    if (env.TASK_BACKEND !== 'baserow') return
    for (const key of ['BASEROW_INTERNAL_URL', 'BASEROW_PUBLIC_URL', 'LINX_PUBLIC_URL'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'TASK_BACKEND=baserow 时必填' })
    }
    if (env.BASEROW_SHARED_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['BASEROW_SHARED_SECRET'], message: '至少 32 个字符' })
    }
  })

export interface AppConfig {
  readonly port: number
  readonly host: string
  readonly databaseUrl: string
  readonly pgliteDir: string
  readonly defaultUserId: string
  readonly redisUrl: string
  readonly corsOrigin: string
  readonly logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  readonly tasks: {
    readonly backend: 'legacy' | 'baserow'
  }
  readonly baserow: {
    readonly internalUrl: string
    readonly publicUrl: string
    readonly sharedSecret: string
    readonly linxPublicUrl: string
  }
  readonly ai: {
    readonly provider: 'rule' | 'openai' | 'anthropic'
    readonly baseUrl: string
    readonly model: string
    readonly apiKey: string
    readonly fallbackToRule: boolean
  }
}

/** 从环境加载并校验配置；非法即抛 AppError（boot fail-fast）。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new AppError('VALIDATION', '环境配置非法（platform-config）', parsed.error.flatten())
  }
  const e = parsed.data
  return {
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    pgliteDir: e.PGLITE_DIR,
    defaultUserId: e.DEFAULT_USER_ID,
    redisUrl: e.REDIS_URL,
    corsOrigin: e.CORS_ORIGIN,
    logLevel: e.LOG_LEVEL,
    tasks: {
      backend: e.TASK_BACKEND,
    },
    baserow: {
      internalUrl: e.BASEROW_INTERNAL_URL,
      publicUrl: e.BASEROW_PUBLIC_URL,
      sharedSecret: e.BASEROW_SHARED_SECRET,
      linxPublicUrl: e.LINX_PUBLIC_URL,
    },
    ai: {
      provider: e.AI_PROVIDER,
      baseUrl: e.AI_BASE_URL,
      model: e.AI_MODEL,
      apiKey: e.AI_API_KEY,
      fallbackToRule: e.AI_FALLBACK_TO_RULE !== 'false',
    },
  }
}
