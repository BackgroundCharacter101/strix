export type TaskType =
  | 'autocomplete'
  | 'chat'
  | 'explain'
  | 'fix'
  | 'generate'
  | 'refactor'
  | 'vuln_check'
  | 'scaffold';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// A user-attached file the assistant can read: extracted `text` (md / txt /
// code / PDF) and/or an `imageUrl` (base64 data URL) for vision models.
export interface Attachment {
  name: string;
  text?: string;
  imageUrl?: string;
}

// OpenAI-style multimodal content parts (for messages with images).
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

// A prompt message whose content may be plain text or multimodal parts.
export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
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
  // Compact workspace context (e.g. project name + file tree) so the assistant
  // can answer questions about the whole project, not just the open file.
  projectContext?: string;
  // When true (Strix Cybersec mode), prepend a security-expert persona to the
  // system prompt. The stance tunes that persona offensive/defensive/balanced.
  securityMode?: boolean;
  securityStance?: SecurityStance;
  // Optional user-customized persona text (base + stance emphasis). When set it
  // overrides the built-in default for the active stance.
  securityPersonaText?: string;
  // Files the user attached (text extracted from md/txt/code/PDF; images as
  // base64 data URLs for vision-capable models).
  attachments?: Attachment[];
}
