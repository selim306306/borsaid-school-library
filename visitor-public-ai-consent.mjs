const LEGACY_STORAGE_KEY = 'borsaid-public-assistant-ai-consent-v1';

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function clearLegacyPublicAssistantAiConsent(storage) {
  const target = resolveStorage(storage);
  try {
    if (!target) return false;
    target.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
