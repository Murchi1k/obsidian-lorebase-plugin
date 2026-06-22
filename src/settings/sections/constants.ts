import type { TemplateFieldDef } from './types';

export const ICON_GENERAL = String.fromCodePoint(0x2699);
export const ICON_GAMES = String.fromCodePoint(0x1F3AE);
export const ICON_ANIME = String.fromCodePoint(0x1F4FA);
export const ICON_INTEGRATIONS = String.fromCodePoint(0x1F50C);
export const ICON_EXPERIMENT = String.fromCodePoint(0x1F9EA);
export const ICON_COMING_SOON = String.fromCodePoint(0x1F6A7);
export const ICON_MOVIES = String.fromCodePoint(0x1F3AC);
export const ICON_BOOKS = String.fromCodePoint(0x1F4DA);
export const ICON_DANGER = String.fromCodePoint(0x26A0);
export const LABEL_RU = '\u0420\u0443\u0441\u0441\u043a\u0438\u0439';

export const GAME_TEMPLATE_FIELDS: TemplateFieldDef[] = [
    { key: 'poster', label: 'templateFieldPoster' },
    { key: 'posterHorizontal', label: 'templateFieldPosterHorizontal' },
    { key: 'plot', label: 'templateFieldPlot' },
    { key: 'gameSeries', label: 'templateFieldGameSeries' },
    { key: 'genres', label: 'templateFieldGenres' },
    { key: 'platforms', label: 'templateFieldPlatforms' },
    { key: 'year', label: 'templateFieldYear' },
    { key: 'released', label: 'templateFieldReleased' },
    { key: 'developers', label: 'templateFieldDevelopers' },
    { key: 'publishers', label: 'templateFieldPublishers' },
    { key: 'rating', label: 'templateFieldRating' },
    { key: 'userRating', label: 'templateFieldUserRating' },
    { key: 'status', label: 'templateFieldStatus' },
    { key: 'favorite', label: 'templateFieldFavorite' },
    { key: 'url', label: 'templateFieldUrl' },
];

export const GAME_TEMPLATE_FIELDS_HLTB: TemplateFieldDef[] = [
    { key: 'main', label: 'templateFieldMain' },
    { key: 'main_plus_sides', label: 'templateFieldMainPlusSides' },
    { key: 'perfectionist', label: 'templateFieldCompletionist' },
];

export const ANIME_TEMPLATE_FIELDS: TemplateFieldDef[] = [
    { key: 'image', label: 'templateFieldImage' },
    { key: 'imageHorizontal', label: 'templateFieldImageHorizontal' },
    { key: 'plot', label: 'templateFieldPlot' },
    { key: 'scoreImdb', label: 'templateFieldScoreImdb' },
    { key: 'tags', label: 'templateFieldTags' },
    { key: 'year', label: 'templateFieldYear' },
    { key: 'studios', label: 'templateFieldStudios' },
    { key: 'format', label: 'templateFieldFormat' },
    { key: 'animeParts', label: 'templateFieldAnimeParts' },
    { key: 'rating', label: 'templateFieldRating' },
    { key: 'status', label: 'templateFieldStatus' },
    { key: 'favorite', label: 'templateFieldFavorite' },
    { key: 'integrationSource', label: 'templateFieldIntegrationSource' },
    { key: 'url', label: 'templateFieldUrl' },
];
