import { setIcon } from 'obsidian';
import type { Language } from '../types';

export const CONTRIBUTOR_URL = 'https://github.com/SpreadSheets600';
export const COMMUNITY_COPY = {
    ru: {
        title: 'Спасибо, что развиваете LOREBASE', tab: 'Сообщество',
        creditTitle: 'Синхронизация с AniList',
        credit: 'Спасибо SpreadSheets600 за основу логики синхронизации с AniList. Я немного доработал её и адаптировал к плагину.',
        thanksTitle: 'Вклад сообщества',
        thanks: 'Спасибо за идеи, сообщения об ошибках и присланные правки. Отдельная благодарность за китайский перевод и исправление API HowLongToBeat.',
        policyTitle: 'Pull requests и обратная связь',
        policy: 'С выходом LOREBASE 4.0.0 я закрываю приём pull requests. Мне нравится самому разбираться, как всё устроено, и искать решения, поэтому я не хочу, чтобы вы тратили время на подготовку правок.',
        feedback: 'Я по-прежнему рад вашим идеям и сообщениям об ошибках. Если нашли ошибку, напишите, как её повторить. Спасибо за ваше время и помощь!',
    },
    en: {
        title: 'Thank you for helping LOREBASE grow', tab: 'Community',
        creditTitle: 'AniList sync',
        credit: 'Thank you to SpreadSheets600 for the foundation of the AniList synchronization logic. I made some refinements and adapted it to the plugin.',
        thanksTitle: 'Community contributions',
        thanks: 'Thank you for sharing ideas, reporting bugs and submitting fixes. Special thanks for the Chinese translation and the HowLongToBeat API fix.',
        policyTitle: 'Pull requests and feedback',
        policy: 'As of LOREBASE 4.0.0, I’ve stopped accepting pull requests. I enjoy figuring out how things work and finding solutions myself, so I’d like to save you the time of preparing a patch.',
        feedback: 'I’m still happy to hear your ideas and bug reports. If you find a bug, tell me how to reproduce it. Thanks for your time and help!',
    },
    uk: {
        title: 'Дякую, що розвиваєте LOREBASE', tab: 'Спільнота',
        creditTitle: 'Синхронізація з AniList',
        credit: 'Дякую SpreadSheets600 за основу логіки синхронізації з AniList. Я трохи доопрацював її та адаптував до плагіна.',
        thanksTitle: 'Внесок спільноти',
        thanks: 'Дякую за ідеї, повідомлення про помилки й надіслані виправлення. Окрема подяка за китайський переклад і виправлення API HowLongToBeat.',
        policyTitle: 'Pull requests і зворотний зв’язок',
        policy: 'З виходом LOREBASE 4.0.0 я припиняю приймати pull requests. Мені подобається самому розбиратися, як усе влаштовано, і шукати рішення, тому я не хочу, щоб ви витрачали час на підготовку змін.',
        feedback: 'Я й далі радий вашим ідеям і повідомленням про помилки. Якщо знайшли помилку, напишіть, як її відтворити. Дякую за ваш час і допомогу!',
    },
    'zh-CN': {
        title: '感谢你们帮助 LOREBASE 成长', tab: '社区',
        creditTitle: 'AniList 同步',
        credit: '感谢 SpreadSheets600 编写 AniList 同步逻辑的基础。我在此基础上做了一些改进，并将其适配到插件中。',
        thanksTitle: '社区贡献',
        thanks: '感谢大家分享想法、报告问题并提交修复。特别感谢为中文翻译和 HowLongToBeat API 修复作出贡献的朋友。',
        policyTitle: 'Pull requests 与反馈',
        policy: '从 LOREBASE 4.0.0 开始，我将停止接收 pull request。我喜欢亲自弄清楚插件是怎么运作的，再自己找解决办法，也希望能帮大家省下准备代码改动的时间。',
        feedback: '依然欢迎大家分享想法、反馈问题。如果发现问题，请告诉我怎么复现。谢谢大家抽出时间来帮忙！',
    },
} satisfies Record<Language, {
    title: string; tab: string; creditTitle: string; credit: string; thanksTitle: string; thanks: string;
    policyTitle: string; policy: string; feedback: string;
}>;

export function renderAniListCredit(container: HTMLElement, language: Language): void {
    const credit = container.createDiv({ cls: 'lorebase-release-credit' });
    credit.createEl('p', { text: COMMUNITY_COPY[language].credit });
    credit.createEl('a', { text: '@SpreadSheets600 ↗', attr: { href: CONTRIBUTOR_URL, target: '_blank', rel: 'noopener noreferrer' } });
}

export function renderReleaseCommunity(container: HTMLElement, language: Language): void {
    const copy = COMMUNITY_COPY[language];
    const root = container.createEl('section', { cls: 'lorebase-release-community' });
    const header = root.createEl('header', { cls: 'lorebase-release-community-heading' });
    renderCommunityIcon(header, 'heart-handshake');
    header.createEl('h2', { text: copy.title });

    const cards = root.createDiv({ cls: 'lorebase-release-community-cards' });
    const anilist = cards.createEl('section', { cls: 'lorebase-release-community-card' });
    renderCommunityCardHeading(anilist, 'refresh-cw', copy.creditTitle);
    renderAniListCredit(anilist, language);
    const thanks = cards.createEl('section', { cls: 'lorebase-release-community-card' });
    renderCommunityCardHeading(thanks, 'users-round', copy.thanksTitle);
    thanks.createEl('p', { text: copy.thanks });

    const policy = root.createEl('section', { cls: 'lorebase-release-policy' });
    const policyHeading = renderCommunityCardHeading(policy, 'git-pull-request', copy.policyTitle);
    policyHeading.createSpan({ cls: 'lorebase-release-badge', text: 'v4.0.0' });
    policy.createEl('p', { text: copy.policy });
    policy.createEl('p', { text: copy.feedback });
}

function renderCommunityIcon(parent: HTMLElement, icon: string): void {
    setIcon(parent.createSpan({ cls: 'lorebase-release-community-icon', attr: { 'aria-hidden': 'true' } }), icon);
}

function renderCommunityCardHeading(parent: HTMLElement, icon: string, title: string): HTMLElement {
    const heading = parent.createDiv({ cls: 'lorebase-release-community-heading' });
    renderCommunityIcon(heading, icon);
    heading.createEl('h3', { text: title });
    return heading;
}
