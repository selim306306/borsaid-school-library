export function shouldShowSchoolNameOnHomepage(profile) {
  return profile?.show_school_name_on_homepage !== false;
}

export function renderPublicProfilesAsSoonAsAvailable(profilesRequest, onProfilesReady) {
  return Promise.resolve(profilesRequest).then((result) => {
    const profiles = result?.error ? [] : (result?.data || []);
    onProfilesReady(profiles);
    return result;
  });
}
