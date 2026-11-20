import {
  AUTO_OPTIMIZE_GAP_MS,
  HOUR_MS,
  MAX_OPTIMIZE_HOURS,
  MIN_OPTIMIZE_HOURS,
  RECENT_USE_MS,
} from '../shared/constants';
import type { AccountId, AccountStatus } from '../shared/types';

// Whole hours only: "6,5" or "1e1" in the custom field are mistakes to show, not values to guess.
export function parseOptimizeHours(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const hours = Number(trimmed);
  return hours >= MIN_OPTIMIZE_HOURS && hours <= MAX_OPTIMIZE_HOURS ? hours : null;
}

// A settled page: not off, down or blocked, and not already loading, which an optimization would interrupt.
export function canOptimize(status: AccountStatus): boolean {
  return status === 'connected' || status === 'login' || status === 'notice';
}

export function optimizeDueAt(hours: number | null, freshSince: number | null): number | null {
  return hours === null || freshSince === null ? null : freshSince + hours * HOUR_MS;
}

export function isInUse(lastUsedAt: number | null, now: number): boolean {
  return lastUsedAt !== null && now - lastUsedAt < RECENT_USE_MS;
}

export interface OptimizeCandidate {
  id: AccountId;
  hours: number | null;
  freshSince: number | null;
  lastUsedAt: number | null;
  status: AccountStatus;
}

// One automatic optimization at a time, a minute apart, the most overdue first: accounts opened together
// never restart together.
export function nextAutoOptimization(
  candidates: readonly OptimizeCandidate[],
  lastAutoAt: number | null,
  now: number,
): AccountId | null {
  if (lastAutoAt !== null && now - lastAutoAt < AUTO_OPTIMIZE_GAP_MS) return null;
  let next: { id: AccountId; dueAt: number } | null = null;
  for (const candidate of candidates) {
    const dueAt = optimizeDueAt(candidate.hours, candidate.freshSince);
    if (dueAt === null || dueAt > now || !canOptimize(candidate.status) || isInUse(candidate.lastUsedAt, now)) continue;
    if (next === null || dueAt < next.dueAt) next = { id: candidate.id, dueAt };
  }
  return next?.id ?? null;
}
