import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const primary = (env) => loadConfig(env).connections[0];

describe('loadConfig: provider settings from .env', () => {
  it('runs in demo mode when no key is set', () => {
    const conn = primary({});
    expect(conn.provider).toBe('mock');
    expect(conn.requestedProvider).toBe('claude');
    expect(conn.demoReason).toMatch(/AI_API_KEY is empty/);
  });

  it('uses Claude with the default model when AI_API_KEY is set', () => {
    const conn = primary({ AI_PROVIDER: 'claude', AI_API_KEY: 'sk-ant-test' });
    expect(conn).toMatchObject({ provider: 'claude', apiKey: 'sk-ant-test', models: ['claude-opus-5-5'], baseURL: null });
  });

  it('accepts "anthropic" as an alias for claude', () => {
    expect(primary({ AI_PROVIDER: 'Anthropic', AI_API_KEY: 'k' }).provider).toBe('claude');
  });

  it('uses OpenAI with base URL, key and model from the environment', () => {
    const conn = primary({
      AI_PROVIDER: 'openai',
      AI_API_KEY: 'sk-openai',
      AI_BASE_URL: 'https://openrouter.ai/api/v1',
      AI_MODEL: 'openai/gpt-5-mini',
    });
    expect(conn).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-openai',
      baseURL: 'https://openrouter.ai/api/v1',
      models: ['openai/gpt-5-mini'],
    });
  });

  it('defaults the OpenAI model when AI_MODEL is empty', () => {
    expect(primary({ AI_PROVIDER: 'openai', AI_API_KEY: 'k' }).models).toEqual(['gpt-5-mini']);
  });

  it('allows an OpenAI-compatible local server without a key', () => {
    const conn = primary({ AI_PROVIDER: 'openai', AI_BASE_URL: 'http://localhost:11434/v1', AI_MODEL: 'llama3.2' });
    expect(conn.provider).toBe('openai');
    expect(conn.demoReason).toBeNull();
  });

  it('falls back to ANTHROPIC_API_KEY / OPENAI_API_KEY', () => {
    expect(primary({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'a' }).apiKey).toBe('a');
    expect(primary({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'o' }).apiKey).toBe('o');
  });

  it('infers OpenAI when only OPENAI_API_KEY is present', () => {
    expect(primary({ OPENAI_API_KEY: 'o' }).provider).toBe('openai');
  });

  it('adds extra models from AI_MODELS without duplicates', () => {
    const conn = primary({
      AI_PROVIDER: 'claude',
      AI_API_KEY: 'k',
      AI_MODEL: 'claude-opus-5-5',
      AI_MODELS: 'claude-sonnet-5-5, claude-opus-5-5 ,claude-haiku-5-5',
    });
    expect(conn.models).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
  });

  it('can be forced into demo mode', () => {
    expect(primary({ AI_PROVIDER: 'mock', AI_API_KEY: 'k' }).provider).toBe('mock');
  });

  it('rejects an unknown provider', () => {
    expect(() => loadConfig({ AI_PROVIDER: 'gemini' })).toThrow(/AI_PROVIDER/);
  });

  it('adds a compare connection only when COMPARE_PROVIDER is set', () => {
    expect(loadConfig({ AI_API_KEY: 'k' }).connections).toHaveLength(1);

    const { connections } = loadConfig({
      AI_PROVIDER: 'claude',
      AI_API_KEY: 'k1',
      COMPARE_PROVIDER: 'openai',
      COMPARE_API_KEY: 'k2',
      COMPARE_MODEL: 'gpt-5',
    });
    expect(connections).toHaveLength(2);
    expect(connections[1]).toMatchObject({ key: 'compare', provider: 'openai', apiKey: 'k2', models: ['gpt-5'] });
  });

  it('reads Claude tuning and limits', () => {
    const cfg = loadConfig({ AI_MAX_TOKENS: '2048', AI_FALLBACKS: 'false', PORT: '7000' });
    expect(cfg.claude).toEqual({ maxTokens: 2048, fallbacks: false });
    expect(cfg.port).toBe(7000);
  });
});
