import { commands, programs } from "./commands/index.js";
import History from "./shell/history.js";
import Shell from "./shell/shell.js";
import escapeHtml from "./shell/escapeHtml.js";
import Terminal from "./view/terminal.js";

const container = document.getElementById("vanilla-terminal");

function boot(container) {
    // The page ships with static fallback content (SEO, no-JS); the terminal replaces
    // it, reusing the copy so it stays defined in site.json / index.md.
    const text = (selector) => container.querySelector(selector)?.textContent.trim() ?? "";
    const copy = {
        title: text(".title") || "Jeroen Wellner",
        tagline: text(".tagline"),
        quote: text(".home"),
    };
    const sections = [...container.querySelectorAll("[data-section]")].map((el) => ({
        title: el.dataset.title,
        html: el.innerHTML,
    }));
    container.textContent = "";

    const site = { title: copy.title, tagline: copy.tagline, sections };
    const shell = new Shell({ commands, programs, history: new History(), site });
    const terminal = new Terminal(container, shell);

    terminal.setBanner(() => {
        const heading = [copy.title, copy.tagline].filter(Boolean).join(" - ");
        return [
            `<strong>${escapeHtml(heading)}</strong>`,
            ...(copy.quote ? [`<em>${escapeHtml(copy.quote)}</em>`] : []),
            "",
            "Type <u>help</u> to see a list of commands, or <u>website</u> for the short tour.",
        ];
    });

    terminal.welcome();
    window.VanillaTerminal = terminal;
}

if (container) boot(container);
