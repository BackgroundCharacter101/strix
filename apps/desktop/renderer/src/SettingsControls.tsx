import React from 'react';

// A switch, not an <input type="checkbox">. The native control renders as a
// blue Windows box inside a near-black amber IDE, which is why the old panel
// looked borrowed from another app.
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`set-toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="set-toggle-knob" aria-hidden />
    </button>
  );
}
