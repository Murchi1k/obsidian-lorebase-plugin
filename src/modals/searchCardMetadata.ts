import { i18n } from '../localization';
import { countryLabel, normalizeCountry, getMediaWorkTypeLabel, type WorkTypeMedia } from '../utils/mediaWorkType';
import { formatSearchReleaseDate } from '../utils/searchReleaseDate';
export function getSearchCardMetadata(item: {
    workType?: string; workTypeMedia?: WorkTypeMedia;
    year?: string; released?: string; format?: string; status?: string; subtitle?: string; provider?: string;
}, omitClassification = false): { meta: string; subtitle: string } {
    const year = item.year?.trim() ?? '';
    const released = item.released?.trim() ?? '';
    const date = released ? formatSearchReleaseDate(released, i18n.getLanguage()) : year;
    let subtitle = item.subtitle?.trim() ?? '';
    const type = omitClassification && item.workType && item.workTypeMedia ? undefined : item.workType && item.workTypeMedia ? getMediaWorkTypeLabel(item.workTypeMedia, item.workType, i18n.getLanguage()) : item.format?.trim();
    const parts = [date, type, item.status?.trim()].filter((part): part is string => Boolean(part));
    if (released && (subtitle === released || subtitle === year)) subtitle = '';
    // Alternative titles remain available to provider matching; they do not
    // belong in the compact date row beneath the chosen display title.
    if (omitClassification && (item.workTypeMedia === 'manga' || ['anilist', 'kitsu', 'jikan', 'shikimori', 'mangadex', 'mangaupdates'].includes(item.provider ?? ''))) subtitle = '';
    if (parts.includes(subtitle) || subtitle === parts.join(' / ')) subtitle = '';
    // Steam supplies the full release date; IGDB/RAWG often repeat just the year.
    const includesYear = !released && /^\d{4}$/.test(year) && new RegExp(`\\b${year}\\b`).test(subtitle);
    return {
        meta: Array.from(new Set(parts.filter(part => !includesYear || part !== year))).join(' / '),
        subtitle,
    };
}

export function getSearchPublicationStatus(raw?: string): { value: string; label: string } | null {
    const status = raw?.trim().toLowerCase().replace(/[ _]+/g, ' ') ?? '';
    let value: 'completed' | 'ongoing' | 'hiatus' | 'cancelled' | 'upcoming';
    if (/cancel|discontinued/.test(status)) value = 'cancelled';
    else if (/hiatus|on hold|paused|suspended/.test(status)) value = 'hiatus';
    else if (/^(finished|released|completed|complete|finished airing)$|\bcomplete[d]?\b/.test(status)) value = 'completed';
    else if (/^(releasing|ongoing|publishing|currently publishing|airing|currently airing)$|\bongoing\b/.test(status)) value = 'ongoing';
    else if (/^(not yet released|not yet aired|anons|announced|upcoming)$/.test(status)) value = 'upcoming';
    else return null;
    const labels = {
        completed: { ru: 'Завершено', uk: 'Завершено', en: 'Completed', 'zh-CN': '已完结' },
        ongoing: { ru: 'Выходит', uk: 'Виходить', en: 'Ongoing', 'zh-CN': '连载中' },
        hiatus: { ru: 'Приостановлено', uk: 'Призупинено', en: 'On hiatus', 'zh-CN': '暂停' },
        cancelled: { ru: 'Отменено', uk: 'Скасовано', en: 'Cancelled', 'zh-CN': '已取消' },
        upcoming: { ru: 'Анонс', uk: 'Анонс', en: 'Upcoming', 'zh-CN': '未发行' },
    };
    return { value, label: labels[value][i18n.getLanguage()] };
}

export function getSearchCardClassification(item: { workType?: string; workTypeMedia?: WorkTypeMedia; countryOfOrigin?: string }, anime = false, fallbackMedia?: WorkTypeMedia): string {
    if (anime) {
        const country = normalizeCountry(item.countryOfOrigin);
        return country ? countryLabel(country, i18n.getLanguage()) : { ru: 'Страна не указана', uk: 'Країну не вказано', en: 'Country unknown', 'zh-CN': '国家未知' }[i18n.getLanguage()];
    }
    const media = item.workTypeMedia ?? fallbackMedia;
    return media ? getMediaWorkTypeLabel(media, item.workType || '', i18n.getLanguage()) : '';
}
