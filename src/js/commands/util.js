// Parse short flags (-la) and `--`. Returns { flags: Set, rest: [] } or null after
// reporting an invalid option.
export function parseFlags(ctx, known) {
    const flags = new Set();
    const rest = [];
    let literal = false;
    for (const arg of ctx.args) {
        if (!literal && arg === "--") {
            literal = true;
        } else if (!literal && arg.length > 1 && arg[0] === "-" && !/^-\d+$/.test(arg)) {
            for (const ch of arg.slice(1)) {
                if (!known.includes(ch)) {
                    ctx.err.print(`${ctx.name}: invalid option -- '${ch}'`);
                    ctx.status = 2;
                    return null;
                }
                flags.add(ch);
            }
        } else {
            rest.push(arg);
        }
    }
    return { flags, rest };
}

export const basename = (abs) => abs.split("/").filter(Boolean).pop() ?? "/";

// Read text from the given files, or from stdin when none are given.
export function readInputs(ctx, files) {
    if (!files.length) return [{ name: "-", text: ctx.stdin ?? "" }];
    const inputs = [];
    for (const file of files) {
        try {
            inputs.push({ name: file, text: ctx.fs.read(ctx.resolve(file)) });
        } catch (error) {
            ctx.fail(error, file);
        }
    }
    return inputs;
}

export const lines = (text) => {
    const parts = text.split("\n");
    if (parts.at(-1) === "") parts.pop();
    return parts;
};
