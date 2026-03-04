export interface AppReleaseManifest {
  version: string;
  publishedAt: string;
  notes: string[];
}

export const APP_BUILD_VERSION = '2026.03.04-r2';
export const RELEASE_NOTES_STORAGE_KEY = 'azadiyan_release_notes_seen_version';
export const RELEASE_MANIFEST_URL = '/release-manifest.json';

export const APP_RELEASE: AppReleaseManifest = {
  version: APP_BUILD_VERSION,
  publishedAt: '2026-03-04',
  notes: [
    'Profile panel now includes a dedicated logout button.',
    'Backend logout flow is complete so sign-out is fully enforced.',
    'Unread message badge now updates correctly when new messages arrive.',
    '.gitignore was tightened to reduce noisy generated files in git changes.',
    'Mobile keyboard behavior was fixed: no black gap and only message area scrolls.',
    'Online/offline status and last-seen timestamps are now more accurate.',
    'Group members are visible, and members can now be added/removed with role checks.',
    'Voice recording upload/send pipeline was fixed end-to-end.',
    'Upload loaders and percentage progress were added for files and voice.',
    'Theme toggle stayed on main page, and chat header action is now manual refresh fallback.',
    'Message edit/delete was added with owner-only controls and two-way realtime sync.',
    'Long-press no longer triggers native text selection; only app context actions are shown.',
    'Release versioning and update modal were added with one-time-per-version display and forced update reload.'
  ]
};
