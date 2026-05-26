// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs, relativeSegments } from './Breadcrumbs';

vi.mock('@strix/editor', () => ({ languageForPath: () => 'typescript' }));

describe('relativeSegments', () => {
  it('makes the workspace folder the first crumb (POSIX paths)', () => {
    expect(relativeSegments('/ws', '/ws/src/a.ts')).toEqual(['ws', 'src', 'a.ts']);
  });

  it('handles Windows backslash paths', () => {
    expect(relativeSegments('C:\\proj', 'C:\\proj\\app\\main.ts')).toEqual([
      'proj',
      'app',
      'main.ts',
    ]);
  });

  it('falls back to the raw path when it is outside the root', () => {
    expect(relativeSegments('/ws', '/other/file.ts')).toEqual(['other', 'file.ts']);
  });

  it('splits the whole path when there is no root', () => {
    expect(relativeSegments(null, '/a/b.ts')).toEqual(['a', 'b.ts']);
  });
});

describe('Breadcrumbs', () => {
  it('renders a crumb per segment relative to the workspace', () => {
    render(<Breadcrumbs rootPath="/ws" path="/ws/src/a.ts" />);
    const nav = screen.getByLabelText('breadcrumbs');
    expect(nav).toHaveTextContent('ws');
    expect(nav).toHaveTextContent('src');
    expect(nav).toHaveTextContent('a.ts');
  });
});
