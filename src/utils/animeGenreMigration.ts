const genreNames = `Action|Adventure|Avant Garde|Award Winning|Boys Love|Comedy|Drama|Ecchi|Erotica|Fantasy|Girls Love|Gourmet|Hentai|Horror|Mystery|Romance|Sci Fi|Slice of Life|Sports|Supernatural|Suspense|Thriller|Psychological|Mecha|Music|Mahou Shoujo|Super Power|Space|Military|Historical|School|Shounen|Shonen|Shoujo|Seinen|Josei|Kids|Demons|Vampire|Martial Arts|Police|Parody|Magic|Game|Cars|Harem|Isekai|Adult Cast|Childcare|Combat Sports|Crossdressing|Delinquents|Detective|Educational|Gag Humor|Gore|High Stakes Game|Idols Female|Idols Male|Iyashikei|Love Polygon|Magical Sex Shift|Medical|Mythology|Organized Crime|Otaku Culture|Performing Arts|Pets|Racing|Reincarnation|Reverse Harem|Romantic Subtext|Samurai|Showbiz|Strategy Game|Survival|Team Sports|Time Travel|Video Game|Visual Arts|Workplace|CGDCT|Боевик|Экшен|Приключения|Авангард|Сёнен-ай|Сёнэн-ай|Сёдзё-ай|Комедия|Драма|Этти|Эротика|Фэнтези|Гурман|Гурманика|Хентай|Ужасы|Детектив|Романтика|Фантастика|Повседневность|Спорт|Сверхъестественное|Триллер|Психологическое|Психология|Меха|Музыка|Махо-сёдзё|Супер сила|Суперсила|Космос|Военное|Исторический|История|Школа|Сёнен|Сёнэн|Сёдзё|Сэйнэн|Сейнен|Дзёсей|Детское|Демоны|Вампиры|Боевые искусства|Полиция|Пародия|Магия|Игры|Машины|Гарем|Исекай|Юри|Яой|Самураи|Работа|Реинкарнация|Путешествия во времени`;
const key = (value: string): string => value.trim().replace(/^#+/, '').toLowerCase().replace(/[\s_\-]+/g, '');
const knownGenres = new Set(genreNames.split('|').map(key));

function list(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string').map(entry => entry.trim()).filter(Boolean);
    return typeof value === 'string' ? value.split(/[,;\n]+/).map(entry => entry.trim()).filter(Boolean) : [];
}

/** Move only known genres or tags recorded in the old provider snapshot. Never touch inline tags. */
export function animeGenreMigration(metadata: Record<string, unknown>): Record<string, unknown> | null {
    if (metadata.lorebase_anime_genres_migrated === true) return null;
    const tags = list(metadata.tags);
    const snapshot = metadata.lorebase_source_snapshot as { lists?: { tags?: unknown } } | undefined;
    const providerGenres = new Set(list(snapshot?.lists?.tags).map(key));
    const genres = [...list(metadata.genres), ...list(metadata.genre)];
    const seen = new Set(genres.map(key));
    const remaining: string[] = [];
    let moved = false;
    for (const tag of tags) {
        const normalized = key(tag);
        if (knownGenres.has(normalized) || providerGenres.has(normalized) || seen.has(normalized)) {
            if (!seen.has(normalized)) { genres.push(tag.replace(/^#/, '')); seen.add(normalized); }
            moved = true;
        } else remaining.push(tag);
    }
    if (!moved) return { lorebase_anime_genres_migrated: true };
    return { genres, tags: remaining, lorebase_anime_genres_migrated: true };
}
