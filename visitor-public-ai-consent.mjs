const STORAGE_KEY = 'borsaid-public-assistant-ai-consent-v1';
let sessionConsent = false;

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function hasPublicAssistantAiConsent(storage) {
  const target = resolveStorage(storage);
  try {
    if (target?.getItem(STORAGE_KEY) === 'granted') return true;
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  return sessionConsent;
}

export function setPublicAssistantAiConsent(approved, storage) {
  sessionConsent = approved === true;
  const target = resolveStorage(storage);
  let persisted = false;
  try {
    if (target) {
      if (sessionConsent) {
        target.setItem(STORAGE_KEY, 'granted');
        persisted = target.getItem(STORAGE_KEY) === 'granted';
      } else {
        target.removeItem(STORAGE_KEY);
        persisted = target.getItem(STORAGE_KEY) !== 'granted';
      }
    }
  } catch {
    // Keep the explicit choice for this page session only if storage is blocked.
  }
  return { consented: sessionConsent, persisted };
}
