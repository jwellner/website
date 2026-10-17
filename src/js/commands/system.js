import { SYSTEM_PROCS } from "../shell/shell.js";
import { formatDateTz, formatDuration, pad, time } from "../shell/format.js";
import { parseFlags } from "./util.js";

export const VERSION = "2.0.0";

const KERNEL = "6.1.0-wllnr";

export default {
    clear: {
        help: "Clear the terminal screen",
        usage: "clear",
        run: (ctx) => ctx.term.clear(),
    },

    help: {
        help: "List commands, or show help for one",
        usage: "help [command]",
        run(ctx) {
            const { commands } = ctx.shell;
            const [topic] = ctx.args;
            if (topic) {
                const cmd = commands[topic];
                if (!cmd) {
                    ctx.err.print(`help: no help topics match '${topic}'`);
                    return 1;
                }
                ctx.out.print(`${topic} - ${cmd.help}`);
                ctx.out.print(`Usage: ${cmd.usage}`);
                return 0;
            }
            ctx.out.print(`wllnr.nl terminal v${VERSION}. Type 'help name' for details on a command.`);
            ctx.out.print("");
            const names = Object.keys(commands)
                .filter((name) => !commands[name].hidden)
                .sort();
            const width = Math.max(...names.map((n) => n.length)) + 2;
            names.forEach((name) => ctx.out.print(`  ${name.padEnd(width)}${commands[name].help}`));
            ctx.out.print("");
            ctx.out.print("Tab completes, Ctrl+R searches history, Ctrl+C cancels, Ctrl+L clears.");
            ctx.out.print("Try: portfolio");
            return 0;
        },
    },

    man: {
        help: "Show the manual page of a command",
        usage: "man command",
        run(ctx) {
            const [topic] = ctx.args;
            if (!topic) {
                ctx.err.print("What manual page do you want?");
                return 1;
            }
            const cmd = ctx.shell.commands[topic];
            if (!cmd) {
                ctx.err.print(`No manual entry for ${topic}`);
                return 16;
            }
            ctx.out.print(`NAME\n       ${topic} - ${cmd.help}\n\nSYNOPSIS\n       ${cmd.usage}\n`);
            return 0;
        },
    },

    version: {
        help: "Print the terminal version",
        usage: "version",
        run: (ctx) => ctx.out.print(`wllnr.nl terminal v${VERSION}`),
    },

    history: {
        help: "Show previously entered commands (-c clears them)",
        usage: "history [-c]",
        run(ctx) {
            const { history } = ctx.shell;
            if (ctx.args[0] === "-c") {
                history.clear();
                return 0;
            }
            history.items.forEach((item, index) => ctx.out.print(`${String(index + 1).padStart(5)}  ${item}`));
            return 0;
        },
    },

    whoami: {
        help: "Print the current login name",
        usage: "whoami",
        run: (ctx) => ctx.out.print(ctx.shell.user),
    },

    id: {
        help: "Print user identity",
        usage: "id",
        run: (ctx) =>
            ctx.out.print(`uid=1000(${ctx.shell.user}) gid=1000(${ctx.shell.user}) groups=1000(${ctx.shell.user})`),
    },

    who: {
        help: "Show who is logged in",
        usage: "who",
        run(ctx) {
            const d = new Date(ctx.shell.startedAt);
            const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            ctx.out.print(`${ctx.shell.user.padEnd(8)} tty1         ${stamp}`);
        },
    },

    hostname: {
        help: "Print the host name",
        usage: "hostname",
        run: (ctx) => ctx.out.print(ctx.shell.host),
    },

    uname: {
        help: "Print system information",
        usage: "uname [-asr]",
        run(ctx) {
            const parsed = parseFlags(ctx, "asrnm");
            if (!parsed) return 1;
            const { flags } = parsed;
            if (flags.has("a")) {
                ctx.out.print(`Linux ${ctx.shell.host} ${KERNEL} #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`);
                return 0;
            }
            const parts = [];
            if (flags.has("s") || !flags.size) parts.push("Linux");
            if (flags.has("n")) parts.push(ctx.shell.host);
            if (flags.has("r")) parts.push(KERNEL);
            if (flags.has("m")) parts.push("x86_64");
            ctx.out.print(parts.join(" "));
            return 0;
        },
    },

    date: {
        help: "Print the current date and time",
        usage: "date",
        run: (ctx) => ctx.out.print(formatDateTz(new Date())),
    },

    uptime: {
        help: "Show how long the system has been running",
        usage: "uptime",
        run(ctx) {
            const up = formatDuration(Date.now() - ctx.shell.startedAt);
            ctx.out.print(` ${time(new Date())} up ${up},  1 user,  load average: 0.08, 0.03, 0.01`);
        },
    },

    env: {
        help: "Print the environment",
        usage: "env",
        run(ctx) {
            [...ctx.env.entries()].forEach(([key, value]) => ctx.out.print(`${key}=${value}`));
        },
    },

    printenv: {
        help: "Print environment variables",
        usage: "printenv [name]",
        run(ctx) {
            if (!ctx.args.length) {
                [...ctx.env.entries()].forEach(([key, value]) => ctx.out.print(`${key}=${value}`));
                return 0;
            }
            const value = ctx.env.get(ctx.args[0]);
            if (value === undefined) return 1;
            ctx.out.print(value);
            return 0;
        },
    },

    export: {
        help: "Set an environment variable",
        usage: "export NAME=value",
        run(ctx) {
            if (!ctx.args.length) {
                [...ctx.env.entries()].forEach(([key, value]) => ctx.out.print(`declare -x ${key}="${value}"`));
                return 0;
            }
            for (const arg of ctx.args) {
                const match = arg.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/s);
                if (!match) {
                    ctx.err.print(`bash: export: \`${arg}': not a valid identifier`);
                    ctx.status = 1;
                } else if (match[2] !== undefined) {
                    ctx.env.set(match[1], match[2]);
                }
            }
            return undefined;
        },
    },

    ps: {
        help: "List running processes",
        usage: "ps [aux]",
        run(ctx) {
            const { shell } = ctx;
            const full = ctx.args.some((arg) => /^-?[aexuf]+$/.test(arg));
            const mine = [
                { pid: shell.bashPid, user: shell.user, cmd: "-bash", start: shell.startedAt },
                ...shell.procs.values(),
                { pid: ctx.pid, user: shell.user, cmd: "ps", start: Date.now() },
            ];
            if (!full) {
                ctx.out.print("    PID TTY          TIME CMD");
                mine.forEach((p) =>
                    ctx.out.print(
                        `${String(p.pid).padStart(7)} pts/0    00:00:00 ${p.cmd.replace(/^-/, "")}`,
                    ),
                );
                return 0;
            }
            ctx.out.print("USER         PID %CPU %MEM TTY      STAT START   TIME COMMAND");
            [...SYSTEM_PROCS, ...mine].forEach((p) => {
                const own = p.user === shell.user;
                ctx.out.print(
                    `${p.user.slice(0, 8).padEnd(8)} ${String(p.pid).padStart(7)}  0.0  0.${p.pid % 9} ${own ? "pts/0   " : "?       "} ${p.cmd === "ps" ? "R+" : "Ss"}   ${time(new Date(p.start ?? shell.startedAt)).slice(0, 5)}   0:00 ${p.cmd}`,
                );
            });
            return 0;
        },
    },

    kill: {
        help: "Terminate a process by PID",
        usage: "kill [-9] pid...",
        async run(ctx) {
            const { shell } = ctx;
            const pids = ctx.args.filter((arg) => !arg.startsWith("-"));
            if (!pids.length) {
                ctx.err.print("kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]");
                return 2;
            }
            for (const arg of pids) {
                const pid = Number(arg);
                const proc = shell.procs.get(pid);
                if (!Number.isInteger(pid)) {
                    ctx.err.print(`bash: kill: ${arg}: arguments must be process or job IDs`);
                    ctx.status = 1;
                } else if (pid === shell.bashPid) {
                    await ctx.term.reboot();
                } else if (proc) {
                    shell.procs.delete(pid);
                    proc.stop?.();
                    ctx.out.print(`[1]+  Terminated              ${proc.cmd}`);
                } else if (SYSTEM_PROCS.some((p) => p.pid === pid)) {
                    ctx.err.print(`bash: kill: (${pid}) - Operation not permitted`);
                    ctx.status = 1;
                } else {
                    ctx.err.print(`bash: kill: (${pid}) - No such process`);
                    ctx.status = 1;
                }
            }
            return undefined;
        },
    },

    sleep: {
        help: "Delay for a number of seconds",
        usage: "sleep seconds",
        async run(ctx) {
            const seconds = Number(ctx.args[0]);
            if (!ctx.args.length || !(seconds >= 0)) {
                ctx.err.print(
                    ctx.args.length ? `sleep: invalid time interval '${ctx.args[0]}'` : "sleep: missing operand",
                );
                return 1;
            }
            await ctx.sleep(seconds * 1000);
            return 0;
        },
    },

    true: { hidden: true, help: "Do nothing, successfully", usage: "true", run: () => 0 },
    false: { hidden: true, help: "Do nothing, unsuccessfully", usage: "false", run: () => 1 },

    sudo: {
        help: "Run a command as another user (hah)",
        usage: "sudo command",
        run(ctx) {
            ctx.err.print(`${ctx.shell.user} is not in the sudoers file. This incident will be reported.`);
            return 1;
        },
    },

    login: {
        help: "Sign in as another user",
        usage: "login [name]",
        async run(ctx) {
            if (await ctx.term.login(ctx.args[0], { allowCancel: true })) {
                ctx.term.clear();
                ctx.term.welcome();
            }
        },
    },

    logout: {
        help: "Log out and return to the login prompt",
        usage: "logout",
        run: (ctx) => ctx.term.logout(),
    },

    exit: {
        help: "Exit the session (same as logout)",
        usage: "exit",
        run: (ctx) => ctx.term.logout(),
    },
};
