import { parse, expand, ParseError } from "./parser.js";
import { FsError } from "./fs.js";
import { HistoryError } from "./history.js";
import createRootFs from "./rootfs.js";
import escapeHtml from "./escapeHtml.js";

export class AbortError extends Error {
    constructor() {
        super("Aborted");
        this.name = "AbortError";
    }
}

// Pids that exist on the fake machine besides the user's own processes.
export const SYSTEM_PROCS = [
    { pid: 1, user: "root", cmd: "/sbin/init" },
    { pid: 2, user: "root", cmd: "[kthreadd]" },
    { pid: 311, user: "root", cmd: "/usr/sbin/sshd -D" },
    { pid: 502, user: "root", cmd: "nginx: master process" },
    { pid: 503, user: "www-data", cmd: "nginx: worker process" },
];

const stripTags = (markup) =>
    new DOMParser().parseFromString(markup, "text/html").body.textContent;

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;

export default class Shell {
    constructor({ commands, programs, history, site = { sections: [] } }) {
        this.site = site;
        this.commands = commands;
        this.programs = programs;
        this.history = history;
        this.user = "guest";
        this.host = "wllnr";
        this.status = 0;
        this.fs = createRootFs(() => this.user);
        this.startedAt = Date.now();
        this.bashPid = 3000 + Math.floor(Math.random() * 1000);
        this.pidCounter = this.bashPid + 10;
        this.procs = new Map();
        this.env = new Map();
        this.resetEnv();
    }

    resetEnv() {
        const home = `/home/${this.user}`;
        this.env = new Map(
            Object.entries({
                USER: this.user,
                LOGNAME: this.user,
                HOME: home,
                PWD: home,
                OLDPWD: home,
                PATH: `/usr/local/bin:/usr/bin:/bin:${home}/tools`,
                SHELL: "/bin/bash",
                TERM: "xterm-256color",
                LANG: "en_US.UTF-8",
                HOSTNAME: this.host,
            }),
        );
    }

    get cwd() {
        return this.env.get("PWD");
    }

    get home() {
        return this.env.get("HOME");
    }

    chdir(abs) {
        this.env.set("OLDPWD", this.cwd);
        this.env.set("PWD", abs);
    }

    displayPath(abs = this.cwd) {
        if (abs === this.home) return "~";
        if (abs.startsWith(`${this.home}/`)) return `~${abs.slice(this.home.length)}`;
        return abs;
    }

    promptHtml() {
        return (
            `<span class="p-user">${escapeHtml(this.user)}@${escapeHtml(this.host)}</span>` +
            `:<span class="p-path">${escapeHtml(this.displayPath())}</span>$&nbsp;`
        );
    }

    setUser(name) {
        if (name === this.user) return;
        const home = this.fs.get("/home");
        if (!home.children[name] && home.children[this.user]) {
            home.children[name] = home.children[this.user];
            delete home.children[this.user];
        }
        this.user = name;
        this.resetEnv();
        this.status = 0;
    }

    nextPid() {
        this.pidCounter += 1;
        return this.pidCounter;
    }

    // Register a long-running background process (shown by ps/top, ended by kill).
    spawn(cmd, stop) {
        const pid = this.nextPid();
        this.procs.set(pid, { pid, user: this.user, cmd, stop, start: Date.now() });
        return pid;
    }

    lookupVar(name) {
        return name === "?" ? String(this.status) : this.env.get(name);
    }

    lookup(name) {
        if (name.includes("/")) {
            const node = this.fs.get(this.fs.resolve(this.cwd, name));
            if (!node) return { error: "No such file or directory", status: 127 };
            if (node.type === "dir") return { error: "Is a directory", status: 126 };
            if (node.exec && this.programs[node.exec]) return { cmd: this.programs[node.exec] };
            return { error: "Permission denied", status: 126 };
        }
        if (this.commands[name]) return { cmd: this.commands[name] };
        for (const dir of (this.env.get("PATH") ?? "").split(":")) {
            const node = this.fs.get(this.fs.resolve("/", `${dir}/${name}`));
            if (node?.exec && this.programs[node.exec]) return { cmd: this.programs[node.exec] };
        }
        return { error: "command not found", status: 127 };
    }

    // All names that can be typed as a command (for completion / help).
    commandNames() {
        const names = new Set(
            Object.entries(this.commands)
                .filter(([, cmd]) => !cmd.hidden)
                .map(([name]) => name),
        );
        for (const dir of (this.env.get("PATH") ?? "").split(":")) {
            const node = this.fs.get(this.fs.resolve("/", dir));
            if (node?.type !== "dir") continue;
            for (const [name, child] of Object.entries(node.children)) {
                if (child.exec) names.add(name);
            }
        }
        return [...names].sort();
    }

    async run(line, term, signal) {
        try {
            const expanded = this.history.expand(line);
            if (expanded.changed) term.print(expanded.line);
            line = expanded.line;
        } catch (error) {
            if (!(error instanceof HistoryError)) throw error;
            term.printErr(`bash: ${error.message}`);
            this.status = 1;
            return;
        }
        this.history.add(line);

        let list;
        try {
            list = parse(line);
        } catch (error) {
            if (!(error instanceof ParseError)) throw error;
            term.printErr(`bash: ${error.message}`);
            this.status = 2;
            return;
        }

        for (const { connector, pipeline } of list) {
            if (connector === "&&" && this.status !== 0) continue;
            if (connector === "||" && this.status === 0) continue;
            this.status = await this.runPipeline(pipeline, term, signal);
            if (signal.aborted) break;
        }
    }

    async runPipeline(pipeline, term, signal) {
        const lookup = (name) => this.lookupVar(name);
        let stdin = null;
        let status = 0;

        for (let i = 0; i < pipeline.length; i += 1) {
            const { words, redirect } = pipeline[i];
            const argv = words.map((word) => expand(word, lookup, this.home));

            while (argv.length && ASSIGNMENT.test(argv[0])) {
                const [, key, value] = argv.shift().match(ASSIGNMENT);
                this.env.set(key, value);
            }
            if (!argv.length) {
                status = 0;
                continue;
            }

            const last = i === pipeline.length - 1;
            const capture = !last || redirect;
            const result = await this.runCommand(argv, { stdin, term, signal, capture });
            status = result.status;
            stdin = capture ? result.output : null;

            if (redirect) {
                const target = this.fs.resolve(this.cwd, expand(redirect.word, lookup, this.home));
                try {
                    this.fs.write(target, result.output, { append: redirect.op === ">>" });
                } catch (error) {
                    if (!(error instanceof FsError)) throw error;
                    term.printErr(`bash: ${error.message}`);
                    status = 1;
                }
                stdin = "";
            }
            if (signal.aborted) return 130;
        }
        return status;
    }

    async runCommand(argv, { stdin, term, signal, capture }) {
        const [name, ...args] = argv;
        const found = this.lookup(name);
        if (found.error) {
            term.printErr(`bash: ${name}: ${found.error}`);
            return { status: found.status, output: "" };
        }

        const buffer = [];
        const out = capture
            ? { print: (text) => buffer.push(String(text)), html: (markup) => buffer.push(stripTags(markup)) }
            : { print: (text) => term.print(text), html: (markup) => term.printHtml(markup) };

        const ctx = {
            name,
            args,
            stdin,
            tty: !capture,
            out,
            err: { print: (text) => term.printErr(text) },
            shell: this,
            term,
            signal,
            fs: this.fs,
            env: this.env,
            pid: this.nextPid(),
            status: 0,
            resolve: (path) => this.fs.resolve(this.cwd, path),
            // Report a per-file error and keep going, like most coreutils.
            fail: (error, label = error.path) => {
                if (!(error instanceof FsError)) throw error;
                term.printErr(`${name}: ${label}: ${error.reason}`);
                ctx.status = 1;
            },
            sleep: (ms) =>
                new Promise((resolve, reject) => {
                    if (signal.aborted) {
                        reject(new AbortError());
                        return;
                    }
                    const done = () => {
                        signal.removeEventListener("abort", onAbort);
                        resolve();
                    };
                    const timer = setTimeout(done, ms);
                    const onAbort = () => {
                        clearTimeout(timer);
                        reject(new AbortError());
                    };
                    signal.addEventListener("abort", onAbort, { once: true });
                }),
        };

        let status;
        try {
            const returned = await found.cmd.run(ctx);
            status = typeof returned === "number" ? returned : ctx.status;
        } catch (error) {
            if (error instanceof AbortError || signal.aborted) {
                status = 130;
            } else if (error instanceof FsError) {
                term.printErr(`${name}: ${error.message}`);
                status = 1;
            } else {
                console.error(error);
                term.printErr(`${name}: unexpected error`);
                status = 1;
            }
        }
        const output = buffer.length ? `${buffer.join("\n")}\n` : "";
        return { status, output };
    }
}
