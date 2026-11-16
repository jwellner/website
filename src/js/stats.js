// Visitor stats for the self-hosted GoatCounter on beast. nginx proxies /count to it
// (docker/default.conf.template), so there is no third-party script and no cookie; GoatCounter
// itself stores no IP addresses. Page views use the URL path, commands are events.
const ENDPOINT = "/count";

function enabled() {
    const { hostname, protocol } = window.location;
    if (!protocol.startsWith("http")) return false;
    // Local builds (yarn start, docker run) have nothing behind /count.
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return false;
    // Automated browsers (headless tests, scrapers) are not visitors.
    if (navigator.webdriver) return false;
    // Respect an explicit opt-out.
    if (navigator.globalPrivacyControl || navigator.doNotTrack === "1") return false;
    return true;
}

function send(params) {
    if (!enabled()) return;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    }
    // Defeats caches between the browser and nginx.
    query.set("rnd", Math.random().toString(36).slice(2, 7));
    const url = `${ENDPOINT}?${query}`;
    try {
        if (navigator.sendBeacon?.(url)) return;
    } catch {
        // Fall through to the image request.
    }
    new Image().src = url;
}

// Only report where visitors came from when that is another site.
function externalReferrer() {
    try {
        const ref = new URL(document.referrer);
        return ref.origin === window.location.origin ? "" : ref.href;
    } catch {
        return "";
    }
}

let lastPath = null;

// A page view; repeated views of the page already counted are ignored.
export function pageview(path, title, { initial = false } = {}) {
    if (path === lastPath) return;
    lastPath = path;
    send({
        p: path,
        t: title,
        r: initial ? externalReferrer() : "",
        s: window.screen?.width,
    });
}

// A named event, e.g. a command typed in the shell. Event names must not start with "/".
export function event(name) {
    send({ p: name.replace(/^\/+/, ""), t: name, e: "true" });
}
