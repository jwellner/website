import { FsError } from "./fs.js";

// Tab completion for the word at the end of `line`.
// Returns { start, candidates: [{ name, dir }] } where `start` is the index in
// `line` where the completed word begins and `name` replaces everything after it.
export default function complete(shell, line) {
    let wordStart = 0;
    for (let i = 0; i < line.length; i += 1) {
        if (line[i] === "\\") i += 1;
        else if (line[i] === " " || line[i] === "\t") wordStart = i + 1;
    }
    const word = line.slice(wordStart).replace(/\\(.)/g, "$1");
    const before = line.slice(0, wordStart).trimEnd();
    const commandPosition = before === "" || /[;|&]$/.test(before);

    if (commandPosition && !word.includes("/")) {
        const candidates = shell
            .commandNames()
            .filter((name) => name.startsWith(word))
            .map((name) => ({ name, dir: false }));
        return { start: wordStart, candidates };
    }

    // Path completion: split into the directory part and the name prefix.
    const slash = word.lastIndexOf("/");
    const dirPart = word.slice(0, slash + 1);
    const prefix = word.slice(slash + 1);
    const base = dirPart.startsWith("~") ? shell.home + dirPart.slice(1) : dirPart || ".";
    const abs = shell.fs.resolve(shell.cwd, base);

    let names;
    try {
        names = shell.fs.names(abs);
    } catch (error) {
        if (error instanceof FsError) return { start: wordStart, candidates: [] };
        throw error;
    }

    const candidates = names
        .filter((name) => name.startsWith(prefix) && (prefix.startsWith(".") || !name.startsWith(".")))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
            name: dirPart + name,
            dir: shell.fs.get(shell.fs.resolve(abs, name))?.type === "dir",
        }));

    // A command position with a slash (./foo) only offers directories and executables.
    if (commandPosition) {
        return {
            start: wordStart,
            candidates: candidates.filter(
                (c) => c.dir || shell.fs.get(shell.fs.resolve(abs, c.name.slice(dirPart.length)))?.exec,
            ),
        };
    }
    return { start: wordStart, candidates };
}

export const commonPrefix = (names) =>
    names.reduce((prefix, name) => {
        let i = 0;
        while (i < prefix.length && prefix[i] === name[i]) i += 1;
        return prefix.slice(0, i);
    });

// Escape characters the tokenizer would treat specially.
export const escapeWord = (name) => name.replace(/([ \t'"\\;|&<>$#])/g, "\\$1");
