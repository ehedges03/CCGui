import type { RawtermDelegate, RawtermRenderTarget, RawtermServerWindow } from "./api/rawterm";

type RawtermModule = typeof import("./api/rawterm");

declare const _CC_VERSION: string | undefined;
declare const _HOST: string | undefined;
declare const arg: string[] | undefined;

const MIN_CC_VERSION = "1.85.0";
const REMOTE_WS_BASE_URL = "wss://remote.craftos-pc.cc/";
const REMOTE_HTTP_BASE_URL = "https://remote.craftos-pc.cc/";
const RAWTERM_EXPECTED_SIZE = 31339;

function versionToParts(version: string): [number, number, number] {
    const parts = version.split(".");
    return [parseInt(parts[0] ?? "0"), parseInt(parts[1] ?? "0"), parseInt(parts[2] ?? "0")];
}

function requireMinVersion(minVersion: string): void {
    let version: string | undefined;
    if (_CC_VERSION) {
        version = _CC_VERSION;
    } else if (!_HOST) {
        version = string.gsub(os.version(), "CraftOS ", "")[0];
    } else {
        version = string.match(_HOST, "ComputerCraft ([0-9%.]+)")[0];
    }    

    if (!version) {
        throw "Could not determine version of ComputerCraft";
    } else {
        const versionParts = versionToParts(version);
        const minParts = versionToParts(minVersion);
        assert(versionParts[0] >= minParts[0] && versionParts[1] >= minParts[1] && versionParts[2] >= minParts[2], "This program requires ComputerCraft " + minVersion + " or later.");
    }
}

function downloadText(url: string): string {
    const [response, errorMessage] = http.get(url);
    if (!response) {
        throw "Could not download from " + url + ": " + (errorMessage || "unknown error");
    }
    const body = response.readAll();
    response.close();
    if (!body) {
        error("Could not read response body from " + url);
    }
    return body;
}

function ensureStringPackPolyfill(): void {
    const stringLib = (globalThis as any).string as { pack?: (...args: unknown[]) => string };
    if (stringLib?.pack) return;
    if (!fs.exists("string_pack.lua")) {
        print("Downloading string.pack polyfill...");
        const source = downloadText(REMOTE_HTTP_BASE_URL + "string_pack.lua");
        const [handle, openError] = fs.open("string_pack.lua", "w");
        if (!handle) {
            error("Could not open string_pack.lua for writing: " + openError);
        }
        handle.write(source);
        handle.close();
    }
    const packModule = dofile("string_pack.lua") as Record<string, unknown>;
    for (const [name, value] of pairs(packModule)) {
        (stringLib as any)[name] = value;
    }
}

function loadRawtermModule(): RawtermModule {
    let rawtermModule: RawtermModule | undefined;
    if (!fs.exists("rawterm.lua") || fs.getSize("rawterm.lua") !== RAWTERM_EXPECTED_SIZE) {
        print("Downloading rawterm API...");
        const source = downloadText(REMOTE_HTTP_BASE_URL + "rawterm.lua");
        if (fs.getFreeSpace("/") >= source.length + 4096) {
            const [handle, openError] = fs.open("rawterm.lua", "w");
            if (!handle) {
                error("Could not open rawterm.lua for writing: " + openError);
            }
            handle.write(source);
            handle.close();
        } else {
            const loader = assert(load(source, "@rawterm.lua", "t")) as unknown as () => RawtermModule;
            rawtermModule = loader();
        }
    }
    return rawtermModule ?? (dofile("rawterm.lua") as RawtermModule);
}

function wrapDelegate(base: RawtermDelegate): RawtermDelegate {
    const baseClose = base.close;
    const baseReceive = base.receive;
    const baseSend = base.send;
    let isOpen = true;

    return {
        close: () => {
            isOpen = false;
            return baseClose ? baseClose.call(base) : undefined;
        },
        receive: (timeout?: number) => {
            if (!isOpen) return undefined;
            let packet = "";
            let expectedLength: number | undefined;
            while (expectedLength === undefined || packet.length < expectedLength + 16 + (string.sub(packet, 1, 4) === "!CPD" ? 8 : 0)) {
                let [ok, rawResult] = pcall(baseReceive, base, timeout);
                while (!ok && typeof rawResult === "string" && string.match(rawResult, "Terminated$")) {
                    [ok, rawResult] = pcall(baseReceive, base, timeout);
                }
                if (!ok) error(rawResult as string);
                if (!rawResult) return undefined;
                const result = rawResult as string;
                if (expectedLength === undefined) {
                    const longPattern = "!CPD(" + string.rep("%x", 12) + ")";
                    expectedLength = tonumber(
                        string.match(result, "!CPC(%x%x%x%x)") ??
                            string.match(result, longPattern) ??
                            "",
                        16
                    );
                }
                if (expectedLength !== undefined) {
                    packet = packet + string.gsub(result, "\n", "")[0];
                }
            }
            return packet + "\n";
        },
        send: (data: string) => {
            if (!isOpen) return;
            for (let offset = 1; offset <= data.length; offset += 65530) {
                baseSend.call(base, string.sub(data, offset, math.min(offset + 65529, data.length)));
            }
        }
    };
}

interface MonitorEntry {
    id: number;
    name: string;
    window: RawtermServerWindow;
}

function packEvent(...values: unknown[]): LuaMultiReturn<any[]> & { n: number } {
    return table.pack(...values) as unknown as LuaMultiReturn<any[]> & { n: number };
}

requireMinVersion(MIN_CC_VERSION);
ensureStringPackPolyfill();

const rawterm = loadRawtermModule();
const args = table.pack(...(arg || []));
const serverId = args[1] as string;
const programName = args[2] as string | undefined;

print("Connecting to " + REMOTE_WS_BASE_URL + "...");
const [baseDelegate, connectError] = rawterm.wsDelegate(REMOTE_WS_BASE_URL + serverId);
if (!baseDelegate) {
    error("Could not connect to server: " + connectError);
}
const delegate = wrapDelegate(baseDelegate);

const basePeripheralCall = peripheral.call;

function createPeripheralHost(name: string): Record<string, (...args: unknown[]) => unknown> {
    const methodNames = peripheral.getMethods(name) || [];
    const host: Record<string, (...args: unknown[]) => unknown> = {};
    for (const methodName of methodNames) {
        host[methodName] = (...args: unknown[]) => basePeripheralCall(name, methodName, ...args);
    }
    return host;
}

const [termWidth, termHeight] = term.getSize();
const mainWindow = rawterm.server(
    delegate,
    termWidth,
    termHeight,
    0,
    "ComputerCraft Remote Terminal: " + (os.computerLabel() || "Computer " + os.computerID()),
    term.current() as unknown as RawtermRenderTarget
);
mainWindow.setVisible(false);

const monitorsByName: Record<string, MonitorEntry> = {};
let nextMonitorId = 1;
let isConnected = true;
let refreshTimerId: number | undefined;
let runtimeError: string | undefined;

function createMonitorWindow(name: string, width: number, height: number, id: number): MonitorEntry {
    const host = createPeripheralHost(name);
    const window = rawterm.server(
        delegate,
        width,
        height,
        id,
        "ComputerCraft Remote Terminal: Monitor " + name,
        host as RawtermRenderTarget,
        undefined,
        undefined,
        true
    );
    window.setVisible(false);
    return { id, name, window };
}

const foundMonitors = table.pack(peripheral.find("monitor"));
for (let i = 1; i <= foundMonitors.n; i++) {
    const monitor = foundMonitors[i] as unknown as any;
    const monitorName = peripheral.getName(monitor as unknown as any);
    const [width, height] = monitor.getSize();
    monitorsByName[monitorName] = createMonitorWindow(monitorName, width, height, nextMonitorId);
    nextMonitorId += 1;
}

peripheral.call = ((name: string, method: string, ...args: unknown[]) => {
    const entry = monitorsByName[name];
    if (entry !== undefined) {
        return (entry.window as unknown as Record<string, (...args: unknown[]) => unknown>)[method](...args);
    }
    return basePeripheralCall(name, method, ...args);
}) as typeof peripheral.call;

const previousTerm = term.redirect(mainWindow as unknown as ITerminal);

const [parallelOk, parallelError] = pcall(parallel.waitForAny,
    () => {
        const shellCoroutine = coroutine.create(shell.run);
        const shellProgram = programName || (settings.get("bios.use_multishell") && "multishell") || "shell";
        let [resumeOk, resumeValue] = coroutine.resume(shellCoroutine, shellProgram);
        while (resumeOk && coroutine.status(shellCoroutine) === "suspended") {
            let event = packEvent();
            const eventFilter = resumeValue as string | undefined;
            const waiters: Array<() => void> = [
                () => {
                    event = packEvent(mainWindow.pullEvent(eventFilter, true));
                }
            ];
            for (const [name, entry] of pairs(monitorsByName)) {
                waiters.push(() => {
                    event = packEvent(entry.window.pullEvent(eventFilter, true));
                    if (event[1] === "mouse_click") {
                        event = packEvent("monitor_touch", name, event[3], event[4]);
                    } else if (
                        event[1] === "mouse_up" ||
                        event[1] === "mouse_drag" ||
                        event[1] === "mouse_scroll" ||
                        event[1] === "mouse_move"
                    ) {
                        event = packEvent();
                    }
                });
            }
            waiters.push(() => {
                while (true) {
                    event = packEvent(os.pullEventRaw(eventFilter));
                    if (
                        !(
                            (event[1] === "websocket_message" && event[2] === REMOTE_WS_BASE_URL + serverId) ||
                            (event[1] === "timer" && event[2] === refreshTimerId)
                        )
                    ) {
                        break;
                    }
                }
            });
            parallel.waitForAny(...waiters);
            if (event[1]) {
                [resumeOk, resumeValue] = coroutine.resume(shellCoroutine, table.unpack(event, 1, event.n));
            }
        }
        if (!resumeOk) runtimeError = resumeValue as string;
    },
    () => {
        while (isConnected) {
            mainWindow.setVisible(true);
            mainWindow.setVisible(false);
            for (const [, entry] of pairs(monitorsByName)) {
                entry.window.setVisible(true);
                entry.window.setVisible(false);
            }
            refreshTimerId = os.startTimer(0.05);
            let timerId: number;
            do {
                [, timerId] = os.pullEventRaw("timer") as LuaMultiReturn<[string, number]>;
            } while (timerId !== refreshTimerId);
        }
    },
    () => {
        while (true) {
            const [eventName, peripheralName] = os.pullEventRaw() as LuaMultiReturn<[string, string]>;
            const peripheralType = peripheral.getType(peripheralName) as unknown as string;
            if (eventName === "peripheral" && peripheralType === "monitor" && !monitorsByName[peripheralName]) {
                const [width, height] = basePeripheralCall(peripheralName, "getSize") as LuaMultiReturn<[number, number]>;
                monitorsByName[peripheralName] = createMonitorWindow(peripheralName, width, height, nextMonitorId);
                nextMonitorId += 1;
            } else if (eventName === "peripheral_detach" && monitorsByName[peripheralName]) {
                monitorsByName[peripheralName].window.close();
                delete (monitorsByName as Record<string, MonitorEntry | undefined>)[peripheralName];
            } else if (eventName === "term_resize") {
                const [width, height] = term.getSize();
                mainWindow.reposition(undefined, undefined, width, height);
            } else if (eventName === "monitor_resize" && monitorsByName[peripheralName]) {
                const [width, height] = basePeripheralCall(peripheralName, "getSize") as LuaMultiReturn<[number, number]>;
                monitorsByName[peripheralName].window.reposition(undefined, undefined, width, height);
            } else if (eventName === "websocket_closed" && peripheralName === REMOTE_WS_BASE_URL + serverId) {
                isConnected = false;
            }
        }
    }
);
if (!parallelOk) {
    runtimeError = parallelError as string;
}

term.redirect(previousTerm);
for (const [, entry] of pairs(monitorsByName)) {
    entry.window.close();
}
mainWindow.close();
peripheral.call = basePeripheralCall;
shell.run("clear");
if (runtimeError && !string.match(runtimeError, "attempt to use closed file")) {
    printError(runtimeError);
}
