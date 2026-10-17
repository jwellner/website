// Tokenizer / parser for a small POSIX-ish command language.
//
// Supports: 'single' and "double" quotes, backslash escapes, $VAR / ${VAR} / $?,
// leading ~, comments, pipes (|), lists (; && ||) and redirects (> >>).
// Words stay unexpanded (arrays of {text, quote}) so that variables are looked
// up when the command runs, e.g. `export A=1; echo $A`.

const OPERATORS = ["&&", "||", ">>", ";", "|", ">"];

export class ParseError extends Error {}

const isSpace = (ch) => ch === " " || ch === "\t" || ch === "\n";

export function tokenize(line) {
    const tokens = [];
    let word = null;
    let i = 0;

    const push = (text, quote) => {
        if (!word) word = [];
        word.push({ text, quote });
    };
    const flush = () => {
        if (word) tokens.push({ type: "word", parts: word });
        word = null;
    };

    while (i < line.length) {
        const ch = line[i];

        if (isSpace(ch)) {
            flush();
            i += 1;
        } else if (ch === "#" && !word) {
            break;
        } else if (ch === "'") {
            const end = line.indexOf("'", i + 1);
            if (end === -1) throw new ParseError("unexpected EOF while looking for matching `'`");
            push(line.slice(i + 1, end), "single");
            i = end + 1;
        } else if (ch === '"') {
            let text = "";
            i += 1;
            for (;;) {
                if (i >= line.length) throw new ParseError('unexpected EOF while looking for matching `"`');
                if (line[i] === '"') break;
                if (line[i] === "\\" && '"\\$'.includes(line[i + 1] ?? "")) {
                    // Keep the escape for `$` so expansion can tell it was escaped.
                    text += line[i + 1] === "$" ? "\\$" : line[i + 1];
                    i += 2;
                } else {
                    text += line[i];
                    i += 1;
                }
            }
            push(text, "double");
            i += 1;
        } else if (ch === "\\") {
            if (i + 1 < line.length) push(line[i + 1], "single");
            i += 2;
        } else {
            const op = OPERATORS.find((o) => line.startsWith(o, i));
            if (op) {
                flush();
                tokens.push({ type: "op", value: op });
                i += op.length;
            } else {
                let end = i;
                while (
                    end < line.length &&
                    !isSpace(line[end]) &&
                    !"'\"\\;|&><".includes(line[end])
                ) {
                    end += 1;
                }
                if (end === i) throw new ParseError(`syntax error near unexpected token \`${ch}'`);
                push(line.slice(i, end), "none");
                i = end;
            }
        }
    }
    flush();
    return tokens;
}

// Returns [{ connector, pipeline: [{ words, redirect }] }]
export function parse(line) {
    const tokens = tokenize(line);
    const list = [];
    let connector = ";";
    let pipeline = [];
    let command = { words: [], redirect: null };
    let pendingRedirect = null;

    const unexpected = (token) =>
        new ParseError(`syntax error near unexpected token \`${token}'`);

    const endCommand = (token) => {
        if (pendingRedirect) throw unexpected(token ?? "newline");
        if (!command.words.length) return false;
        pipeline.push(command);
        command = { words: [], redirect: null };
        return true;
    };

    for (const token of tokens) {
        if (token.type === "word") {
            if (pendingRedirect) {
                command.redirect = { op: pendingRedirect, word: token.parts };
                pendingRedirect = null;
            } else {
                command.words.push(token.parts);
            }
        } else if (token.value === ">" || token.value === ">>") {
            if (pendingRedirect) throw unexpected(token.value);
            pendingRedirect = token.value;
        } else if (token.value === "|") {
            if (!endCommand("|")) throw unexpected("|");
        } else {
            // ; && ||
            if (!endCommand(token.value)) throw unexpected(token.value);
            list.push({ connector, pipeline });
            pipeline = [];
            connector = token.value;
        }
    }

    if (endCommand()) {
        list.push({ connector, pipeline });
    } else if (pipeline.length || connector !== ";") {
        throw unexpected("newline");
    }
    return list;
}

export function expand(parts, lookup, home) {
    let out = "";
    parts.forEach((part, index) => {
        let { text } = part;
        if (part.quote === "single") {
            out += text;
            return;
        }
        if (part.quote === "none" && index === 0 && (text === "~" || text.startsWith("~/"))) {
            text = home + text.slice(1);
        }
        out += text.replace(
            /\\\$|\$(\?|[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})/g,
            (match, name) => {
                if (match === "\\$") return "$";
                const key = name.startsWith("{") ? name.slice(1, -1) : name;
                return lookup(key) ?? "";
            },
        );
    });
    return out;
}
