import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clearDb, connectTestDb, disconnectTestDb, sendMessage } from '../helpers.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearDb);

describe('Conversation history API', () => {
  it('lists threads newest first with tone and count', async () => {
    const { app } = buildTestApp();
    const first = await sendMessage(app, { message: 'Older thread', tone: 'casual' });
    const second = await sendMessage(app, { message: 'Newer thread', tone: 'concise' });

    const { body } = await request(app).get('/api/conversations').expect(200);
    expect(body.conversations.map((c) => c._id)).toEqual([second.conversationId, first.conversationId]);
    expect(body.conversations[0]).toMatchObject({ title: 'Newer thread', exchangeCount: 1, lastTone: 'concise', isBranch: false });
  });

  it('searches titles and message text, escaping regex characters', async () => {
    const { app } = buildTestApp();
    await sendMessage(app, { message: 'What is a (regex)?', tone: 'casual' });
    await sendMessage(app, { message: 'Something else', tone: 'casual' });

    const hit = await request(app).get('/api/conversations').query({ q: '(regex)' });
    expect(hit.body.conversations.map((c) => c.title)).toEqual(['What is a (regex)?']);

    const byResponse = await request(app).get('/api/conversations').query({ q: 'answer from model-a' });
    expect(byResponse.body.conversations).toHaveLength(2);
  });

  it('renames without moving the thread to the top', async () => {
    const { app } = buildTestApp();
    const first = await sendMessage(app, { message: 'First', tone: 'casual' });
    const second = await sendMessage(app, { message: 'Second', tone: 'casual' });

    const res = await request(app).patch(`/api/conversations/${first.conversationId}`).send({ title: '  Renamed   thread ' });
    expect(res.body.conversation.title).toBe('Renamed thread');

    const { body } = await request(app).get('/api/conversations');
    expect(body.conversations[0]._id).toBe(second.conversationId);
    await request(app).patch(`/api/conversations/${first.conversationId}`).send({ title: '' }).expect(400);
  });

  it('deletes a thread', async () => {
    const { app } = buildTestApp();
    const convo = await sendMessage(app, { message: 'Delete me', tone: 'casual' });
    await request(app).delete(`/api/conversations/${convo.conversationId}`).expect(204);
    await request(app).get(`/api/conversations/${convo.conversationId}`).expect(404);
    await request(app).delete(`/api/conversations/${convo.conversationId}`).expect(404);
  });

  it('returns JSON errors for bad input', async () => {
    const { app } = buildTestApp();
    await request(app).get('/api/conversations/not-an-id').expect(404);
    const badJson = await request(app).post('/api/chat').set('Content-Type', 'application/json').send('{bad');
    expect(badJson.status).toBe(400);
    expect(badJson.body.error).toMatch(/valid JSON/);
    await request(app).get('/api/nope').expect(404);
  });
});
