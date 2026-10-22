import seed from './data/seed.json' with { type: 'json' };
import { TrackerMatcher, type TrackerDataset } from './matcher.js';

export * from './matcher.js';

export const seedDataset: TrackerDataset = seed as TrackerDataset;

export function createDefaultMatcher(): TrackerMatcher {
  return new TrackerMatcher(seedDataset);
}
