import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TONES } from '../../src/services/tones.js';
import { buildTestApp, clearDb, connectTestDb, disconnectTestDb, sendMessage } from '../helpers.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearDb);

describe('Custom tone editor', () => {
  it('returns the built-in instructions and the system prompt they produce', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/tones');
    expect(res.status).toBe(200);
    expect(res.body.tones.map((t) => t.id)).toEqual(['professional', 'casual', 'concise']);
    for (const tone of res.body.tones) {
      expect(tone.customized).toBe(false);
      expect(tone.instruction).toBe(TONES[tone.id].defaultInstruction);
      expect(tone.systemPrompt).toContain(tone.instruction);
    }
  });

  it('saves a custom instruction in MongoDB and uses it for new replies', async () => {
    const { app, adapters } = buildTestApp();
    const custom = 'Talk like a pirate, but keep the facts straight.';

    const saved = await request(app).put('/api/tones/casual').send({ instruction: `  ${custom}  ` });
    expect(saved.status).toBe(200);
    expect(saved.body.tone).toMatchObject({ id: 'casual', instruction: custom, customized: true });
    expect(saved.body.tone.systemPrompt).toContain(custom);

    const list = await request(app).get('/api/tones');
    expect(list.body.tones.find((t) => t.id === 'casual').instruction).toBe(custom);

    await sendMessage(app, { message: 'Hi', tone: 'casual' });
    expect(adapters.a.calls[0].system).toContain(custom);
    expect(adapters.a.calls[0].system).not.toContain(TONES.casual.defaultInstruction);

    // Other tones are unaffected.
    await sendMessage(app, { message: 'Hi', tone: 'concise' });
    expect(adapters.a.calls[1].system).toContain(TONES.concise.defaultInstruction);
  });

  it('applies custom instructions to both sides of a comparison', async () => {
    const { app, adapters } = buildTestApp();
    await request(app).put('/api/tones/professional').send({ instruction: 'Custom professional.' });
    await request(app).put('/api/tones/concise').send({ instruction: 'Custom concise.' });
    await sendMessage(app, { message: 'Hi', tone: 'professional', compare: { tone: 'concise' } });
    const systems = adapters.a.calls.map((c) => c.system).join('\n');
    expect(systems).toContain('Custom professional.');
    expect(systems).toContain('Custom concise.');
  });

  it('resets a tone to its default', async () => {
    const { app, adapters } = buildTestApp();
    await request(app).put('/api/tones/concise').send({ instruction: 'One word answers.' });
    const reset = await request(app).delete('/api/tones/concise');
    expect(reset.body.tone).toMatchObject({ customized: false, instruction: TONES.concise.defaultInstruction });

    await sendMessage(app, { message: 'Hi', tone: 'concise' });
    expect(adapters.a.calls[0].system).toContain(TONES.concise.defaultInstruction);
  });

  it('validates input', async () => {
    const { app } = buildTestApp();
    await request(app).put('/api/tones/casual').send({ instruction: '   ' }).expect(400);
    await request(app).put('/api/tones/casual').send({ instruction: 'x'.repeat(2001) }).expect(400);
    await request(app).put('/api/tones/pirate').send({ instruction: 'Arr' }).expect(404);
    await request(app).delete('/api/tones/pirate').expect(404);
  });
});
