# Release notes

All release history lives inside the update window. The common settings header contains the launch button in every section; there is no separate Changelog settings section. All notes are bundled and work offline.

- `features.ts`: eighteen localized 4.0.0 feature descriptions, details, icons and destinations, with library search examples in `searchFeature.ts` and workflow highlights in `workflowFeatures.ts`. These also supply the corresponding changelog entries, so the tour and history stay consistent.
- `catalog.ts`: additional changes, fixes, version ordering and historical localization.
- `workflowNotes.ts`: localized 4.0.0 notes for actors, game tracking, episode tracking and filtering, assigned to their appropriate changelog groups.
- `additionalNotes.ts`: localized 4.0.0 changelog entries for integrations, the tagged-note inbox, priority, personal notes, completion dates and other features.
- `legacy.ts` / `legacyTranslations.ts`: original English entries and complete Russian, Ukrainian and Simplified Chinese translations, in matching order. Tests enforce counts and language coverage.
- `community.ts`: translated acknowledgments, AniList attribution and the maintainer's message about pull requests.
- `explorer.ts`: a compact feature pager with eighteen destinations; `render.ts`: version/category selection and individually expandable notes. The full text stays bundled; the global details control expands all notes in the selected category.

For a new release, preserve the existing notes and feature descriptions and add the new version. Add any new destination to `main.ts` and its targeted settings/view method. Update manifest.json, package.json, the root and root-package versions in package-lock.json, versions.json and the public README. Run `npm run typecheck`, `npm test`, and `npm run build`; distribute manifest.json, main.js and styles.css together.

`lastSeenReleaseVersion` is a high-water mark. Fresh installations remember their version silently. Existing installations without a marker see the window once after workspace initialization. Upgrades show it once; restarting or downgrading does not. Unknown versions show the missing-notes message instead of relabeling old highlights. Reopen the tour using the What’s new control in the common settings header.

No historical versions without documented notes are invented. The 4.0.0 animation entry explicitly describes the temporary workaround, not a completed animation overhaul.

The update modal retains its in-memory view state when reopened. Trying a feature offers a dismissible return control. Returning closes the destination modal opened by the tour and resumes the same feature. Settings destinations receive a temporary focus/highlight; no feature configuration is changed by navigation. Installed version accents remain visible when selecting older releases. History also remembers its selected category.
