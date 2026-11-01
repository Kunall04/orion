import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { SessionManager } from './session/manager';

// Explicit opt-in; only the unique test session is touched.
const integration = process.env.ORION_DATABASE_INTEGRATION === '1' ? describe : describe.skip;
integration('PostgreSQL chat persistence', () => {
  const db = new PrismaClient();
  const id = `integration-${randomUUID()}`;
  const manager = () => {
    const sessions = new Map<string, any>();
    return {
      getOrCreateSession: async (sessionId: string, repo?: string) => {
        if (!sessions.has(sessionId)) sessions.set(sessionId, { id: sessionId, repo, sandbox: { port: 5001, url: 'http://127.0.0.1:5001' }, createdAt: Date.now() });
        return sessions.get(sessionId);
      },
      getSession: (sessionId: string) => sessions.get(sessionId),
      listSessions: () => [...sessions.values()],
      terminateSession: async (sessionId: string) => sessions.delete(sessionId),
    } as unknown as SessionManager;
  };
  afterAll(async () => {
    await db.session.deleteMany({ where: { id } });
    await db.$disconnect();
  });

  it('saves, retries without duplicates, restores after restart, and cascades delete', async () => {
    const first = buildApp({ prisma: db, persistenceFile: null, sessionManager: manager() });
    const messages = [{ id: 'u1', role: 'user', text: 'Hello' }, { id: 'a1', role: 'agent', text: 'Hi!' }];
    try {
      expect((await first.inject({ method: 'POST', url: '/sessions', payload: { id, title: 'Test chat' } })).statusCode).toBe(200);
      for (let i = 0; i < 2; i++) {
        expect((await first.inject({ method: 'POST', url: `/sessions/${id}/messages`, payload: { title: 'Test chat', messages } })).statusCode).toBe(200);
      }
      expect(await db.message.count({ where: { sessionId: id } })).toBe(2);
      // A bad insert must roll back the preceding delete.
      const failed = await first.inject({ method: 'POST', url: `/sessions/${id}/messages`, payload: { messages: [{ role: { bad: true }, text: 'invalid' }] } });
      expect(failed.statusCode).toBe(500);
      expect(await db.message.count({ where: { sessionId: id } })).toBe(2);
    } finally { await first.close(); }

    const restarted = buildApp({ prisma: db, persistenceFile: null, sessionManager: manager() });
    try {
      const restored = await restarted.inject({ method: 'GET', url: `/sessions/${id}` });
      expect(restored.statusCode).toBe(200);
      expect(restored.json().session.messages).toEqual(messages);
      const list = await restarted.inject({ method: 'GET', url: '/sessions' });
      expect(list.statusCode).toBe(200);
      expect(list.json().sessions.find((s: { id: string }) => s.id === id).messages).toEqual(messages);
      expect((await restarted.inject({ method: 'DELETE', url: `/sessions/${id}` })).statusCode).toBe(200);
      expect(await db.message.count({ where: { sessionId: id } })).toBe(0);
    } finally { await restarted.close(); }
  });

  it('returns a failure if the database cannot be reached', async () => {
    const broken = new PrismaClient({ datasources: { db: { url: 'postgresql://invalid:invalid@127.0.0.1:1/invalid?connect_timeout=1' } } });
    const app = buildApp({ prisma: broken, persistenceFile: null, sessionManager: manager() });
    try {
      const response = await app.inject({ method: 'POST', url: '/sessions', payload: { id: `failure-${id}` } });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ ok: false, error: 'Internal server error' });
    } finally { await app.close(); await broken.$disconnect(); }
  });
});
