import { describe, it, expect } from 'vitest';
import { isLocalAiEndpoint, withAiCors } from './aiCors';

describe('isLocalAiEndpoint', () => {
  it('matches the local FreeLLMAPI proxy + api paths', () => {
    expect(isLocalAiEndpoint('http://localhost:3001/v1/chat/completions')).toBe(true);
    expect(isLocalAiEndpoint('http://127.0.0.1:3001/api/keys')).toBe(true);
    expect(isLocalAiEndpoint('http://localhost:3001/v1/models')).toBe(true);
  });
  it('does not match other local traffic or remote hosts', () => {
    expect(isLocalAiEndpoint('http://localhost:8787/latest-m1.json')).toBe(false); // update feed
    expect(isLocalAiEndpoint('http://localhost:3000/index.html')).toBe(false); // dev renderer
    expect(isLocalAiEndpoint('https://api.github.com/user')).toBe(false); // remote
    expect(isLocalAiEndpoint('http://192.168.1.9:3001/v1/chat/completions')).toBe(false); // LAN host
    expect(isLocalAiEndpoint('not a url')).toBe(false);
  });
});

describe('withAiCors', () => {
  it('injects permissive CORS for the local AI server', () => {
    const out = withAiCors('http://localhost:3001/v1/chat/completions', { 'content-type': ['application/json'] });
    expect(out).not.toBeNull();
    expect(out!['Access-Control-Allow-Origin']).toEqual(['*']);
    expect(out!['Access-Control-Allow-Headers']).toEqual(['*']);
    expect(out!['content-type']).toEqual(['application/json']); // preserves existing
  });
  it('leaves non-AI responses untouched (returns null)', () => {
    expect(withAiCors('http://localhost:8787/latest-m1.json', {})).toBeNull();
    expect(withAiCors('https://example.com/api/x', {})).toBeNull();
  });
});
