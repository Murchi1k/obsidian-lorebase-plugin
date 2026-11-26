/** Minimal Obsidian DOM helpers for the real dropdown component in happy-dom. */
export function installStatisticsDom(): void {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); }, addClass(...names: string[]) { this.classList.add(...names); }, removeClass(...names: string[]) { this.classList.remove(...names); }, hasClass(name: string) { return this.classList.contains(name); }, toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); },
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createEl(tag: string, options: any = {}) { const node = this.ownerDocument.createElement(tag); if (options.cls) node.className = options.cls; if (options.text) node.textContent = options.text; for (const [name, value] of Object.entries(options.attr ?? {})) node.setAttribute(name, String(value)); this.appendChild(node); return node; },
        createDiv(options: any) { return this.createEl('div', options); }, createSpan(options: any) { return this.createEl('span', options); },
        getClientRects() { if (!this.isConnected) return []; for (let node: HTMLElement | null = this; node; node = node.parentElement) if (node.hidden) return []; return [this.getBoundingClientRect()]; },
    });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1100 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 });
}
export function chooseStatistic(root: HTMLElement, label: string, value: string): void {
    const trigger = root.querySelector<HTMLButtonElement>(`.lorebase-settings-dropdown-btn[aria-label="${label}"]`)!;
    trigger.getBoundingClientRect = () => ({ x: 20, y: 20, top: 20, left: 20, right: 220, bottom: 60, width: 200, height: 40, toJSON() {} });
    trigger.click();
    const option = Array.from(document.querySelectorAll<HTMLElement>('.lb-stat-dropdown-panel.is-open [role="option"]')).find(option => option.textContent === value);
    if (!option) throw new Error(`Missing option ${value}`); option.click();
}
