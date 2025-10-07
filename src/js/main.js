import Terminal from "./terminal.js";

const terminal = new Terminal();

terminal.prompt("login", (name) => {
    terminal.output(`Hi ${name}!`);
    terminal.output("Type <u>help</u> to see a list of commands.");
    terminal.user = name;
});