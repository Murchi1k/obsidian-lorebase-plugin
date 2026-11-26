// @vitest-environment happy-dom
import { beforeAll, expect, it, vi } from 'vitest';
import { i18n } from '../src/localization';
import { renderCommunityRatingPanel } from '../src/modals/CommunityRatingPanel';
import { createCardPreviewItem } from '../src/settings/sections/cardPreviewSamples';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeAll(installStatisticsDom);

it('shows the community score with a compact ten-point scale and refreshes the same panel', async () => {
    i18n.setLanguage('ru');
    const root = document.createElement('div');
    root.createDiv({ cls: 'lorebase-editmode-column-right' });
    const item = { ...createCardPreviewItem('game', 4), communityRating: 82, communityVotes: 743, communityRatingProvider: 'IGDB' };
    const refresh = vi.fn(async () => {
        item.communityRating = 86.5;
        return true;
    });
    renderCommunityRatingPanel(root, item, refresh);
    const score = root.querySelector('[data-role="community-rating"]')!;
    expect(score.textContent).toBe('8.2');
    expect(score.parentElement?.textContent).toBe('8.2 / 10');
    expect(root.querySelector('details')).toBeNull();

    root.querySelector('button')!.click();
    await vi.waitFor(() => expect(score.textContent).toBe('8.7'));
});
