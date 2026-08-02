// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { ProposeIcon, AutoApplyIcon, PlanIcon } from './icons';

describe('agent mode icons', () => {
  it('render an svg that inherits currentColor', () => {
    for (const Icon of [ProposeIcon, AutoApplyIcon, PlanIcon]) {
      const { container, unmount } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      unmount();
    }
  });

  it('respect the size prop', () => {
    const { container } = render(<PlanIcon size={20} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20');
  });
});
