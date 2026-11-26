import { i18n } from './index';
import type { ClassicRatingHoliday, ClassicRatingSeason, MediaType } from '../types';

export type RatingPresetId = MediaType | ClassicRatingSeason | ClassicRatingHoliday;
type Words = readonly [en: string, ru: string, uk: string, zh: string];
type PresetCopy = { name: Words; levels: readonly [Words, Words, Words, Words, Words] };

const copy = {
    game: {
        name: ['Game Experience', 'Игровой опыт', 'Ігровий досвід', '游戏体验'],
        levels: [
            ['Trash', 'Мусор', 'Мотлох', '糟糕'], ['Weak', 'Слабо', 'Слабко', '欠佳'],
            ['Playable', 'Играбельно', 'Можна грати', '可玩'], ['Great', 'Отлично', 'Чудово', '出色'],
            ['Masterpiece', 'Шедевр', 'Шедевр', '杰作'],
        ],
    },
    anime: {
        name: ['Bloom', 'Цветение', 'Цвітіння', '花开'],
        levels: [
            ['Wilted', 'Увядание', 'В’янення', '凋零'], ['Fading', 'Угасание', 'Згасання', '褪色'],
            ['Growing', 'Рост', 'Зростання', '成长'], ['Bloom', 'Цветение', 'Цвітіння', '绽放'],
            ['Full Bloom', 'Расцвет', 'Розквіт', '盛放'],
        ],
    },
    movie: {
        name: ['Audience', 'Зритель', 'Глядач', '观众'],
        levels: [
            ['Rotten', 'Провал', 'Провал', '烂片'], ['Dull', 'Скучно', 'Нудно', '乏味'],
            ['Decent', 'Неплохо', 'Непогано', '尚可'], ['Bravo', 'Браво', 'Браво', '喝彩'],
            ['Cinema', 'Большое кино', 'Велике кіно', '影坛经典'],
        ],
    },
    series: {
        name: ['Showtime', 'Время шоу', 'Час шоу', '好戏开场'],
        levels: [
            ['Flop', 'Провал', 'Провал', '失败'], ['Weak', 'Слабо', 'Слабко', '欠佳'],
            ['Watchable', 'Смотрибельно', 'Можна дивитися', '值得一看'], ['Show', 'Шоу', 'Шоу', '精彩演出'],
            ['Legend', 'Легенда', 'Легенда', '传奇'],
        ],
    },
    music: {
        name: ['Vinyl', 'Винил', 'Вініл', '黑胶唱片'],
        levels: [
            ['Silence', 'Тишина', 'Тиша', '寂静'], ['Noise', 'Шум', 'Шум', '噪音'],
            ['Rhythm', 'Ритм', 'Ритм', '节奏'], ['Hit', 'Хит', 'Хіт', '热门金曲'],
            ['Platinum', 'Платина', 'Платина', '白金唱片'],
        ],
    },
    book: {
        name: ['Story Fuel', 'Энергия истории', 'Енергія історії', '故事能量'],
        levels: [
            ['Cold', 'Холодно', 'Холодно', '冰冷'], ['Weak', 'Слабо', 'Слабко', '欠佳'],
            ['Warm', 'Тепло', 'Тепло', '温暖'], ['Energizing', 'Бодрит', 'Бадьорить', '提神'],
            ['Volcano', 'Вулкан', 'Вулкан', '火山'],
        ],
    },
    manga: {
        name: ['Ramen Rating', 'Рамен-рейтинг', 'Рамен-рейтинг', '拉面评分'],
        levels: [
            ['Spoiled', 'Испорчено', 'Зіпсовано', '变质'], ['Bland', 'Пресно', 'Прісно', '寡淡'],
            ['Tasty', 'Вкусно', 'Смачно', '美味'], ['Excellent', 'Отлично', 'Чудово', '极佳'],
            ['Perfect', 'Идеально', 'Ідеально', '完美'],
        ],
    },
    spring: {
        name: ['Cherry Blossom', 'Цветение сакуры', 'Цвітіння сакури', '樱花盛开'],
        levels: [
            ['Withering', 'Увядание', 'В’янення', '凋零'], ['Sprout', 'Росток', 'Паросток', '萌芽'],
            ['Blossom', 'Цветение', 'Цвітіння', '绽放'], ['Sakura', 'Сакура', 'Сакура', '樱花'],
            ['Splendor', 'Великолепие', 'Пишнота', '绚烂'],
        ],
    },
    summer: {
        name: ['Summer Paradise', 'Летний рай', 'Літній рай', '夏日天堂'],
        levels: [
            ['Ruined', 'Испорчено', 'Зіпсовано', '泡汤'], ['Cloudy', 'Пасмурно', 'Похмуро', '阴天'],
            ['Warm', 'Тепло', 'Тепло', '温暖'], ['Hot', 'Жарко', 'Спекотно', '炎热'],
            ['Paradise', 'Рай', 'Рай', '天堂'],
        ],
    },
    autumn: {
        name: ['Autumn Weather', 'Осенняя погода', 'Осіння погода', '秋日天气'],
        levels: [
            ['Stormy weather', 'Ненастье', 'Негода', '风暴'], ['Rain', 'Дождь', 'Дощ', '雨天'],
            ['Fog', 'Туман', 'Туман', '迷雾'], ['Falling leaves', 'Листопад', 'Листопад', '落叶'],
            ['Golden autumn', 'Золотая осень', 'Золота осінь', '金秋'],
        ],
    },
    winter: {
        name: ['Snowy Winter', 'Снежная зима', 'Сніжна зима', '飘雪的冬日'],
        levels: [
            ['Slush', 'Слякоть', 'Сльота', '雪泥'], ['First snow', 'Первый снег', 'Перший сніг', '初雪'],
            ['Snowflake', 'Снежинка', 'Сніжинка', '雪花'], ['Snowman', 'Снеговик', 'Сніговик', '雪人'],
            ['Christmas tree', 'Ёлочка', 'Ялиночка', '小圣诞树'],
        ],
    },
    christmas: {
        name: ['Christmas', 'Рождество', 'Різдво', '圣诞节'],
        levels: [
            ['Cold', 'Холодно', 'Холодно', '寒冷'], ['Stocking', 'Носок', 'Шкарпетка', '圣诞袜'],
            ['Gift', 'Подарок', 'Подарунок', '礼物'], ['Christmas tree', 'Ёлка', 'Ялинка', '圣诞树'],
            ['Miracle', 'Чудо', 'Диво', '奇迹'],
        ],
    },
    halloween: {
        name: ['Halloween', 'Хэллоуин', 'Гелловін', '万圣节'],
        levels: [
            ['Cobweb', 'Паутина', 'Павутиння', '蛛网'], ['Bat', 'Летучая мышь', 'Кажан', '蝙蝠'],
            ['Ghost', 'Призрак', 'Привид', '幽灵'], ['Horror', 'Ужас', 'Жах', '恐怖'],
            ['Pumpkin', 'Тыква', 'Гарбуз', '南瓜'],
        ],
    },
    easter: {
        name: ['Easter', 'Пасха', 'Великдень', '复活节'],
        levels: [
            ['Egg', 'Яйцо', 'Яйце', '彩蛋'], ['Chick', 'Цыплёнок', 'Курча', '小鸡'],
            ['Rabbit', 'Кролик', 'Кролик', '兔子'], ['Basket', 'Корзинка', 'Кошик', '篮子'],
            ['Celebration', 'Праздник', 'Свято', '庆典'],
        ],
    },
    lights: {
        name: ['Festival of Lights', 'Фестиваль огней', 'Фестиваль вогнів', '灯光节'],
        levels: [
            ['Candle', 'Свеча', 'Свічка', '蜡烛'], ['Spark', 'Искра', 'Іскра', '火花'],
            ['Lantern', 'Фонарь', 'Ліхтар', '灯笼'], ['Fireworks', 'Огни', 'Вогні', '烟火'],
            ['Radiance', 'Сияние', 'Сяйво', '光辉'],
        ],
    },
} as const satisfies Record<RatingPresetId, PresetCopy>;

function localize(words: Words): string {
    return words[({ en: 0, ru: 1, uk: 2, 'zh-CN': 3 } as const)[i18n.getLanguage()]];
}

export function ratingPresetName(preset: RatingPresetId): string {
    return localize(copy[preset].name);
}

export function ratingPresetLevel(preset: RatingPresetId, score: number): string {
    return localize(copy[preset].levels[score - 1] ?? copy[preset].name);
}
