import FileSystem, { dir, file } from "./fs.js";

const BUILT = new Date("2025-01-15T09:00:00");

// The pages of the `website` app, as plain text files in ~/Documents. The page markup
// is minified, so line breaks come from the block elements rather than from whitespace.
const sectionText = (html) => {
    const { body } = new DOMParser().parseFromString(html, "text/html");
    body.querySelectorAll("h2").forEach((el) => el.prepend("# "));
    body.querySelectorAll("li").forEach((el) => el.prepend("* "));
    body.querySelectorAll("li, dd").forEach((el) => el.append("\n"));
    body.querySelectorAll("dt").forEach((el) => el.append(" ".repeat(Math.max(2, 10 - el.textContent.length))));
    body.querySelectorAll("h2, p, pre, dl").forEach((el) => el.append("\n\n"));
    return body.textContent.replace(/\n{3,}/g, "\n\n").trim();
};

const readme = `Welcome to wllnr.nl!

This is a tiny fake Linux box that lives in your browser.
Nothing here is real, and nothing you change is saved.

  ls -la          look around, including hidden files
  cat Documents/about.txt
  website         browse this site in a full-screen app (q to quit)
  top             what is this machine up to?
  help            everything else

Poke around. There is at least one secret.
`;

const passwd = (user) => () =>
    `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
${user()}:x:1000:1000:${user()}:/home/${user()}:/bin/bash
`;

// `getUser` is called lazily so the files follow `login <name>`.
export default function createRootFs(getUser, sections = []) {
    const sys = { ro: true, mtime: BUILT };
    const f = (content, opts = {}) => file(content, { ro: true, mtime: BUILT, ...opts });

    const root = dir(
        {
            bin: dir({}, sys),
            etc: dir(
                {
                    hostname: f("wllnr\n"),
                    motd: f("Welcome to wllnr.nl\n"),
                    passwd: f(passwd(getUser)),
                    "os-release": f('PRETTY_NAME="wllnr.nl 2.0"\nNAME="wllnr.nl"\nID=wllnr\n'),
                },
                sys,
            ),
            home: dir(
                {
                    guest: dir(
                        {
                            Desktop: dir({}, { mtime: BUILT, owner: "user" }),
                            Documents: dir(
                                Object.fromEntries(
                                    sections.map(({ slug, html }) => [
                                        `${slug}.txt`,
                                        file(`${sectionText(html)}\n`, { mtime: BUILT, owner: "user" }),
                                    ]),
                                ),
                                { mtime: BUILT, owner: "user" },
                            ),
                            tools: dir(
                                {
                                    "party.sh": file("#!/bin/sh\n# let's get this party started\n", {
                                        exec: "party",
                                        mtime: BUILT,
                                        owner: "user",
                                    }),
                                },
                                { mtime: BUILT, owner: "user" },
                            ),
                            ".bashrc": file("# ~/.bashrc\n# nothing to see here\n", { mtime: BUILT, owner: "user" }),
                            ".secret": file("You found it. Have a cookie. 🍪\n", { mtime: BUILT, owner: "user" }),
                            "README.md": file(readme, { mtime: BUILT, owner: "user" }),
                        },
                        { mtime: BUILT, owner: "user" },
                    ),
                },
                sys,
            ),
            root: dir({}, { ...sys, owner: "root" }),
            tmp: dir({}, { mtime: BUILT }),
            usr: dir({ bin: dir({}, sys) }, sys),
            var: dir({ log: dir({}, sys) }, sys),
        },
        sys,
    );
    return new FileSystem(root);
}
