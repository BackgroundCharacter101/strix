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

// One row: label + description on the left, control right-aligned.
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        {htmlFor ? (
          <label className="set-row-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="set-row-label">{label}</span>
        )}
        {description && <span className="set-row-desc">{description}</span>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}
