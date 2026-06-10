import { describe, it, expect } from 'vitest';
import { parseEnvLines, buildFreebuffEnv, hasFreebuffConnection } from './freebuffEnv';

describe('parseEnvLines', () => {
  it('parses KEY=VALUE lines, ignoring blanks and comments', () => {
    expect(parseEnvLines('A=1\n\n# note\nB = two \nC=')).toEqual({ A: '1', B: 'two', C: '' });
  });
  it('keeps = in the value', () => {
    expect(parseEnvLines('URL=https://x.y/?a=b')).toEqual({ URL: 'https://x.y/?a=b' });
  });
  it('skips malformed lines', () => {
    expect(parseEnvLines('noequals\n=novalue')).toEqual({});
  });
});

describe('buildFreebuffEnv', () => {
  it('is empty when nothing is set', () => {
    expect(buildFreebuffEnv({})).toEqual({});
    expect(hasFreebuffConnection({})).toBe(false);
  });

  it('maps the API key to both naming conventions', () => {
    const env = buildFreebuffEnv({ apiKey: ' sk-123 ' });
    expect(env.CODEBUFF_API_KEY).toBe('sk-123');
    expect(env.FREEBUFF_API_KEY).toBe('sk-123');
  });

  it('maps a proxy to upper- and lower-case proxy vars', () => {
    const env = buildFreebuffEnv({ proxyUrl: 'http://vps:8080' });
    expect(env.HTTPS_PROXY).toBe('http://vps:8080');
    expect(env.http_proxy).toBe('http://vps:8080');
  });

  it('lets the freeform box override the defaults', () => {
    const env = buildFreebuffEnv({ apiKey: 'x', extraEnv: 'CODEBUFF_API_KEY=override\nFOO=bar' });
    expect(env.CODEBUFF_API_KEY).toBe('override');
    expect(env.FOO).toBe('bar');
  });

  it('flags a configured connection', () => {
    expect(hasFreebuffConnection({ proxyUrl: 'http://vps' })).toBe(true);
  });
});
