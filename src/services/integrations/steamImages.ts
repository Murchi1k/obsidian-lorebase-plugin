export function getSteamLibraryPoster(appId: string | number): string {
    const id = String(appId || '').trim();
    return id ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg` : '';
}

export function getSteamAppIdFromImageUrl(imageUrl: string): string {
    return imageUrl.match(/steam\/apps\/(\d+)\//)?.[1] ?? '';
}

function isSteamLibraryPosterUrl(imageUrl: string): boolean {
    return /\/library_600x900(?:_2x)?\.jpg(?:$|\?)/.test(imageUrl);
}

export function getSteamVerticalImageCandidates(appId: string | number, primary?: string): string[] {
    const id = String(appId || '').trim();
    const candidates: string[] = [];
    if (primary && isSteamLibraryPosterUrl(primary)) {
        candidates.push(primary);
    }
    if (id) {
        candidates.push(
            `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`,
            `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900_2x.jpg`,
            `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
            `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900_2x.jpg`
        );
    }
    return Array.from(new Set(candidates.filter(Boolean)));
}

export function getSteamHorizontalImageCandidates(appId: string | number, primary?: string): string[] {
    const id = String(appId || '').trim();
    const candidates = primary ? [primary] : [];
    if (id) {
        candidates.push(
            `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_616x353.jpg`,
            `https://cdn.akamai.steamstatic.com/steam/apps/${id}/capsule_616x353.jpg`,
            `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`,
            `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`
        );
    }
    return Array.from(new Set(candidates.filter(Boolean)));
}
