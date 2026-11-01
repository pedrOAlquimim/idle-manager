import { describe, expect, test } from 'vitest';
import { sparkline } from '../src/shared/chart';

describe('sparkline', () => {
  test('no values draw nothing', () => {
    expect(sparkline([], 100, 30)).toEqual({ line: '', area: '', last: null });
  });

  test('two values span the full width, low at the bottom and high at the top', () => {
    expect(sparkline([0, 10], 100, 30)).toEqual({
      line: '0.0,26.0 100.0,6.0',
      area: '0,30 0.0,26.0 100.0,6.0 100,30',
      last: { x: 100, y: 6 },
    });
  });

  test('points are spread evenly along the width', () => {
    expect(sparkline([0, 5, 10], 100, 30).line).toBe('0.0,26.0 50.0,16.0 100.0,6.0');
  });

  test('a flat series sits on the baseline instead of dividing by zero', () => {
    expect(sparkline([7, 7, 7], 100, 30).line).toBe('0.0,26.0 50.0,26.0 100.0,26.0');
  });

  test('a ceiling keeps a quiet series low, and a value above the ceiling wins', () => {
    expect(sparkline([5, 5], 100, 30, 10).line).toBe('0.0,26.0 100.0,26.0');
    expect(sparkline([0, 20], 100, 30, 10).line).toBe('0.0,26.0 100.0,6.0');
    expect(sparkline([0, 5], 100, 30, 10).line).toBe('0.0,26.0 100.0,16.0');
  });

  test('a single value is one dot at the right edge', () => {
    expect(sparkline([3], 100, 30)).toMatchObject({ last: { x: 100, y: 26 } });
  });

  test('values that are not numbers are left out', () => {
    expect(sparkline([0, Number.NaN, 10], 100, 30).line).toBe(sparkline([0, 10], 100, 30).line);
  });
});
