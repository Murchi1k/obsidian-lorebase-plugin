import { JsonFetcher, asObject, getArray, getString } from './common';

export interface SteamGridDbOptions {
    enabled?: boolean;
    apiKey?: string;
}

export async function getSteamGridDbPoster(
    fetchJson: JsonFetcher,
    steamAppId: string | number,
    options?: SteamGridDbOptions
): Promise<string> {
    const id = String(steamAppId || '').trim();
    const apiKey = options?.apiKey?.trim();
    if (!id || !options?.enabled || !apiKey) return '';

    try {
        const url = new URL(`https://www.steamgriddb.com/api/v2/grids/steam/${id}`);
        url.searchParams.set('dimensions', '600x900');
        url.searchParams.set('types', 'static');

        const root = asObject(await fetchJson(url.toString(), {
            Authorization: `Bearer ${apiKey}`,
        }));
        const grids = getArray(root, 'data')
            .map((entry) => asObject(entry))
            .filter((entry): entry is Record<string, unknown> => Boolean(entry));

        const exact = grids.find((entry) => {
            const width = Number(entry.width);
            const height = Number(entry.height);
            return width === 600 && height === 900 && Boolean(getString(entry, 'url'));
        });

        return getString(exact ?? grids[0] ?? null, 'url');
    } catch (error) {
        console.warn('[LOREBASE] Failed to load SteamGridDB poster.', error);
        return '';
    }
}
