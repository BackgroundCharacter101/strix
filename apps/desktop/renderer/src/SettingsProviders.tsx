import React from 'react';
import type { Settings } from './useSettings';
import { Row, Toggle } from './SettingsControls';
import { IS_COMPETITION } from './edition';
import { ProviderKeys, DirectModels } from './SettingsProviderKeys';

// The whole "AI" settings tab: server/model/generation defaults, the direct
// (BYOK) model list, FreeBuff's own-server connection, and FreeLLMAPI provider
// keys. Pulled out of SettingsPage.tsx because it owns all of the provider /
// API-key configuration in one cohesive (and sizeable) chunk.
export function SettingsProviders({
  settings,
  onChange,
  query,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  query: string;
}) {
  return (
    <section className="set-section">
      <h3>AI</h3>
      <Row
        query={query}
        label="AI server URL"
        desc="A shared FreeLLMAPI host for the team (e.g. http://192.168.1.50:3001). Leave blank to use the local server."
      >
        <input
          type="text"
          aria-label="AI server URL"
          placeholder="http://localhost:3001"
          value={settings.aiServerUrl}
          onChange={(e) => onChange({ aiServerUrl: e.target.value })}
        />
      </Row>

      <Row
        query={query}
        label="Default model"
        desc="Model selected by default in the AI panel. 'auto' lets the router pick. Direct models you add below also appear in that picker."
      >
        <input
          type="text"
          aria-label="Default model"
          placeholder="auto"
          value={settings.aiDefaultModel}
          onChange={(e) => onChange({ aiDefaultModel: e.target.value || 'auto' })}
        />
      </Row>

      <div className="set-row set-row-block">
        <div className="set-info">
          <div className="set-label">Direct API key models</div>
          <div className="set-desc">
            Bring your own models from any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq,
            Together, Mistral, DeepSeek, local Ollama/LM Studio). Each one shows up in the AI
            panel&apos;s model picker next to Auto — pick per message. Keys are stored locally
            and sent only to that provider (through the app&apos;s main process, never the
            renderer).
          </div>
        </div>
      </div>
      <DirectModels
        models={settings.aiDirectModels}
        onChange={(m) => onChange({ aiDirectModels: m })}
        enableLocalDetect={IS_COMPETITION}
      />

      <Row
        query={query}
        label="Temperature"
        desc="Creativity vs. determinism (0 = focused, 2 = wild). 0.7 is a good default."
      >
        <input
          type="number"
          aria-label="Temperature"
          min={0}
          max={2}
          step={0.1}
          value={settings.aiTemperature}
          onChange={(e) =>
            onChange({ aiTemperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })
          }
        />
      </Row>
      <Row
        query={query}
        label="Max response tokens"
        desc="Cap the AI's response length for chat/explain/fix (0 = provider default)."
      >
        <input
          type="number"
          aria-label="Max response tokens"
          min={0}
          max={32000}
          step={256}
          value={settings.aiMaxTokens}
          onChange={(e) => onChange({ aiMaxTokens: Math.max(0, Number(e.target.value) || 0) })}
        />
      </Row>

      <Row
        query={query}
        label="GitHub client ID"
        desc='For "Sign in with GitHub" (browser). Register a free OAuth App at github.com/settings/applications/new with Device Flow enabled, then paste its Client ID here. Shareable across the team.'
      >
        <input
          type="text"
          aria-label="GitHub client ID"
          placeholder="Iv1.xxxxxxxxxxxxxxxx"
          value={settings.githubClientId}
          onChange={(e) => onChange({ githubClientId: e.target.value })}
        />
      </Row>

      <Row
        query={query}
        label="Apply AI changes without confirming"
        desc="Hands-off agent: write file changes immediately, skipping the review/diff modal."
      >
        <Toggle
          checked={settings.agentAutoApply}
          onChange={(v) => onChange({ agentAutoApply: v })}
          label="Apply AI changes without confirming"
        />
      </Row>

      <div className="set-row set-row-block">
        <div className="set-info">
          <div className="set-label">FreeBuff connection (your own VPS / full access)</div>
          <div className="set-desc">
            Point the FreeBuff agent at your own server for full, unthrottled access. These
            are injected as environment variables when FreeBuff launches. After changing them,
            close the FreeBuff terminal tab and click <em>Ask FreeBuff</em> again to apply.
          </div>
        </div>
      </div>
      <details className="set-guide">
        <summary>📖 New to this? Step-by-step guide (no tech knowledge needed)</summary>
        <div className="set-guide-body">
          <p>
            <strong>Don&apos;t have your own server?</strong> Then skip this whole section —
            FreeBuff already works out of the box, just with the free limits. Nothing here is
            required.
          </p>

          <h4>Which box do I fill in?</h4>
          <p>You almost never need all three — pick the ONE that matches what you were given:</p>
          <ul>
            <li>
              <strong>Someone gave you a server address with a port</strong> (looks like{' '}
              <code>http://203.0.113.7:8080</code> — an address, a colon, a number) → put it in{' '}
              <strong>Proxy / VPS URL</strong>. Done.
            </li>
            <li>
              <strong>Someone gave you a website-style address</strong> (looks like{' '}
              <code>https://freebuff.mycompany.com</code>) → put it in{' '}
              <strong>Self-hosted backend URL</strong>. Done.
            </li>
            <li>
              <strong>Someone gave you lines that contain an = sign</strong> (like{' '}
              <code>SOME_NAME=some-value</code>) → paste them, exactly as given, one per line,
              into <strong>Extra environment variables</strong>. Done.
            </li>
          </ul>

          <h4>Then make it take effect (2 clicks)</h4>
          <ol>
            <li>
              If a <strong>FreeBuff</strong> tab is open in the terminal at the bottom, close it
              with the little <strong>×</strong> next to its name.
            </li>
            <li>
              Click <strong>Ask FreeBuff</strong> (or the ✨ FreeBuff button) — the new session
              now uses your server.
            </li>
          </ol>

          <h4>If it doesn&apos;t work</h4>
          <ul>
            <li>
              Check for typos — no spaces before/after what you pasted, and addresses must
              start with <code>http://</code> or <code>https://</code>.
            </li>
            <li>
              If you use a VPN app to reach the server, make sure the VPN is{' '}
              <strong>switched on</strong> before opening FreeBuff.
            </li>
            <li>
              Still stuck? Ask the person who runs your server for the exact value — then paste
              it into <strong>Extra environment variables</strong> exactly as they wrote it
              (that box always wins over the others).
            </li>
          </ul>

          <p className="set-guide-note">
            🔒 Everything you enter here stays on this computer. It is only handed to FreeBuff
            when it starts — Strix never sends it anywhere else.
          </p>
        </div>
      </details>
      <Row
        query={query}
        label="Proxy / VPS URL"
        desc="Route FreeBuff's traffic through your VPS/VPN (sets HTTP(S)_PROXY)."
      >
        <input
          type="text"
          aria-label="FreeBuff proxy URL"
          placeholder="http://your-vps:8080"
          value={settings.freebuffProxyUrl}
          onChange={(e) => onChange({ freebuffProxyUrl: e.target.value })}
        />
      </Row>
      <Row
        query={query}
        label="Self-hosted backend URL"
        desc="If you run the FreeBuff/Codebuff backend yourself, its base URL."
      >
        <input
          type="text"
          aria-label="FreeBuff backend URL"
          placeholder="https://freebuff.your-domain.com"
          value={settings.freebuffBackendUrl}
          onChange={(e) => onChange({ freebuffBackendUrl: e.target.value })}
        />
      </Row>
      <Row
        query={query}
        label="Extra environment variables"
        desc="One KEY=VALUE per line — overrides the above. Use FreeBuff's documented names."
      >
        <textarea
          className="set-textarea"
          aria-label="FreeBuff extra environment variables"
          rows={3}
          placeholder={'HTTPS_PROXY=…\nCODEBUFF_BACKEND_URL=…'}
          value={settings.freebuffExtraEnv}
          onChange={(e) => onChange({ freebuffExtraEnv: e.target.value })}
        />
      </Row>

      <div className="set-row set-row-block">
        <div className="set-info">
          <div className="set-label">FreeLLMAPI provider keys</div>
          <div className="set-desc">
            Free LLM providers for the built-in Auto router — no need to open the server&apos;s
            web page. Keys are stored encrypted on the AI host above (local by default).
          </div>
        </div>
      </div>
      <ProviderKeys serverUrl={settings.aiServerUrl} />
    </section>
  );
}
