import React from 'react';

// A single settings row: label + description on the left, the control on the
// right. Hidden entirely when a search query doesn't match its text, which is
// how the settings search filters rows across every section.
export function Row({
  query,
  label,
  desc,
  children,
}: {
  query: string;
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  if (query && !`${label} ${desc}`.toLowerCase().includes(query.toLowerCase())) return null;
  return (
    <div className="set-row">
      <div className="set-info">
        <div className="set-label">{label}</div>
        <div className="set-desc">{desc}</div>
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

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
