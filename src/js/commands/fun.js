import escapeHtml from "../shell/escapeHtml.js";
import { formatDuration } from "../shell/format.js";
import { lines } from "./util.js";

const LOGO = [
    "     ██╗██╗    ██╗",
    "     ██║██║    ██║",
    "     ██║██║ █╗ ██║",
    "██   ██║██║███╗██║",
    "╚█████╔╝╚███╔███╔╝",
    " ╚════╝  ╚══╝╚══╝ ",
];

const FORTUNES = [
    "It works on my machine.",
    "There are only two hard things in computer science: cache invalidation, naming things, and off-by-one errors.",
    "A good programmer looks both ways before crossing a one-way street.",
    "It's not a bug, it's an undocumented feature.",
    "Have you tried turning it off and on again?",
    "The cloud is just someone else's computer.",
    "Premature optimization is the root of all evil. - Donald Knuth",
    "Weeks of coding can save you hours of planning.",
    "Never deploy on a Friday.",
    "Works in production, fails in staging. Famous last words.",
];

const browser = () => {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return "Edge";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "unknown browser";
};

const bubble = (text) => {
    const wrapped = [];
    for (const paragraph of text.split("\n")) {
        let current = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (current && current.length + word.length + 1 > 40) {
                wrapped.push(current);
                current = word;
            } else {
                current = current ? `${current} ${word}` : word;
            }
        }
        wrapped.push(current);
    }
    const width = Math.max(...wrapped.map((l) => l.length));
    const body =
        wrapped.length === 1
            ? [`< ${wrapped[0].padEnd(width)} >`]
            : wrapped.map((l, i) => {
                  const [left, right] = i === 0 ? ["/", "\\"] : i === wrapped.length - 1 ? ["\\", "/"] : ["|", "|"];
                  return `${left} ${l.padEnd(width)} ${right}`;
              });
    return [` ${"_".repeat(width + 2)} `, ...body, ` ${"-".repeat(width + 2)} `];
};

const COW = [
    "        \\   ^__^",
    "         \\  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||",
];

export default {
    neofetch: {
        help: "Show system information",
        usage: "neofetch",
        run(ctx) {
            const { shell } = ctx;
            const title = `${shell.user}@${shell.host}`;
            const label = (name, value) => `<span class="c-dir">${name}</span>: ${escapeHtml(value)}`;
            const info = [
                `<span class="c-exec">${escapeHtml(title)}</span>`,
                "-".repeat(title.length),
                label("OS", "wllnr.nl 2.0"),
                label("Host", `${browser()} on the web`),
                label("Kernel", "JavaScript (ES2022)"),
                label("Uptime", formatDuration(Date.now() - shell.startedAt)),
                label("Shell", "vanilla-term"),
                label("Resolution", `${window.innerWidth}x${window.innerHeight}`),
                label("Languages", "Python, Javascript"),
                label("Interests", "Docker, Infrastructure, Databases, Networking"),
            ];
            const rows = Math.max(LOGO.length, info.length);
            const out = [];
            for (let i = 0; i < rows; i += 1) {
                const logo = (LOGO[i] ?? "").padEnd(LOGO[0].length);
                out.push(`<span class="c-dir">${escapeHtml(logo)}</span>   ${info[i] ?? ""}`);
            }
            ctx.out.html(out.join("\n"));
        },
    },

    cowsay: {
        help: "Have a cow say something",
        usage: "cowsay [text]",
        run(ctx) {
            const text = ctx.args.length ? ctx.args.join(" ") : lines(ctx.stdin ?? "").join("\n");
            if (!text.trim()) {
                ctx.err.print("cowsay: nothing to say");
                return 1;
            }
            ctx.out.print([...bubble(text), ...COW].join("\n"));
            return 0;
        },
    },

    fortune: {
        help: "Print a random adage",
        usage: "fortune",
        run: (ctx) => ctx.out.print(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]),
    },

    contact: {
        help: "How to contact me",
        usage: "contact",
        run: (ctx) => ctx.out.print("You can mail me at jeroen@wllnr.nl."),
    },
};

// Programs only runnable through an executable file (e.g. ~/tools/party.sh).
export const programs = {
    party: {
        help: "Start a colorful party",
        usage: "party.sh",
        run(ctx) {
            const { shell, term } = ctx;
            const running = [...shell.procs.values()].find((p) => p.cmd === "party.sh");
            if (running) {
                ctx.err.print("party.sh: already running (kill it with: kill " + running.pid + ")");
                return 1;
            }
            const colors = ["black", "red", "orange", "green", "blue", "white", "yellow"];
            // Strobing colors can trigger photosensitive reactions: slow down if asked to.
            const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            const timer = setInterval(() => {
                term.el.style.setProperty("--term-bg", colors[Math.floor(Math.random() * colors.length)]);
            }, reduced ? 1500 : 100);
            shell.spawn("party.sh", () => {
                clearInterval(timer);
                term.el.style.removeProperty("--term-bg");
            });
            ctx.out.print("Let's get this party started! 🎉🎉🎉");
            return 0;
        },
    },
};
