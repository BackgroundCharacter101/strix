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
export async function runTask(
  task: TaskType,
  opts: BuildPromptOptions,
  callbacks: RunTaskCallbacks,
): Promise<void> {
  const params: ChatCompletionCreateParamsStreaming = {
    model: TASK_MODEL_PREFERENCE[task],
    messages: buildPrompt(task, opts) as ChatCompletionMessageParam[],
    stream: true,
  };

  if (task === 'autocomplete') {
    params.max_tokens = AUTOCOMPLETE_MAX_TOKENS;
  }

  const stream = await ai.chat.completions.create(params);
  await streamToPanel(stream, callbacks.onToken, callbacks.onDone);
}
