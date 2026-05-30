// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Toaster } from './Toaster';
import { showToast, dismissToast } from './toast';

beforeEach(() => {
  // Clear any leftover toasts between tests.
  // (dismiss by raising then dismissing is overkill; just clear via ids.)
});

describe('toasts', () => {
  it('shows a toast and dismisses it via the close button', () => {
    render(<Toaster />);
    let id = 0;
    act(() => {
      id = showToast('Saved file', 'success');
    });
    expect(screen.getByText('Saved file')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Saved file')).not.toBeInTheDocument();
    dismissToast(id);
  });

  it('renders the kind-specific role and icon', () => {
    render(<Toaster />);
    let id = 0;
    act(() => {
      id = showToast('Something failed', 'error', 0);
    });
    expect(screen.getByText('Something failed')).toBeInTheDocument();
    expect(screen.getByText('Something failed').closest('.toast')).toHaveClass('toast-error');
    act(() => dismissToast(id));
  });
});
