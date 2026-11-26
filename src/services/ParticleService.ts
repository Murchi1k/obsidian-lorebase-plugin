import { ParticleEffect } from '../types';
import { DEFAULT_SETTINGS, PARTICLE_INTENSITY_MAX, PARTICLE_INTENSITY_MIN } from '../constants';

const PARTICLE_MOTION = {
    sakura: { size: 6, sizeRange: 6, duration: 12, durationRange: 18, sway: 30, swayRange: 80, spin: 360 },
    snow: { size: 3, sizeRange: 6, duration: 14, durationRange: 16, sway: 18, swayRange: 50, spin: 180 },
    leaves: { size: 7, sizeRange: 7, duration: 10, durationRange: 12, sway: 45, swayRange: 85, spin: 480 },
    fireflies: { size: 2, sizeRange: 4, duration: 8, durationRange: 14, sway: 20, swayRange: 85, spin: 0 },
    rain: { size: 1, sizeRange: 2, duration: 1.4, durationRange: 1.8, sway: 22, swayRange: 18, spin: 0 },
} satisfies Record<Exclude<ParticleEffect, 'none'>, object>;

export class ParticleService {
    private container: HTMLElement | null = null;
    private effect: ParticleEffect = 'none';
    private renderedEffect: ParticleEffect = 'none';
    private intensity = DEFAULT_SETTINGS.particleIntensity;
    private rafId: number | null = null;

    constructor(private readonly doc: Document = document) {}

    apply(effect: ParticleEffect, intensity: number, animateWithReducedMotion = false): void {
        const nextEffect = Object.prototype.hasOwnProperty.call(PARTICLE_MOTION, effect) ? effect : 'none';
        const nextIntensity = this.clampIntensity(intensity);

        if (nextEffect === 'none') {
            this.destroy();
            return;
        }

        const needsRender = !this.container?.isConnected || nextEffect !== this.effect || nextIntensity !== this.intensity;
        this.effect = nextEffect;
        this.intensity = nextIntensity;

        this.ensureContainer();
        this.container?.toggleAttribute('data-animate-with-reduced-motion', animateWithReducedMotion);

        if (needsRender) {
            this.scheduleRender();
        }
    }

    destroy(): void {
        if (this.rafId !== null) {
            this.doc.defaultView?.cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }

    private clampIntensity(value: number): number {
        if (!Number.isFinite(value)) return DEFAULT_SETTINGS.particleIntensity;
        return Math.min(
            PARTICLE_INTENSITY_MAX,
            Math.max(PARTICLE_INTENSITY_MIN, Math.trunc(value))
        );
    }

    private ensureContainer(): void {
        if (this.container?.isConnected || !this.doc.body) return;
        // Settings and dialogs can be siblings of the workspace.
        const container = this.doc.createElement('div');
        container.className = 'lorebase-particle-container';
        container.setAttribute('aria-hidden', 'true');
        this.doc.body.appendChild(container);
        this.container = container;
    }

    private scheduleRender(): void {
        const view = this.doc.defaultView;
        if (!view) return;
        if (this.rafId !== null) {
            view.cancelAnimationFrame(this.rafId);
        }

        this.rafId = view.requestAnimationFrame(() => {
            this.rafId = null;
            this.render();
        });
    }

    private render(): void {
        if (!this.container || this.effect === 'none') return;
        if (this.renderedEffect !== this.effect) {
            this.container.replaceChildren();
            this.renderedEffect = this.effect;
        }
        while (this.container.childElementCount > this.intensity) {
            this.container.lastElementChild?.remove();
        }

        const fragment = this.doc.createDocumentFragment();

        for (let i = this.container.childElementCount; i < this.intensity; i++) {
            fragment.appendChild(this.createParticle(this.effect));
        }

        this.container.appendChild(fragment);
    }

    private createParticle(effect: Exclude<ParticleEffect, 'none'>): HTMLElement {
        const particle = this.doc.createElement('div');
        particle.className = `lorebase-particle lorebase-particle-${effect}`;
        const motion = PARTICLE_MOTION[effect];
        const size = motion.size + Math.random() * motion.sizeRange;
        const speed = motion.duration + Math.random() * motion.durationRange;
        const sway = motion.sway + Math.random() * motion.swayRange;
        const left = Math.random() * 100;
        const restY = Math.random() * 100;
        const delay = -Math.random() * speed;
        const opacity = 0.3 + Math.random() * 0.5;
        const scale = 0.75 + Math.random() * 0.6;
        const spin = motion.spin * (1 + Math.random());
        const swayReverse = -sway * (0.6 + Math.random() * 0.3);

        particle.style.width = `${size}px`;
        particle.style.height = `${effect === 'rain' ? size * 8 : size}px`;
        particle.style.left = `${left}vw`;
        particle.style.animationDuration = `${speed}s`;
        particle.style.animationDelay = `${delay}s`;
        particle.style.setProperty('--sway-amount', `${sway}px`);
        particle.style.setProperty('--sway-reverse', `${swayReverse.toFixed(2)}px`);
        particle.style.setProperty('--particle-opacity', opacity.toFixed(2));
        particle.style.setProperty('--particle-scale', scale.toFixed(2));
        particle.style.setProperty('--particle-spin', `${spin.toFixed(0)}deg`);
        particle.style.setProperty('--particle-rest-y', `${restY}%`);

        return particle;
    }
}
