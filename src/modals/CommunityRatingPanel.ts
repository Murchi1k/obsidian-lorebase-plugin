import { Notice, setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import type { MediaItem } from '../types';
import { formatCommunityRatingValue } from '../utils/rating';

export type CommunityRatingRefresh = () => Promise<boolean>;

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

    const panel = column.createDiv({ cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-community-rating' });
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
    const scale = score.createSpan({ cls: 'lorebase-community-rating-scale', text: ' / 10' });

    const meta = body.createDiv({ cls: 'lorebase-community-rating-meta' });
    const providerValue = meta.createSpan({ cls: 'lorebase-community-rating-provider', attr: { 'data-role': 'community-provider' } });
    const votesValue = meta.createSpan({ cls: 'lorebase-community-rating-votes', attr: { 'data-role': 'community-votes' } });

    const sync = (): void => {
        providerValue.textContent = item.communityRatingProvider || t('communityRatingNoSource');
        const rating = item.communityRating;
        const hasRating = typeof rating === 'number' && Number.isFinite(rating);
        ratingValue.textContent = hasRating ? formatCommunityRatingValue(rating) : '—';
        scale.hidden = !hasRating;
        votesValue.textContent = formatVotesLine(item.communityVotes);
        body.toggleClass('is-empty', !hasRating);
    };

    const update = async (): Promise<void> => {
        refreshButton.disabled = true;
        refreshButton.addClass('is-loading');
        try {
            if (!await refresh()) {
                new Notice(t('communityRatingNotFound'));
                return;
            }
            sync();
            new Notice(t('communityRatingUpdated'));
        } catch (error) {
            console.error('Community rating refresh failed:', error);
            new Notice(t('communityRatingRefreshFailed'));
        } finally {
            refreshButton.disabled = false;
            refreshButton.removeClass('is-loading');
        }
    };

    refreshButton.addEventListener('click', () => { void update(); });

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
