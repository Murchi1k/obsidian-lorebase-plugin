import { setIcon } from 'obsidian';
import type { GameItem } from '../types';
import { gt } from '../localization/gameTracking';
import { achievementProgress } from '../utils/gameTracking';
import type { SteamTrackingResult } from '../services/integrations/providers/steamTracking';
import { renderPlayStationTrophies, type RefreshPlayStationTracking } from './PlayStationProgressPanel';
import { playStationPersonalProgress } from '../services/playstation/progress';
import { pt, psnError } from '../localization/playstation';
import type { PlayStationProgressPreference } from './PlayStationProgressPreference';

export type RefreshGameTracking = (appId: string) => Promise<SteamTrackingResult>;

export class GameTrackingPanel {
    private patch: Partial<GameItem> = {};
    private alive = true;
    private loading = false;
    private fields: HTMLInputElement[] = [];
    private unlocked!: HTMLInputElement;
    private total!: HTMLInputElement;
    private controller = new AbortController();
    private unsubscribePsn?: () => void;
    constructor(private host: HTMLElement, private game: GameItem, private refresh?: RefreshGameTracking, private compact = false,
        private refreshPsn?: RefreshPlayStationTracking, private psnPreference?: PlayStationProgressPreference) { this.render(); }
    getValue(): Partial<GameItem> { return { ...this.patch }; }
    destroy(): void { this.alive = false; this.controller.abort(); this.unsubscribePsn?.(); }
    validate(): boolean {
        if (this.loading) return false;
        this.unlocked.setCustomValidity(this.unlocked.value !== '' && this.total.value !== '' && Number(this.unlocked.value) > Number(this.total.value) ? gt('invalid') : '');
        const invalid = this.fields.find(input => !input.checkValidity());
        if (invalid) {
            this.host.closest('.lorebase-editmode-root')?.querySelector<HTMLButtonElement>('[data-mobile-tab-target="personal"]')?.click();
            const details = invalid.closest('details');
            if (details) details.open = true;
            invalid.reportValidity(); invalid.focus(); return false;
        }
        return true;
    }
    private el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
        return parent.createEl(tag, { cls, text });
    }
    private input(parent: HTMLElement, label: string, value: number | null | undefined): HTMLInputElement {
        const input = this.el(parent, 'input', 'lorebase-game-number');
        input.type = 'number'; input.min = '0'; input.step = '1'; input.setAttribute('aria-label', label); input.title = label;
        input.value = value == null ? '' : String(value); input.placeholder = '—';
        this.fields.push(input); return input;
    }
    private button(parent: HTMLElement, text: string, action: (event: MouseEvent) => void): HTMLButtonElement {
        const button = this.el(parent, 'button', 'lorebase-game-action', text);
        button.type = 'button'; button.addEventListener('click', action); return button;
    }
    private icon(parent: HTMLElement, name: string): void { setIcon(this.el(parent, 'span', 'lorebase-game-icon'), name); }
    private renderProgressRing(ring: HTMLElement, onChange: () => void): (value: number, focus?: boolean) => void {
        ring.tabIndex = 0;
        ring.setAttribute('role', 'slider');
        ring.setAttribute('aria-label', gt('progress'));
        ring.setAttribute('aria-valuemin', '0');
        ring.setAttribute('aria-valuemax', '100');
        const svg = ring.createSvg('svg');
        svg.setAttribute('viewBox', '0 0 80 80');
        svg.setAttribute('aria-hidden', 'true');
        const track = svg.createSvg('circle');
        track.setAttribute('cx', '40');
        track.setAttribute('cy', '40');
        track.setAttribute('r', '34');
        track.setAttribute('pathLength', '100');
        track.setAttribute('class', 'lorebase-game-ring-track');
        const fill = track.cloneNode() as SVGCircleElement;
        fill.setAttribute('class', 'lorebase-game-ring-fill');
        fill.setAttribute('transform', 'rotate(-90 40 40)');
        svg.append(fill);
        const output = this.el(ring, 'output', 'lorebase-game-ring-value');
        output.setAttribute('aria-hidden', 'true');
        const entry = this.el(ring.parentElement!, 'input', 'lorebase-game-ring-input');
        entry.type = 'number';
        entry.min = '0';
        entry.max = '100';
        entry.step = '1';
        entry.inputMode = 'numeric';
        entry.setAttribute('aria-label', gt('enterProgress'));
        entry.hidden = true;
        let value = this.game.progressPercent ?? null;
        const paint = (): void => {
            const label = value === null ? '—' : `${value}%`;
            ring.setAttribute('aria-valuenow', String(value ?? 0));
            ring.setAttribute('aria-valuetext', label);
            fill.setAttribute('stroke-dasharray', `${value ?? 0} 100`);
            fill.toggleAttribute('hidden', !value);
            output.value = label;
            ring.classList.toggle('is-set', value !== null);
        };
        const change = (next: number | null): void => {
            if (value === next) return;
            value = next;
            this.patch.progressPercent = next;
            paint();
            onChange();
        };
        const closeEntry = (commit: boolean, restoreFocus: boolean): void => {
            if (entry.hidden) return;
            if (commit && entry.checkValidity()) change(entry.value === '' ? null : entry.valueAsNumber);
            entry.hidden = true;
            ring.classList.remove('is-editing');
            if (restoreFocus) ring.focus({ preventScroll: true });
        };
        const openEntry = (): void => {
            entry.value = value === null ? '' : String(value);
            entry.hidden = false;
            ring.classList.add('is-editing');
            entry.focus({ preventScroll: true });
            entry.select();
        };
        entry.addEventListener('blur', () => closeEntry(true, false));
        entry.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Enter' && !entry.reportValidity()) return;
            closeEntry(event.key === 'Enter', true);
        });
        ring.addEventListener('contextmenu', event => {
            event.preventDefault();
            event.stopPropagation();
            closeEntry(false, false);
            change(null);
        });
        const position = (event: PointerEvent): { angle: number; distance: number } => {
            const bounds = ring.getBoundingClientRect();
            const x = event.clientX - bounds.left - bounds.width / 2;
            const y = event.clientY - bounds.top - bounds.height / 2;
            return { angle: (Math.atan2(x, -y) * 50 / Math.PI + 100) % 100, distance: Math.hypot(x, y) / bounds.width };
        };
        const clamp = (percent: number): number => Math.max(0, Math.min(100, Math.round(percent)));
        let drag: { pointer: number; angle: number; progress: number } | undefined;
        ring.addEventListener('pointerdown', event => {
            if (event.button !== 0 || drag) return;
            const { angle, distance } = position(event);
            if (!Number.isFinite(distance) || distance > 0.55) return;
            event.preventDefault();
            if (distance < 0.25) { openEntry(); return; }
            ring.focus({ preventScroll: true });
            const progress = angle === 0 && value === 100 ? 100 : angle;
            drag = { pointer: event.pointerId, angle, progress };
            ring.setPointerCapture?.(event.pointerId);
            change(clamp(progress));
        });
        ring.addEventListener('pointermove', event => {
            if (drag?.pointer !== event.pointerId) return;
            const { angle, distance } = position(event);
            if (distance < 0.2) return;
            // Unwrap the angle while dragging so crossing twelve o’clock does not jump from 100% to 0%.
            drag.progress += (angle - drag.angle + 150) % 100 - 50;
            drag.angle = angle;
            change(clamp(drag.progress));
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
            ring.addEventListener(type, event => { if (drag?.pointer === event.pointerId) drag = undefined; });
        }
        ring.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === 'Enter' || event.key === ' ') openEntry();
                else change(null);
                return;
            }
            const steps: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 100 : (value ?? 0) + steps[event.key];
            if (!Number.isFinite(next)) return;
            event.preventDefault();
            change(clamp(next));
        });
        paint();
        return (value, focus = true) => {
            closeEntry(false, false);
            change(value);
            if (focus) ring.focus({ preventScroll: true });
        };
    }

    private renderProgressHelp(heading: HTMLElement): void {
        const help = this.el(heading, 'details', 'lorebase-game-progress-help');
        const summary = this.el(help, 'summary', '', '?');
        summary.setAttribute('aria-label', gt('progressHelp'));
        summary.title = gt('progressHelp');
        const text = this.el(help, 'div', 'lorebase-game-progress-help-text');
        this.el(text, 'p', '', gt('ringHelp'));
        this.el(text, 'p', '', gt('platformsHelp'));
        help.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !help.open) return;
            event.stopPropagation();
            help.open = false;
            summary.focus();
        });
    }

    private stat(parent: HTMLElement, kind: string, label: string, icon: string): { fields: HTMLElement; value?: HTMLElement; valueRow?: HTMLElement } {
        const cls = `lorebase-game-stat is-${kind}`;
        if (!this.compact) {
            const block = this.el(parent, 'div', cls);
            this.el(block, 'span', 'lorebase-game-stat-caption', label);
            const fields = this.el(block, 'div', 'lorebase-game-stat-controls');
            this.icon(fields, icon);
            return { fields };
        }
        const details = this.el(parent, 'details', cls);
        const summary = this.el(details, 'summary', 'lorebase-game-stat-summary');
        this.icon(summary, icon);
        const text = this.el(summary, 'span', 'lorebase-game-stat-text');
        this.el(text, 'span', 'lorebase-game-stat-caption', label);
        const valueRow = this.el(text, 'span', 'lorebase-game-stat-value-row');
        const value = this.el(valueRow, 'strong', 'lorebase-game-stat-value');
        setIcon(this.el(summary, 'span', 'lorebase-game-stat-chevron'), 'chevron-down');
        const fields = this.el(details, 'div', 'lorebase-game-stat-controls');
        return { fields, value, valueRow };
    }

    private renderLegacyProgress(heading: HTMLElement): (value: number) => void {
        const score = this.el(heading, 'label', 'lorebase-game-progress-score');
        const percent = this.input(score, gt('progress'), this.game.progressPercent);
        percent.max = '100'; percent.classList.add('lorebase-game-progress-number');
        this.el(score, 'span', '', '%');
        const bar = this.el(this.host, 'div', 'lorebase-game-progress-bar');
        bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', gt('progress'));
        bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
        const fill = this.el(bar, 'span', 'lorebase-game-progress-fill');
        const paintProgress = () => {
            const value = percent.value === '' ? null : Number(percent.value);
            if (!percent.checkValidity()) return;
            fill.style.width = `${value ?? 0}%`; bar.classList.toggle('is-unknown', value === null);
            if (value === null) { bar.removeAttribute('aria-valuenow'); bar.setAttribute('aria-valuetext', '—'); }
            else { bar.setAttribute('aria-valuenow', String(value)); bar.setAttribute('aria-valuetext', `${value}%`); }
        };
        paintProgress();
        percent.addEventListener('input', () => { if (percent.checkValidity()) { this.patch.progressPercent = percent.value === '' ? null : Number(percent.value); paintProgress(); } });
        return value => {
            percent.value = String(value);
            this.patch.progressPercent = value;
            paintProgress();
        };
    }

    private render(): void {
        const host = this.host; host.classList.add('lorebase-game-tracking');
        const heading = this.el(host, 'div', 'lorebase-game-tracking-heading');
        this.el(heading, 'h3', 'lorebase-editmode-panel-title', gt('title'));
        if (this.compact) this.renderProgressHelp(heading);
        const actions = this.el(heading, 'div', 'lorebase-game-tracking-actions');
        const overview = this.compact ? this.el(host, 'div', 'lorebase-game-tracking-overview') : host;
        let applyProgress: (value: number, focus?: boolean) => void;
        if (this.compact) {
            const slot = this.el(overview, 'div', 'lorebase-game-ring-slot');
            applyProgress = this.renderProgressRing(this.el(slot, 'div', 'lorebase-game-progress-ring'), () => syncEstimateVisibility());
        } else applyProgress = this.renderLegacyProgress(heading);
        const toolbar = this.el(overview, 'div', 'lorebase-game-tracking-toolbar');
        const { fields: timeControl, value: timeValue } = this.stat(toolbar, 'time', gt(this.compact ? 'timeSummary' : 'time'), 'clock-3');
        const hours = this.input(timeControl, gt('hours'), this.game.playtimeMinutes == null ? null : Math.floor(this.game.playtimeMinutes / 60));
        hours.classList.add('lorebase-game-hours');
        this.el(timeControl, 'span', 'lorebase-game-time-unit', gt('hoursShort'));
        const minutes = this.input(timeControl, gt('minutes'), this.game.playtimeMinutes == null ? null : this.game.playtimeMinutes % 60);
        minutes.max = '59'; minutes.classList.add('lorebase-game-minutes');
        this.el(timeControl, 'span', 'lorebase-game-time-unit', gt('minutesShort'));
        const paintTime = (): void => {
            if (!timeValue) return;
            timeValue.textContent = hours.value === '' && minutes.value === ''
                ? '—'
                : `${hours.value || '0'} ${gt('hoursShort')} ${minutes.value || '0'} ${gt('minutesShort')}`;
        };
        const updateTime = (): void => {
            if (!hours.checkValidity() || !minutes.checkValidity()) return;
            this.patch.playtimeMinutes = hours.value === '' && minutes.value === '' ? null : Number(hours.value) * 60 + Number(minutes.value);
            paintTime();
        };
        paintTime();
        hours.addEventListener('input', updateTime); minutes.addEventListener('input', updateTime);
        const { fields: counts, value: achievementsValue, valueRow } = this.stat(toolbar, 'achievements', gt('achievements'), 'trophy');
        this.unlocked = this.input(counts, gt('unlocked'), this.game.achievementsUnlocked);
        this.el(counts, 'span', 'lorebase-game-stat-separator', '/');
        this.total = this.input(counts, gt('total'), this.game.achievementsTotal);
        const estimate = (): number | null => this.unlocked.checkValidity() && this.total.checkValidity()
            ? achievementProgress(this.unlocked.value, this.total.value)
            : null;
        const apply = this.button(valueRow ?? counts, '', event => {
            if (valueRow) event.preventDefault();
            const value = estimate();
            if (!this.loading && value !== null) applyProgress(value);
        });
        apply.classList.add('lorebase-game-apply-progress');
        apply.title = gt('applyAchievements');
        let estimatedProgress: number | null = null;
        const syncEstimateVisibility = (): void => {
            const current = this.patch.progressPercent === undefined ? this.game.progressPercent : this.patch.progressPercent;
            apply.hidden = this.compact && (estimatedProgress === null || estimatedProgress === current);
        };
        const updateSuggestion = () => {
            if (achievementsValue) achievementsValue.textContent = this.unlocked.value || this.total.value
                ? `${this.unlocked.value || '—'}/${this.total.value || '—'}`
                : '—';
            estimatedProgress = estimate();
            syncEstimateVisibility();
            const percent = estimatedProgress === null ? '—' : `${estimatedProgress}%`;
            apply.textContent = this.compact ? `≈ ${percent}` : `= ${percent}`;
            apply.disabled = this.loading || estimatedProgress === null;
            apply.setAttribute('aria-label', `${gt('applyAchievements')}: ${percent}`);
        };
        updateSuggestion();
        for (const [input, key] of [[this.unlocked, 'achievementsUnlocked'], [this.total, 'achievementsTotal']] as const) {
            input.addEventListener('input', () => {
                this.unlocked.setCustomValidity('');
                if (input.checkValidity()) this.patch[key] = input.value === '' ? null : Number(input.value);
                updateSuggestion();
            });
        }
        const modes = this.el(this.compact ? toolbar : host, 'div', 'lorebase-game-modes');
        modes.setAttribute('role', 'group');
        modes.setAttribute('aria-label', gt(this.compact ? 'modeLabel' : 'modes'));
        if (this.compact) this.el(modes, 'span', 'lorebase-game-mode-caption', gt('modeLabel'));
        const selected = new Set(this.game.gameModes ?? []);
        for (const mode of ['solo', 'coop', 'multiplayer'] as const) {
            const button = this.button(modes, '', () => {
                selected.has(mode) ? selected.delete(mode) : selected.add(mode);
                button.classList.toggle('is-active', selected.has(mode)); button.setAttribute('aria-pressed', String(selected.has(mode)));
                this.patch.gameModes = [...selected];
            });
            button.dataset.mode = mode;
            this.icon(button, { solo: 'user-round', coop: 'handshake', multiplayer: 'network' }[mode]);
            if (this.compact) {
                button.setAttribute('aria-label', gt(mode));
                button.title = gt(mode);
            }
            const label = this.compact && mode !== 'solo' ? gt(mode === 'coop' ? 'coopShort' : 'multiplayerShort') : gt(mode);
            this.el(button, 'span', '', label); button.setAttribute('aria-pressed', String(selected.has(mode))); button.classList.toggle('is-active', selected.has(mode));
        }
        const status = this.el(host, 'p', 'setting-item-description lorebase-game-tracking-status'); status.setAttribute('role', 'status');
        const appId = this.game.steamAppId || (this.game.integrationProvider === 'steam' ? this.game.integrationId || '' : '');
        const syncHost = this.compact ? actions : toolbar;
        const sync = this.button(syncHost, '', () => { void refresh(); }); sync.classList.add('lorebase-game-steam-refresh');
        const syncIcon = this.el(sync, 'span', 'lorebase-game-icon');
        const syncLabel = this.el(sync, 'span', '', gt('steam'));
        setIcon(syncIcon, 'refresh-cw');
        sync.setAttribute('aria-label', gt('steam'));
        sync.hidden = Boolean(this.game.playstation && !appId);
        sync.disabled = !this.refresh; sync.title = appId ? gt('steam') : gt('linkSource');
        const showSyncState = (state: 'loading' | 'updated' | 'partial' | 'failed' | 'linkSource'): void => {
            if (!this.compact) { status.textContent = gt(state); return; }
            sync.dataset.state = state;
            const success = state === 'updated' || state === 'partial';
            const label = state === 'updated' ? gt('synced') : state === 'partial' ? gt('syncedPartial') : state === 'loading' ? gt('loading') : gt('steam');
            syncLabel.textContent = label;
            sync.setAttribute('aria-label', success ? `${label} · ${gt('steam')}` : label);
            setIcon(syncIcon, success ? 'check' : 'refresh-cw');
            status.classList.toggle('is-steam-feedback', success || state === 'loading');
            status.textContent = success || state === 'loading' ? label : gt(state);
        };
        if (this.game.playstation) {
            let tracking = structuredClone(this.game.playstation);
            let enabled = this.psnPreference?.isVisible() ?? true;
            const control = this.el(actions, 'div', 'lorebase-psn-control');
            actions.prepend(control);
            const ps = this.button(control, '', () => {
                if (this.loading) return;
                enabled = !enabled;
                if (enabled) fillFromPlayStation();
                paintPlayStation();
                this.psnPreference?.setVisible(enabled);
            });
            ps.classList.add('lorebase-psn-mode'); ps.title = pt('progressMode'); ps.setAttribute('aria-label', pt('progressMode'));
            const indicator = this.el(ps, 'span', 'lorebase-psn-mode-indicator'); indicator.setAttribute('aria-hidden', 'true');
            this.el(ps, 'span', '', 'PS');
            const update = this.button(control, '', () => { void refreshPlayStation(); });
            update.classList.add('lorebase-psn-refresh'); update.title = pt('refresh'); update.setAttribute('aria-label', pt('refresh'));
            setIcon(this.el(update, 'span', ''), 'refresh-cw');
            const message = this.el(actions, 'span', 'lorebase-psn-refresh-status'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
            // EditModal appends its platform controls after this section.
            const trophies = this.el(host, 'div', 'lorebase-psn-trophy-section');
            const paintPlayStation = () => {
                ps.setAttribute('aria-pressed', String(enabled)); ps.classList.toggle('is-active', enabled);
                ps.setAttribute('aria-expanded', String(enabled)); ps.title = pt(enabled ? 'hideTrophies' : 'showTrophies');
                control.classList.toggle('is-active', enabled);
                if (enabled) { if (indicator.parentElement !== ps) ps.prepend(indicator); if (update.parentElement !== control) control.appendChild(update); }
                else { indicator.remove(); update.remove(); }
                update.hidden = !enabled; update.disabled = !this.refreshPsn || this.loading;
                trophies.hidden = !enabled; trophies.empty();
                if (enabled) renderPlayStationTrophies(trophies, tracking);
            };
            const fillFromPlayStation = () => {
                const values = playStationPersonalProgress(tracking);
                Object.assign(this.patch, values);
                if (values.playtimeMinutes !== undefined && values.playtimeMinutes !== null) {
                    hours.value = String(Math.floor(values.playtimeMinutes / 60)); minutes.value = String(values.playtimeMinutes % 60); paintTime();
                }
                if (values.achievementsUnlocked !== undefined && values.achievementsTotal !== undefined) {
                    this.unlocked.value = String(values.achievementsUnlocked); this.total.value = String(values.achievementsTotal); this.unlocked.setCustomValidity('');
                }
                if (values.progressPercent !== undefined && values.progressPercent !== null) applyProgress(values.progressPercent, false);
                updateSuggestion();
            };
            const refreshPlayStation = async () => {
                if (this.loading || !this.refreshPsn) return;
                this.loading = true; update.disabled = true; ps.disabled = true; message.textContent = pt('loading');
                try {
                    const result = await this.refreshPsn(tracking, this.controller.signal);
                    if (!this.alive) return;
                    if (result.tracking.accountId !== tracking.accountId || result.tracking.titleId !== tracking.titleId) throw new Error('PSN_ACCOUNT_CHANGED');
                    tracking = result.tracking; this.patch.playstation = structuredClone(tracking);
                    fillFromPlayStation(); paintPlayStation(); message.textContent = pt(result.partial ? 'partial' : 'updated');
                } catch (error) { if (this.alive) message.textContent = psnError(error); }
                finally { this.loading = false; if (this.alive) { ps.disabled = false; update.disabled = false; updateSuggestion(); } }
            };
            if (enabled) fillFromPlayStation();
            paintPlayStation();
            this.unsubscribePsn = this.psnPreference?.subscribe(visible => {
                if (!this.alive || visible === enabled) return;
                enabled = visible;
                if (enabled) fillFromPlayStation();
                paintPlayStation();
            });
        }
        const refresh = async () => {
            if (!this.refresh || this.loading) return;
            if (!/^[1-9]\d*$/.test(appId)) { showSyncState('linkSource'); return; }
            this.loading = true; showSyncState('loading');
            const controls = this.compact ? [hours, minutes, this.unlocked, this.total, apply, sync] : Array.from(host.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button'));
            controls.forEach(node => node.disabled = true);
            try {
                const result = await this.refresh(appId); if (!this.alive) return;
                if (result.playtimeMinutes !== undefined) {
                    this.patch.playtimeMinutes = result.playtimeMinutes;
                    hours.value = String(Math.floor(result.playtimeMinutes / 60));
                    minutes.value = String(result.playtimeMinutes % 60);
                    paintTime();
                }
                if (result.achievementsUnlocked !== undefined && result.achievementsTotal !== undefined) {
                    this.patch.achievementsUnlocked = result.achievementsUnlocked; this.patch.achievementsTotal = result.achievementsTotal;
                    this.unlocked.value = String(result.achievementsUnlocked); this.total.value = String(result.achievementsTotal); this.unlocked.setCustomValidity('');
                    updateSuggestion();
                }
                showSyncState(result.partial ? 'partial' : 'updated');
            } catch { if (this.alive) showSyncState('failed'); }
            finally {
                this.loading = false;
                if (this.alive) { controls.forEach(node => node.disabled = false); updateSuggestion(); }
            }
        };
    }
}
