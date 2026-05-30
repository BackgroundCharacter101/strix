// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('@strix/editor', () => ({ languageForPath: () => 'typescript' }));
import { Palette, type PaletteItem } from './Palette';

const items: PaletteItem[] = [
  { id: '/ws/a.ts', label: 'a.ts', detail: 'src', icon: 'a.ts' },
  { id: '/ws/b.css', label: 'b.css', detail: 'styles', icon: 'b.css' },
  { id: '/ws/readme.md', label: 'readme.md', detail: '', icon: 'readme.md' },
];

describe('Palette', () => {
  it('filters items by the query', () => {
    render(<Palette items={items} placeholder="Search" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'css' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('b.css');
  });

  it('selects with Enter (respecting arrow navigation)', () => {
    const onSelect = vi.fn();
    render(<Palette items={items} placeholder="Search" onSelect={onSelect} onClose={vi.fn()} />);
    const input = screen.getByLabelText('Search');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Palette items={items} placeholder="Search" onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('fuzzy-matches non-contiguous characters and highlights them', () => {
    render(<Palette items={items} placeholder="Search" onSelect={vi.fn()} onClose={vi.fn()} />);
    // 'rdm' is a subsequence of 'readme.md'.
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'rdm' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('readme.md');
    // The matched characters are wrapped for highlighting.
    expect(options[0].querySelectorAll('.palette-hl').length).toBe(3);
  });

  it('orders recent ids first when the query is empty', () => {
    render(
      <Palette
        items={items}
        placeholder="Search"
        recentIds={['/ws/readme.md']}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('readme.md');
  });

  it('shows an empty state when nothing matches', () => {
    render(<Palette items={items} placeholder="Search" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});
