import type { LorebaseSettings } from '../../types';

type Integrations = NonNullable<LorebaseSettings['integrations']>;
type Provider = keyof Integrations['providers'];
type Kind = keyof Integrations['media'];

function isMediaScopedProvider(provider: Provider): provider is 'anilist' | 'shikimori' {
    return provider === 'anilist' || provider === 'shikimori';
}

export function isProviderEnabled(integrations: Integrations | undefined, provider: Provider, kind?: Kind): boolean {
    if (!integrations) return false;
    if ((kind === 'anime' || kind === 'manga') && isMediaScopedProvider(provider)) {
        const override = integrations.media[kind]?.providerEnabled?.[provider];
        if (typeof override === 'boolean') return override;
    }
    return integrations.providers[provider]?.enabled === true;
}

export function setProviderEnabled(integrations: Integrations, provider: Provider, enabled: boolean, kind?: Kind): void {
    if ((kind === 'anime' || kind === 'manga') && isMediaScopedProvider(provider)) {
        const media = integrations.media[kind];
        media.providerEnabled = { ...media.providerEnabled, [provider]: enabled };
    } else {
        integrations.providers[provider].enabled = enabled;
    }
}
