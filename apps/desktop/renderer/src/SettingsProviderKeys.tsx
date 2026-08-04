import React, { useCallback, useEffect, useState } from 'react';
import type { DirectModel } from './useSettings';
import type { AiProviderKey } from '../../main/bridge';
import { showToast } from './toast';

// FreeLLMAPI providers the user can add a key for (ids match the server).
const KEY_PLATFORMS: { id: string; label: string }[] = [
  { id: 'groq', label: 'Groq' },
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'cerebras', label: 'Cerebras' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'cohere', label: 'Cohere' },
  { id: 'nvidia', label: 'NVIDIA' },
  { id: 'sambanova', label: 'SambaNova' },
  { id: 'github', label: 'GitHub Models' },
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'zhipu', label: 'Zhipu' },
  { id: 'huggingface', label: 'HuggingFace' },
];

const platformLabel = (id: string) => KEY_PLATFORMS.find((p) => p.id === id)?.label ?? id;

// Add / list / remove FreeLLMAPI provider keys without leaving the IDE. Targets
// the configured AI host (or the local server when blank).
export function ProviderKeys({ serverUrl }: { serverUrl?: string }) {
  const [keys, setKeys] = useState<AiProviderKey[]>([]);
  const [platform, setPlatform] = useState('groq');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const url = serverUrl || undefined;

  const refresh = useCallback(() => {
    window.strix.ai
      .listKeys(url)
      .then(setKeys)
      .catch(() => setKeys([]));
  }, [url]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async () => {
    const key = value.trim();
    if (!key) return;
    setBusy(true);
    const res = await window.strix.ai.addKey(platform, key, url);
    setBusy(false);
    if (res.ok) {
      setValue('');
      showToast(`${platformLabel(platform)} key added`, 'success');
      refresh();
      // Tell the (still-mounted, behind-this-overlay) AI panel to re-check keys
      // + reload models so the new key works without an alt-tab or restart.
      window.dispatchEvent(new Event('strix:ai-keys-changed'));
    } else {
      showToast(res.error || 'Could not add key', 'error', 6000);
    }
  };

  const remove = async (id: number) => {
    await window.strix.ai.deleteKey(id, url);
    showToast('API key removed', 'info');
    refresh();
    window.dispatchEvent(new Event('strix:ai-keys-changed'));
  };

  return (
    <div className="set-keys">
      <div className="set-keys-add">
        <select
          aria-label="Provider"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          {KEY_PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="password"
          aria-label="API key"
          placeholder="Paste API key…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
        />
        <button type="button" className="set-save-btn" disabled={busy || !value.trim()} onClick={add}>
          {busy ? 'Adding…' : 'Add key'}
        </button>
      </div>
      {keys.length > 0 ? (
        <ul className="set-keys-list" aria-label="Provider keys">
          {keys.map((k) => (
            <li key={k.id}>
              <span className="set-key-platform">{platformLabel(k.platform)}</span>
              <code className="set-key-mask">{k.maskedKey}</code>
              <span className={`set-key-status set-key-${k.status}`}>{k.status}</span>
              <button
                type="button"
                className="set-key-remove"
                aria-label={`remove ${platformLabel(k.platform)} key`}
                title="Remove key"
                onClick={() => remove(k.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="set-keys-empty">
          No provider keys yet. Add one above (Groq, Gemini, OpenRouter… are free) to power the AI.
        </p>
      )}
    </div>
  );
}

// One-click provider presets (like VS Code's BYOK picker). `kind:'anthropic'`
// uses the native Claude Messages API; everything else is OpenAI-compatible.
const PROVIDER_PRESETS: {
  id: string;
  label: string;
  baseURL: string;
  modelHint: string;
  kind?: string;
}[] = [
  { id: 'openrouter', label: 'OpenRouter — one key, every model', baseURL: 'https://openrouter.ai/api/v1', modelHint: 'anthropic/claude-3.5-sonnet' },
  { id: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1', modelHint: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic (Claude)', baseURL: 'https://api.anthropic.com', modelHint: 'claude-3-5-sonnet-20241022', kind: 'anthropic' },
  { id: 'gemini', label: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', modelHint: 'gemini-2.0-flash' },
  { id: 'groq', label: 'Groq', baseURL: 'https://api.groq.com/openai/v1', modelHint: 'llama-3.3-70b-versatile' },
  { id: 'mistral', label: 'Mistral', baseURL: 'https://api.mistral.ai/v1', modelHint: 'mistral-large-latest' },
  { id: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com', modelHint: 'deepseek-chat' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', baseURL: '', modelHint: '' },
];

// Friendly host label for a base URL (so the list reads "api.openai.com").
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Add / list / remove "bring your own" direct models. Each is an
// OpenAI-compatible endpoint + key + model id; they show up in the AI panel's
// model picker next to FreeLLMAPI's Auto. Stored locally (in Settings).
export function DirectModels({
  models,
  onChange,
  enableLocalDetect,
}: {
  models: DirectModel[];
  onChange: (m: DirectModel[]) => void;
  // Competition: show "Detect local models" (probes Ollama / LM Studio).
  enableLocalDetect?: boolean;
}) {
  const [label, setLabel] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [presetId, setPresetId] = useState('');
  const [detecting, setDetecting] = useState(false);

  const genId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Picking a provider prefills the base URL + model placeholder so adding a key
  // is one field. `custom` clears them for a manual OpenAI-compatible endpoint.
  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = PROVIDER_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setBaseURL(p.baseURL);
    setModel(p.modelHint);
    if (!label.trim()) setLabel(p.label.split(' — ')[0].replace(/\(.*\)/, '').trim());
  };

  const add = () => {
    const l = label.trim();
    const b = baseURL.trim();
    const k = apiKey.trim();
    const m = model.trim();
    if (!b || !k || !m) {
      showToast('Base URL, API key and model are all required', 'error', 5000);
      return;
    }
    const provider = PROVIDER_PRESETS.find((x) => x.id === presetId)?.kind;
    onChange([...models, { id: genId(), label: l || m, baseURL: b, apiKey: k, model: m, provider }]);
    setLabel('');
    setBaseURL('');
    setApiKey('');
    setModel('');
    setPresetId('');
    showToast(`Added "${l || m}"`, 'success');
  };

  // Probe localhost for running model servers (Ollama / LM Studio) and add any
  // that aren't already in the list — no URL/model typing.
  const detect = async () => {
    setDetecting(true);
    try {
      const found = await window.strix.ai.detectLocal();
      if (!found.length) {
        showToast('No local model server found. Is Ollama / LM Studio running?', 'info', 6000);
        return;
      }
      const existing = new Set(models.map((d) => `${d.baseURL}|${d.model}`));
      const added = found
        .filter((f) => !existing.has(`${f.baseURL}|${f.model}`))
        .map((f) => ({
          id: genId(),
          label: f.label,
          baseURL: f.baseURL,
          apiKey: f.apiKey,
          model: f.model,
        }));
      if (!added.length) {
        showToast('Local models already added.', 'info');
        return;
      }
      onChange([...models, ...added]);
      showToast(`Added ${added.length} local model(s)`, 'success');
    } finally {
      setDetecting(false);
    }
  };

  const remove = (id: string) => {
    onChange(models.filter((d) => d.id !== id));
    showToast('Direct model removed', 'info');
  };

  return (
    <div className="set-keys">
      {enableLocalDetect && (
        <div className="set-directmodels-detect">
          <button type="button" className="set-save-btn" disabled={detecting} onClick={detect}>
            {detecting ? 'Scanning…' : 'Detect local models (Ollama / LM Studio)'}
          </button>
          <span className="set-desc">Finds running local servers and adds them automatically.</span>
        </div>
      )}
      <div className="set-directmodels-add">
        <select
          aria-label="Provider"
          value={presetId}
          onChange={(e) => applyPreset(e.target.value)}
        >
          <option value="">Provider…</option>
          {PROVIDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Model label"
          placeholder="Label (e.g. GPT-4o mini)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          type="text"
          aria-label="Base URL"
          placeholder="https://api.openai.com/v1"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
        />
        <input
          type="password"
          aria-label="Direct model API key"
          placeholder="API key (sk-…)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <input
          type="text"
          aria-label="Model id"
          placeholder="gpt-4o-mini"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <button type="button" className="set-save-btn" onClick={add}>
          Add model
        </button>
      </div>
      {models.length > 0 ? (
        <ul className="set-keys-list" aria-label="Direct models">
          {models.map((d) => (
            <li key={d.id}>
              <span className="set-key-platform">{d.label}</span>
              <code className="set-key-mask">{d.model}</code>
              <span className="set-key-status">{hostOf(d.baseURL)}</span>
              <button
                type="button"
                className="set-key-remove"
                aria-label={`remove ${d.label}`}
                title="Remove model"
                onClick={() => remove(d.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="set-keys-empty">
          No direct models yet. Add one above (OpenAI, OpenRouter, Groq, Together, DeepSeek, local
          Ollama…) to pick it in the AI panel next to Auto.
        </p>
      )}
    </div>
  );
}
