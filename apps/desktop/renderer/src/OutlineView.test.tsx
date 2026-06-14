// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OutlineView } from './OutlineView';

const src = 'export class Foo {\n  bar() {}\n}\nexport function baz() {}';

describe('OutlineView', () => {
  it('prompts to open a file when none is active', () => {
    render(<OutlineView path={null} content="" onJump={vi.fn()} />);
    expect(screen.getByText(/Open a file/)).toBeInTheDocument();
  });

  it('lists symbols and jumps to a symbol line on click', () => {
    const onJump = vi.fn();
    render(<OutlineView path="x.ts" content={src} onJump={onJump} />);
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('baz')).toBeInTheDocument();

    fireEvent.click(screen.getByText('baz'));
    expect(onJump).toHaveBeenCalledWith(4);
  });

  it('filters symbols by the query box', () => {
    render(<OutlineView path="x.ts" content={src} onJump={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Filter symbols'), { target: { value: 'baz' } });
    expect(screen.getByText('baz')).toBeInTheDocument();
    expect(screen.queryByText('Foo')).not.toBeInTheDocument();
  });
});
