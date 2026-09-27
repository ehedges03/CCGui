import * as log from "./log";

declare const _CC_VERSION: string | undefined;

const MIN_CC_VERSION = "1.85.0";

function versionToParts(version: string): [number, number, number] {
    const parts = version.split(".");
    return [
        parseInt(parts[0] ?? "0"),
        parseInt(parts[1] ?? "0"),
        parseInt(parts[2] ?? "0"),
    ];
}

function requireMinVersion(minVersion: string): void {
    let version: string | undefined;
    if (_CC_VERSION) {
        version = _CC_VERSION;
        log.debug(
            "resolved version",
            "source",
            "_CC_VERSION",
            "version",
            version,
        );
    } else if (!_HOST) {
        version = string.gsub(os.version(), "CraftOS ", "")[0];
        log.debug(
            "resolved version",
            "source",
            "os.version",
            "version",
            version,
        );
    } else {
        version = string.match(_HOST, "ComputerCraft ([0-9%.]+)")[0];
        log.debug("resolved version", "source", "_HOST", "version", version);
    }
    if (!version) {
        throw "Could not determine version of ComputerCraft";
    } else {
        const versionParts = versionToParts(version);
        const minParts = versionToParts(minVersion);
        assert(
            versionParts[0] >= minParts[0] &&
                versionParts[1] >= minParts[1] &&
                versionParts[2] >= minParts[2],
            "This program requires ComputerCraft " + minVersion + " or later.",
        );
        log.info(
            "version check passed",
            "version",
            version,
            "minVersion",
            minVersion,
        );
    }
}

export function verifyVersion(): void {
    requireMinVersion(MIN_CC_VERSION);
}

const b64str =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const b64strIndex = Object.fromEntries(
    b64str.split("").map((char, index) => [char, index]),
);

export function base64encode(str: string): string {
    let retval = "";
    for (const [s] of string.gmatch(str, "...")) {
        const n =
            string.byte(s, 1) * 0x10000 +
            string.byte(s, 2) * 0x100 +
            string.byte(s, 3);
        const a = bit.extract(n, 18, 6);
        const b = bit.extract(n, 12, 6);
        const c = bit.extract(n, 6, 6);
        const d = bit.extract(n, 0, 6);
        retval +=
            b64str.charAt(a) +
            b64str.charAt(b) +
            b64str.charAt(c) +
            b64str.charAt(d);
    }
    if (str.length % 3 === 2) {
        const n = bit.lshift(
            string.byte(str, -2) * 0x100 + string.byte(str, -1),
            2,
        );
        const a = bit.extract(n, 12, 6);
        const b = bit.extract(n, 6, 6);
        const c = bit.extract(n, 0, 6);
        retval += b64str.charAt(a) + b64str.charAt(b) + b64str.charAt(c) + "=";
    } else if (str.length % 3 === 1) {
        const n = bit.lshift(string.byte(str, -1), 4);
        const a = bit.extract(n, 6, 6);
        const b = bit.extract(n, 0, 6);
        retval += b64str.charAt(a) + b64str.charAt(b) + "==";
    }
    return retval;
}

export function base64decode(str: string): string {
    let retval = "";
    for (const [s] of string.gmatch(str, "....")) {
        if (string.sub(s, 3, 4) === "==") {
            const n =
                bit.lshift(b64strIndex[string.sub(s, 1, 1)], 6) +
                b64strIndex[string.sub(s, 2, 2)];
            retval += string.char(bit.extract(n, 4, 8));
        } else if (string.sub(s, 4, 4) === "=") {
            const n =
                bit.lshift(b64strIndex[string.sub(s, 1, 1)], 12) +
                bit.lshift(b64strIndex[string.sub(s, 2, 2)], 6) +
                b64strIndex[string.sub(s, 3, 3)];
            retval +=
                string.char(bit.extract(n, 10, 8)) +
                string.char(bit.extract(n, 2, 8));
        } else {
            const n =
                bit.lshift(b64strIndex[string.sub(s, 1, 1)], 18) +
                bit.lshift(b64strIndex[string.sub(s, 2, 2)], 12) +
                bit.lshift(b64strIndex[string.sub(s, 3, 3)], 6) +
                b64strIndex[string.sub(s, 4, 4)];
            retval +=
                string.char(bit.extract(n, 16, 8)) +
                string.char(bit.extract(n, 8, 8)) +
                string.char(bit.extract(n, 0, 8));
        }
    }
    return retval;
}
