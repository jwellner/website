// In-memory filesystem. Nothing is persisted; it resets on every page load.
//
// Nodes:
//   { type: "dir",  children: {name: node}, ro?, owner?, mtime }
//   { type: "file", content: string | () => string, ro?, exec?, owner?, mtime }
// `ro` marks nodes that can't be modified, `exec` names the program a file runs.

export class FsError extends Error {
    constructor(reason, path) {
        super(path ? `${path}: ${reason}` : reason);
        this.reason = reason;
        this.path = path;
    }
}

export const dir = (children = {}, opts = {}) => ({ type: "dir", children, ...opts });
export const file = (content = "", opts = {}) => ({ type: "file", content, ...opts });

export const split = (path) => path.split("/").filter(Boolean);

export default class FileSystem {
    constructor(root) {
        this.root = root;
    }

    // Turn a (possibly relative) path into a normalized absolute one.
    resolve(cwd, path) {
        const parts = [];
        const input = path.startsWith("/") ? path : `${cwd}/${path}`;
        for (const part of split(input)) {
            if (part === ".") continue;
            if (part === "..") parts.pop();
            else parts.push(part);
        }
        return `/${parts.join("/")}`;
    }

    get(abs) {
        let node = this.root;
        for (const part of split(abs)) {
            if (node.type !== "dir" || !node.children[part]) return null;
            node = node.children[part];
        }
        return node;
    }

    // Like get() but throws the errors a shell would show.
    need(abs) {
        const parts = split(abs);
        let node = this.root;
        for (const part of parts) {
            if (node.type !== "dir") throw new FsError("Not a directory", abs);
            node = node.children[part];
            if (!node) throw new FsError("No such file or directory", abs);
        }
        return node;
    }

    read(abs) {
        const node = this.need(abs);
        if (node.type === "dir") throw new FsError("Is a directory", abs);
        return typeof node.content === "function" ? node.content() : node.content;
    }

    names(abs) {
        const node = this.need(abs);
        if (node.type !== "dir") throw new FsError("Not a directory", abs);
        return Object.keys(node.children);
    }

    // Returns [parentNode, name] for a path that is about to be created/removed.
    parentOf(abs) {
        const parts = split(abs);
        const name = parts.pop();
        if (!name) throw new FsError("Permission denied", abs);
        const parent = this.need(`/${parts.join("/")}`);
        if (parent.type !== "dir") throw new FsError("Not a directory", abs);
        return [parent, name];
    }

    mkdir(abs, { parents = false } = {}) {
        if (parents) {
            let current = "";
            for (const part of split(abs)) {
                current += `/${part}`;
                const node = this.get(current);
                if (!node) this.mkdir(current);
                else if (node.type !== "dir") throw new FsError("Not a directory", current);
            }
            return;
        }
        const [parent, name] = this.parentOf(abs);
        if (parent.children[name]) throw new FsError("File exists", abs);
        if (parent.ro) throw new FsError("Permission denied", abs);
        parent.children[name] = dir({}, { mtime: new Date(), owner: "user" });
        parent.mtime = new Date();
    }

    write(abs, content, { append = false } = {}) {
        const [parent, name] = this.parentOf(abs);
        const existing = parent.children[name];
        if (existing) {
            if (existing.type === "dir") throw new FsError("Is a directory", abs);
            if (existing.ro) throw new FsError("Permission denied", abs);
            const old = typeof existing.content === "function" ? existing.content() : existing.content;
            existing.content = append ? old + content : content;
            existing.mtime = new Date();
            return;
        }
        if (parent.ro) throw new FsError("Permission denied", abs);
        parent.children[name] = file(content, { mtime: new Date(), owner: "user" });
        parent.mtime = new Date();
    }

    touch(abs) {
        const node = this.get(abs);
        if (node) {
            node.mtime = new Date();
        } else {
            this.write(abs, "");
        }
    }

    remove(abs, { recursive = false } = {}) {
        const node = this.need(abs);
        const [parent, name] = this.parentOf(abs);
        if (parent.ro || node.ro) throw new FsError("Permission denied", abs);
        if (node.type === "dir" && !recursive) throw new FsError("Is a directory", abs);
        delete parent.children[name];
        parent.mtime = new Date();
    }

    rmdir(abs) {
        const node = this.need(abs);
        if (node.type !== "dir") throw new FsError("Not a directory", abs);
        if (Object.keys(node.children).length) throw new FsError("Directory not empty", abs);
        this.remove(abs, { recursive: true });
    }

    // Move a node; `to` must be the final path (not a directory to move into).
    move(from, to) {
        const node = this.need(from);
        const [fromParent, fromName] = this.parentOf(from);
        const [toParent, toName] = this.parentOf(to);
        if (fromParent.ro || toParent.ro || node.ro) throw new FsError("Permission denied", from);
        if (to === from) return;
        if (to.startsWith(`${from}/`)) {
            throw new FsError(`cannot move to a subdirectory of itself, '${to}'`, from);
        }
        const target = toParent.children[toName];
        if (target && (target.type === "dir" || node.type === "dir")) {
            throw new FsError("File exists", to);
        }
        delete fromParent.children[fromName];
        toParent.children[toName] = node;
        fromParent.mtime = toParent.mtime = new Date();
    }

    copy(from, to) {
        const node = this.need(from);
        if (node.type === "dir") throw new FsError("Is a directory", from);
        const { exec, ro } = node;
        this.write(to, this.read(from));
        const copy = this.get(to);
        if (exec) copy.exec = exec;
        if (ro) copy.ro = false;
    }
}
