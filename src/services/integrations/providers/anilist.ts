import { readAlternativeTitles, selectAlternativeTitles } from '../alternativeTitles';
import { parseEpisodeDuration } from '../../media/watchProgress';
import { fuzzySearchReleaseDate } from '../../../utils/searchReleaseDate';
import type { AnimeFormat } from '../../../types';
import { AnimeDetails, IntegrationAnimePart, IntegrationMangaPart, MangaDetails, SearchResult } from '../types';
import { inferMangaWorkType } from '../../../utils/mangaWorkType';
import { JsonFetcher, asObject, formatFuzzyDate, getArray, getObject, getString, mapAnimeFormat, mapStringList, pickAnimeTitle, stripHtml } from './common';

interface SearchPageOptions {
    includeAdult?: boolean;
    page?: number;
    pageSize?: number;
}

/** Resolve countries by exact MAL IDs; provider names or titles never imply a country. */
export async function enrichAnimeSearchCountries(fetchJson: JsonFetcher, items: SearchResult[]): Promise<void> {
    const missing = items.filter(item => !item.countryOfOrigin && /^\d+$/.test(item.malId ?? '')).slice(0, 50);
    if (!missing.length) return;
    const ids = Array.from(new Set(missing.map(item => Number(item.malId))));
    try {
        // A missing Media alias makes AniList return HTTP 404 for the entire
        // aliased request. The list query safely omits unmatched MAL IDs.
        const root = asObject(await fetchJson('https://graphql.anilist.co', { 'Content-Type': 'application/json', Accept: 'application/json' }, 'POST', JSON.stringify({
            query: 'query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { idMal countryOfOrigin } } }', variables: { ids },
        })));
        const countries = new Map(getArray(getObject(getObject(root, 'data'), 'Page'), 'media').map(raw => {
            const record = asObject(raw);
            return [getString(record, 'idMal'), getString(record, 'countryOfOrigin')];
        }));
        missing.forEach(item => {
            const country = countries.get(String(Number(item.malId)));
            if (country) item.countryOfOrigin = country;
        });
    } catch { /* Country is optional; a lookup failure must not hide search results. */ }
}

function withHasNext<T>(items: T[], hasNext: boolean): T[] {
    Object.defineProperty(items, 'hasNext', {
        value: hasNext,
        enumerable: false,
        configurable: true,
    });
    return items;
}

export async function searchAniList(
    fetchJson: JsonFetcher,
    query: string,
    options: SearchPageOptions = {}
): Promise<SearchResult[]> {
    const pageNumber = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const gql = `query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(search: $search, type: ANIME, sort: SEARCH_MATCH${options.includeAdult ? '' : ', isAdult: false'}) {
      isAdult
      id
      title {
        userPreferred
        romaji
        english
        native
      }
      startDate {
        year
        month
        day
      }
      format
      countryOfOrigin
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
            variables: { search: query, page: pageNumber, perPage: pageSize },
        })
    );

    const root = asObject(json);
    const data = getObject(root, 'data');
    const page = getObject(data, 'Page');
    const pageInfo = getObject(page, 'pageInfo');
    const results = getArray(page, 'media');

    const mapped = results.map((item) => {
        const record = asObject(item);
        const startDate = getObject(record, 'startDate');
        const year = getString(startDate, 'year');
        const coverImage = getObject(record, 'coverImage');
        return {
            id: getString(record, 'id'),
            title: pickAnimeTitle(record?.title),
            subtitle: year,
            year,
            released: fuzzySearchReleaseDate(startDate),
            format: mapAnimeFormat(getString(record, 'format')),
            countryOfOrigin: getString(record, 'countryOfOrigin') || undefined,
            image: getString(coverImage, 'large') || getString(coverImage, 'medium'),
            provider: 'anilist' as const,
            isAdult: record?.isAdult === true,
        };
    });

    return withHasNext(mapped, Boolean(pageInfo?.hasNextPage));
}

export async function getAniListDetails(
    fetchJson: JsonFetcher,
    id: string,
    options: { includeParts?: boolean } = {}
): Promise<AnimeDetails | null> {
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
    synonyms
    description(asHtml: false)
    genres
    countryOfOrigin
    isAdult
    episodes
    duration
    studios(isMain: true) {
      nodes {
        name
      }
    }
    startDate {
      year
      month
      day
    }
    averageScore
    stats {
      scoreDistribution {
        amount
      }
    }
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
          duration
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
    const parts = options.includeParts === false ? [] : await getAniListRelatedParts(fetchJson, item);

    return {
        kind: 'anime',
        countryOfOrigin: getString(item, 'countryOfOrigin'),
        isAdult: item.isAdult === true,
        alternativeTitles: readAlternativeTitles('anilist', item),
        name: pickAnimeTitle(item.title),
        description: stripHtml(getString(item, 'description')),
        image,
        imageHorizontal: image,
        genres: tags,
        tags: [],
        studios,
        year: getString(startDate, 'year'),
        released: formatFuzzyDate(startDate),
        imdbRating: score,
        communityRating: score,
        communityVotes: String(sumScoreDistribution(getObject(item, 'stats')) || ''),
        url: getString(item, 'siteUrl'),
        format: mapAnimeFormat(getString(item, 'format')),
        parts,
    };
}

export async function searchAniListManga(
    fetchJson: JsonFetcher,
    query: string,
    options: SearchPageOptions = {}
): Promise<SearchResult[]> {
    const pageNumber = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const gql = `query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(search: $search, type: MANGA, sort: SEARCH_MATCH${options.includeAdult ? '' : ', isAdult: false'}) {
      isAdult
      id
      title {
        userPreferred
        romaji
        english
        native
      }
      startDate {
        year
        month
        day
      }
      format
      status
      countryOfOrigin
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
            variables: { search: query, page: pageNumber, perPage: pageSize },
        })
    );

    const root = asObject(json);
    const data = getObject(root, 'data');
    const page = getObject(data, 'Page');
    const pageInfo = getObject(page, 'pageInfo');
    const results = getArray(page, 'media');

    const mapped = results.map((item) => {
        const record = asObject(item);
        const startDate = getObject(record, 'startDate');
        const year = getString(startDate, 'year');
        const coverImage = getObject(record, 'coverImage');
        return {
            id: getString(record, 'id'),
            title: pickAnimeTitle(record?.title),
            subtitle: year,
            year,
            released: fuzzySearchReleaseDate(startDate),
            publicationStatus: getString(record, 'status'),
            workType: inferMangaWorkType(getString(record, 'format'), getString(record, 'countryOfOrigin')),
            workTypeMedia: 'manga' as const,
            image: getString(coverImage, 'large') || getString(coverImage, 'medium'),
            provider: 'anilist' as const,
            isAdult: record?.isAdult === true,
        };
    });

    return withHasNext(mapped, Boolean(pageInfo?.hasNextPage));
}

export async function getAniListMangaDetails(fetchJson: JsonFetcher, id: string): Promise<MangaDetails | null> {
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId)) return null;

    const gql = `query ($id: Int) {
  Media(id: $id, type: MANGA) {
    id
    format
    countryOfOrigin
    title {
      userPreferred
      romaji
      english
      native
    }
    synonyms
    description(asHtml: false)
    genres
    countryOfOrigin
    isAdult
    chapters
    volumes
    startDate {
      year
      month
      day
    }
    staff(perPage: 25, sort: RELEVANCE) {
      edges {
        role
        node { name { full } }
      }
    }
    averageScore
    stats {
      scoreDistribution {
        amount
      }
    }
    siteUrl
    coverImage {
      extraLarge
      large
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
    const startDate = getObject(item, 'startDate');
    const coverImage = getObject(item, 'coverImage');
    const image = getString(coverImage, 'extraLarge') || getString(coverImage, 'large');
    const chapters = getNumber(item, 'chapters');
    const volumes = getNumber(item, 'volumes');
    const contributors = getAniListMangaContributors(item);

    return {
        kind: 'manga',
        countries: getString(item, 'countryOfOrigin') ? [getString(item, 'countryOfOrigin')] : [],
        alternativeTitles: readAlternativeTitles('anilist', item),
        workType: inferMangaWorkType(getString(item, 'format'), getString(item, 'countryOfOrigin')),
        name: pickAnimeTitle(item.title),
        description: stripHtml(getString(item, 'description')),
        poster: image,
        posterHorizontal: image,
        authors: contributors.authors,
        artists: contributors.artists,
        genres: tags,
        year: getString(startDate, 'year'),
        released: formatFuzzyDate(startDate),
        chapters: chapters ? String(chapters) : '',
        volumes: volumes ? String(volumes) : '',
        rating: score,
        communityRating: score,
        communityVotes: String(sumScoreDistribution(getObject(item, 'stats')) || ''),
        url: getString(item, 'siteUrl'),
        parts: buildMangaParts(volumes, chapters),
    };
}

function getAniListMangaContributors(item: Record<string, unknown>): { authors: string[]; artists: string[] } {
    const authors = new Set<string>();
    const artists = new Set<string>();
    for (const rawEdge of getArray(getObject(item, 'staff'), 'edges')) {
        const edge = asObject(rawEdge);
        const role = getString(edge, 'role').toLowerCase();
        const name = getString(getObject(getObject(edge, 'node'), 'name'), 'full');
        if (!name) continue;
        if (/story|script|writer|original creator|composition/.test(role)) authors.add(name);
        if (/art|illustrat|character design|inking/.test(role)) artists.add(name);
    }
    return { authors: Array.from(authors), artists: Array.from(artists) };
}

function sumScoreDistribution(stats: Record<string, unknown> | null): number {
    return getArray(stats, 'scoreDistribution').reduce<number>((sum, entry) => {
        const amount = getNumber(asObject(entry), 'amount') ?? 0;
        return sum + amount;
    }, 0);
}

function buildMangaParts(volumes: number | null, chapters: number | null): IntegrationMangaPart[] {
    if (!volumes || volumes <= 0) return [];
    const perVolume = chapters && chapters > 0 ? Math.ceil(chapters / volumes) : null;
    return Array.from({ length: Math.min(volumes, 200) }, (_, index) => ({
        id: `volume-${index + 1}`,
        kind: 'volume' as const,
        title: `Volume ${index + 1}`,
        volumeNumber: index + 1,
        chapterCurrent: 0,
        chapterTotal: perVolume,
        status: 'planned' as const,
    }));
}

async function getAniListRelatedParts(_fetchJson: JsonFetcher, root: Record<string, unknown>): Promise<IntegrationAnimePart[]> {
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of [root, ...getAniListRelationNodes(root)]) {
        const id = getString(item, 'id');
        if (id) byId.set(id, item);
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
            alternativeTitles: selectAlternativeTitles(readAlternativeTitles('anilist', item), 'all', pickAnimeTitle(item.title)),
            seasonNumber,
            episodeCurrent: 0,
            episodeTotal: getNumber(item, 'episodes'),
            poster: getString(getObject(item, 'coverImage'), 'extraLarge') || getString(getObject(item, 'coverImage'), 'large') || null,
            year: getNumber(getObject(item, 'startDate') ?? {}, 'year'),
            episodeDuration: parseEpisodeDuration(item.duration),
            releaseDate: formatFuzzyDate(getObject(item, 'startDate') ?? {}),
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
