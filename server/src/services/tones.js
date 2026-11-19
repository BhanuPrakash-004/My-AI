// Built-in tones. Each tone's instruction is appended to the system prompt as a
// "system instruction" modifier; users can override the text in the tone editor.

export const TONES = {
  professional: {
    label: 'Professional',
    defaultInstruction: [
      'Write in a polished, courteous, business-appropriate voice.',
      'Use complete sentences, precise vocabulary, and a clear structure (short headings or lists when the answer has several parts).',
      'Avoid slang, emoji, and jokes.',
    ].join(' '),
  },
  casual: {
    label: 'Casual',
    defaultInstruction: [
      'Write like a friendly, knowledgeable friend chatting over coffee.',
      'Use a relaxed, conversational voice with contractions and plain words; light humor is welcome and an occasional emoji is fine.',
      'Stay warm, but keep the information accurate and genuinely useful.',
    ].join(' '),
  },
  concise: {
    label: 'Concise',
    defaultInstruction: [
      'Give the shortest answer that fully addresses the question.',
      'Lead with the answer and cut preamble, pleasantries, hedging, and repetition.',
      'Prefer one or two sentences or a few tight bullet points, and keep most replies under 80 words unless the user explicitly asks for more detail.',
      'Include code only when it is the answer.',
    ].join(' '),
  },
};

export const TONE_IDS = Object.keys(TONES);
export const DEFAULT_TONE = 'professional';

export const isTone = (value) => TONE_IDS.includes(value);

export const BASE_SYSTEM_PROMPT = [
  'You are MyAi, a helpful AI assistant inside a chat app.',
  'Answer accurately and helpfully. If you are unsure about something, say so instead of guessing.',
  'Format with Markdown when it improves readability: lists, tables, and fenced code blocks with a language tag.',
].join(' ');

/**
 * Composes the system prompt for one request.
 * `instruction` is the user's custom text for the tone, if any.
 */
export function buildSystemPrompt(tone, instruction) {
  const id = isTone(tone) ? tone : DEFAULT_TONE;
  const text = instruction?.trim() || TONES[id].defaultInstruction;
  return [
    BASE_SYSTEM_PROMPT,
    '',
    '<tone_instruction>',
    `Tone: ${TONES[id].label}.`,
    text,
    'Apply this tone to your next reply even if earlier replies in this conversation used a different tone.',
    '</tone_instruction>',
  ].join('\n');
}
