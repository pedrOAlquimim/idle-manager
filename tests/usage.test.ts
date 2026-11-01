import { describe, expect, test } from 'vitest';
import { appendEvent, appendSample, totalUsage, usageForProcess } from '../src/core/usage';
import { accountId } from '../src/shared/types';
import type { HistoryEvent } from '../src/shared/types';

const event = (id: number): HistoryEvent => ({ id, accountId: accountId('principal'), text: `event ${id}`, at: id * 1000 });

describe('appendSample', () => {
  test('series keeps only 30 samples', () => {
    let series: number[] = [];
    for (let value = 0; value < 35; value += 1) series = appendSample(series, value);
    expect(series).toHaveLength(30);
    expect(series[0]).toBe(5);
    expect(series.at(-1)).toBe(34);
  });

  test('a short series just grows and the input is not mutated', () => {
    const input = Object.freeze([1, 2]);
    expect(appendSample(input, 3)).toEqual([1, 2, 3]);
    expect(input).toEqual([1, 2]);
  });
});

describe('usageForProcess', () => {
  test('usage converts KB to MB and returns null without the pid', () => {
    const usage = [{ pid: 7, memoryKb: 204800, cpu: 0.5 }];
    expect(usageForProcess(usage, 7)).toEqual({ memoryMb: 200, cpu: 0.5 });
    expect(usageForProcess(usage, 8)).toBeNull();
  });

  test('the right process is picked among several', () => {
    const usage = [
      { pid: 1, memoryKb: 1024, cpu: 0.1 },
      { pid: 2, memoryKb: 2048, cpu: 0.2 },
    ];
    expect(usageForProcess(usage, 2)).toEqual({ memoryMb: 2, cpu: 0.2 });
  });
});

describe('totalUsage', () => {
  test('total adds every process', () => {
    const usage = [
      { pid: 1, memoryKb: 204800, cpu: 0.5 },
      { pid: 2, memoryKb: 102400, cpu: 1.25 },
    ];
    expect(totalUsage(usage)).toEqual({ memoryMb: 300, cpu: 1.75 });
  });

  test('total of nothing is zero', () => {
    expect(totalUsage([])).toEqual({ memoryMb: 0, cpu: 0 });
  });
});

describe('appendEvent', () => {
  test('history keeps 50 events, newest first', () => {
    let history: HistoryEvent[] = [];
    for (let id = 0; id < 55; id += 1) history = appendEvent(history, event(id));
    expect(history).toHaveLength(50);
    expect(history[0]?.id).toBe(54);
    expect(history.at(-1)?.id).toBe(5);
  });

  test('a short history just grows and the input is not mutated', () => {
    const input = Object.freeze([event(1)]);
    expect(appendEvent(input, event(2)).map((e) => e.id)).toEqual([2, 1]);
    expect(input).toHaveLength(1);
  });
});
