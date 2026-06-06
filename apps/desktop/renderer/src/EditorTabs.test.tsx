// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorTabs } from './EditorTabs';
import type { EditorTabsApi } from './useEditorTabs';

function api(overrides: Partial<EditorTabsApi> = {}): EditorTabsApi {
  return {
    tabs: [],
    activePath: null,
    active: null,
    isDirty: () => false,
    open: vi.fn(),
    activate: vi.fn(),
    close: vi.fn(),
    saveAll: vi.fn(),
    replaceAll: vi.fn(),
    ...overrides,
  };
}

describe('EditorTabs', () => {
  it('renders nothing when no files are open', () => {
    const { container } = render(<EditorTabs tabs={api()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a tab per open file with the basename and marks the active one', () => {
    render(
      <EditorTabs tabs={api({ tabs: ['/ws/a.ts', '/ws/b.ts'], activePath: '/ws/b.ts' })} />,
    );
    expect(screen.getByRole('tab', { name: /a\.ts/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /b\.ts/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a dirty marker for unsaved tabs', () => {
    render(
      <EditorTabs
        tabs={api({ tabs: ['/ws/a.ts'], activePath: '/ws/a.ts', isDirty: () => true })}
      />,
    );
    expect(screen.getByRole('tab', { name: /a\.ts/ })).toHaveTextContent('●');
  });

  it('activates and closes tabs via clicks', () => {
    const activate = vi.fn();
    const close = vi.fn();
    render(
      <EditorTabs
        tabs={api({ tabs: ['/ws/a.ts', '/ws/b.ts'], activePath: '/ws/a.ts', activate, close })}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /b\.ts/ }));
    expect(activate).toHaveBeenCalledWith('/ws/b.ts');

    fireEvent.click(screen.getByRole('button', { name: 'close a.ts' }));
    expect(close).toHaveBeenCalledWith('/ws/a.ts');
  });

  it('closes a tab on middle-click', () => {
    const close = vi.fn();
    render(<EditorTabs tabs={api({ tabs: ['/ws/a.ts'], activePath: '/ws/a.ts', close })} />);

    const tab = screen.getByRole('tab', { name: /a\.ts/ });
    tab.parentElement?.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
    expect(close).toHaveBeenCalledWith('/ws/a.ts');
  });
});
