import { mt } from '../localization/music';
import { areOnlineExtrasEnabled, onOnlineExtrasChange } from '../services/onlineExtras';

/** Inline credits stay independent of the surrounding details/summary control. */
export class TrackArtistCredits {
    private generation = 0;
    private expanded = false;
    private names: string[] = [];
    private stopExtrasWatch: () => void;
    constructor(private root: HTMLElement, private open: (name: string, current: () => boolean) => Promise<void>) {
        this.stopExtrasWatch = onOnlineExtrasChange(() => this.render());
    }
    update(names: string[]): void {
        this.generation++;
        this.names = names;
        this.render();
    }
    destroy(): void { this.stopExtrasWatch(); this.generation++; this.root.replaceChildren(); }
    private render(): void {
        this.generation++;
        this.root.replaceChildren();
        this.root.classList.toggle('is-expanded', this.expanded);
        this.root.closest('.lorebase-music-track-heading')?.classList.toggle('has-expanded-credits', this.expanded);
        if (!this.names.length) return;
        this.root.createSpan({ text: `${mt('creditFeat')} ` });
        const visible = this.expanded ? this.names : this.names.slice(0, 2);
        visible.forEach((name, index) => {
            if (index) this.root.append(this.root.ownerDocument.createTextNode(', '));
            const link = this.button(name, 'lorebase-music-artist-link');
            link.disabled = !areOnlineExtrasEnabled();
            link.title = `${mt('discography')}: ${name}`;
            link.addEventListener('click', () => {
                if (!areOnlineExtrasEnabled()) return;
                const generation = ++this.generation;
                link.disabled = true; link.setAttribute('aria-busy', 'true');
                void this.open(name, () => generation === this.generation).finally(() => {
                    link.disabled = !areOnlineExtrasEnabled(); link.removeAttribute('aria-busy');
                });
            });
        });
        if (this.names.length > 2) {
            this.root.append(this.root.ownerDocument.createTextNode(' · '));
            const more = this.button(this.expanded ? mt('fewerArtists') : `${mt('moreArtists')} +${this.names.length - 2}`, 'lorebase-music-artists-more');
            more.setAttribute('aria-expanded', String(this.expanded));
            more.addEventListener('click', () => { this.expanded = !this.expanded; this.render(); });
        }
    }
    private button(text: string, cls: string): HTMLButtonElement {
        const button = this.root.createEl('button', { cls, text, attr: { type: 'button' } });
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
        return button;
    }
}
