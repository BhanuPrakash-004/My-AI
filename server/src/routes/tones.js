import { Router } from 'express';
import { config } from '../config.js';
import { listToneSettings, resetToneInstruction, saveToneInstruction } from '../services/toneSettings.js';
import { isTone, TONE_IDS } from '../services/tones.js';
import { HttpError } from '../utils/http.js';

function assertTone(id) {
  if (!isTone(id)) throw new HttpError(404, `Unknown tone. Use one of: ${TONE_IDS.join(', ')}.`);
}

export function createTonesRouter() {
  const router = Router();

  // The instruction behind each tone (custom or built-in) and the full system prompt it produces.
  router.get('/', async (req, res) => {
    res.json({ tones: await listToneSettings() });
  });

  router.put('/:id', async (req, res) => {
    assertTone(req.params.id);
    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
    if (!instruction) throw new HttpError(400, 'Instruction cannot be empty.');
    if (instruction.length > config.limits.maxInstructionChars) {
      throw new HttpError(400, `Instructions can be up to ${config.limits.maxInstructionChars} characters.`);
    }
    res.json({ tone: await saveToneInstruction(req.params.id, instruction) });
  });

  // Restore the built-in instruction.
  router.delete('/:id', async (req, res) => {
    assertTone(req.params.id);
    res.json({ tone: await resetToneInstruction(req.params.id) });
  });

  return router;
}
