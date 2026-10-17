const KEY = "VanillaTerm";
const MAX_HISTORY = 100;

export class HistoryError extends Error {}

export default class History {
    constructor() {
        this.items = this.load();
    }

    load() {
        try {
            const raw = window.localStorage.getItem(KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed)
                ? parsed.filter((x) => typeof x === "string").slice(-MAX_HISTORY)
                : [];
        } catch {
            return [];
        }
    }

    save() {
        try {
            window.localStorage.setItem(KEY, JSON.stringify(this.items));
        } catch {
            // Ignore quota / private-mode failures.
        }
    }

    add(line) {
        if (this.items.at(-1) !== line) this.items.push(line);
        this.items = this.items.slice(-MAX_HISTORY);
        this.save();
    }

    clear() {
        this.items = [];
        try {
            window.localStorage.removeItem(KEY);
        } catch {
            // Ignore storage failures.
        }
    }

    // Bash-style event designators: `!!` anywhere, `!n`, `!-n` and `!prefix` at the start.
    expand(line) {
        let result = line.replace(/(^|\s)!!(?=\s|$)/g, (_, space) => {
            const last = this.items.at(-1);
            if (last === undefined) throw new HistoryError("!!: event not found");
            return space + last;
        });

        const match = result.match(/^(\s*)!(-?\d+|[A-Za-z_./][^\s]*)(.*)$/s);
        if (match) {
            const [, space, ref, rest] = match;
            let found;
            if (/^-?\d+$/.test(ref)) {
                const n = Number(ref);
                found = n < 0 ? this.items.at(n) : this.items[n - 1];
            } else {
                found = [...this.items].reverse().find((item) => item.startsWith(ref));
            }
            if (found === undefined) throw new HistoryError(`!${ref}: event not found`);
            result = space + found + rest;
        }
        return { line: result, changed: result !== line };
    }

    // Most recent entry containing `query`, searching backwards from `from` (exclusive).
    search(query, from = this.items.length) {
        if (!query) return -1;
        for (let i = Math.min(from, this.items.length) - 1; i >= 0; i -= 1) {
            if (this.items[i].includes(query)) return i;
        }
        return -1;
    }
}
