// Central config, read from environment (loaded via --env-file-if-exists=.env).
// AI fields seed the runtime ai_config row on first boot; after that the
// active config lives in the DB and is editable via /api/ai/config.
export const config = {
  port: Number(process.env.PORT) || 8787,
  host: process.env.HOST || '127.0.0.1',
  dbPath: process.env.DB_PATH || './data/chattodo.db',
  defaultUserId: process.env.DEFAULT_USER_ID || 'u_default',
  ai: {
    provider: process.env.AI_PROVIDER || 'rule', // rule | openai | anthropic
    baseUrl: process.env.AI_BASE_URL || '',
    model: process.env.AI_MODEL || '',
    apiKey: process.env.AI_API_KEY || '',
    fallbackToRule: (process.env.AI_FALLBACK_TO_RULE || 'true') !== 'false',
  },
}
