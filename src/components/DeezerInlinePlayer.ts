import { areOnlineExtrasEnabled, onOnlineExtrasChange } from '../services/onlineExtras';
import { setIcon } from 'obsidian';
import { mt } from '../localization/music';
import { formatDuration } from '../services/media/music';
import { exactMusicPreview, type MusicPreview, type MusicPreviewQuery } from '../services/media/musicPlayback';

export interface DeezerPreviewTarget { key: string; query: MusicPreviewQuery; host: HTMLElement; button: HTMLButtonElement }
type LoadPreviews = (query: MusicPreviewQuery) => Promise<MusicPreview[]>;

/** One transient clip per editor. The player follows its song when rows are reordered. */
export class DeezerInlinePlayer {
    private static active?: DeezerInlinePlayer;
    private targets = new Map<string, DeezerPreviewTarget>();
    private key?: string;
    private queryIdentity = '';
    private root: HTMLElement;
    private status: HTMLElement;
    private controls: HTMLElement;
    private seek: HTMLInputElement;
    private elapsed: HTMLElement;
    private total: HTMLElement;
    private volumeButton: HTMLButtonElement;
    private volumeInput: HTMLInputElement;
    private audio?: HTMLAudioElement;
    private generation = 0;
    private alive = true;
    private loading = false;
    private playing = false;
    private volume = .7;
    private muted = false;
    private stopExtrasWatch: () => void;
    constructor(private load: LoadPreviews) {
        this.stopExtrasWatch = onOnlineExtrasChange(enabled => { if (!enabled) this.stop(); this.paintButtons(); });
        this.root = document.createElement('div'); this.root.className = 'lorebase-deezer-inline';
        this.status = this.root.createDiv({ cls: 'lorebase-deezer-inline-status', attr: { role: 'status', 'aria-live': 'polite' } });
        this.controls = this.root.createDiv({ cls: 'lorebase-deezer-inline-controls' });
        this.elapsed = this.controls.createSpan({ text: '0:00' });
        this.seek = this.range('30', '.1', '0', mt('previewSeek'));
        this.seek.disabled = true;
        this.total = this.controls.createSpan({ text: '0:30' });
        this.volumeButton = this.controls.createEl('button', { attr: { type: 'button', 'aria-label': mt('previewMute'), title: mt('previewMute') } });
        this.volumeInput = this.range('1', '.05', String(this.volume), mt('previewVolume'));
        this.volumeButton.addEventListener('click', () => { this.muted = !this.muted; this.applyVolume(); });
        this.volumeInput.addEventListener('input', () => { this.volume = Number(this.volumeInput.value); this.muted = this.volume === 0; this.applyVolume(); });
        this.seek.addEventListener('input', () => {
            if (!this.audio || this.seek.disabled) return;
            this.audio.currentTime = Math.min(this.duration(), Math.max(0, Number(this.seek.value)));
            this.updateTime();
        });
        this.applyVolume();
    }
    private range(max: string, step: string, value: string, label: string): HTMLInputElement {
        const shell = this.controls.createDiv({ cls: 'lorebase-deezer-range' });
        const rail = shell.createSpan({ cls: 'lorebase-deezer-range-rail', attr: { 'aria-hidden': 'true' } });
        rail.createSpan({ cls: 'lorebase-deezer-range-fill' });
        rail.createSpan({ cls: 'lorebase-deezer-range-thumb' });
        // A transparent native range retains keyboard, pointer and screen-reader behavior.
        return shell.createEl('input', { attr: { type: 'range', min: '0', max, step, value, 'aria-label': label } });
    }
    private paintRange(input: HTMLInputElement, percent: number): void {
        input.parentElement?.style.setProperty('--lorebase-seek-progress', `${Math.min(100, Math.max(0, percent))}%`);
    }
    private identity(query: MusicPreviewQuery): string { return JSON.stringify([query.title, query.artist, query.deezerId]); }
    mount(targets: DeezerPreviewTarget[]): void {
        this.targets = new Map(targets.map(target => [target.key, target]));
        const active = this.key && this.targets.get(this.key);
        if (this.key && (!active || this.identity(active.query) !== this.queryIdentity)) this.stop();
        else if (active) active.host.appendChild(this.root);
        this.paintButtons();
    }
    updateQuery(key: string, query: MusicPreviewQuery): void {
        const target = this.targets.get(key); if (!target) return;
        target.query = query;
        if (key === this.key && this.identity(query) !== this.queryIdentity) this.stop();
        this.paintButtons();
    }
    async toggle(key: string): Promise<void> {
        if (!areOnlineExtrasEnabled()) return;
        const target = this.targets.get(key); if (!this.alive || !target) return;
        if (key === this.key && this.loading) { this.stop(); return; }
        if (key === this.key && this.audio) {
            if (this.playing) this.audio.pause();
            else { if (this.audio.ended || this.audio.currentTime >= this.duration()) this.audio.currentTime = 0; await this.play(this.audio); }
            return;
        }
        DeezerInlinePlayer.active?.stop(); this.stop(); DeezerInlinePlayer.active = this;
        this.key = key; this.queryIdentity = this.identity(target.query); target.host.appendChild(this.root);
        this.status.textContent = mt('loading'); this.controls.hidden = true; this.loading = true; this.paintButtons();
        const generation = ++this.generation;
        try {
            const items = await this.load(target.query);
            if (!this.alive || generation !== this.generation) return;
            this.loading = false;
            const exact = target.query.deezerId ? items[0] : exactMusicPreview(items, target.query);
            if (exact) await this.start(exact);
            else if (!items.length) this.status.textContent = mt('previewMissing');
            else this.chooseVersion(items);
        } catch { if (this.alive && generation === this.generation) { this.loading = false; this.status.textContent = mt('previewMissing'); } }
        if (this.alive && generation === this.generation) this.paintButtons();
    }
    private chooseVersion(items: MusicPreview[]): void {
        this.status.empty();
        const select = this.status.createEl('select', { cls: 'dropdown', attr: { 'aria-label': mt('chooseVersion') } });
        select.createEl('option', { text: mt('chooseVersion'), attr: { value: '' } });
        items.forEach((item, index) => select.createEl('option', { text: `${item.title} · ${item.artist} · ${item.album}`, attr: { value: String(index) } }));
        select.addEventListener('change', () => { if (select.value !== '') void this.start(items[Number(select.value)]); });
    }
    private async start(item: MusicPreview): Promise<void> {
        if (!this.alive) return;
        this.releaseAudio(); this.status.textContent = mt('preview30'); this.controls.hidden = false;
        this.seek.value = '0'; this.paintRange(this.seek, 0); this.seek.disabled = true; this.elapsed.textContent = '0:00'; this.total.textContent = '0:30';
        const audio = document.createElement('audio'); this.audio = audio; audio.preload = 'none'; audio.src = item.preview;
        audio.addEventListener('loadedmetadata', () => { if (this.audio === audio) { this.seek.disabled = false; this.seek.max = String(this.duration()); this.updateTime(); } });
        audio.addEventListener('timeupdate', () => {
            if (this.audio !== audio) return;
            if (audio.currentTime >= 30) audio.pause();
            this.updateTime();
        });
        audio.addEventListener('play', () => { if (this.audio === audio) { this.playing = true; this.paintButtons(); } });
        const paused = () => { if (this.audio === audio) { this.playing = false; this.paintButtons(); } };
        audio.addEventListener('pause', paused); audio.addEventListener('ended', paused);
        audio.addEventListener('error', () => { if (this.audio === audio) { this.playing = false; this.status.textContent = mt('previewMissing'); this.paintButtons(); } });
        this.applyVolume(); await this.play(audio);
    }
    private async play(audio: HTMLAudioElement): Promise<void> {
        try { await audio.play(); }
        catch { if (this.audio === audio && this.alive) { this.playing = false; this.status.textContent = mt('previewPressPlay'); this.paintButtons(); } }
    }
    private duration(): number { return this.audio && Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? Math.min(30, this.audio.duration) : 30; }
    private updateTime(): void {
        const time = Math.min(this.audio?.currentTime || 0, this.duration());
        this.seek.value = String(time); this.elapsed.textContent = formatDuration(time); this.total.textContent = formatDuration(this.duration());
        this.paintRange(this.seek, time / this.duration() * 100);
        this.seek.setAttribute('aria-valuetext', `${formatDuration(time)} / ${formatDuration(this.duration())}`);
    }
    private applyVolume(): void {
        if (this.audio) { this.audio.volume = this.volume; this.audio.muted = this.muted; }
        setIcon(this.volumeButton, this.muted || this.volume === 0 ? 'volume-x' : 'volume-2');
        this.volumeButton.setAttribute('aria-pressed', String(this.muted));
        this.volumeInput.value = String(this.muted ? 0 : this.volume);
        this.paintRange(this.volumeInput, this.muted ? 0 : this.volume * 100);
    }
    private paintButtons(): void {
        for (const target of this.targets.values()) {
            target.button.disabled = !areOnlineExtrasEnabled();
            target.button.hidden = !areOnlineExtrasEnabled();
            const active = target.key === this.key;
            target.button.setAttribute('aria-pressed', String(active && this.playing));
            target.button.setAttribute('aria-busy', String(active && this.loading));
            target.button.setAttribute('aria-label', `${mt(active && this.playing ? 'previewPause' : 'listenMusic')}: ${target.query.title}`);
            target.host.parentElement?.classList.toggle('is-preview-active', active);
            setIcon(target.button, active && this.loading ? 'loader-circle' : active && this.playing ? 'pause' : 'play');
        }
    }
    private releaseAudio(): void {
        const audio = this.audio; this.audio = undefined; this.playing = false;
        if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    }
    stop(): void {
        this.generation++; this.loading = false; this.releaseAudio(); this.key = undefined; this.root.remove(); this.paintButtons();
        this.root.querySelector('select')?.remove();
        if (DeezerInlinePlayer.active === this) DeezerInlinePlayer.active = undefined;
    }
    destroy(): void { this.stopExtrasWatch(); this.stop(); this.alive = false; this.targets.clear(); }
}
