import { describe, expect, it } from 'vitest';
import { statusTagColor } from './statusTagColor';

describe('statusTagColor', () => {
  it('maps every preset presence key to its established tag color', () => {
    expect(statusTagColor('working')).toBe('green');
    expect(statusTagColor('business_trip')).toBe('purple');
    expect(statusTagColor('field_research')).toBe('cyan');
    expect(statusTagColor('out')).toBe('orange');
    expect(statusTagColor('leave')).toBe('orange');
  });

  it('uses a neutral tag color for unknown custom keys', () => {
    expect(statusTagColor('client_visit')).toBe('blue');
  });
});
