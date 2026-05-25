import React from 'react';
import { DiffViewer, languageForPath } from '@strix/editor';

export interface CodeProposalProps {
  path: string | null;
  original: string;
  suggested: string;
  onApply: () => void;
  onDismiss: () => void;
}

// Shows an AI-proposed change as a diff with Apply / Dismiss (§8.4 Fix, §8.6 Refactor).
export function CodeProposal({ path, original, suggested, onApply, onDismiss }: CodeProposalProps) {
  return (
    <div className="ai-proposal" aria-label="proposed change">
      <div className="ai-proposal-diff">
        <DiffViewer
          original={original}
          modified={suggested}
          language={path ? languageForPath(path) : undefined}
        />
      </div>
      <div className="ai-proposal-actions">
        <button type="button" onClick={onApply}>
          Apply
        </button>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
