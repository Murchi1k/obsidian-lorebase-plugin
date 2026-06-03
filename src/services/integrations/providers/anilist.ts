import { AnimeDetails, SearchResult } from '../types';
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

    return {
        name: pickAnimeTitle(item.title),
        description: stripHtml(getString(item, 'description')),
        image: getString(coverImage, 'extraLarge') || getString(coverImage, 'large'),
        tags,
        studios,
        year: getString(startDate, 'year'),
        imdbRating: score,
        url: getString(item, 'siteUrl'),
        format: mapAnimeFormat(getString(item, 'format')),
    };
}
