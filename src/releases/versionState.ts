/** Compare release versions numerically, including SemVer prereleases. */
export function compareVersions(left: string, right: string): number | null {
    const parse = (value: string) => /^(\d+)\.(\d+)\.(\d+)(?:-([\da-zA-Z.-]+))?(?:\+[\da-zA-Z.-]+)?$/.exec(value);
    const a = parse(left);
    const b = parse(right);
    if (!a || !b) return null;
    for (let index = 1; index <= 3; index++) {
        const difference = Number(a[index]) - Number(b[index]);
        if (difference) return Math.sign(difference);
    }
    if (a[4] === b[4]) return 0;
    if (!a[4]) return 1;
    if (!b[4]) return -1;
    const ap = a[4].split('.');
    const bp = b[4].split('.');
    for (let index = 0; index < Math.max(ap.length, bp.length); index++) {
        if (ap[index] === undefined) return -1;
        if (bp[index] === undefined) return 1;
        if (ap[index] === bp[index]) continue;
        const an = /^\d+$/.test(ap[index]);
        const bn = /^\d+$/.test(bp[index]);
        if (an && bn) return Math.sign(Number(ap[index]) - Number(bp[index]));
        if (an !== bn) return an ? -1 : 1;
        return ap[index] < bp[index] ? -1 : 1;
    }
    return 0;
}

export function getReleaseStartupAction(current: string, seen: unknown, existingInstall: boolean): 'show' | 'remember' | 'none' {
    if (compareVersions(current, current) === null) return 'none';
    if (typeof seen !== 'string' || compareVersions(current, seen) === null) {
        return existingInstall ? 'show' : 'remember';
    }
    return compareVersions(current, seen) === 1 ? 'show' : 'none';
}
