import type { TaskType } from './types';

export const TASK_MODEL_PREFERENCE: Record<TaskType, string> = {
  autocomplete: 'auto', // FreeLLMAPI picks fastest (Groq priority)
  chat: 'auto', // sticky session, best available
  explain: 'auto', // prefers quality (Gemini 2.5 Flash)
  fix: 'auto',
  generate: 'auto',
  refactor: 'auto',
  vuln_check: 'auto',
  scaffold: 'auto', // whole-project generation: best available
};

// Only autocomplete has a spec'd cap (§8.1: keep completions short and fast).
export const AUTOCOMPLETE_MAX_TOKENS = 150;
