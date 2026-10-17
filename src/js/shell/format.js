const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const pad = (n, width = 2) => String(n).padStart(width, "0");

export const time = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// Sat Oct 17 14:03:22 2026
export const formatDate = (d) =>
    `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, " ")} ${time(d)} ${d.getFullYear()}`;

// `date` output including the time zone: Sat Oct 17 14:03:22 CEST 2026
export const formatDateTz = (d) => {
    const zone =
        new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
            .formatToParts(d)
            .find((p) => p.type === "timeZoneName")?.value ?? "UTC";
    return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, " ")} ${time(d)} ${zone} ${d.getFullYear()}`;
};

// ls -l style: "Oct 17 14:03"
export const formatLsDate = (d) =>
    `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, " ")} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const formatDuration = (ms) => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "less than a minute";
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
};
