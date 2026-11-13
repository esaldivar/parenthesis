import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Angular/jsdom and axe scans compete heavily for CPU when Vitest starts one
    // worker per available core. Bound that contention without extending test
    // deadlines, changing isolation or reducing accessibility assertions.
    // Retain Vitest's smaller default on one- and two-core hosts.
    maxWorkers: Math.min(2, Math.max(1, availableParallelism() - 1)),
  },
});
