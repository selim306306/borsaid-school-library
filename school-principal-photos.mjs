const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function publicSchoolPrincipals(profiles = []) {
  const seen = new Set();
  return profiles.filter(profile => {
    if (!profile?.library_id || seen.has(profile.library_id) || profile.is_public !== true) return false;
    const prefix = `${profile.library_id}/principal-photo-`;
    if (!String(profile.principal_name || '').trim() || !String(profile.school_name || '').trim()
      || !String(profile.principal_photo_path || '').startsWith(prefix)
      || !new RegExp(`^${UUID}/principal-photo-${UUID}$`).test(profile.principal_photo_path)) return false;
    seen.add(profile.library_id);
    return true;
  });
}
export function renderSchoolPrincipalCards(list, profiles, photoUrl) {
  if (!list) return;
  list.querySelectorAll('[data-school-principal]').forEach(card => card.remove());
  for (const profile of publicSchoolPrincipals(profiles)) {
    const card = document.createElement('li');
    card.className = 'leadership-person';
    card.dataset.schoolPrincipal = profile.library_id;
    const image = document.createElement('img');
    image.className = 'leadership-photo leadership-photo-principal';
    image.src = photoUrl(profile.principal_photo_path);
    image.alt = `صورة ${profile.principal_name}، مدير ${profile.school_name}`;
    image.width = 240;
    image.height = 300;
    image.loading = 'lazy';
    image.decoding = 'async';
    const copy = document.createElement('div');
    copy.className = 'leadership-person-copy';
    const name = document.createElement('strong');
    name.className = 'leadership-person-name';
    name.textContent = profile.principal_name;
    const title = document.createElement('span');
    title.className = 'leadership-person-title';
    title.textContent = `مدير المدرسة · ${profile.school_name}`;
    const source = document.createElement('span');
    source.className = 'leadership-person-source';
    source.textContent = 'بيانات وصورة أضافهما مالك المدرسة';
    copy.append(name, title, source);
    card.append(image, copy);
    list.append(card);
  }
}
