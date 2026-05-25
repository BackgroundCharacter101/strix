import * as monaco from 'monaco-editor';
import { complete } from '@strix/ai-gateway';

let seq = 0;

// AI inline autocomplete (ARCHITECTURE §8.1): ghost text after a typing pause,
// Tab to accept. Sends ~50 lines above the cursor as context. Fails silently
// if the AI is unavailable (e.g. no provider key yet).
export function registerAutocomplete(): void {
  monaco.languages.registerInlineCompletionsProvider(
    { pattern: '**' },
    {
      async provideInlineCompletions(model, position) {
        const mine = ++seq;
        // Debounce 400ms; bail if the user kept typing.
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (mine !== seq) return { items: [] };

        const fromLine = Math.max(1, position.lineNumber - 50);
        const context = model.getValueInRange(
          new monaco.Range(fromLine, 1, position.lineNumber, position.column),
        );
        if (!context.trim()) return { items: [] };

        try {
          const ghost = await complete('autocomplete', {
            filePath: model.uri.path,
            fileContent: context,
          });
          if (!ghost || mine !== seq) return { items: [] };
          return {
            items: [
              {
                insertText: ghost,
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column,
                ),
              },
            ],
          };
        } catch {
          return { items: [] };
        }
      },
      freeInlineCompletions() {},
    },
  );
}
