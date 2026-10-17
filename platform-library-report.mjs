export const SITE_OWNER_LIBRARY_IDS = new Set([
  'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4',
  'c5d10456-1c6e-4bd1-8275-d14e354ac285',
]);

const METRIC_KEYS = Object.freeze([
  'branches', 'titles', 'copies', 'available', 'lost',
  'open_loans', 'overdue_loans', 'queued_reservations', 'ready_reservations',
]);

export function hasPlatformOwnerAccess(memberships = []) {
  return Array.isArray(memberships) && memberships.some(membership =>
    membership?.role === 'owner'
      && membership?.status === 'active'
      && SITE_OWNER_LIBRARY_IDS.has(String(membership?.library_id || '')),
  );
}

export function metricValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0;
}

export function libraryHasOperationalData(library = {}) {
  return METRIC_KEYS.some(key => metricValue(library[key]) > 0);
}

export function anonymousPlatformReport(report = {}) {
  const toMetrics = source => Object.fromEntries(METRIC_KEYS.map(key => [key, metricValue(source?.[key])]));
  const libraries = Array.isArray(report.libraries) ? report.libraries : [];
  return {
    scope: 'current_snapshot_all_registered_libraries',
    totals: toMetrics(report.totals),
    libraries: libraries.map((library, index) => ({
      label: `مكتبة ${index + 1}`,
      ...toMetrics(library),
    })),
  };
}
