import React, { useEffect, useRef, useState } from 'react';

// A minimal single-input modal. Electron blocks window.prompt(), so naming
// (new file/folder, rename) goes through this instead.
export function PromptDialog({
  title,
  initialValue = '',
  confirmLabel = 'OK',
  onSubmit,
  onCancel,
}: {
  title: string;
  initialValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="palette-overlay" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="strix-prompt-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title" id="strix-prompt-title">
          {title}
        </h2>
        <input
          ref={inputRef}
          className="dialog-input"
          aria-label={title}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <div className="dialog-actions">
          <button type="button" className="ai-ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={value.trim().length === 0}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
