import escapeHtml from "../shell/escapeHtml.js";
import { FsError } from "../shell/fs.js";
import { SYSTEM_PROCS } from "../shell/shell.js";
import { formatDuration, time } from "../shell/format.js";

// Fullscreen apps: they take over the terminal through `term.openScreen()` and hand
// control back to the shell when closed.

const isQuit = (event) =>
    event.key === "q" || event.key === "Q" || (event.ctrlKey && event.key.toLowerCase() === "c");

const randomBetween = (min, max) => min + Math.random() * (max - min);

// --- top -----------------------------------------------------------------------

const top = {
    help: "Show running processes (press q to quit)",
    usage: "top",
    async run(ctx) {
        const { shell, term } = ctx;
        const screen = term.openScreen((event) => {
            if (isQuit(event)) screen.close();
        });
        const pre = document.createElement("pre");
        pre.className = "app-pre";
        screen.el.append(pre);

        const render = () => {
            const rows = [
                ...SYSTEM_PROCS.map((p) => ({ ...p, cpu: p.pid === 503 ? randomBetween(0, 0.3) : 0, start: shell.startedAt })),
                { pid: shell.bashPid, user: shell.user, cmd: "-bash", cpu: randomBetween(0, 0.2), start: shell.startedAt },
                ...[...shell.procs.values()].map((p) => ({
                    ...p,
                    cpu: p.cmd === "party.sh" ? randomBetween(20, 35) : randomBetween(0, 1),
                })),
                { pid: ctx.pid, user: shell.user, cmd: "top", cpu: randomBetween(0.3, 1.5), start: Date.now() },
            ].sort((a, b) => b.cpu - a.cpu);

            const busy = rows.reduce((sum, r) => sum + r.cpu, 0);
            const header = [
                `top - ${time(new Date())} up ${formatDuration(Date.now() - shell.startedAt)},  1 user,  load average: ${(busy / 40).toFixed(2)}, 0.03, 0.01`,
                `Tasks: ${String(rows.length).padStart(3)} total,   1 running, ${String(rows.length - 1).padStart(3)} sleeping,   0 stopped,   0 zombie`,
                `%Cpu(s): ${busy.toFixed(1).padStart(4)} us,  ${(busy / 4).toFixed(1)} sy,  0.0 ni, ${Math.max(0, 100 - busy * 1.25).toFixed(1)} id`,
                `MiB Mem :   1024.0 total,    ${(612 - busy).toFixed(1)} free,    ${(201 + busy).toFixed(1)} used,    210.3 buff/cache`,
                "",
                "    PID USER      PR  NI    VIRT    RES  S  %CPU  %MEM     TIME+ COMMAND",
            ];
            const body = rows.map((p) => {
                const age = (Date.now() - (p.start ?? shell.startedAt)) / 1000;
                const cpuTime = `${Math.floor(age / 600)}:${(age % 60).toFixed(2).padStart(5, "0")}`;
                return (
                    `${String(p.pid).padStart(7)} ${p.user.slice(0, 8).padEnd(9)} 20   0  ${String(12000 + (p.pid % 90) * 100).padStart(6)} ` +
                    `${String(1200 + (p.pid % 40) * 50).padStart(6)}  ${p.cpu > 10 ? "R" : "S"}  ${p.cpu.toFixed(1).padStart(4)}   0.${p.pid % 9} ${cpuTime.padStart(9)} ${p.cmd}`
                );
            });
            pre.textContent = [...header, ...body, "", "(press q to quit)"].join("\n");
        };

        render();
        const timer = setInterval(render, 1000);
        await screen.closed;
        clearInterval(timer);
        return 0;
    },
};

// --- vim -----------------------------------------------------------------------

const vim = {
    help: "Edit a file (a very small vi; try :q to leave)",
    usage: "vim [file]",
    async run(ctx) {
        const { term, fs } = ctx;
        const arg = ctx.args.find((a) => !a.startsWith("-"));
        let abs = arg ? ctx.resolve(arg) : null;
        let lines = [""];
        let message = "";

        if (abs) {
            const node = fs.get(abs);
            if (node?.type === "dir") {
                ctx.err.print(`vim: ${arg}: Is a directory`);
                return 1;
            }
            if (node) {
                const text = fs.read(abs);
                lines = text.replace(/\n$/, "").split("\n");
                message = `"${arg}" ${lines.length}L, ${text.length}B`;
            } else {
                message = `"${arg}" [New]`;
            }
        }

        let row = 0;
        let col = 0;
        let mode = "normal";
        let command = "";
        let pending = "";
        let modified = false;

        const screen = term.openScreen((event) => {
            onKey(event);
            render();
        });
        screen.el.classList.add("vim");
        const body = document.createElement("pre");
        body.className = "app-pre vim-body";
        const status = document.createElement("div");
        status.className = "app-status";
        screen.el.append(body, status);

        const clamp = () => {
            row = Math.max(0, Math.min(row, lines.length - 1));
            const max = mode === "insert" ? lines[row].length : Math.max(0, lines[row].length - 1);
            col = Math.max(0, Math.min(col, max));
        };

        const write = (name) => {
            const target = name ? ctx.resolve(name) : abs;
            if (!target) {
                message = "E32: No file name";
                return false;
            }
            const text = `${lines.join("\n")}\n`;
            try {
                fs.write(target, text);
            } catch (error) {
                if (!(error instanceof FsError)) throw error;
                message = `E212: Can't open file for writing`;
                return false;
            }
            abs ??= target;
            modified = false;
            message = `"${name || arg}" ${lines.length}L, ${text.length}B written`;
            return true;
        };

        const execute = (input) => {
            const [name, ...rest] = input.split(/\s+/);
            switch (name) {
                case "":
                    break;
                case "w":
                    write(rest[0]);
                    break;
                case "wq":
                case "wq!":
                case "x":
                    if (write(rest[0])) screen.close();
                    break;
                case "q":
                case "qa":
                    if (modified) message = "E37: No write since last change (add ! to override)";
                    else screen.close();
                    break;
                case "q!":
                case "qa!":
                    screen.close();
                    break;
                default:
                    message = `E492: Not an editor command: ${input}`;
            }
        };

        const insertText = (text) => {
            const line = lines[row];
            lines[row] = line.slice(0, col) + text + line.slice(col);
            col += text.length;
            modified = true;
        };

        const onInsertKey = ({ key, ctrlKey, metaKey }) => {
            if (key === "Escape") {
                mode = "normal";
                col -= 1;
            } else if (key === "Enter") {
                const line = lines[row];
                lines.splice(row, 1, line.slice(0, col), line.slice(col));
                row += 1;
                col = 0;
                modified = true;
            } else if (key === "Backspace") {
                if (col > 0) {
                    lines[row] = lines[row].slice(0, col - 1) + lines[row].slice(col);
                    col -= 1;
                    modified = true;
                } else if (row > 0) {
                    col = lines[row - 1].length;
                    lines.splice(row - 1, 2, lines[row - 1] + lines[row]);
                    row -= 1;
                    modified = true;
                }
            } else if (key === "Tab") {
                insertText("    ");
            } else if (key === "ArrowLeft") col -= 1;
            else if (key === "ArrowRight") col += 1;
            else if (key === "ArrowUp") row -= 1;
            else if (key === "ArrowDown") row += 1;
            else if (key.length === 1 && !ctrlKey && !metaKey) insertText(key);
        };

        const onCommandKey = ({ key, ctrlKey, metaKey }) => {
            if (key === "Escape" || (ctrlKey && key.toLowerCase() === "c")) {
                mode = "normal";
            } else if (key === "Enter") {
                mode = "normal";
                message = "";
                execute(command.trim());
            } else if (key === "Backspace") {
                if (command) command = command.slice(0, -1);
                else mode = "normal";
            } else if (key.length === 1 && !ctrlKey && !metaKey) {
                command += key;
            }
        };

        const onNormalKey = ({ key, ctrlKey }) => {
            const wasPending = pending;
            pending = "";
            switch (key) {
                case "h":
                case "ArrowLeft":
                    col -= 1;
                    break;
                case "l":
                case "ArrowRight":
                    col += 1;
                    break;
                case "j":
                case "ArrowDown":
                    row += 1;
                    break;
                case "k":
                case "ArrowUp":
                    row -= 1;
                    break;
                case "0":
                    col = 0;
                    break;
                case "$":
                    col = lines[row].length;
                    break;
                case "G":
                    row = lines.length - 1;
                    break;
                case "i":
                    mode = "insert";
                    break;
                case "a":
                    mode = "insert";
                    col += 1;
                    break;
                case "A":
                    mode = "insert";
                    col = lines[row].length;
                    break;
                case "o":
                    lines.splice(row + 1, 0, "");
                    row += 1;
                    col = 0;
                    mode = "insert";
                    modified = true;
                    break;
                case "O":
                    lines.splice(row, 0, "");
                    col = 0;
                    mode = "insert";
                    modified = true;
                    break;
                case "x":
                    lines[row] = lines[row].slice(0, col) + lines[row].slice(col + 1);
                    modified = true;
                    break;
                case "d":
                    if (wasPending === "d") {
                        lines.splice(row, 1);
                        if (!lines.length) lines.push("");
                        modified = true;
                    } else {
                        pending = "d";
                    }
                    break;
                case ":":
                    mode = "command";
                    command = "";
                    break;
                case "c":
                    if (ctrlKey) message = "Type  :qa!  and press <Enter> to abandon all changes and exit Vim";
                    break;
                default:
            }
        };

        function onKey(event) {
            if (mode === "insert") onInsertKey(event);
            else if (mode === "command") onCommandKey(event);
            else onNormalKey(event);
            clamp();
        }

        function render() {
            const html = lines.map((line, index) => {
                if (index !== row) return escapeHtml(line) || " ";
                return (
                    `${escapeHtml(line.slice(0, col))}<span class="cursor">${escapeHtml(line[col] ?? " ")}</span>` +
                    `${escapeHtml(line.slice(col + 1))}`
                );
            });
            const filler = Math.max(0, 30 - lines.length);
            body.innerHTML = [...html, ...Array(filler).fill("~")].join("\n");
            const left =
                mode === "insert" ? "-- INSERT --" : mode === "command" ? `:${command}` : message || (modified ? "[+]" : "");
            status.textContent = `${left}`.padEnd(40) + `${row + 1},${col + 1}`;
            body.querySelector(".cursor")?.scrollIntoView({ block: "nearest" });
        }

        render();
        await screen.closed;
        return 0;
    },
};

// --- website -------------------------------------------------------------------

const website = {
    help: "Browse this website in a full-screen app (press q to quit)",
    usage: "website",
    async run(ctx) {
        const { term } = ctx;
        const { title, tagline, sections } = ctx.shell.site;
        if (!sections.length) {
            ctx.err.print("website: no pages found");
            return 1;
        }
        let index = 0;

        const screen = term.openScreen((event) => {
            const { key } = event;
            if (isQuit(event) || key === "Escape") screen.close();
            else if (key === "ArrowRight" || key === "ArrowDown" || key === "j" || key === "l" || (key === "Tab" && !event.shiftKey)) select(index + 1);
            else if (key === "ArrowLeft" || key === "ArrowUp" || key === "k" || key === "h" || key === "Tab") select(index - 1);
            else if (key === "Home") select(0);
            else if (key === "End") select(sections.length - 1);
            else if (key === "PageDown" || key === " ") page.scrollBy({ top: page.clientHeight * 0.9 });
            else if (key === "PageUp") page.scrollBy({ top: -page.clientHeight * 0.9 });
            else if (/^[1-9]$/.test(key) && Number(key) <= sections.length) select(Number(key) - 1);
            else if (key === "Enter") follow();
        });

        screen.el.classList.add("site-screen");
        screen.el.innerHTML = `
            <header class="site-header">
                <span class="site-title">${escapeHtml(title)}</span>
                <span class="site-tagline">${escapeHtml(tagline)}</span>
            </header>
            <nav class="site-nav" aria-label="Pages"></nav>
            <main class="site-page"></main>
            <footer class="site-footer">
                <span class="site-keys">←/→ page · 1-${sections.length} jump · Enter open link</span>
                <button type="button" class="site-quit">q back to terminal</button>
            </footer>`;
        const nav = screen.el.querySelector(".site-nav");
        const page = screen.el.querySelector(".site-page");
        screen.el.querySelector(".site-quit").addEventListener("click", () => screen.close());

        const tabs = sections.map((section, i) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = section.title;
            button.addEventListener("click", () => {
                select(i);
                term.focus();
            });
            nav.append(button);
            return button;
        });

        // Open the first link of the current page (mailto: or external).
        function follow() {
            const link = page.querySelector("a[href]");
            if (!link) return;
            const href = link.getAttribute("href");
            if (href.startsWith("mailto:")) window.location.href = href;
            else window.open(href, "_blank", "noopener,noreferrer");
        }

        function select(next) {
            index = (next + sections.length) % sections.length;
            tabs.forEach((tab, i) => {
                tab.classList.toggle("active", i === index);
                tab.setAttribute("aria-current", i === index ? "page" : "false");
            });
            page.innerHTML = sections[index].html; // trusted markup from src/content
            page.scrollTop = 0;
        }

        select(0);
        await screen.closed;
        return 0;
    },
};

export default {
    top,
    vim,
    vi: { ...vim, hidden: true },
    website,
};
