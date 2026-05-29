import React from 'react';
import { OwlIcon } from './icons';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="dialog about-dialog" onMouseDown={(e) => e.stopPropagation()}>
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
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
