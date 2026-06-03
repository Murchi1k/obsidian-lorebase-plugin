const notice = msg => new Notice(msg, 5000);

const API_URL = "https://api.rawg.io/api/";
const API_KEY = (typeof process !== "undefined" && process?.env?.RAWG_API_KEY)
    ? process.env.RAWG_API_KEY
    : ""; // Укажите ключ через переменную окружения RAWG_API_KEY

module.exports = {
    entry: start,
    settings: {
        name: "QuickAdd games",
        author: "Murch1k",
        options: {} 
    }
}

let QuickAdd;

async function start(params, settings) {
    QuickAdd = params;

    const query = await QuickAdd.quickAddApi.inputPrompt("Введите название игры или RAWG ID: ");
    if (!query) {
        notice("Вы не ввели запрос.");
        throw new Error("Вы не ввели запрос.");
    }

    let selectedGame;
    try {
        if (isRawgId(query)) {
            selectedGame = await getByRawgId(query);
        } else {
            const results = await getByQuery(query);
            const choice = await QuickAdd.quickAddApi.suggester(results.map(formatTitleForSuggestion), results);
            if (!choice) {
                notice("Вы не выбрали игру.");
                throw new Error("Вы не выбрали игру.");
            }
            selectedGame = await getByRawgId(choice.id);
        }

        if (!selectedGame) {
            notice("Не удалось получить данные об игре.");
            throw new Error("Не удалось получить данные об игре.");
        }

        // Жанры для тела заметки (в виде тегов #Экшен)
        const genreTags = selectedGame.genres?.map(g => `#${g.name.replace(/\s+/g, "")}`).join(" ") || "";
        // Жанры для YAML (в виде массива)
        const genreList = selectedGame.genres?.map(g => g.name) || [];

        // Платформы для тела заметки (в виде ссылок)
        const platformLinks = linkifyList(selectedGame.platforms?.map(p => p.platform.name) || []);
        // Платформы для YAML (в виде массива)
        const platformList = selectedGame.platforms?.map(p => p.platform.name) || [];

        // Разработчики и издатели
        const developerList = selectedGame.developers?.map(d => d.name) || ["Не указано"];
        const publisherList = selectedGame.publishers?.map(p => p.name) || ["Не указано"];
        const developerLinks = linkifyList(developerList);
        const publisherLinks = linkifyList(publisherList);

        // Перевод статуса на русский
        const statusTranslations = {
            released: "Выпущена",
            tba: "Анонсирована",
            cancelled: "Отменена",
            indevelopment: "В разработке"
        };
        const statusLower = statusTranslations[selectedGame.status?.toLowerCase()] || selectedGame.status || "Не указано";

        // Очистка описания от тегов и переносов строк
        const cleanDescriptionForYaml = (selectedGame.description_raw || "Нет описания")
            .replace(/<[^>]+>/g, "") // Удаляем HTML-теги
            .replace(/\n/g, " ");

        const cleanDescriptionForBody = (selectedGame.description_raw || "Нет описания")
            .replace(/<[^>]+>/g, "");

        // Извлечение года из released
        const year = selectedGame.released ? new Date(selectedGame.released).getFullYear() : "Не указан";

        // Запрос статусов с проверкой на undefined
        const statusPlayedResult = await QuickAdd.quickAddApi.checkboxPrompt("Статус игры:", ["Пройдено"], false);
        const droppedResult = await QuickAdd.quickAddApi.checkboxPrompt("Брошено:", ["Брошено"], false);
        const favoriteResult = await QuickAdd.quickAddApi.checkboxPrompt("Избранное:", ["Избранное"], false);

        const statusPlayed = Array.isArray(statusPlayedResult) ? statusPlayedResult : [];
        const dropped = Array.isArray(droppedResult) ? droppedResult : [];
        const favorite = Array.isArray(favoriteResult) ? favoriteResult : [];

        // Форматирование имени файла
        const rawFileName = selectedGame.name || query;
        const formattedFileName = replaceIllegalFileNameCharactersInString(rawFileName);

        const variables = {
            ...selectedGame,
            name: selectedGame.name || "Не указано", // Оригинальное название для YAML
            platforms: platformList,
            developers: developerList,
            publishers: publisherList,
            rawgUrl: `https://rawg.io/games/${selectedGame.slug}`,
            released: formatDateString(selectedGame.released),
            genreTags: genreTags,
            genres: genreList,
            platformLinks: platformLinks,
            developerLinks: developerLinks,
            publisherLinks: publisherLinks,
            fileName: formattedFileName,
            typeLink: `[[Игра]]`,
            statusLower: statusLower,
            description: cleanDescriptionForBody,
            rating: selectedGame.rating || "Не указано",
            metacritic: selectedGame.metacritic || "Не указано",
            playtime: selectedGame.playtime || "Не указано",
            Poster: selectedGame.background_image ? selectedGame.background_image : "Нет постера",
            Plot: cleanDescriptionForYaml,
            Year: year,
            userRating: "0",
            played: statusPlayed.includes("Пройдено") ? "true" : "false",
            dropped: dropped.includes("Брошено") ? "true" : "false",
            favorite: favorite.includes("Избранное") ? "true" : "false",
            url: `https://rawg.io/games/${selectedGame.slug}`,
        };

        // Шаблон заметки
        const noteTemplate = `---
poster: "{{VALUE:Poster}}"
name: "{{VALUE:name}}"
plot: "{{VALUE:Plot}}"
year: "{{VALUE:Year}}"
genres: {{VALUE:genres}}
platforms: {{VALUE:platforms}}
developers: {{VALUE:developers}}
publishers: {{VALUE:publishers}}
rating: "{{VALUE:rating}}"
metacritic: "{{VALUE:metacritic}}"
playtime: "{{VALUE:playtime}}"
released: "{{VALUE:released}}"
status: "{{VALUE:statusLower}}"
played: "{{VALUE:played}}"
dropped: "{{VALUE:dropped}}"
favorite: "{{VALUE:favorite}}"
url: "{{VALUE:url}}"
userRating: "{{VALUE:userRating}}"
---

# {{VALUE:name}}

{{VALUE:genreTags}}

## Основная информация
- **Тип**: {{VALUE:typeLink}}
- **Статус**: {{VALUE:statusLower}}
- **Платформы**: {{VALUE:platformLinks}}
- **Разработчики**: {{VALUE:developerLinks}}
- **Издатели**: {{VALUE:publisherLinks}}
- **Дата выпуска**: {{VALUE:released}}
- **Год**: {{VALUE:Year}}

## Рейтинги
- **RAWG рейтинг**: {{VALUE:rating}}
- **Metacritic**: {{VALUE:metacritic}}
- **Личный рейтинг**: {{VALUE:userRating}}

## Статус игры
- **Пройдено**: {{VALUE:played}}
- **Брошено**: {{VALUE:dropped}}
- **Избранное**: {{VALUE:favorite}}

## Описание
{{VALUE:description}}

## Постер
![Poster]({{VALUE:Poster}})

## Ссылка
- [RAWG]({{VALUE:url}})
`;

        // Установка переменных и шаблона для QuickAdd
        QuickAdd.variables = {
            ...variables,
            noteContent: noteTemplate
        };

    } catch (error) {
        notice(`Ошибка в скрипте: ${error.message}`);
        throw error;
    }
}

function isRawgId(str) {
    return /^\d+$/.test(str); // RAWG ID — это число
}

function formatTitleForSuggestion(resultItem) {
    return `(Игра) ${resultItem.name} (${resultItem.released ? resultItem.released.slice(0, 4) : "Неизвестно"})`;
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
    const searchResults = await apiGet(`${API_URL}games`, {
        search: query,
        page_size: 10 // Ограничим 10 результатами
    });

    if (!searchResults || !searchResults.results?.length) {
        notice("Результаты не найдены.");
        throw new Error("Результаты не найдены.");
    }

    return searchResults.results;
}

async function getByRawgId(id) {
    const res = await apiGet(`${API_URL}games/${id}`);

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
        .replace(/[*\\\/<>:\|\?]*/g, "") // Удаляем только символы из списка ошибки: * \ / < > : | ?
        .replace(/\n/g, " ") // Заменяем переносы строк на пробелы
        .trim(); // Удаляем лишние пробелы
}

async function apiGet(url, data) {
    if (!API_KEY) {
        throw new Error("Отсутствует RAWG API ключ. Задайте RAWG_API_KEY.");
    }

    let finalURL = new URL(url);
    if (data) {
        Object.keys(data).forEach(key => finalURL.searchParams.append(key, data[key]));
    }

    finalURL.searchParams.append("key", API_KEY); // Добавляем API-ключ
    finalURL.searchParams.append("user_agent", "ObsidianGameScript");

    const res = await request({
        url: finalURL.href,
        method: "GET",
        cache: "no-cache",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "ObsidianGameScript"
        },
    });

    const response = JSON.parse(res);
    if (response.detail && response.detail.includes("authentication")) {
        throw new Error("Ошибка авторизации. Проверьте API-ключ.");
    }
    return response;
}
