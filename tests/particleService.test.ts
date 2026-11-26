// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { PARTICLE_INTENSITY_MAX, PARTICLE_INTENSITY_MIN } from '../src/constants';
import { ParticleService } from '../src/services/ParticleService';

const nextFrame = (): Promise<void> => new Promise(resolve => window.requestAnimationFrame(() => resolve()));
const selector = '.lorebase-particle-container';

afterEach(() => {
    document.body.replaceChildren();
});

describe('ParticleService', () => {
    it('mounts outside the workspace and changes motion preference without replacing particles', async () => {
        const workspace = document.createElement('div');
        workspace.className = 'app-container';
        document.body.appendChild(workspace);
        const service = new ParticleService(document);

        service.apply('snow', PARTICLE_INTENSITY_MIN);
        await nextFrame();
        const layer = document.querySelector(selector)!;
        const particle = layer.firstElementChild;
        expect(layer.parentElement).toBe(document.body);
        expect(layer.children).toHaveLength(PARTICLE_INTENSITY_MIN);
        expect(layer.querySelector('.lorebase-particle-snow')).toBe(particle);
        expect(layer.hasAttribute('data-animate-with-reduced-motion')).toBe(false);

        service.apply('snow', PARTICLE_INTENSITY_MIN, true);
        await nextFrame();
        expect(layer.hasAttribute('data-animate-with-reduced-motion')).toBe(true);
        expect(layer.firstElementChild).toBe(particle);
        service.destroy();
    });

    it('recreates a detached layer and cancels pending rendering when turned off', async () => {
        const service = new ParticleService(document);
        service.apply('rain', PARTICLE_INTENSITY_MIN);
        const detachedLayer = document.querySelector(selector)!;
        detachedLayer.remove();

        service.apply('rain', PARTICLE_INTENSITY_MIN);
        const replacement = document.querySelector(selector)!;
        expect(replacement).not.toBe(detachedLayer);
        service.apply('none', PARTICLE_INTENSITY_MIN);
        await nextFrame();

        expect(document.querySelector(selector)).toBeNull();
        expect(replacement.childElementCount).toBe(0);
    });

    it('adjusts density without restarting the particles already on screen', async () => {
        const service = new ParticleService(document);
        service.apply('snow', PARTICLE_INTENSITY_MIN);
        await nextFrame();
        const layer = document.querySelector(selector)!;
        const first = layer.firstElementChild;

        service.apply('snow', PARTICLE_INTENSITY_MAX);
        await nextFrame();
        expect(layer.children).toHaveLength(PARTICLE_INTENSITY_MAX);
        expect(layer.firstElementChild).toBe(first);

        service.apply('snow', PARTICLE_INTENSITY_MIN);
        await nextFrame();
        expect(layer.children).toHaveLength(PARTICLE_INTENSITY_MIN);
        expect(layer.firstElementChild).toBe(first);
        service.destroy();
    });
});
