import { ParticleEffect } from '../types';

export class ParticleService {
    private container: HTMLElement | null = null;
    private effect: ParticleEffect = 'none';
    private intensity = 70;
    private rafId: number | null = null;

    apply(effect: ParticleEffect, intensity: number): void {
        const nextEffect: ParticleEffect = effect || 'none';
        const nextIntensity = this.clampIntensity(intensity);

        if (nextEffect === 'none') {
            this.destroy();
            return;
        }

        const needsRender = !this.container || nextEffect !== this.effect || nextIntensity !== this.intensity;
        this.effect = nextEffect;
        this.intensity = nextIntensity;

        this.ensureContainer();

        if (needsRender) {
            this.scheduleRender();
        }
    }

    destroy(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }

    private clampIntensity(value: number): number {
        if (!Number.isFinite(value)) return 70;
        return Math.min(150, Math.max(20, Math.trunc(value)));
    }

    private ensureContainer(): void {
        if (this.container) return;
        const container = document.createElement('div');
        container.className = 'lorebase-particle-container';
        container.setAttribute('aria-hidden', 'true');
        container.setAttribute('role', 'presentation');
        const host = (document.querySelector('.app-container') as HTMLElement | null)
            ?? document.body
            ?? document.documentElement;
        if (!host) {
            return;
        }
        host.appendChild(container);
        this.container = container;
    }

    private scheduleRender(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
        }

        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.render();
        });
    }

    private render(): void {
        if (!this.container) return;
        this.container.innerHTML = '';

        const fragment = document.createDocumentFragment();

        for (let i = 0; i < this.intensity; i++) {
            fragment.appendChild(this.createParticle());
        }

        this.container.appendChild(fragment);
    }

    private createParticle(): HTMLElement {
        const particle = document.createElement('div');
        particle.className = `lorebase-particle lorebase-particle-${this.effect}`;

        const isSnow = this.effect === 'snow';
        const size = (isSnow ? 4 : 6) + Math.random() * (isSnow ? 5 : 6);
        const speed = 12 + Math.random() * 18;
        const sway = (isSnow ? 18 : 30) + Math.random() * (isSnow ? 50 : 80);
        const left = Math.random() * 100;
        const delay = -Math.random() * speed;
        const opacity = 0.3 + Math.random() * 0.5;
        const scale = isSnow ? (0.7 + Math.random() * 0.7) : (0.8 + Math.random() * 0.55);
        const spin = (isSnow ? 180 : 360) + Math.random() * (isSnow ? 180 : 360);
        const swayReverse = -sway * (0.6 + Math.random() * 0.3);

        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${left}vw`;
        particle.style.animationDuration = `${speed}s`;
        particle.style.animationDelay = `${delay}s`;
        particle.style.setProperty('--sway-amount', `${sway}px`);
        particle.style.setProperty('--sway-reverse', `${swayReverse.toFixed(2)}px`);
        particle.style.setProperty('--particle-opacity', opacity.toFixed(2));
        particle.style.setProperty('--particle-scale', scale.toFixed(2));
        particle.style.setProperty('--particle-spin', `${spin.toFixed(0)}deg`);

        return particle;
    }
}
