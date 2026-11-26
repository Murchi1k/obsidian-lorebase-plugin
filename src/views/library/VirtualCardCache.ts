import type { GameCard } from '../../components/GameCard';

type SavedCard = { card: GameCard; item: unknown; images: HTMLImageElement[]; bytes: number; onLoad: () => void };

/** Retain a few detached cards so reversing scroll reuses their decoded covers. */
export class VirtualCardCache {
    private cards = new Map<number, SavedCard>();
    private bytes = 0;
    private readonly maxCards = 24;
    private readonly maxBytes = 24 * 1024 * 1024;

    take(index: number, parent: HTMLElement, item: unknown): GameCard | undefined {
        const saved = this.cards.get(index);
        if (!saved) return;
        this.release(index);
        const { card } = saved;
        if (saved.item !== item) { card.destroy(); return; }
        parent.appendChild(card.getElement());
        return card;
    }

    retain(index: number, card: GameCard, item: unknown): void {
        card.getElement().remove();
        card.setImageLoadingPriority(false);
        const old = this.cards.get(index);
        if (old) { this.release(index); if (old.card !== card) old.card.destroy(); }
        const images = Array.from(card.getElement().querySelectorAll<HTMLImageElement>('img'));
        const saved: SavedCard = { card, item, images, bytes: this.imageBytes(images), onLoad: () => {
            if (this.cards.get(index) !== saved) return;
            const bytes = this.imageBytes(images);
            this.bytes += bytes - saved.bytes; saved.bytes = bytes;
            this.trim();
        } };
        this.cards.set(index, saved);
        this.bytes += saved.bytes;
        // Covers can finish decoding after their card has left the viewport.
        for (const image of images) image.addEventListener('load', saved.onLoad);
        this.trim();
    }

    private imageBytes(images: HTMLImageElement[]): number {
        return images.reduce((bytes, image) => bytes + (image.naturalWidth || 400) * (image.naturalHeight || 600) * 4, 0);
    }

    private release(index: number): void {
        const saved = this.cards.get(index);
        if (!saved) return;
        this.cards.delete(index);
        this.bytes -= saved.bytes;
        for (const image of saved.images) image.removeEventListener('load', saved.onLoad);
    }

    private trim(): void {
        while (this.cards.size > this.maxCards || this.bytes > this.maxBytes && this.cards.size > 0) {
            const oldest = this.cards.keys().next().value!;
            const evicted = this.cards.get(oldest)!.card;
            this.release(oldest);
            evicted.destroy();
        }
    }

    destroy(): void {
        for (const [index, { card }] of this.cards) { this.release(index); card.destroy(); }
        this.bytes = 0;
    }
}
