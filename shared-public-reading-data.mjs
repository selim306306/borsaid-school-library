const requestsByFetch = new WeakMap();

function canonicalUrl(url) {
  try {
    return new URL(String(url), import.meta.url).href;
  } catch {
    return String(url);
  }
}

export function fetchSharedPublicReadingJson(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch غير متاح');

  let requests = requestsByFetch.get(fetchImpl);
  if (!requests) {
    requests = new Map();
    requestsByFetch.set(fetchImpl, requests);
  }

  const key = canonicalUrl(url);
  const existing = requests.get(key);
  if (existing) return existing;

  const request = Promise.resolve()
    .then(() => fetchImpl(url, { credentials: 'same-origin', cache: 'no-store' }))
    .then(async (response) => {
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 0}`);
      return response.json();
    })
    .catch((error) => {
      requests.delete(key);
      throw error;
    });

  requests.set(key, request);
  return request;
}
