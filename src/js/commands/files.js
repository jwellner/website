import escapeHtml from "../shell/escapeHtml.js";
import { FsError } from "../shell/fs.js";
import { formatLsDate } from "../shell/format.js";
import { basename, lines, parseFlags, readInputs } from "./util.js";

const nameHtml = (name, node) => {
    const label = escapeHtml(name);
    if (node?.type === "dir") return `<span class="c-dir">${label}</span>`;
    if (node?.exec) return `<span class="c-exec">${label}</span>`;
    return label;
};

const permissions = (node) => {
    if (node.type === "dir") return "drwxr-xr-x";
    if (node.exec) return "-rwxr-xr-x";
    return node.ro ? "-r--r--r--" : "-rw-r--r--";
};

const sizeOf = (fs, abs, node) => (node.type === "dir" ? 4096 : fs.read(abs).length);

const sortNames = (names) =>
    [...names].sort((a, b) =>
        a.replace(/^\./, "").localeCompare(b.replace(/^\./, ""), undefined, { sensitivity: "base" }),
    );

function listEntries(ctx, flags, entries) {
    // entries: [{ name, abs, node }]
    const { shell } = ctx;
    if (flags.has("l")) {
        const rows = entries.map(({ name, abs, node }) => ({
            perms: permissions(node),
            links: node.type === "dir" ? 2 : 1,
            owner: node.owner === "user" ? shell.user : "root",
            size: sizeOf(ctx.fs, abs, node),
            date: formatLsDate(node.mtime ?? new Date()),
            label: nameHtml(name, node),
        }));
        const width = Math.max(...rows.map((r) => String(r.size).length), 1);
        const ownerWidth = Math.max(...rows.map((r) => r.owner.length), 1);
        const total = rows.reduce((sum, r) => sum + Math.max(4, Math.ceil(r.size / 4096) * 4), 0);
        const out = [`total ${total}`];
        for (const r of rows) {
            out.push(
                `${r.perms} ${r.links} ${r.owner.padEnd(ownerWidth)} ${r.owner.padEnd(ownerWidth)} ` +
                    `${String(r.size).padStart(width)} ${r.date} ${r.label}`,
            );
        }
        ctx.out.html(out.join("\n"));
    } else if (!ctx.tty || flags.has("1")) {
        entries.forEach(({ name, node }) => ctx.out.html(nameHtml(name, node)));
    } else if (entries.length) {
        const items = entries.map(({ name, node }) => nameHtml(name, node));
        ctx.out.html(`<span class="ls">${items.join("  ")}</span>`);
    }
}

function walk(fs, abs, flags, visit, prefix = "") {
    const names = sortNames(fs.names(abs)).filter((n) => flags.has("a") || !n.startsWith("."));
    names.forEach((name, index) => {
        const child = fs.get(fs.resolve(abs, name));
        const last = index === names.length - 1;
        visit(name, child, prefix + (last ? "└── " : "├── "));
        if (child.type === "dir") walk(fs, fs.resolve(abs, name), flags, visit, prefix + (last ? "    " : "│   "));
    });
}

// Resolve the destination for cp/mv: an existing directory receives the source by name.
function destination(ctx, source, target) {
    const abs = ctx.resolve(target);
    return ctx.fs.get(abs)?.type === "dir" ? ctx.fs.resolve(abs, basename(source)) : abs;
}

export default {
    ls: {
        help: "List directory contents",
        usage: "ls [-1al] [path...]",
        run(ctx) {
            const parsed = parseFlags(ctx, "1al");
            if (!parsed) return 2;
            const { flags, rest } = parsed;
            const targets = rest.length ? rest : ["."];
            const files = [];
            const dirs = [];

            for (const target of targets) {
                const abs = ctx.resolve(target);
                const node = ctx.fs.get(abs);
                if (!node) {
                    ctx.err.print(`ls: cannot access '${target}': No such file or directory`);
                    ctx.status = 2;
                } else if (node.type === "dir") {
                    dirs.push({ target, abs });
                } else {
                    files.push({ name: target, abs, node });
                }
            }

            if (files.length) listEntries(ctx, flags, files);

            dirs.forEach(({ target, abs }, index) => {
                if (files.length || index > 0) ctx.out.print("");
                if (targets.length > 1) ctx.out.print(`${target}:`);
                const names = sortNames(ctx.fs.names(abs)).filter(
                    (n) => flags.has("a") || !n.startsWith("."),
                );
                const entries = names.map((name) => {
                    const child = ctx.fs.resolve(abs, name);
                    return { name, abs: child, node: ctx.fs.get(child) };
                });
                if (flags.has("a")) {
                    const parent = ctx.fs.resolve(abs, "..");
                    entries.unshift(
                        { name: ".", abs, node: ctx.fs.get(abs) },
                        { name: "..", abs: parent, node: ctx.fs.get(parent) },
                    );
                }
                listEntries(ctx, flags, entries);
            });
        },
    },

    cd: {
        help: "Change the working directory",
        usage: "cd [dir | -]",
        run(ctx) {
            const { shell } = ctx;
            const [arg = shell.home] = ctx.args;
            const target = arg === "-" ? shell.env.get("OLDPWD") : arg;
            const abs = ctx.resolve(target);
            try {
                if (ctx.fs.need(abs).type !== "dir") throw new FsError("Not a directory", abs);
            } catch (error) {
                ctx.fail(error, arg);
                return 1;
            }
            if (arg === "-") ctx.out.print(abs);
            shell.chdir(abs);
        },
    },

    pwd: {
        help: "Print the working directory",
        usage: "pwd",
        run: (ctx) => ctx.out.print(ctx.shell.cwd),
    },

    cat: {
        help: "Print the contents of files",
        usage: "cat [file...]",
        run(ctx) {
            for (const { text } of readInputs(ctx, ctx.args)) {
                if (text) ctx.out.print(text.replace(/\n$/, ""));
            }
        },
    },

    echo: {
        help: "Print arguments",
        usage: "echo [-n] [text...]",
        run(ctx) {
            const args = [...ctx.args];
            while (args[0] === "-n" || args[0] === "-e") args.shift();
            ctx.out.print(args.join(" "));
        },
    },

    mkdir: {
        help: "Create directories",
        usage: "mkdir [-p] dir...",
        run(ctx) {
            const parsed = parseFlags(ctx, "p");
            if (!parsed) return 1;
            if (!parsed.rest.length) {
                ctx.err.print("mkdir: missing operand");
                return 1;
            }
            for (const dir of parsed.rest) {
                try {
                    ctx.fs.mkdir(ctx.resolve(dir), { parents: parsed.flags.has("p") });
                } catch (error) {
                    ctx.fail(error, `cannot create directory '${dir}'`);
                }
            }
        },
    },

    rmdir: {
        help: "Remove empty directories",
        usage: "rmdir dir...",
        run(ctx) {
            if (!ctx.args.length) {
                ctx.err.print("rmdir: missing operand");
                return 1;
            }
            for (const dir of ctx.args) {
                try {
                    ctx.fs.rmdir(ctx.resolve(dir));
                } catch (error) {
                    ctx.fail(error, `failed to remove '${dir}'`);
                }
            }
        },
    },

    touch: {
        help: "Create empty files or update their timestamps",
        usage: "touch file...",
        run(ctx) {
            if (!ctx.args.length) {
                ctx.err.print("touch: missing file operand");
                return 1;
            }
            for (const file of ctx.args) {
                try {
                    ctx.fs.touch(ctx.resolve(file));
                } catch (error) {
                    ctx.fail(error, `cannot touch '${file}'`);
                }
            }
        },
    },

    rm: {
        help: "Remove files or directories",
        usage: "rm [-rf] file...",
        run(ctx) {
            const parsed = parseFlags(ctx, "rRfd");
            if (!parsed) return 1;
            const { flags, rest } = parsed;
            const recursive = flags.has("r") || flags.has("R");
            if (!rest.length) {
                if (!flags.has("f")) ctx.err.print("rm: missing operand");
                return flags.has("f") ? 0 : 1;
            }
            for (const file of rest) {
                const abs = ctx.resolve(file);
                if (recursive && abs === "/") {
                    ctx.err.print("rm: it is dangerous to operate recursively on '/'");
                    ctx.err.print("rm: use --no-preserve-root to override this failsafe");
                    ctx.status = 1;
                    continue;
                }
                const node = ctx.fs.get(abs);
                if (!node && flags.has("f")) continue;
                try {
                    if (node?.type === "dir" && flags.has("d") && !recursive) ctx.fs.rmdir(abs);
                    else ctx.fs.remove(abs, { recursive });
                } catch (error) {
                    ctx.fail(error, `cannot remove '${file}'`);
                }
            }
        },
    },

    cp: {
        help: "Copy files",
        usage: "cp source... dest",
        run(ctx) {
            if (ctx.args.length < 2) {
                ctx.err.print("cp: missing destination file operand");
                return 1;
            }
            const sources = ctx.args.slice(0, -1);
            const target = ctx.args.at(-1);
            if (sources.length > 1 && ctx.fs.get(ctx.resolve(target))?.type !== "dir") {
                ctx.err.print(`cp: target '${target}' is not a directory`);
                return 1;
            }
            for (const source of sources) {
                try {
                    const from = ctx.resolve(source);
                    ctx.fs.copy(from, destination(ctx, from, target));
                } catch (error) {
                    ctx.fail(
                        error,
                        error.reason === "Is a directory"
                            ? `-r not specified; omitting directory '${source}'`
                            : `cannot copy '${source}'`,
                    );
                }
            }
        },
    },

    mv: {
        help: "Move or rename files",
        usage: "mv source... dest",
        run(ctx) {
            if (ctx.args.length < 2) {
                ctx.err.print("mv: missing destination file operand");
                return 1;
            }
            const sources = ctx.args.slice(0, -1);
            const target = ctx.args.at(-1);
            if (sources.length > 1 && ctx.fs.get(ctx.resolve(target))?.type !== "dir") {
                ctx.err.print(`mv: target '${target}' is not a directory`);
                return 1;
            }
            for (const source of sources) {
                try {
                    const from = ctx.resolve(source);
                    ctx.fs.move(from, destination(ctx, from, target));
                } catch (error) {
                    ctx.fail(error, `cannot move '${source}'`);
                }
            }
        },
    },

    tree: {
        help: "List directory contents as a tree",
        usage: "tree [-a] [dir]",
        run(ctx) {
            const parsed = parseFlags(ctx, "a");
            if (!parsed) return 1;
            const target = parsed.rest[0] ?? ".";
            const abs = ctx.resolve(target);
            let dirs = 0;
            let files = 0;
            const out = [];
            try {
                if (ctx.fs.need(abs).type !== "dir") throw new FsError("Not a directory", abs);
                walk(ctx.fs, abs, parsed.flags, (name, node, branch) => {
                    out.push(`${branch}${nameHtml(name, node)}`);
                    if (node.type === "dir") dirs += 1;
                    else files += 1;
                });
            } catch (error) {
                ctx.fail(error, target);
                return 1;
            }
            ctx.out.html([escapeHtml(target), ...out, "", `${dirs} directories, ${files} files`].join("\n"));
        },
    },

    head: {
        help: "Print the first lines of files",
        usage: "head [-n N] [file...]",
        run: (ctx) => slice(ctx, "head"),
    },

    tail: {
        help: "Print the last lines of files",
        usage: "tail [-n N] [file...]",
        run: (ctx) => slice(ctx, "tail"),
    },

    wc: {
        help: "Count lines, words and bytes",
        usage: "wc [-lwc] [file...]",
        run(ctx) {
            const parsed = parseFlags(ctx, "lwc");
            if (!parsed) return 1;
            const { flags } = parsed;
            const all = !flags.size;
            for (const { name, text } of readInputs(ctx, parsed.rest)) {
                const counts = [];
                if (all || flags.has("l")) counts.push(lines(text).length);
                if (all || flags.has("w")) counts.push(text.split(/\s+/).filter(Boolean).length);
                if (all || flags.has("c")) counts.push(text.length);
                ctx.out.print(`${counts.map((n) => String(n).padStart(6)).join(" ")}${name === "-" ? "" : ` ${name}`}`);
            }
        },
    },

    sort: {
        help: "Sort lines of text",
        usage: "sort [-r] [file...]",
        run(ctx) {
            const parsed = parseFlags(ctx, "r");
            if (!parsed) return 1;
            const all = readInputs(ctx, parsed.rest).flatMap(({ text }) => lines(text));
            all.sort((a, b) => a.localeCompare(b));
            if (parsed.flags.has("r")) all.reverse();
            all.forEach((line) => ctx.out.print(line));
        },
    },

    grep: {
        help: "Print lines that match a pattern",
        usage: "grep [-inv] pattern [file...]",
        run(ctx) {
            const parsed = parseFlags(ctx, "inv");
            if (!parsed) return 2;
            const [pattern, ...files] = parsed.rest;
            if (pattern === undefined) {
                ctx.err.print("Usage: grep [-inv] pattern [file...]");
                return 2;
            }
            const { flags } = parsed;
            let regex;
            try {
                regex = new RegExp(pattern, flags.has("i") ? "i" : "");
            } catch {
                regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags.has("i") ? "i" : "");
            }
            let matched = false;
            const inputs = readInputs(ctx, files);
            for (const { name, text } of inputs) {
                lines(text).forEach((line, index) => {
                    if (regex.test(line) === flags.has("v")) return;
                    matched = true;
                    const prefix = `${inputs.length > 1 ? `${name}:` : ""}${flags.has("n") ? `${index + 1}:` : ""}`;
                    ctx.out.print(prefix + line);
                });
            }
            return matched ? 0 : 1;
        },
    },
};

function slice(ctx, which) {
    let count = 10;
    const files = [];
    for (let i = 0; i < ctx.args.length; i += 1) {
        const arg = ctx.args[i];
        if (arg === "-n") {
            count = Number(ctx.args[(i += 1)]);
        } else if (/^-\d+$/.test(arg)) {
            count = Number(arg.slice(1));
        } else {
            files.push(arg);
        }
    }
    if (!Number.isInteger(count) || count < 0) {
        ctx.err.print(`${which}: invalid number of lines`);
        return 1;
    }
    const inputs = readInputs(ctx, files);
    inputs.forEach(({ name, text }, index) => {
        if (inputs.length > 1) ctx.out.print(`${index ? "\n" : ""}==> ${name} <==`);
        const all = lines(text);
        (which === "head" ? all.slice(0, count) : all.slice(Math.max(all.length - count, 0))).forEach((line) =>
            ctx.out.print(line),
        );
    });
    return undefined;
}
