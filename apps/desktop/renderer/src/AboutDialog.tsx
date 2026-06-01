import React, { useEffect, useRef } from 'react';
import { OwlIcon } from './icons';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the close button and support Escape-to-close (parity with PromptDialog).
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div
        className="dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="About Strix"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="about-mark">
          <OwlIcon size={56} />
        </div>
        <h2 className="about-name">Strix</h2>
        <p className="about-tagline">AI-native code editor</p>
        <dl className="about-meta">
          <div>
            <dt>Version</dt>
            <dd>0.1.0 (dev)</dd>
          </div>
          <div>
            <dt>Engine</dt>
            <dd>Electron + React + Monaco</dd>
          </div>
          <div>
            <dt>AI backbone</dt>
            <dd>FreeLLMAPI (local)</dd>
          </div>
        </dl>
        <div className="dialog-actions">
          <button ref={closeRef} type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
