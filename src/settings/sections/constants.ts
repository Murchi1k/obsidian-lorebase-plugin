import type { TemplateFieldDef } from './types';

export const ICON_GENERAL = String.fromCodePoint(0x2699);
export const ICON_CARD_CUSTOMIZATION = String.fromCodePoint(0x1F6E0);
export const ICON_MEDIA = String.fromCodePoint(0x1F5C2);
export const ICON_INTEGRATIONS = String.fromCodePoint(0x1F50C);
export const LABEL_RU = '\u0420\u0443\u0441\u0441\u043a\u0438\u0439';
export const LABEL_UK = '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430';

export const GAME_TEMPLATE_FIELDS: TemplateFieldDef[] = [
    { key: 'name', label: 'templateFieldName' },
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
    { key: 'name', label: 'templateFieldName' },
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
    { key: 'url', label: 'templateFieldUrl' },
];

export const MOVIE_TEMPLATE_FIELDS: TemplateFieldDef[] = [
    { key: 'name', label: 'templateFieldName' },
    { key: 'poster', label: 'templateFieldPoster' },
    { key: 'posterHorizontal', label: 'templateFieldPosterHorizontal' },
    { key: 'plot', label: 'templateFieldPlot' },
    { key: 'genres', label: 'templateFieldGenres' },
    { key: 'year', label: 'templateFieldYear' },
    { key: 'released', label: 'templateFieldReleased' },
    { key: 'runtime', label: 'templateFieldRuntime' },
    { key: 'director', label: 'templateFieldDirector' },
    { key: 'actors', label: 'templateFieldActors' },
    { key: 'rating', label: 'templateFieldRating' },
    { key: 'status', label: 'templateFieldStatus' },
    { key: 'favorite', label: 'templateFieldFavorite' },
    { key: 'movieParts', label: 'templateFieldMovieParts' },
    { key: 'integrationSource', label: 'templateFieldIntegrationSource' },
    { key: 'url', label: 'templateFieldUrl' },
];

export const SERIES_TEMPLATE_FIELDS: TemplateFieldDef[] = [
    { key: 'name', label: 'templateFieldName' },
    { key: 'poster', label: 'templateFieldPoster' },
    { key: 'posterHorizontal', label: 'templateFieldPosterHorizontal' },
    { key: 'plot', label: 'templateFieldPlot' },
    { key: 'genres', label: 'templateFieldGenres' },
    { key: 'year', label: 'templateFieldYear' },
    { key: 'released', label: 'templateFieldReleased' },
    { key: 'runtime', label: 'templateFieldRuntime' },
    { key: 'director', label: 'templateFieldDirector' },
    { key: 'actors', label: 'templateFieldActors' },
    { key: 'seasons', label: 'templateFieldSeasons' },
    { key: 'episodeCurrent', label: 'templateFieldEpisodeCurrent' },
    { key: 'episodeTotal', label: 'templateFieldEpisodeTotal' },
    { key: 'seriesParts', label: 'templateFieldSeriesParts' },
    { key: 'rating', label: 'templateFieldRating' },
    { key: 'status', label: 'templateFieldStatus' },
    { key: 'favorite', label: 'templateFieldFavorite' },
    { key: 'integrationSource', label: 'templateFieldIntegrationSource' },
    { key: 'url', label: 'templateFieldUrl' },
];

export const BOOK_TEMPLATE_FIELDS: TemplateFieldDef[] = [
    { key: 'name', label: 'templateFieldName' },
    { key: 'poster', label: 'templateFieldPoster' },
    { key: 'posterHorizontal', label: 'templateFieldPosterHorizontal' },
    { key: 'plot', label: 'templateFieldPlot' },
    { key: 'authors', label: 'templateFieldAuthors' },
    { key: 'publisher', label: 'templateFieldPublisher' },
    { key: 'genres', label: 'templateFieldGenres' },
    { key: 'tags', label: 'templateFieldTags' },
    { key: 'year', label: 'templateFieldYear' },
    { key: 'released', label: 'templateFieldReleased' },
    { key: 'pageCurrent', label: 'templateFieldPageCurrent' },
    { key: 'pageTotal', label: 'templateFieldPageTotal' },
    { key: 'chapterCurrent', label: 'templateFieldChapterCurrent' },
    { key: 'chapterTotal', label: 'templateFieldChapterTotal' },
    { key: 'rating', label: 'templateFieldRating' },
    { key: 'status', label: 'templateFieldStatus' },
    { key: 'favorite', label: 'templateFieldFavorite' },
    { key: 'integrationSource', label: 'templateFieldIntegrationSource' },
    { key: 'url', label: 'templateFieldUrl' },
];

export const MANGA_TEMPLATE_FIELDS: TemplateFieldDef[] = [
    { key: 'name', label: 'templateFieldName' },
    { key: 'poster', label: 'templateFieldPoster' },
    { key: 'posterHorizontal', label: 'templateFieldPosterHorizontal' },
    { key: 'plot', label: 'templateFieldPlot' },
    { key: 'authors', label: 'templateFieldAuthors' },
    { key: 'artists', label: 'templateFieldArtists' },
    { key: 'genres', label: 'templateFieldGenres' },
    { key: 'tags', label: 'templateFieldTags' },
    { key: 'year', label: 'templateFieldYear' },
    { key: 'chapterCurrent', label: 'templateFieldChapterCurrent' },
    { key: 'chapterTotal', label: 'templateFieldChapterTotal' },
    { key: 'volumeCurrent', label: 'templateFieldVolumeCurrent' },
    { key: 'volumeTotal', label: 'templateFieldVolumeTotal' },
    { key: 'mangaParts', label: 'templateFieldMangaParts' },
    { key: 'rating', label: 'templateFieldRating' },
    { key: 'status', label: 'templateFieldStatus' },
    { key: 'favorite', label: 'templateFieldFavorite' },
    { key: 'integrationSource', label: 'templateFieldIntegrationSource' },
    { key: 'url', label: 'templateFieldUrl' },
];
