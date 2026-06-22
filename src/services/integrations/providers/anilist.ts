import type { AnimeFormat } from '../../../types';
import { AnimeDetails, IntegrationAnimePart, SearchResult } from '../types';
import { JsonFetcher, asObject, getArray, getObject, getString, mapAnimeFormat, mapStringList, pickAnimeTitle, stripHtml } from './common';

export async function searchAniList(fetchJson: JsonFetcher, query: string): Promise<SearchResult[]> {
    const gql = `query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title {
        userPreferred
        romaji
        english
        native
      }
      startDate {
        year
      }
      format
      coverImage {
        large
        medium
      }
    }
  }
}`;

    const json = await fetchJson(
        'https://graphql.anilist.co',
        {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        'POST',
        JSON.stringify({
            query: gql,
            variables: { search: query, page: 1, perPage: 10 },
        })
    );

    const root = asObject(json);
    const data = getObject(root, 'data');
    const page = getObject(data, 'Page');
    const results = getArray(page, 'media');

    return results.map((item) => {
        const record = asObject(item);
        const startDate = getObject(record, 'startDate');
        const year = getString(startDate, 'year');
        const coverImage = getObject(record, 'coverImage');
        return {
            id: getString(record, 'id'),
            title: pickAnimeTitle(record?.title),
            subtitle: year,
            year,
            format: mapAnimeFormat(getString(record, 'format')),
            image: getString(coverImage, 'large') || getString(coverImage, 'medium'),
            provider: 'anilist',
        };
    });
}

export async function getAniListDetails(fetchJson: JsonFetcher, id: string): Promise<AnimeDetails | null> {
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId)) return null;

    const gql = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title {
      userPreferred
      romaji
      english
      native
    }
    description(asHtml: false)
    genres
    episodes
    studios(isMain: true) {
      nodes {
        name
      }
    }
    startDate {
      year
    }
    averageScore
    siteUrl
    format
    coverImage {
      extraLarge
      large
    }
    relations {
      edges {
        relationType
        node {
          id
          type
          title {
            userPreferred
            romaji
            english
            native
          }
          format
          episodes
          startDate {
            year
          }
          coverImage {
            large
          }
        }
      }
    }
  }
}`;

    const json = await fetchJson(
        'https://graphql.anilist.co',
        {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        'POST',
        JSON.stringify({
            query: gql,
            variables: { id: numericId },
        })
    );

    const root = asObject(json);
    const data = getObject(root, 'data');
    const item = getObject(data, 'Media');
    if (!item) return null;

    const scoreValue = item.averageScore;
    const score = typeof scoreValue === 'number'
        ? (scoreValue / 10).toFixed(1)
        : '';
    const tags = mapStringList(getArray(item, 'genres'), (entry) => entry);
    const studiosRoot = getObject(item, 'studios');
    const studios = mapStringList(getArray(studiosRoot, 'nodes'), (studio) => getString(asObject(studio), 'name'));
    const startDate = getObject(item, 'startDate');
    const coverImage = getObject(item, 'coverImage');
    const image = getString(coverImage, 'extraLarge') || getString(coverImage, 'large');
    const parts = await getAniListRelatedParts(fetchJson, item);

    return {
        name: pickAnimeTitle(item.title),
        description: stripHtml(getString(item, 'description')),
        image,
        imageHorizontal: image,
        tags,
        studios,
        year: getString(startDate, 'year'),
        imdbRating: score,
        url: getString(item, 'siteUrl'),
        format: mapAnimeFormat(getString(item, 'format')),
        parts,
    };
}

async function getAniListRelatedParts(fetchJson: JsonFetcher, root: Record<string, unknown>): Promise<IntegrationAnimePart[]> {
    const byId = new Map<string, Record<string, unknown>>();
    const pending: Record<string, unknown>[] = [root];
    const visited = new Set<string>();
    const maxItems = 24;

    while (pending.length && byId.size < maxItems) {
        const current = pending.shift();
        if (!current) continue;

        const id = getString(current, 'id');
        if (!id || visited.has(id)) continue;
        visited.add(id);
        byId.set(id, current);

        for (const related of getAniListRelationNodes(current)) {
            const relatedId = getString(related, 'id');
            if (!relatedId || visited.has(relatedId) || byId.has(relatedId)) continue;
            byId.set(relatedId, related);
            if (byId.size >= maxItems) break;
            const hydrated = await getAniListRelationMedia(fetchJson, relatedId);
            if (hydrated) pending.push(hydrated);
        }
    }

    const media = Array.from(byId.values()).sort(compareAniListMedia);
    let tvSeason = 0;
    return media.map((item, index) => {
        const kind = mapAniListKind(getString(item, 'format'));
        const seasonNumber = kind === 'tv' ? ++tvSeason : null;
        return {
            id: `anilist-${getString(item, 'id') || index + 1}`,
            kind,
            title: pickAnimeTitle(item.title),
            seasonNumber,
            episodeCurrent: 0,
            episodeTotal: getNumber(item, 'episodes'),
            status: 'planned',
        };
    });
}

function getAniListRelationNodes(item: Record<string, unknown>): Record<string, unknown>[] {
    const relations = getObject(item, 'relations');
    const edges = getArray(relations, 'edges');
    const allowed = new Set(['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'SUMMARY', 'OTHER']);
    const nodes: Record<string, unknown>[] = [];

    for (const edgeRaw of edges) {
        const edge = asObject(edgeRaw);
        if (!allowed.has(getString(edge, 'relationType'))) continue;
        const node = getObject(edge, 'node');
        if (!node || getString(node, 'type') !== 'ANIME') continue;
        nodes.push(node);
    }

    return nodes;
}

async function getAniListRelationMedia(fetchJson: JsonFetcher, id: string): Promise<Record<string, unknown> | null> {
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId)) return null;

    const gql = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    type
    title {
      userPreferred
      romaji
      english
      native
    }
    format
    episodes
    startDate {
      year
    }
    relations {
      edges {
        relationType
        node {
          id
          type
          title {
            userPreferred
            romaji
            english
            native
          }
          format
          episodes
          startDate {
            year
          }
        }
      }
    }
  }
}`;

    const json = await fetchJson(
        'https://graphql.anilist.co',
        {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        'POST',
        JSON.stringify({
            query: gql,
            variables: { id: numericId },
        })
    );

    const root = asObject(json);
    const data = getObject(root, 'data');
    return getObject(data, 'Media');
}

function compareAniListMedia(a: Record<string, unknown>, b: Record<string, unknown>): number {
    const yearA = getNumber(getObject(a, 'startDate'), 'year') ?? 9999;
    const yearB = getNumber(getObject(b, 'startDate'), 'year') ?? 9999;
    if (yearA !== yearB) return yearA - yearB;
    return pickAnimeTitle(a.title).localeCompare(pickAnimeTitle(b.title));
}

function mapAniListKind(format: string): AnimeFormat {
    const value = format.toLowerCase();
    if (value === 'movie') return 'movie';
    if (value === 'ova') return 'ova';
    if (value === 'ona') return 'ona';
    if (value === 'special') return 'special';
    return 'tv';
}

function getNumber(source: Record<string, unknown> | null, key: string): number | null {
    if (!source) return null;
    const value = source[key];
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
}
