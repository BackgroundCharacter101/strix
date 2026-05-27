import React from 'react';
import { renderMarkdown } from './markdown';

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="markdown-preview" aria-label="markdown preview">
      {renderMarkdown(content)}
    </div>
  );
}
