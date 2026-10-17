import escapeHtml from "../shell/escapeHtml.js";
import complete, { commonPrefix, escapeWord } from "../shell/complete.js";
import { formatDate } from "../shell/format.js";

const LAST_LOGIN_KEY = "VanillaTerm.lastLogin";
const MAX_LINES = 2000;
const LINK_PATTERN =
    /(https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<])*[^\s<.,;:!?)'"]|[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const RESERVED_USERS = ["root", "daemon", "www-data"];

// Escaped text in, HTML with clickable links out.
const linkify = (escaped) =>
    escaped.replace(LINK_PATTERN, (match) =>
        match.startsWith("http")
            ? `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`
            : `<a href="mailto:${match}">${match}</a>`,
    );

const TEMPLATE = `
<div class="term-scroll" role="log" aria-live="polite" aria-label="Terminal">
    <div class="term-output"></div>
    <div class="term-command">
        <span class="term-prompt"></span>
        <input class="term-input" type="text" spellcheck="false" autocomplete="off"
            autocapitalize="off" autocorrect="off" enterkeyhint="send" aria-label="Terminal input">
    </div>
</div>`;

export default class Terminal {
    constructor(el, shell) {
        this.el = el;
        this.shell = shell;
        this.busy = false;
        this.controller = null;
        this.reader = null;
        this.screen = null;
        this.search = null;
        this.tab = null;
        this.historyIndex = null;
        this.draft = "";

        el.classList.add("VanillaTerm");
        el.insertAdjacentHTML("beforeend", TEMPLATE);
        this.scroller = el.querySelector(".term-scroll");
        this.output = el.querySelector(".term-output");
        this.command = el.querySelector(".term-command");
        this.promptEl = el.querySelector(".term-prompt");
        this.input = el.querySelector(".term-input");

        // Listeners stay on the terminal element; never on the document.
        this.input.addEventListener("keydown", this.onKeyDown);
        el.addEventListener("keydown", this.onScreenKeyDown);
        el.addEventListener("click", this.onClick);

        this.updatePrompt();
        if (window.matchMedia?.("(pointer: fine)").matches) this.focus();
    }

    // --- output ---------------------------------------------------------

    line(html, className = "") {
        const div = document.createElement("div");
        div.className = className ? `line ${className}` : "line";
        div.innerHTML = html;
        this.output.append(div);
        while (this.output.childElementCount > MAX_LINES) this.output.firstElementChild.remove();
        this.scrollToEnd();
        return div;
    }

    print(text = "") {
        for (const line of String(text).split("\n")) {
            this.line(linkify(escapeHtml(line)));
        }
    }

    // Trusted markup only (static HTML, or text already run through escapeHtml).
    printHtml(markup) {
        this.line(markup);
    }

    printErr(text) {
        this.line(escapeHtml(text), "err");
    }

    clear() {
        this.output.textContent = "";
    }

    scrollToEnd() {
        this.scroller.scrollTop = this.scroller.scrollHeight;
    }

    echo(promptHtml, value, suffix = "") {
        this.line(`${promptHtml}${escapeHtml(value)}${suffix}`, "echo");
    }

    // --- prompt / focus ---------------------------------------------------

    focus() {
        this.input.focus({ preventScroll: true });
    }

    updatePrompt(html = this.shell.promptHtml()) {
        this.promptEl.innerHTML = html;
    }

    updateChrome() {
        this.command.classList.toggle("busy", this.busy && !this.reader);
        this.scrollToEnd();
    }

    onClick = (event) => {
        if (window.getSelection?.().toString()) return;
        if (event.target.closest("a, button")) return;
        this.focus();
    };

    // --- session ----------------------------------------------------------

    // Print the welcome banner. `lines` are trusted HTML strings.
    banner(lines) {
        let previous = null;
        try {
            previous = window.localStorage.getItem(LAST_LOGIN_KEY);
            window.localStorage.setItem(LAST_LOGIN_KEY, String(Date.now()));
        } catch {
            // Storage unavailable (private mode); skip the last-login line.
        }
        lines.forEach((html) => this.printHtml(html));
        if (previous && !Number.isNaN(Number(previous))) {
            this.print(`Last login: ${formatDate(new Date(Number(previous)))} on tty1`);
        }
        this.print();
    }

    // Ask for a line of input (login name, confirmation, ...). Resolves null on Ctrl+C.
    read(promptText, { silent = false } = {}) {
        return new Promise((resolve) => {
            this.reader = { resolve, silent, promptHtml: escapeHtml(promptText) };
            this.input.type = silent ? "password" : "text";
            this.updatePrompt(this.reader.promptHtml);
            this.updateChrome();
            this.focus();
        });
    }

    finishRead(value) {
        const { resolve, silent, promptHtml } = this.reader;
        this.echo(promptHtml, silent || value === null ? "" : value, value === null ? "^C" : "");
        this.reader = null;
        this.input.type = "text";
        this.input.value = "";
        this.updatePrompt();
        this.updateChrome();
        resolve(value);
    }

    async login(name, { allowCancel = false } = {}) {
        let answer = name;
        for (;;) {
            if (answer === undefined) answer = await this.read(`${this.shell.host} login: `);
            if (answer === null && allowCancel) return false;
            const candidate = (answer ?? "").trim().toLowerCase() || "guest";
            if (USERNAME.test(candidate) && !RESERVED_USERS.includes(candidate)) {
                this.shell.setUser(candidate);
                this.updatePrompt();
                return true;
            }
            if (answer !== null) this.print("Login incorrect");
            answer = undefined;
        }
    }

    setBanner(build) {
        this.buildBanner = build;
    }

    welcome() {
        this.banner(this.buildBanner?.() ?? []);
    }

    async logout() {
        this.print("logout");
        await new Promise((resolve) => setTimeout(resolve, 400));
        this.clear();
        await this.login();
        this.clear();
        this.welcome();
    }

    async reboot() {
        this.el.classList.add("fade");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        this.clear();
        this.el.classList.remove("fade");
        this.print("Terminal rebooted.");
    }

    // --- fullscreen apps (top, vim, website) -------------------------------

    // `onKey` receives KeyboardEvents until `close()` is called.
    openScreen(onKey) {
        const el = document.createElement("div");
        el.className = "term-screen";
        this.el.append(el);
        let resolveClosed;
        const closed = new Promise((resolve) => {
            resolveClosed = resolve;
        });
        const screen = {
            el,
            closed,
            onKey,
            close: () => {
                if (this.screen !== screen) return;
                this.screen = null;
                el.remove();
                resolveClosed();
                this.focus();
            },
        };
        this.screen = screen;
        this.focus();
        return screen;
    }

    // --- keyboard -----------------------------------------------------------

    // Fullscreen apps contain buttons and links; keep keys working after one is clicked.
    onScreenKeyDown = (event) => {
        if (!this.screen || event.target === this.input) return;
        this.focus();
        this.onKeyDown(event);
    };

    onKeyDown = (event) => {
        if (event.key !== "Tab") this.tab = null;

        if (this.screen) {
            const passthrough = event.metaKey || /^F\d+$/.test(event.key) || (event.ctrlKey && event.shiftKey);
            if (!passthrough) event.preventDefault();
            this.screen.onKey(event);
            return;
        }
        if (this.reader) {
            this.onReaderKey(event);
            return;
        }
        if (this.busy) {
            this.onBusyKey(event);
            return;
        }
        if (this.search) {
            this.onSearchKey(event);
            return;
        }
        this.onShellKey(event);
    };

    onReaderKey(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            this.finishRead(this.input.value);
        } else if (event.ctrlKey && event.key.toLowerCase() === "c") {
            event.preventDefault();
            this.finishRead(null);
        }
    }

    onBusyKey(event) {
        if (event.metaKey || (event.ctrlKey && event.shiftKey)) return;
        if (event.ctrlKey && event.key.toLowerCase() === "c") {
            event.preventDefault();
            this.print("^C");
            this.controller?.abort();
            return;
        }
        event.preventDefault();
    }

    onShellKey(event) {
        const { key, ctrlKey, metaKey, altKey } = event;
        const { input } = this;

        if (ctrlKey && !altKey && !metaKey) {
            switch (key.toLowerCase()) {
                case "c":
                    if (input.selectionStart !== input.selectionEnd) return; // allow copy
                    event.preventDefault();
                    this.echo(this.shell.promptHtml(), input.value, "^C");
                    input.value = "";
                    this.historyIndex = null;
                    return;
                case "l":
                    event.preventDefault();
                    this.clear();
                    return;
                case "d":
                    event.preventDefault();
                    if (!input.value) this.execute("exit", { echo: false });
                    return;
                case "r":
                    event.preventDefault();
                    this.enterSearch();
                    return;
                case "u":
                    event.preventDefault();
                    input.value = input.value.slice(input.selectionStart);
                    input.setSelectionRange(0, 0);
                    return;
                case "k":
                    event.preventDefault();
                    input.value = input.value.slice(0, input.selectionStart);
                    return;
                case "a":
                    event.preventDefault();
                    input.setSelectionRange(0, 0);
                    return;
                case "e":
                    event.preventDefault();
                    input.setSelectionRange(input.value.length, input.value.length);
                    return;
                default:
                    return;
            }
        }

        switch (key) {
            case "Enter":
                event.preventDefault();
                this.submit();
                break;
            case "Tab":
                event.preventDefault();
                this.onTab();
                break;
            case "ArrowUp":
            case "ArrowDown":
                event.preventDefault();
                this.navigateHistory(key === "ArrowUp" ? -1 : 1);
                break;
            case "Escape":
                event.preventDefault();
                input.value = "";
                break;
            default:
        }
    }

    // --- history / search ---------------------------------------------------

    setInput(value) {
        this.input.value = value;
        this.input.setSelectionRange(value.length, value.length);
    }

    navigateHistory(direction) {
        const { items } = this.shell.history;
        if (this.historyIndex === null) {
            if (direction > 0) return;
            this.draft = this.input.value;
            this.historyIndex = items.length;
        }
        const next = this.historyIndex + direction;
        if (next < 0) return;
        if (next >= items.length) {
            this.historyIndex = null;
            this.setInput(this.draft);
            return;
        }
        this.historyIndex = next;
        this.setInput(items[next]);
    }

    enterSearch() {
        this.search = { query: "", match: -1, saved: this.input.value, failed: false };
        this.renderSearch();
    }

    renderSearch() {
        const { query, failed } = this.search;
        const label = failed ? "failed reverse-i-search" : "reverse-i-search";
        this.updatePrompt(`(${label})\`${escapeHtml(query)}': `);
    }

    exitSearch(restore) {
        const { saved } = this.search;
        this.search = null;
        this.updatePrompt();
        if (restore) this.setInput(saved);
    }

    onSearchKey(event) {
        const { key, ctrlKey } = event;
        const { history } = this.shell;
        const search = this.search;
        const lower = key.toLowerCase();

        const find = (from) => {
            const index = history.search(search.query, from);
            search.failed = index === -1 && search.query !== "";
            if (index !== -1) {
                search.match = index;
                this.setInput(history.items[index]);
            }
            this.renderSearch();
        };

        if (key === "Escape" || (ctrlKey && (lower === "c" || lower === "g"))) {
            event.preventDefault();
            this.exitSearch(true);
        } else if (key === "Enter") {
            event.preventDefault();
            this.exitSearch(false);
            this.submit();
        } else if (ctrlKey && lower === "r") {
            event.preventDefault();
            find(search.match === -1 ? history.items.length : search.match);
        } else if (key === "Backspace") {
            event.preventDefault();
            search.query = search.query.slice(0, -1);
            find(history.items.length);
        } else if (key.length === 1 && !ctrlKey && !event.metaKey) {
            event.preventDefault();
            search.query += key;
            find(search.match === -1 ? history.items.length : search.match + 1);
        } else if (!ctrlKey && !event.metaKey && !event.altKey) {
            // Any other key (arrows, Tab, ...) accepts the match for editing.
            this.exitSearch(false);
            if (key === "Tab") event.preventDefault();
        }
    }

    // --- tab completion -----------------------------------------------------

    onTab() {
        const { input } = this;
        const caret = input.selectionStart ?? input.value.length;
        const head = input.value.slice(0, caret);
        const tail = input.value.slice(caret);
        const { start, candidates } = complete(this.shell, head);
        if (!candidates.length) return;

        const typed = head.slice(start).replace(/\\(.)/g, "$1");
        const prefix = commonPrefix(candidates.map((c) => c.name));
        let replacement = null;

        if (candidates.length === 1) {
            const [only] = candidates;
            replacement = escapeWord(only.name) + (only.dir ? "/" : " ");
        } else if (prefix.length > typed.length) {
            replacement = escapeWord(prefix);
        }

        if (replacement !== null) {
            const before = head.slice(0, start) + replacement;
            input.value = before + tail;
            input.setSelectionRange(before.length, before.length);
            this.tab = null;
            return;
        }

        // Ambiguous and nothing more to add: list the options on the second Tab.
        if (this.tab?.head === head) {
            this.echo(this.shell.promptHtml(), input.value);
            const items = candidates.map((c) => {
                const label = escapeHtml(c.name.slice(c.name.lastIndexOf("/", c.name.length - 2) + 1));
                return c.dir ? `<span class="c-dir">${label}/</span>` : label;
            });
            this.printHtml(`<span class="ls">${items.join("  ")}</span>`);
        } else {
            this.tab = { head };
        }
    }

    // --- running commands ---------------------------------------------------

    submit() {
        const value = this.input.value;
        this.input.value = "";
        this.historyIndex = null;
        return this.execute(value);
    }

    async execute(value, { echo = true } = {}) {
        if (echo) this.echo(this.shell.promptHtml(), value);
        const line = value.trim();
        if (!line) return;

        this.busy = true;
        this.controller = new AbortController();
        this.updateChrome();
        try {
            await this.shell.run(line, this, this.controller.signal);
        } catch (error) {
            console.error(error);
            this.printErr("bash: internal error");
        } finally {
            this.busy = false;
            this.controller = null;
            this.updatePrompt();
            this.updateChrome();
            this.focus();
        }
    }
}
