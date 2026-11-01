import { afterAll } from 'vitest';
import { killLeftovers } from './helpers';

// A safety net for a hung app: whatever a file started and did not close dies when the file ends.
afterAll(killLeftovers);
