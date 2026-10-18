import { renderPublicSchoolBranding } from './school-homepage-branding.mjs?v=eaf1851341b06f28';

export const SUPABASE_URL = 'https://eahptkwvjcnixlzlyznh.supabase.co';
// Public browser key; this request is anonymous and remains subject to existing RLS.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MpskNH6FyBeuQmb3Y9V2Aw_7d2L9x00';
export const PUBLIC_PROFILE_COLUMNS = 'library_id,school_name,educational_administration,librarian_name,school_logo_path,governorate_logo_path,principal_photo_path,principal_name,deputy_names,general_supervisor_name,first_supervisor_name,is_public,show_school_name_on_homepage';

export async function fetchInitialPublicProfiles(fetcher = fetch) {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/library_profiles`);
    url.searchParams.set('select', PUBLIC_PROFILE_COLUMNS);
    url.searchParams.set('order', 'school_name.asc');
    const response = await fetcher(url.href, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error('Public school profiles unavailable');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid public school profiles');
    return { data, error: null };
  } catch (error) {
    return { data: [], error };
  }
}

// Match the existing SDK's public storage URLs, including its image-error fallback.
export function publicBrandingLogoUrl(path, { original = false } = {}) {
  if (!path) return '';
  const objectPath = String(path).split('/').map(encodeURIComponent).join('/');
  if (original) return `${SUPABASE_URL}/storage/v1/object/public/school-branding/${objectPath}`;
  return `${SUPABASE_URL}/storage/v1/render/image/public/school-branding/${objectPath}?width=128&height=128&resize=contain&format=webp&quality=65`;
}

// A page-lifetime request, not a data cache. No SDK or staff session is needed to
// paint the header. The application consumes this same result once, then refetches
// normally for every owner edit/removal/publication change.
let initialProfilesRequest = typeof document === 'undefined' ? null : fetchInitialPublicProfiles();
if (initialProfilesRequest) {
  void initialProfilesRequest.then(result => {
    if (!result.error) renderPublicSchoolBranding(result.data, publicBrandingLogoUrl);
  });
}
export function takeInitialPublicProfilesRequest() {
  const request = initialProfilesRequest;
  initialProfilesRequest = null;
  return request;
}
