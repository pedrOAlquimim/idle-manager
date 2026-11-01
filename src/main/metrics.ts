import { app } from 'electron';
import type { ProcessUsage } from '../core/usage';

// Electron reports memory in kilobytes and CPU as a percentage since the previous call.
export function readProcessUsage(): ProcessUsage[] {
  return app.getAppMetrics().map((metric) => ({
    pid: metric.pid,
    memoryKb: metric.memory.workingSetSize,
    cpu: metric.cpu.percentCPUUsage,
  }));
}
