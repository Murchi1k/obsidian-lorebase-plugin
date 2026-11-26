import { handleAsyncAction } from '../utils/actionHandler';
import { setIcon } from 'obsidian';
import type { Language } from '../types';
import { getReleaseHighlights, type ReleaseTarget } from './features';
import { EXPLORER_COPY, getReleaseCopy } from './copy';
import { renderAniListCredit } from './community';
import type { ReleaseWindowState } from './navigation';

export function renderReleaseExplorer(container: HTMLElement, language: Language, version: string, navigate: (target: ReleaseTarget) => Promise<boolean>, onNavigated: () => void, state?: ReleaseWindowState): void {
    const features = getReleaseHighlights(language, version);
    const copy = getReleaseCopy(language);
    const labels = EXPLORER_COPY[language];
    if (!features.length) { container.createEl('p', { text: copy.empty }); return; }
    const root = container.createDiv({ cls: 'lorebase-release-explorer' });
    const story = root.createEl('article', { cls: 'lorebase-release-story', attr: { id: 'lorebase-feature-story' } });
    const controls = root.createDiv({ cls: 'lorebase-release-explorer-controls' });
    const previous = controls.createEl('button', { cls: 'lorebase-release-step', attr: { type: 'button', 'aria-label': labels.previous, title: labels.previous } });
    setIcon(previous, 'chevron-left');
    const progress = controls.createDiv({ cls: 'lorebase-release-progress' });
    const counter = progress.createSpan({ cls: 'lorebase-release-counter', attr: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const dots = progress.createDiv({ cls: 'lorebase-release-dots', attr: { role: 'group', 'aria-label': labels.features } });
    const next = controls.createEl('button', { cls: 'lorebase-release-step', attr: { type: 'button', 'aria-label': labels.next, title: labels.next } });
    setIcon(next, 'chevron-right');
    const selectors: HTMLButtonElement[] = [];
    let selected = 0;
    const select = (index: number): void => {
        selected = index;
        if (state) state.featureIndex = index;
        const feature = features[index];
        story.empty();
        story.scrollTop = 0;
        story.setAttribute('aria-labelledby', 'lorebase-feature-heading');
        const icon = story.createDiv({ cls: 'lorebase-release-feature-icon', attr: { 'aria-hidden': 'true' } });
        setIcon(icon, feature.icon);
        const heading = story.createDiv({ cls: 'lorebase-release-feature-heading' });
        heading.createEl('h2', { text: feature.title, attr: { id: 'lorebase-feature-heading' } });
        if (feature.beta) heading.createSpan({ cls: 'lorebase-release-badge', text: labels.beta });
        story.createEl('p', { cls: 'lorebase-release-story-lead', text: feature.description });
        const list = story.createEl('ul', { cls: 'lorebase-release-story-points' });
        for (const point of feature.details) list.createEl('li', { text: point });
        if (feature.target === 'anilist') renderAniListCredit(story, language);
        const action = story.createEl('button', { cls: 'lorebase-release-explore', attr: { type: 'button' } });
        action.createSpan({ text: copy.open });
        setIcon(action.createSpan({ attr: { 'aria-hidden': 'true' } }), 'arrow-up-right');
        action.addEventListener('click', handleAsyncAction(async () => {
            action.disabled = true;
            try { if (await navigate(feature.target)) onNavigated(); }
            finally { action.disabled = false; }
        }));
        previous.disabled = index === 0;
        next.disabled = index === features.length - 1;
        counter.textContent = `${index + 1} / ${features.length}`;
        selectors.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    };
    features.forEach((feature, index) => {
        const button = dots.createEl('button', { cls: 'lorebase-release-dot', attr: { type: 'button', title: feature.title, 'aria-label': feature.title, 'aria-controls': story.id } });
        button.addEventListener('click', () => select(index));
        selectors.push(button);
    });
    previous.addEventListener('click', () => select(selected - 1));
    next.addEventListener('click', () => select(selected + 1));
    root.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? features.length - 1
            : Math.max(0, Math.min(features.length - 1, selected + (event.key === 'ArrowRight' ? 1 : -1)));
        select(index);
    });
    select(Math.max(0, Math.min(features.length - 1, state?.featureIndex ?? 0)));
}
