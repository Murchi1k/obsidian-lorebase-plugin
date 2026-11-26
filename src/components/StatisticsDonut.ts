export interface DonutSegment { value: number; color: string; label: string; onSelect?: () => void }

/** Rounded annular sectors retain the true proportions, including very small shares. */
export function renderStatisticsDonut(host: HTMLElement, input: DonutSegment[]): void {
    const ns = 'http://www.w3.org/2000/svg', segments = input.filter(segment => segment.value > 0);
    const svg = host.ownerDocument.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120'); svg.classList.add('lb-stat-ring-svg');
    const interactive = segments.some(segment => segment.onSelect);
    if (!interactive) svg.setAttribute('aria-hidden', 'true');
    const tooltip = host.ownerDocument.createElement('span'); tooltip.className = 'lb-stat-ring-tooltip'; tooltip.hidden = true; tooltip.setAttribute('aria-hidden', 'true');
    const bindSegment = (shape: SVGElement, segment: DonutSegment) => {
        if (!segment.onSelect) { const title = host.ownerDocument.createElementNS(ns, 'title'); title.textContent = segment.label; shape.appendChild(title); return; }
        shape.classList.add('lb-stat-ring-segment'); shape.setAttribute('role', 'button'); shape.setAttribute('tabindex', '0'); shape.setAttribute('aria-label', segment.label);
        const highlight = () => { svg.classList.add('has-active-segment'); svg.querySelectorAll('.is-emphasized').forEach(value => value.classList.remove('is-emphasized')); shape.classList.add('is-emphasized'); tooltip.textContent = segment.label; tooltip.hidden = false; };
        const clear = () => { svg.classList.remove('has-active-segment'); shape.classList.remove('is-emphasized'); tooltip.hidden = true; };
        shape.addEventListener('pointerenter', highlight); shape.addEventListener('pointerleave', clear);
        shape.addEventListener('focus', highlight); shape.addEventListener('blur', clear);
        shape.addEventListener('click', () => segment.onSelect!());
        shape.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); segment.onSelect!(); } });
    };
    host.appendChild(svg);
    host.appendChild(tooltip);
    if (segments.length < 2) {
        const circle = host.ownerDocument.createElementNS(ns, 'circle');
        for (const [key, value] of Object.entries({ cx: '60', cy: '60', r: '48', fill: 'none', stroke: segments[0]?.color ?? 'var(--background-modifier-border)', 'stroke-width': '14' })) circle.setAttribute(key, value);
        if (segments[0]) bindSegment(circle, segments[0]);
        svg.appendChild(circle); return;
    }
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const point = (radius: number, angle: number) => `${60 + radius * Math.cos(angle)},${60 + radius * Math.sin(angle)}`;
    let offset = -Math.PI / 2;
    for (const segment of segments) {
        const sweep = segment.value / total * Math.PI * 2, gap = Math.min(.055, sweep * .24);
        const a = offset + gap / 2, b = offset + sweep - gap / 2;
        const outer = 55, inner = 41, corner = Math.min(7, (b - a) * inner / 3);
        const co = corner / outer, ci = corner / inner;
        const path = host.ownerDocument.createElementNS(ns, 'path');
        path.setAttribute('d', `M${point(outer,a+co)} A${outer},${outer} 0 ${Number(b-a-2*co>Math.PI)},1 ${point(outer,b-co)} Q${point(outer,b)} ${point(outer-corner,b)} L${point(inner+corner,b)} Q${point(inner,b)} ${point(inner,b-ci)} A${inner},${inner} 0 ${Number(b-a-2*ci>Math.PI)},0 ${point(inner,a+ci)} Q${point(inner,a)} ${point(inner+corner,a)} L${point(outer-corner,a)} Q${point(outer,a)} ${point(outer,a+co)} Z`);
        path.setAttribute('fill', segment.color);
        bindSegment(path, segment); svg.appendChild(path);
        offset += sweep;
    }
}
