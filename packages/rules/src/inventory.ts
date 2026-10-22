import type {
  BrowserMode,
  InventoryCookie,
  InventoryTracker,
  ScanEvidence,
  ScanResult,
} from '@privacyscan/shared';

/** Aggregates trackers and cookies across modes into a reviewable inventory. */
export function buildInventory(evidence: ScanEvidence): ScanResult['inventory'] {
  const trackers = new Map<string, InventoryTracker>();
  const cookies = new Map<string, InventoryCookie>();
  const unclassified = new Set<string>();

  const addMode = (list: BrowserMode[], mode: BrowserMode): void => {
    if (!list.includes(mode)) list.push(mode);
  };

  for (const mode of Object.values(evidence.modes)) {
    const beforeConsent = (phase: string): boolean =>
      mode.mode === 'baseline' || phase === 'pre-action';

    for (const r of mode.requests) {
      if (!r.tracker) {
        if (r.thirdParty) unclassified.add(r.hostname);
        continue;
      }
      const key = `${r.tracker.vendor}|${r.tracker.category}`;
      let t = trackers.get(key);
      if (!t) {
        t = {
          vendor: r.tracker.vendor,
          category: r.tracker.category,
          hostnames: [],
          seenIn: [],
          beforeConsent: false,
        };
        trackers.set(key, t);
      }
      if (!t.hostnames.includes(r.hostname)) t.hostnames.push(r.hostname);
      addMode(t.seenIn, mode.mode);
      t.beforeConsent ||= beforeConsent(r.phase);
    }

    for (const c of mode.cookies) {
      // Vendors seen only through cookies (e.g. a first-party analytics cookie) still belong in the list.
      if (c.tracker) {
        const tKey = `${c.tracker.vendor}|${c.tracker.category}`;
        let t = trackers.get(tKey);
        if (!t) {
          t = {
            vendor: c.tracker.vendor,
            category: c.tracker.category,
            hostnames: [],
            seenIn: [],
            beforeConsent: false,
          };
          trackers.set(tKey, t);
        }
        addMode(t.seenIn, mode.mode);
        t.beforeConsent ||= beforeConsent(c.phase);
      }
      const key = `${c.name}|${c.domain}`;
      const lifetime =
        c.expires > 0 ? Math.max(0, Math.round((c.expires - mode.capturedAt) / 86_400)) : null;
      let item = cookies.get(key);
      if (!item) {
        item = {
          name: c.name,
          domain: c.domain,
          ...(c.tracker ? { vendor: c.tracker.vendor, category: c.tracker.category } : {}),
          maxLifetimeDays: lifetime,
          thirdParty: c.thirdParty,
          seenIn: [],
        };
        cookies.set(key, item);
      } else if (
        lifetime !== null &&
        (item.maxLifetimeDays === null || lifetime > item.maxLifetimeDays)
      ) {
        item.maxLifetimeDays = lifetime;
      }
      addMode(item.seenIn, mode.mode);
    }
  }

  return {
    trackers: [...trackers.values()].sort((a, b) => a.vendor.localeCompare(b.vendor)),
    cookies: [...cookies.values()].sort((a, b) => a.name.localeCompare(b.name)),
    unclassifiedThirdPartyHosts: [...unclassified].sort(),
  };
}
