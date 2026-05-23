import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

// The authoritative route is the `X-Routed-Via` response header (parsed by
// StatusTracker). The raw chunk stream doesn't carry headers, so onDone reports
// the model echoed on the chunks as a best-effort fallback.
export async function streamToPanel(
  stream: AsyncIterable<ChatCompletionChunk>,
  onToken: (token: string) => void,
  onDone: (routedVia: string) => void,
): Promise<void> {
  let routedVia = 'unknown';

  for await (const chunk of stream) {
    if (chunk.model) {
      routedVia = chunk.model;
    }
    const token = chunk.choices[0]?.delta?.content;
    if (token) {
      onToken(token);
    }
  }

  onDone(routedVia);
}
