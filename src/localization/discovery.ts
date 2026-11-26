import { i18n } from './index';
const copy = {
    title: ['How I found it', 'Откуда узнал', 'Звідки дізнався', '发现来源'],
    hint: ['Who recommended it and what caught my interest', 'Кто посоветовал и почему заинтересовало', 'Хто порадив і чим зацікавило', '谁推荐的，以及感兴趣的原因'],
    personPlaceholder: ['Name or nickname', 'Имя или ник', 'Ім’я або нік', '名字或昵称'],
    reasonPlaceholder: ['What caught your attention', 'Что привлекло внимание', 'Що привернуло увагу', '是什么吸引了你'],
    reason: ['Why it caught my interest', 'Почему заинтересовало', 'Чому зацікавило', '感兴趣的原因'],
    person: ['Who recommended it', 'Кто посоветовал', 'Хто порадив', '推荐人'],
} as const;
export const dt = (key: keyof typeof copy): string => copy[key][({ en:0, ru:1, uk:2, 'zh-CN':3 } as const)[i18n.getLanguage()]];
