import { parseFlags } from "./util.js";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// Deterministic fake address from the TEST-NET-1 range (192.0.2.0/24, reserved for docs).
const fakeAddress = (host) => {
    let hash = 0;
    for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) % 253;
    return `192.0.2.${hash + 1}`;
};

const resolveHost = (host) => {
    if (host === "localhost") return "127.0.0.1";
    const match = host.match(IPV4);
    if (match) return match.slice(1).every((n) => Number(n) <= 255) ? host : null;
    return host.includes(".") ? fakeAddress(host.toLowerCase()) : null;
};

const SITE_HOSTS = ["wllnr.nl", "www.wllnr.nl"];

const PAGE = `<!doctype html>
<html lang="en">
<head><title>Jeroen Wellner</title></head>
<body>
  <h1>Jeroen Wellner</h1>
  <p>Devops/Software Engineer</p>
  <p><i>Building things for the Internet since 1996</i></p>
  <p>Contact: jeroen@wllnr.nl</p>
</body>
</html>`;

export default {
    ping: {
        help: "Check whether a host is reachable",
        usage: "ping [-c count] host",
        async run(ctx) {
            let count = 4;
            let host;
            for (let i = 0; i < ctx.args.length; i += 1) {
                const arg = ctx.args[i];
                if (arg === "-c") {
                    count = Number(ctx.args[(i += 1)]);
                } else if (arg.startsWith("-")) {
                    ctx.err.print(`ping: invalid option -- '${arg.replace(/^-+/, "")}'`);
                    return 2;
                } else {
                    host = arg;
                }
            }
            if (!host) {
                ctx.err.print("ping: usage error: Destination address required");
                return 2;
            }
            if (!Number.isInteger(count) || count < 1) {
                ctx.err.print("ping: invalid argument for -c");
                return 2;
            }
            const address = resolveHost(host);
            if (!address) {
                ctx.err.print(`ping: ${host}: Name or service not known`);
                return 2;
            }

            const local = address.startsWith("127.");
            const base = local ? 0.04 : 8 + (Number(address.split(".")[3]) % 20);
            const times = [];
            ctx.out.print(`PING ${host} (${address}) 56(84) bytes of data.`);

            try {
                for (let seq = 1; seq <= count; seq += 1) {
                    const rtt = local ? base + Math.random() * 0.03 : base + Math.random() * 3;
                    times.push(rtt);
                    ctx.out.print(
                        `64 bytes from ${local ? "localhost (127.0.0.1)" : address}: icmp_seq=${seq} ttl=${local ? 64 : 57} time=${rtt.toFixed(local ? 3 : 1)} ms`,
                    );
                    if (seq < count) await ctx.sleep(1000);
                }
            } catch (error) {
                if (error.name !== "AbortError") throw error;
            }

            const sent = times.length;
            ctx.out.print("");
            ctx.out.print(`--- ${host} ping statistics ---`);
            if (!sent) return 0;
            const min = Math.min(...times);
            const max = Math.max(...times);
            const avg = times.reduce((a, b) => a + b, 0) / sent;
            const mdev = Math.sqrt(times.reduce((a, b) => a + (b - avg) ** 2, 0) / sent);
            const f = (n) => n.toFixed(3);
            ctx.out.print(`${sent} packets transmitted, ${sent} received, 0% packet loss, time ${(sent - 1) * 1000}ms`);
            ctx.out.print(`rtt min/avg/max/mdev = ${f(min)}/${f(avg)}/${f(max)}/${f(mdev)} ms`);
            return 0;
        },
    },

    curl: {
        help: "Fetch a URL (only wllnr.nl is reachable from in here)",
        usage: "curl [-s] url",
        run(ctx) {
            const parsed = parseFlags(ctx, "sSL");
            if (!parsed) return 2;
            const [target] = parsed.rest;
            if (!target) {
                ctx.err.print("curl: try 'curl --help' for more information");
                return 2;
            }
            let url;
            try {
                url = new URL(/^[a-z]+:\/\//i.test(target) ? target : `http://${target}`);
            } catch {
                ctx.err.print(`curl: (3) URL rejected: Bad hostname`);
                return 3;
            }
            if (!["http:", "https:"].includes(url.protocol)) {
                ctx.err.print(`curl: (1) Protocol "${url.protocol.slice(0, -1)}" not supported`);
                return 1;
            }
            if (!SITE_HOSTS.includes(url.hostname)) {
                ctx.err.print(`curl: (6) Could not resolve host: ${url.hostname}`);
                return 6;
            }
            ctx.out.print(PAGE);
            return 0;
        },
    },
};
