// Per-message reasoning depth. Each level maps onto the provider's native
// reasoning-effort parameter: Claude `output_config.effort`, OpenAI `reasoning_effort`.

export const THINKING_LEVELS = {
  fast: { label: 'Fast', claudeEffort: 'low', openaiEffort: 'low' },
  balanced: { label: 'Balanced', claudeEffort: 'medium', openaiEffort: 'medium' },
  deep: { label: 'Deep', claudeEffort: 'high', openaiEffort: 'high' },
};

export const THINKING_IDS = Object.keys(THINKING_LEVELS);
export const DEFAULT_THINKING = 'balanced';

export const isThinkingLevel = (value) => THINKING_IDS.includes(value);
