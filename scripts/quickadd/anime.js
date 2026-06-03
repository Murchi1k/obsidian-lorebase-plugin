const notice = msg => new Notice(msg, 5000);

const API_URL = "https://shikimori.one/api/";

module.exports = {
    entry: start,
    settings: {
        name: "Скрипт для аниме",
        author: "Murch1k",
        options: {}
    }
}

let QuickAdd;

async function start(params, settings) {
    QuickAdd = params;

    const query = await QuickAdd.quickAddApi.inputPrompt("Введите название аниме или Shikimori ID: ");
    if (!query) {
        notice("Вы не ввели запрос.");
        throw new Error("Вы не ввели запрос.");
    }

    let selectedAnime;
    try {
        if (isShikimoriId(query)) {
            selectedAnime = await getByShikimoriId(query);
        } else {
            const results = await getByQuery(query);
            const choice = await QuickAdd.quickAddApi.suggester(results.map(formatTitleForSuggestion), results);
            if (!choice) {
                notice("Вы не выбрали аниме.");
                throw new Error("Вы не выбрали аниме.");
            }
            selectedAnime = await getByShikimoriId(choice.id);
        }

        if (!selectedAnime) {
            notice("Не удалось получить данные об аниме.");
            throw new Error("Не удалось получить данные об аниме.");
        }

        // Только демографические категории и явные темы
        const demographicAndThemeCategories = [
            "Сёнен", "Сейнен", "Дзёсей", "Кодомо", 
            "Психологическое", "Жестокость", "Повседневность", "Романтика", "Комедия", "Мистика"
        ];

        // Разделение жанров и тем
        const genres = selectedAnime.genres?.filter(g => !demographicAndThemeCategories.includes(g.russian || g.name)) || [];
        const themes = selectedAnime.genres?.filter(g => demographicAndThemeCategories.includes(g.russian || g.name)) || [];

        // Сортировка жанров в порядке, как на Shikimori
        const genreOrder = [
            "Сёнен", "Сейнен", "Дзёсей", "Кодомо", 
            "Экшен", "Сверхъестественное", "Триллер", "Фантастика", "Ужасы", 
            "Приключения", "Фэнтези", "Меха", "Спорт", "Детектив", "Исторический"
        ];
        genres.sort((a, b) => {
            const aName = a.russian || a.name;
            const bName = b.russian || b.name;
            return genreOrder.indexOf(aName) - genreOrder.indexOf(bName);
        });

        // Жанры для тела заметки (#Экшен)
        const genreTags = genres.map(g => `#${(g.russian || g.name).replace(/\s+/g, "")}`).join(" ");
        // Жанры для YAML (теги)
        const genreList = genres.map(g => (g.russian || g.name).replace(/\s+/g, ""));
        // Темы для тела заметки (ссылки)
        const themeLinks = linkifyList(themes.map(t => t.russian || t.name));
        // Темы для YAML
        const themeList = themes.map(t => t.russian || t.name);

        // Перевод статуса
        const statusTranslations = {
            anons: "Анонсировано",
            ongoing: "Выходит",
            released: "Выпущено",
            paused: "Приостановлено",
            discontinued: "Прекращено"
        };
        const statusLower = statusTranslations[selectedAnime.status.toLowerCase()] || selectedAnime.status;

        // Очистка описания
        const cleanDescriptionForYaml = (selectedAnime.description || "Нет описания")
            .replace(/\[character=\d+\]/g, "")
            .replace(/\[.*?\]/g, "")
            .replace(/\n/g, " ");

        const cleanDescriptionForBody = (selectedAnime.description || "Нет описания")
            .replace(/\[character=\d+\]/g, "")
            .replace(/\[.*?\]/g, "");

        // Год
        const year = selectedAnime.aired_on ? new Date(selectedAnime.aired_on).getFullYear() : "Не указан";

        // Статусы
        const statusWatchedResult = await QuickAdd.quickAddApi.checkboxPrompt("Статус просмотра:", ["Просмотрено"], false);
        const droppedResult = await QuickAdd.quickAddApi.checkboxPrompt("Брошено:", ["Брошено"], false);
        const favoriteResult = await QuickAdd.quickAddApi.checkboxPrompt("Избранное:", ["Избранное"], false);

        const statusWatched = Array.isArray(statusWatchedResult) ? statusWatchedResult : [];
        const dropped = Array.isArray(droppedResult) ? droppedResult : [];
        const favorite = Array.isArray(favoriteResult) ? favoriteResult : [];

        // Имя файла
        const rawFileName = selectedAnime.russian || selectedAnime.name || query;
        const formattedFileName = replaceIllegalFileNameCharactersInString(rawFileName);

        const variables = {
            ...selectedAnime,
            name: selectedAnime.name || "Не указано",
            studios: selectedAnime.studios?.map(s => s.name) || ["Не указано"],
            shikimoriUrl: `https://shikimori.one/animes/${selectedAnime.id}`,
            airedOn: formatDateString(selectedAnime.aired_on),
            genreTags: genreTags,
            tags: genreList,
            themes: themeList,
            themeLinks: themeLinks,
            studioLinks: linkifyList(selectedAnime.studios?.map(s => s.name) || []),
            fileName: formattedFileName,
            typeLink: `[[Аниме]]`,
            statusLower: statusLower,
            description: cleanDescriptionForBody,
            score: selectedAnime.score || "Не указан",
            episodes: selectedAnime.episodes || "Не указано",
            russian: selectedAnime.russian || selectedAnime.name,
            Poster: selectedAnime.image?.original ? `https://shikimori.one${selectedAnime.image.original}` : "Нет постера",
            Plot: cleanDescriptionForYaml,
            imdbRating: selectedAnime.score || "Не указан",
            Year: year,
            rating: "0",
            status: statusWatched.includes("Просмотрено") ? "true" : "false",
            dropped: dropped.includes("Брошено") ? "true" : "false",
            favorite: favorite.includes("Избранное") ? "true" : "false",
            url: `https://shikimori.one/animes/${selectedAnime.id}`,
        };

        // Отладка

        QuickAdd.variables = variables;
    } catch (error) {
        notice(`Ошибка в скрипте: ${error.message}`);
        console.error("Ошибка:", error);
        throw error;
    }
}

function isShikimoriId(str) {
    return /^\d+$/.test(str);
}

function formatTitleForSuggestion(resultItem) {
    return `(Аниме) ${resultItem.russian || resultItem.name} (${resultItem.aired_on ? resultItem.aired_on.slice(0, 4) : "Неизвестно"})`;
}

function formatDateString(dateString) {
    if (!dateString) return "Неизвестно";
    const date = new Date(dateString);
    const formattedYear = date.getFullYear();
    const formattedMonth = String(date.getMonth() + 1).padStart(2, "0");
    const formattedDay = String(date.getDate()).padStart(2, "0");
    return `${formattedYear}-${formattedMonth}-${formattedDay}`;
}

async function getByQuery(query) {
    const searchResults = await apiGet(`${API_URL}animes`, {
        "search": query,
        "limit": 10
    });

    if (!searchResults || !searchResults.length) {
        notice("Результаты не найдены.");
        throw new Error("Результаты не найдены.");
    }

    return searchResults;
}

async function getByShikimoriId(id) {
    const res = await apiGet(`${API_URL}animes/${id}`);

    if (!res) {
        notice("Результаты не найдены.");
        throw new Error("Результаты не найдены.");
    }

    return res;
}

function linkifyList(list) {
    if (list.length === 0) return "";
    if (list.length === 1) return `\n  - "[[${list[0]}]]"`;
    return list.map(item => `\n  - "[[${item.trim()}]]"`).join("");
}

function replaceIllegalFileNameCharactersInString(string) {
    return string
        .replace(/[*\\\/<>:\|\?]*/g, "")
        .replace(/\n/g, " ")
        .trim();
}

async function apiGet(url, data) {
    let finalURL = new URL(url);
    if (data) {
        Object.keys(data).forEach(key => finalURL.searchParams.append(key, data[key]));
    }

    finalURL.searchParams.append("user_agent", "ObsidianAnimeScript");

    try {
        const res = await request({
            url: finalURL.href,
            method: "GET",
            cache: "no-cache",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "ObsidianAnimeScript"
            },
        });
        return JSON.parse(res);
    } catch (error) {
        console.error("Ошибка API:", error);
        throw error;
    }
}
