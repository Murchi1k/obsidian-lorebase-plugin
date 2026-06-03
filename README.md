# Lorebase

Lorebase is an Obsidian plugin for tracking games and anime in a local Markdown-based library.

It lets you organize titles with card views, statuses, ratings, favorites, tags, metadata integrations, and collection statistics. Your data stays in your vault as regular Markdown files.

## Features

- Game and anime libraries
- Vertical and horizontal card views
- Search, filters, and sorting
- Status tracking
- Personal ratings and favorites
- Tags, genres, and series grouping
- Collection statistics
- Custom card appearance
- English and Russian interface
- Metadata integrations for faster note creation

## Integrations

Lorebase can search external metadata providers when creating new notes.

Game providers:

- RAWG
- Steam
- HowLongToBeat

Anime providers:

- AniList
- Shikimori

RAWG requires an API key. You can enter it in the plugin settings under Integrations.

## Installation

### Manual installation

1. Download the latest release from GitHub.
2. Copy these files from the release:

```text
main.js
manifest.json
styles.css
```

3. Place them in this folder inside your vault:

```text
Vault/.obsidian/plugins/lorebase/
```

4. Restart Obsidian or reload plugins.
5. Enable Lorebase in Settings -> Community plugins.

### Build from source

Install dependencies:

```bash
npm install
```

Build the plugin:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Basic Usage

1. Open Lorebase from the ribbon icon or command palette.
2. Choose Games or Anime.
3. Use the add button to search for a title through the configured providers.
4. Review the selected result and create a note.
5. Edit status, rating, favorite flag, tags, dates, and progress from the card or edit modal.

## Settings

The settings tab lets you configure:

- Library folders
- Enabled media types
- Interface language
- Accent color
- Card layout and size
- Status labels
- Game plan tags
- Metadata providers
- Note templates

## Data Storage

Lorebase stores items as Markdown files in your vault. This keeps your library portable, editable, and easy to back up.

## License

MIT
