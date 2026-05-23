export type TaskType =
  | 'autocomplete'
  | 'chat'
  | 'explain'
  | 'fix'
  | 'generate'
  | 'refactor'
  | 'vuln_check';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BuildPromptOptions {
  fileContent: string;
  filePath: string;
  selection?: string;
  errorMessage?: string;
  userMessage?: string;
  history?: ChatMessage[];
}
