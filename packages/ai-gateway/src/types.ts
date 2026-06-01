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

// Security-expert stance used in Strix Cybersec mode.
export type SecurityStance = 'balanced' | 'offensive' | 'defensive';

export interface BuildPromptOptions {
  fileContent: string;
  filePath: string;
  selection?: string;
  errorMessage?: string;
  userMessage?: string;
  history?: ChatMessage[];
  // When true (Strix Cybersec mode), prepend a security-expert persona to the
  // system prompt. The stance tunes that persona offensive/defensive/balanced.
  securityMode?: boolean;
  securityStance?: SecurityStance;
  // Optional user-customized persona text (base + stance emphasis). When set it
  // overrides the built-in default for the active stance.
  securityPersonaText?: string;
}
