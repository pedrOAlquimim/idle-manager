import { EVENTS_PER_ACCOUNT, USAGE_SAMPLES } from '../shared/constants';
import type { HistoryEvent, UsageSample } from '../shared/types';

export interface ProcessUsage {
  pid: number;
  memoryKb: number;
  cpu: number;
}

const KB_PER_MB = 1024;

export function appendSample(series: readonly number[], value: number): number[] {
  return [...series, value].slice(-USAGE_SAMPLES);
}

export function usageForProcess(usage: readonly ProcessUsage[], pid: number): UsageSample | null {
  const found = usage.find((process) => process.pid === pid);
  return found === undefined ? null : { memoryMb: found.memoryKb / KB_PER_MB, cpu: found.cpu };
}

export function totalUsage(usage: readonly ProcessUsage[]): UsageSample {
  return usage.reduce<UsageSample>(
    (total, process) => ({ memoryMb: total.memoryMb + process.memoryKb / KB_PER_MB, cpu: total.cpu + process.cpu }),
    { memoryMb: 0, cpu: 0 },
  );
}

export function appendEvent(events: readonly HistoryEvent[], event: HistoryEvent): HistoryEvent[] {
  return [event, ...events].slice(0, EVENTS_PER_ACCOUNT);
}
