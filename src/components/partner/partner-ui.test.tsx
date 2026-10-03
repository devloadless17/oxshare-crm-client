import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stat } from './partner-ui';

describe('Stat', () => {
  it('wraps a long figure at its space before cutting inside it (3 Oct 2026)', () => {
    // `break-all` cut "20,000,000.00 LBP" into "20,000,0 / 00.00 LB / P" on a phone.
    render(<Stat label="Closing balance" value="20,000,000.00 LBP" large />);
    const figure = screen.getByText('20,000,000.00 LBP');
    expect(figure.className).not.toContain('break-all');
    expect(figure.className).toContain('[overflow-wrap:anywhere]');
  });
});
