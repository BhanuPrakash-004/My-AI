import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conversation } from '../../src/models/Conversation.js';
import { buildTestApp, clearDb, connectTestDb, disconnectTestDb, sendMessage } from '../helpers.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearDb);

async function threeTurnConversation(app) {
  const first = await sendMessage(app, { message: 'Plan a trip', tone: 'professional' });
  const id = first.conversationId;
  await sendMessage(app, { conversationId: id, message: 'Make it cheaper', tone: 'casual' });
  await sendMessage(app, { conversationId: id, message: 'Add museums', tone: 'concise' });
  return (await request(app).get(`/api/conversations/${id}`)).body.conversation;
}

describe('Branch conversation', () => {
  it('copies the thread up to the chosen message into a new conversation', async () => {
    const { app } = buildTestApp();
    const original = await threeTurnConversation(app);
    const from = original.exchanges[1];

    const res = await request(app).post(`/api/conversations/${original._id}/branch`).send({ exchangeId: from._id });
    expect(res.status).toBe(201);

    const branch = res.body.conversation;
    expect(branch._id).not.toBe(original._id);
    expect(branch.title).toBe('Plan a trip (branch)');
    expect(branch.tone).toBe('casual');
    expect(branch.isBranch).toBe(true);
    expect(branch.branchedFrom).toMatchObject({
      conversationId: original._id,
      exchangeId: from._id,
      title: 'Plan a trip',
      copiedCount: 2,
    });
    expect(branch.exchanges.map((e) => [e.prompt, e.response, e.tone])).toEqual(
      original.exchanges.slice(0, 2).map((e) => [e.prompt, e.response, e.tone]),
    );
    // Copies get their own ids.
    expect(branch.exchanges.map((e) => e._id)).not.toContain(original.exchanges[0]._id);
  });

  it('leaves the original untouched and lists the branch on it', async () => {
    const { app } = buildTestApp();
    const original = await threeTurnConversation(app);
    const { body } = await request(app)
      .post(`/api/conversations/${original._id}/branch`)
      .send({ exchangeId: original.exchanges[0]._id });

    // Continue the branch in a different direction.
    await sendMessage(app, { conversationId: body.conversation._id, message: 'Actually, go to Japan', tone: 'casual' });

    const after = (await request(app).get(`/api/conversations/${original._id}`)).body.conversation;
    expect(after.exchanges.map((e) => e.prompt)).toEqual(['Plan a trip', 'Make it cheaper', 'Add museums']);
    expect(after.branches).toEqual([
      expect.objectContaining({ _id: body.conversation._id, exchangeId: original.exchanges[0]._id }),
    ]);

    const branch = (await request(app).get(`/api/conversations/${body.conversation._id}`)).body.conversation;
    expect(branch.exchanges.map((e) => e.prompt)).toEqual(['Plan a trip', 'Actually, go to Japan']);
  });

  it('numbers additional branches and flags them in the list', async () => {
    const { app } = buildTestApp();
    const original = await threeTurnConversation(app);
    const branch = (id) => request(app).post(`/api/conversations/${original._id}/branch`).send({ exchangeId: id });

    await branch(original.exchanges[0]._id);
    const second = await branch(original.exchanges[2]._id);
    expect(second.body.conversation.title).toBe('Plan a trip (branch 2)');

    const list = (await request(app).get('/api/conversations')).body.conversations;
    expect(list.filter((c) => c.isBranch)).toHaveLength(2);
    expect(list.find((c) => c._id === original._id).isBranch).toBe(false);
  });

  it('reports when the original conversation was deleted', async () => {
    const { app } = buildTestApp();
    const original = await threeTurnConversation(app);
    const { body } = await request(app)
      .post(`/api/conversations/${original._id}/branch`)
      .send({ exchangeId: original.exchanges[0]._id });

    await request(app).delete(`/api/conversations/${original._id}`).expect(204);
    const branch = (await request(app).get(`/api/conversations/${body.conversation._id}`)).body.conversation;
    expect(branch.branchedFrom.exists).toBe(false);
    expect(branch.exchanges).toHaveLength(1);
  });

  it('rejects unknown conversations and messages', async () => {
    const { app } = buildTestApp();
    const original = await threeTurnConversation(app);
    await request(app).post('/api/conversations/64b000000000000000000000/branch').send({ exchangeId: original.exchanges[0]._id }).expect(404);
    await request(app).post(`/api/conversations/${original._id}/branch`).send({ exchangeId: '64b000000000000000000000' }).expect(404);
    await request(app).post(`/api/conversations/${original._id}/branch`).send({ exchangeId: 'nope' }).expect(404);
    expect(await Conversation.countDocuments()).toBe(1);
  });
});
