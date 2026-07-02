import { triageInputSync, detectIntent, extractCommandTarget } from './ruleProvider.js'
import { makeLlmProvider } from './llmProvider.js'

export { detectIntent, extractCommandTarget, triageInputSync }

// Triage via the configured provider. ctx.aiConfig (from the DB) selects the
// provider; without a configured key it falls back to the rule engine.
// LLM errors propagate so the caller can log them and decide on fallback.
export async function triageInput(text, ctx = {}) {
  const cfg = ctx.aiConfig
  if (cfg && cfg.provider && cfg.provider !== 'rule' && cfg.apiKey) {
    return makeLlmProvider(cfg).triageInput(text, ctx)
  }
  return triageInputSync(text)
}
