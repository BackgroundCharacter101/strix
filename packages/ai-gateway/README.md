# @strix/ai-gateway

The single point of contact between the IDE and the AI. Wraps the OpenAI SDK
configured against a self-hosted FreeLLMAPI instance and adds IDE-specific
logic: prompt building, task routing, streaming, and status tracking.

## Modules

| Module | Export | Purpose |
|--------|--------|---------|
| `client.ts` | `ai` | OpenAI SDK client pointed at `FREELLMAPI_URL`. |
| `tasks.ts` | `TASK_MODEL_PREFERENCE`, `AUTOCOMPLETE_MAX_TOKENS` | Maps each `TaskType` to a model preference (all `auto`). |
| `context.ts` | `buildPrompt(task, opts)` | Builds the `ChatMessage[]` for a task, replaying history for chat. |
| `stream.ts` | `streamToPanel(stream, onToken, onDone)` | Drains a streaming completion, emitting tokens and the routed model. |
| `status.ts` | `StatusTracker` | Parses `X-Routed-Via` / `X-Fallback-Attempts` headers and tracks daily token usage (resets at UTC midnight). |

## Configuration

| Env var | Default |
|---------|---------|
| `FREELLMAPI_URL` | `http://localhost:3001/v1` |
| `FREELLMAPI_KEY` | `freellmapi-your-unified-key` |
