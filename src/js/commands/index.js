import apps from "./apps.js";
import files from "./files.js";
import fun, { programs } from "./fun.js";
import network from "./network.js";
import system from "./system.js";

// Every command is { help, usage, run(ctx), hidden? }; see shell/shell.js for `ctx`.
export const commands = { ...system, ...files, ...network, ...apps, ...fun };

export { programs };
