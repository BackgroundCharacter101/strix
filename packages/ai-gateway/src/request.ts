import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { ai } from './client';
import { buildPrompt } from './context';
import { AUTOCOMPLETE_MAX_TOKENS, TASK_MODEL_PREFERENCE } from './tasks';
import { streamToPanel } from './stream';
import type { BuildPromptOptions, TaskType } from './types';

export interface RunTaskCallbacks {
  onToken: (token: string) => void;
  onDone: (routedVia: string) => void;
}

// Builds the prompt for a task, opens a streaming completion against
// FreeLLMAPI, and drives the token/done callbacks via streamToPanel.
export interface RunTaskSettings {
  /** Override the model; defaults to the task's preference ('auto'). */
  model?: string;
  /** Sampling temperature (0–2). Omit for the provider default. */
  temperature?: number;
  /** Max output tokens for free-form tasks (chat/explain/fix/refactor/audit). */
  maxTokens?: number;
  /** Abort the in-flight request (e.g. a Stop button). */
  signal?: AbortSignal;
}

export async function runTask(
  task: TaskType,
  opts: BuildPromptOptions,
  callbacks: RunTaskCallbacks,
  settings: RunTaskSettings = {},
): Promise<void> {
  const params: ChatCompletionCreateParamsStreaming = {
    model: settings.model || TASK_MODEL_PREFERENCE[task],
    messages: buildPrompt(task, opts) as ChatCompletionMessageParam[],
    stream: true,
  };

  if (task === 'autocomplete') {
    params.max_tokens = AUTOCOMPLETE_MAX_TOKENS;
  } else if (task === 'scaffold') {
    // Give the model room so plans aren't truncated, but stay within limits that
    // every provider accepts (some reject larger values).
    params.max_tokens = 4096;
  } else if (settings.maxTokens && settings.maxTokens > 0) {
    // User-tuned cap for free-form tasks (task-specific limits above win).
    params.max_tokens = settings.maxTokens;
  }
  // User-tuned sampling temperature (skip for autocomplete — determinism wins).
  if (task !== 'autocomplete' && typeof settings.temperature === 'number') {
    params.temperature = settings.temperature;
  }

  const stream = await ai.chat.completions.create(
    params,
    settings.signal ? { signal: settings.signal } : undefined,
  );
  await streamToPanel(stream, callbacks.onToken, callbacks.onDone);
}

// Run a task and resolve with the full text (no streaming UI). Used for
// inline autocomplete and other one-shot completions.
export async function complete(
  task: TaskType,
  opts: BuildPromptOptions,
  settings: RunTaskSettings = {},
): Promise<string> {
  let text = '';
  await runTask(
    task,
    opts,
    {
      onToken: (token) => {
        text += token;
      },
      onDone: () => {},
    },
    settings,
  );
  return text;
}
