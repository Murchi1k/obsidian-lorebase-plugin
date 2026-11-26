import { i18n } from '../../localization';
import { setIcon } from 'obsidian';
import type { Language } from '../../types';

type ProviderHelp = { title: string; description: string; links: Array<{ label: string; href: string }> };
export function getAdditionalProviderHelp(provider: 'vndb', language: Language): ProviderHelp {
    const copy = {
        ru: {
            vndb: ['Визуальные новеллы из VNDB', 'Поиск и загрузка метаданных работают без API ключа. Новеллы добавляются в игры с типом «Визуальная новелла».', 'Открыть VNDB', 'Документация API'],
        },
        uk: {
            vndb: ['Візуальні новели з VNDB', 'Пошук і завантаження метаданих працюють без API ключа. Новели додаються до ігор із типом «Візуальна новела».', 'Відкрити VNDB', 'Документація API'],
        },
        en: {
            vndb: ['Visual novels from VNDB', 'Search and metadata import work without an API key. Novels join the games library with the Visual novel type.', 'Open VNDB', 'API documentation'],
        },
        'zh-CN': {
            vndb: ['VNDB 视觉小说', '搜索和导入元数据无需 API 密钥。作品以视觉小说类型添加到游戏资料库。', '打开 VNDB', 'API 文档'],
        },
    }[language][provider];
    return { title: copy[0], description: copy[1], links: [
        { label: copy[2], href: 'https://vndb.org/' },
        { label: copy[3], href: 'https://api.vndb.org/kana' },
    ] };
}
export function renderAdditionalProviderHelp(parent: HTMLElement, provider: 'vndb'): void {
    const copy = getAdditionalProviderHelp(provider, i18n.getLanguage());
    const details = parent.createEl('details', { cls: 'lorebase-provider-free-help' });
    const summary = details.createEl('summary', { attr: { title: copy.title } });
    setIcon(summary.createSpan({ attr: { 'aria-hidden': 'true' } }), 'circle-check');
    summary.createSpan({ text: {
        ru: 'API-ключ не нужен', uk: 'Ключ API не потрібен', en: 'No API key needed', 'zh-CN': '无需 API 密钥',
    }[i18n.getLanguage()] });
    setIcon(summary.createSpan({ cls: 'lorebase-provider-key-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    const help = details.createDiv({ cls: 'lorebase-provider-help' });
    help.createDiv({ cls: 'lorebase-provider-help-text', text: copy.description });
    const links = help.createDiv({ cls: 'lorebase-provider-help-links' });
    for (const link of copy.links) links.createEl('a', { text: link.label, attr: { href: link.href, target: '_blank', rel: 'noopener noreferrer' } });
}
