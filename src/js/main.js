import { commands, programs } from "./commands/index.js";
import History from "./shell/history.js";
import Shell from "./shell/shell.js";
import escapeHtml from "./shell/escapeHtml.js";
import Terminal from "./view/terminal.js";

const container = document.getElementById("vanilla-terminal");

function boot(container) {
    // The page ships with static fallback content (SEO, no-JS); the terminal replaces
    // it, reusing the copy so it stays defined in site.json and src/content/sections.
    const text = (selector) => container.querySelector(selector)?.textContent.trim() ?? "";
    const copy = {
        title: text(".title") || "Jeroen Wellner",
        tagline: text(".tagline"),
        quote: text(".quote"),
    };
    const template = container.querySelector("template#site-sections");
    const sections = [...(template?.content.querySelectorAll("section") ?? [])].map((el) => ({
        slug: el.dataset.slug,
        title: el.dataset.title,
        html: el.innerHTML,
    }));
    const { mode, page } = container.dataset;
    container.textContent = "";

    const site = {
        title: copy.title,
        tagline: copy.tagline,
        sections,
        // Keep the address bar in step with the page shown, without adding history entries.
        onNavigate: (slug) => {
            try {
                window.history.replaceState(null, "", `/${slug}/`);
            } catch {
                // Some embedders block the History API; the URL just stays put.
            }
        },
    };
    const shell = new Shell({ commands, programs, history: new History(), site });
    const terminal = new Terminal(container, shell);

    terminal.setBanner(() => {
        const heading = [copy.title, copy.tagline].filter(Boolean).join(" - ");
        return [
            `<strong>${escapeHtml(heading)}</strong>`,
            ...(copy.quote ? [`<em>${escapeHtml(copy.quote)}</em>`] : []),
            "",
            "Type <u>help</u> to see a list of commands, or <u>website</u> to open the site again.",
            ...(window.matchMedia?.("(pointer: coarse)").matches ? ["Tap anywhere to type."] : []),
        ];
    });

    terminal.welcome();
    if (mode === "404") {
        // An unknown URL is an unknown path: fail the way a shell would.
        const path = window.location.pathname;
        terminal.echo(shell.promptHtml(), `cat ${path}`);
        terminal.printErr(`cat: ${path}: No such file or directory`);
        terminal.print("Type help, or website to open the site.");
        terminal.print();
    } else if (sections.length) {
        // The site is the website app (at the page in the URL); q drops you into the shell.
        terminal.execute(page ? `website ${page}` : "website", { echo: false, record: false });
    }
    window.VanillaTerminal = terminal;
}

if (container) boot(container);
