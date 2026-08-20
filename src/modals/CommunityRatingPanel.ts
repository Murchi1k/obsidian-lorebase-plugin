import { Notice, setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import type { CommunityRating, MediaItem } from '../types';

export type CommunityRatingRefresh = () => Promise<CommunityRating | null>;

function formatRating(value: number | null | undefined): string {
    if (!Number.isFinite(value)) return '-';
    const rating = Number(value);
    const text = Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
    return `${text}%`;
}

function formatVotes(value: number | null | undefined): string {
    if (!Number.isFinite(value)) return '-';
    return new Intl.NumberFormat(i18n.getLocale()).format(Math.max(0, Math.trunc(Number(value))));
}

function formatVotesLine(value: number | null | undefined): string {
    const votes = formatVotes(value);
    if (votes === '-') return t('communityRatingNoVotes');
    return `${votes} ${t('communityRatingVotes')}`;
}

export function renderCommunityRatingPanel(
    root: HTMLElement,
    item: MediaItem,
    refresh: CommunityRatingRefresh
): void {
    const column = root.querySelector<HTMLElement>('.lorebase-editmode-column-right');
    if (!column || column.querySelector('.lorebase-editmode-community-rating')) return;

    const panel = createDiv({ cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-community-rating' });
    panel.dataset.mobilePane = 'more';
    const titleRow = panel.createDiv({ cls: 'lorebase-editmode-panel-title-row' });
    titleRow.createEl('h3', {
        cls: 'lorebase-editmode-panel-title',
        text: t('communityRatingTitle'),
    });
    const refreshButton = titleRow.createEl('button', {
        cls: 'lorebase-editmode-icon-btn lorebase-editmode-community-refresh',
        attr: {
            type: 'button',
            title: t('communityRatingRefresh'),
            'aria-label': t('communityRatingRefresh'),
        },
    });
    setIcon(refreshButton, 'refresh-cw');

    const body = panel.createDiv({ cls: 'lorebase-community-rating-card' });
    const score = body.createDiv({ cls: 'lorebase-community-rating-score' });
    const ratingValue = score.createSpan({ cls: 'lorebase-community-rating-number', attr: { 'data-role': 'community-rating' } });
    score.createSpan({ cls: 'lorebase-community-rating-caption', text: t('communityRatingScore') });

    const meta = body.createDiv({ cls: 'lorebase-community-rating-meta' });
    const providerValue = meta.createSpan({ cls: 'lorebase-community-rating-provider', attr: { 'data-role': 'community-provider' } });
    const votesValue = meta.createSpan({ cls: 'lorebase-community-rating-votes', attr: { 'data-role': 'community-votes' } });

    const sync = (): void => {
        providerValue.textContent = item.communityRatingProvider || t('communityRatingNoSource');
        ratingValue.textContent = formatRating(item.communityRating);
        votesValue.textContent = formatVotesLine(item.communityVotes);
        body.toggleClass('is-empty', !Number.isFinite(item.communityRating));
    };

    refreshButton.addEventListener('click', () => {
        void (async (): Promise<void> => {
            refreshButton.disabled = true;
            refreshButton.addClass('is-loading');
            try {
                const next = await refresh();
                if (!next || !Number.isFinite(next.rating)) {
                    new Notice(t('communityRatingNotFound'));
                    return;
                }
                item.communityRatingProvider = next.provider;
                item.communityRating = next.rating;
                item.communityVotes = next.votes;
                sync();
                new Notice(t('communityRatingUpdated'));
            } catch (error) {
                console.error('Community rating refresh failed:', error);
                new Notice(t('communityRatingRefreshFailed'));
            } finally {
                refreshButton.disabled = false;
                refreshButton.removeClass('is-loading');
            }
        })();
    });

    sync();

    const tags = column.querySelector<HTMLElement>('.lorebase-editmode-tags');
    if (tags) {
        tags.after(panel);
        return;
    }

    const dates = column.querySelector<HTMLElement>('.lorebase-editmode-timestamps');
    if (dates) dates.before(panel);
    else column.appendChild(panel);
}
