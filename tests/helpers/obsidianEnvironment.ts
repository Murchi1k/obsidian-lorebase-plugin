if (typeof window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
            clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
            setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args),
            clearInterval: (...args: Parameters<typeof clearInterval>) => clearInterval(...args),
        },
    });
}

if (typeof document !== 'undefined') {
    const applyOptions = (node: Element, options?: DomElementInfo | SvgElementInfo | string): void => {
        const opts = typeof options === 'string' ? { cls: options } : options;
        if (!opts) return;
        if (opts.cls) node.setAttribute('class', typeof opts.cls === 'string' ? opts.cls : opts.cls.join(' '));
        for (const [name, value] of Object.entries(opts.attr ?? {})) {
            if (value !== null) node.setAttribute(name, String(value));
        }
        if ('text' in opts && typeof opts.text === 'string') node.textContent = opts.text;
        if ('title' in opts && typeof opts.title === 'string') node.setAttribute('title', opts.title);
        if ('placeholder' in opts && typeof opts.placeholder === 'string') node.setAttribute('placeholder', opts.placeholder);
    };
    const addToParent = (parent: Node | undefined, node: Node, prepend = false): void => {
        if (parent) parent.insertBefore(node, prepend ? parent.firstChild : null);
    };

    function makeElement<K extends keyof HTMLElementTagNameMap>(
        tag: K, options?: DomElementInfo | string, callback?: (node: HTMLElementTagNameMap[K]) => void, parent?: Node,
    ): HTMLElementTagNameMap[K] {
        const opts = typeof options === 'string' ? { cls: options } : options;
        const target = opts?.parent ?? parent;
        const node = (target?.ownerDocument ?? document).createElement(tag);
        applyOptions(node, opts);
        callback?.(node);
        addToParent(target, node, opts?.prepend);
        return node;
    }

    Object.assign(globalThis, {
        createEl: makeElement,
        createDiv: (options?: DomElementInfo | string) => makeElement('div', options),
        createFragment: () => document.createDocumentFragment(),
    });
    Object.assign(Node.prototype, {
        createEl<K extends keyof HTMLElementTagNameMap>(this: Node, tag: K, options?: DomElementInfo | string, callback?: (node: HTMLElementTagNameMap[K]) => void) {
            return makeElement(tag, options, callback, this);
        },
        createDiv(this: Node, options?: DomElementInfo | string, callback?: (node: HTMLDivElement) => void) {
            return this.createEl('div', options, callback);
        },
        createSpan(this: Node, options?: DomElementInfo | string, callback?: (node: HTMLSpanElement) => void) {
            return this.createEl('span', options, callback);
        },
        createSvg<K extends keyof SVGElementTagNameMap>(this: Node, tag: K, options?: SvgElementInfo | string, callback?: (node: SVGElementTagNameMap[K]) => void) {
            const opts = typeof options === 'string' ? { cls: options } : options;
            const parent = opts?.parent ?? this;
            const node = (parent.ownerDocument ?? document).createElementNS('http://www.w3.org/2000/svg', tag);
            applyOptions(node, opts);
            callback?.(node);
            addToParent(parent, node, opts?.prepend);
            return node;
        },
    });
}
