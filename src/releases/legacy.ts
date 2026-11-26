import type { ReleaseNotes } from './catalog';

// Archived from the repository README; original release language is English.
export const LEGACY_RELEASES: ReleaseNotes[] = [
    {
        "version": "3.0.1",
        "notice": "Mobile UI is in active development. The reworked mobile interface for the library, add, and edit flows is an early alpha — expect rough edges while it's polished over the next few releases.",
        "groups": [
            {
                "kind": "added",
                "items": [
                    "Import existing notes — bring notes into your library with automatic media-type detection, field mapping, and a preview of the changes",
                    "Metadata sources for existing cards — link a card to a provider, switch providers, and safely refresh its data",
                    "Community ratings — score, vote count, and a manual refresh of provider data",
                    "Extended progress — seasons, episodes, volumes, chapters, DLC, active parts, and quick actions right from the card",
                    "\"My Notes\" section — edit your personal text without touching the note's structure",
                    "Related media — create links between games, anime, movies, TV shows, books, and manga",
                    "Start and completion dates — convenient date pickers, auto-set on completion, and the date shown on the card",
                    "Saved library views — your own sort/group/filter presets for each media type",
                    "Advanced filters — filter on system and custom YAML fields, lists, numbers, and dates",
                    "Card click action — open the note or jump straight into editing",
                    "Request diagnostics — a log of requests, errors, retries, and temporary provider rate-limit blocks",
                    "Steam Sync controls — a progress window with pause, resume, cancel, and detailed processing results",
                    "MangaUpdates — new primary manga search provider, replacing Jikan for manga"
                ]
            },
            {
                "kind": "improved",
                "items": [
                    "Reworked mobile interface for the library, add, and edit flows across all media types (early alpha — still a lot of work ahead)",
                    "Editors now share a unified field layout, tabs, a pinned save bar, and common metadata panels",
                    "Steam Sync got a faster preview, earlier duplicate detection, and improved library/wishlist loading",
                    "Improved providers and fallback sources for games, anime, movies, TV shows, books, and manga",
                    "Improved templates and frontmatter generation: arrays, numbers, dates, field order, and consistent naming",
                    "Added safe request throttling, retries, and protection against 403 and 429 errors",
                    "Improved handling of local images, remote posters, and custom covers",
                    "Expanded appearance settings for cards, completion date format, and library effects",
                    "Reworked the virtual grid, scroll restoration, and rendering for large libraries"
                ]
            },
            {
                "kind": "fixed",
                "items": [
                    "Improved handling of provider 403 and 429 errors: added safe pauses, retries, and protection against excessive requests",
                    "Plans and tags now write to notes correctly, including values with spaces",
                    "Fixed metadata-source recording and detection when adding cards from mobile",
                    "Fixed major mobile UI issues: overlapping panels, duplicate close button, status display, and editor behavior",
                    "Fixed DLC loading, vertical Steam cover selection, and SteamGridDB fallback",
                    "Fixed metadata updates wiping personal progress, custom fields, and manually edited values",
                    "Improved stability of search, import, Steam Sync, and external provider requests"
                ]
            }
        ]
    },
    {
        "version": "2.0.6",
        "groups": [
            {
                "kind": "added",
                "items": [
                    "New media types — Movies, TV Shows, Books, and Manga are now fully supported as standalone libraries",
                    "New metadata providers — TMDB, TVmaze, OMDb, Hardcover, Google Books, Jikan, and MangaDex",
                    "Manual card creation — add media without searching through a provider",
                    "SteamGridDB — fallback source for high-quality vertical Steam covers",
                    "Reading progress — pages, chapters, volumes, and manga progress tracking",
                    "Show progress — seasons, episodes, and an active-part tracker for shows",
                    "Related media — link local notes to each other",
                    "New per-media settings — dedicated folders, templates, badges, and appearance for each media type",
                    "Card style modes — choose between hover overlay cards and progress-footer cards where supported",
                    "Book cover effect — optional hardcover-style cards for books and manga",
                    "Ukrainian localization — new beta interface language",
                    "Wishlist status for games",
                    "New templates — dedicated note templates for movies, TV shows, books, and manga"
                ]
            },
            {
                "kind": "improved",
                "items": [
                    "Fully reworked plugin settings",
                    "Added a tabbed or accordion layout mode for settings",
                    "Added folder suggestions for library paths and image storage paths",
                    "Added per-media preview controls for card appearance settings",
                    "Improved library cards and progress display",
                    "Updated editor modals",
                    "Improved manual creation with cover URL/file support and media-specific fields",
                    "Improved genre and tag editing in modals",
                    "Improved handling of genres, tags, ratings, and statuses",
                    "Improved Steam Sync and Steam image matching",
                    "Improved handling of local and remote posters",
                    "Improved Russian and English localization",
                    "Expanded statistics to cover all new media types"
                ]
            },
            {
                "kind": "fixed",
                "items": [
                    "Removed the obsolete Coming Soon / In development settings section",
                    "Fixed book add flow using the wrong cover or metadata after selecting a search result",
                    "Fixed manga add flow resetting selection when searching for another title",
                    "Book and manga hover overlays have stronger background readability",
                    "Book and manga card text sizing is more readable",
                    "Anime and TV progress-footer cards keep the same hover behavior as books and manga",
                    "Manga hover cards now lift consistently in hover mode",
                    "Anime virtual-grid progress footers no longer overlap the next row",
                    "Anime and TV season/part chips now use status colors consistently",
                    "README data format examples now match the current snake_case frontmatter fields"
                ]
            }
        ]
    },
    {
        "version": "1.1.0",
        "groups": [
            {
                "kind": "added",
                "items": [
                    "Steam Sync — import your Steam library and wishlist directly",
                    "IGDB provider for game metadata",
                    "Anime Title Parts auto-fill",
                    "Horizontal cover support in templates",
                    "Experimental: poster download from URL to local storage"
                ]
            },
            {
                "kind": "improved",
                "items": [
                    "Small redesign of the add window",
                    "HowLongToBeat integration"
                ]
            },
            {
                "kind": "fixed",
                "items": [
                    "Support buttons in settings",
                    "Dropdown formatting under description",
                    "Removed unnecessary media providers block"
                ]
            }
        ]
    }
];
