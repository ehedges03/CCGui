export type LogAttrValue = string | number | boolean | undefined | object | unknown;

export enum LogLevel {
    TRACE = -8,
    DEBUG = -4,
    INFO = 0,
    WARN = 4,
    ERROR = 8,
}

// Logging configuration
export let LOG_LEVEL: LogLevel = LogLevel.DEBUG;

const levelNames: Record<LogLevel, string> = {
    [LogLevel.TRACE]: "TRACE",
    [LogLevel.DEBUG]: "DEBUG",
    [LogLevel.INFO]: "INFO",
    [LogLevel.WARN]: "WARN",
    [LogLevel.ERROR]: "ERROR",
};

const luaDebug = debug;

type CallerInfo = ReturnType<typeof luaDebug.getinfo> & {
    calculatedLine?: number;
    calculatedFile?: string;
};

function setLogLevel(level: LogLevel): void {
    LOG_LEVEL = level;
}

const stripLuaSourcePrefix = (path: string): string => {
    const [stripped] = string.gsub(path, "^@", "");
    return stripped;
};

const toTsPath = (luaPath: string): string => {
    const [tsPath] = string.gsub(luaPath, "%.lua$", ".ts");
    return tsPath;
};

const sourceBasename = (path: string): string => {
    const match = string.match(path, "([^/]+)$");
    if (match !== undefined && match[0] !== undefined) {
        return match[0];
    }
    return path;
};

const startsWith = (value: string, prefix: string): boolean => {
    return string.sub(value, 1, prefix.length) === prefix;
};

const stripPrefix = (value: string, prefix: string): string => {
    if (startsWith(value, prefix)) {
        return string.sub(value, prefix.length + 1);
    }
    return value;
};

const stripProjectRoot = (path: string): string => {
    let normalized = path;
    while (startsWith(normalized, "/")) {
        normalized = string.sub(normalized, 2);
    }

    normalized = stripPrefix(normalized, "@cc-tstl/");
    normalized = stripPrefix(normalized, "cc-tstl/");

    return normalized;
};

const normalizeSourcePath = (path: string): string => {
    return stripProjectRoot(toTsPath(stripLuaSourcePrefix(path)));
};

const isUsableSourcePath = (path: string | undefined): boolean => {
    if (path === undefined || path === "") {
        return false;
    }
    return path !== ".lua" && string.match(path, "[^/%.]") !== undefined;
};

const isLogInternalSource = (path: string): boolean => {
    const base = sourceBasename(toTsPath(path));
    return base === "log.ts" || base === "log.lua";
};

const resolveCallerFrame = (
    info: NonNullable<ReturnType<typeof luaDebug.getinfo>>,
): CallerInfo => {
    let line = info.currentline;
    let file = stripLuaSourcePrefix(info.source ?? info.short_src ?? "");

    if (!isUsableSourcePath(file)) {
        return {
            ...info,
            calculatedLine: line,
            calculatedFile: undefined,
        };
    }

    const sourcemap = _G.__TS__sourcemap;
    if (line && sourcemap) {
        const lookupKeys = [
            file,
            stripLuaSourcePrefix(info.short_src ?? ""),
        ];
        let fileMap: Record<string, unknown> | undefined;
        for (const key of lookupKeys) {
            if (isUsableSourcePath(key) && sourcemap[key]) {
                fileMap = sourcemap[key] as Record<string, unknown>;
                break;
            }
        }

        if (fileMap) {
            const tsLine = fileMap[tostring(line)];
            if (tsLine !== undefined) {
                if (typeof tsLine === "number") {
                    line = tsLine;
                    file = toTsPath(file);
                } else if (
                    typeof tsLine === "object" &&
                    tsLine !== null &&
                    (tsLine as { line?: number }).line !== undefined
                ) {
                    const mapped = tsLine as { line: number; file?: string };
                    line = mapped.line;
                    file = mapped.file ?? toTsPath(file);
                } else {
                    file = toTsPath(file);
                }
            } else {
                file = toTsPath(file);
            }
        } else {
            file = toTsPath(file);
        }
    } else {
        file = toTsPath(file);
    }

    return {
        ...info,
        calculatedLine: line,
        calculatedFile: normalizeSourcePath(file),
    };
};

const getCallerInfo = (): CallerInfo => {
    if (type(luaDebug) !== "table" || luaDebug.getinfo === undefined) {
        return {};
    }

    for (let depth = 3; depth <= 12; depth++) {
        const info = luaDebug.getinfo(depth, "Sl");
        if (!info) {
            break;
        }

        const file = stripLuaSourcePrefix(info.source ?? info.short_src ?? "");
        if (!isUsableSourcePath(file) || isLogInternalSource(file)) {
            continue;
        }

        return resolveCallerFrame(info);
    }

    return {};
};

const formatSource = (caller: CallerInfo): string | undefined => {
    const parts: string[] = [];
    if (caller.calculatedFile !== undefined) {
        parts.push(tostring(caller.calculatedFile));
    }
    if (caller.calculatedLine !== undefined) {
        parts.push(tostring(caller.calculatedLine));
    }
    if (parts.length === 0) {
        return undefined;
    }
    return parts.join(":");
};

const shouldLog = (level: LogLevel) => level >= LOG_LEVEL;

const escapeString = (value: string): string => {
    const [result] = string.gsub(value, '"', '\\"');
    return result;
};

const needsQuoting = (value: string): boolean => {
    return (
        value === "" ||
        string.find(value, " ") !== undefined ||
        string.find(value, "=") !== undefined ||
        string.find(value, '"') !== undefined
    );
};

const serializeLogValue = (value: LogAttrValue): string => {
    if (value === undefined) {
        return "";
    }

    const valueType = type(value);
    if (valueType === "boolean" || valueType === "number") {
        return tostring(value);
    }
    if (valueType === "string") {
        return value as string;
    }
    if (valueType === "table") {
        const [ok, serialized] = pcall(() => textutils.serialiseJSON(value));
        if (ok && typeof serialized === "string") {
            return serialized;
        }
    }

    return tostring(value);
};

const formatAttrValue = (value: LogAttrValue): string => {
    if (value === undefined) {
        return '""';
    }

    const serialized = serializeLogValue(value);
    if (needsQuoting(serialized)) {
        return `"${escapeString(serialized)}"`;
    }
    return serialized;
};

const collectAttrs = (
    boundAttrs: Record<string, LogAttrValue>,
    pairs: LogAttrValue[],
): Record<string, LogAttrValue> => {
    const attrs: Record<string, LogAttrValue> = { ...boundAttrs };
    for (let i = 0; i < pairs.length; i += 2) {
        const key = pairs[i];
        const value = pairs[i + 1];
        if (typeof key === "string") {
            attrs[key] = value;
        }
    }
    return attrs;
};

const formatTimestamp = (): string => {
    return tostring(os.date("!%Y-%m-%dT%H:%M:%SZ"));
};

const formatMessage = (message: LogAttrValue): string => {
    return serializeLogValue(message);
};

const formatLogRecord = (
    level: LogLevel,
    message: string,
    attrs: Record<string, LogAttrValue>,
): string => {
    const parts = [
        `time=${formatTimestamp()}`,
        `level=${levelNames[level]}`,
        `msg=${formatAttrValue(message)}`,
    ];

    for (const [key, value] of Object.entries(attrs)) {
        parts.push(`${key}=${formatAttrValue(value)}`);
    }

    return parts.join(" ");
};

const logInternal = (
    level: LogLevel,
    message: LogAttrValue,
    loggerName?: string,
    boundAttrs: Record<string, LogAttrValue> = {},
    pairs: LogAttrValue[] = [],
) => {
    if (!shouldLog(level)) return;

    const attrs = collectAttrs(boundAttrs, pairs);
    if (loggerName !== undefined) {
        attrs.logger = loggerName;
    }

    const source = formatSource(getCallerInfo());
    if (source !== undefined) {
        attrs.source = source;
    }

    print(formatLogRecord(level, formatMessage(message), attrs));
};

export class Logger {
    public readonly name?: string;
    private readonly boundAttrs: Record<string, LogAttrValue>;

    constructor(name?: string, boundAttrs: Record<string, LogAttrValue> = {}) {
        this.name = name;
        this.boundAttrs = boundAttrs;
    }

    public with(key: string, value: LogAttrValue): Logger {
        return new Logger(this.name, {
            ...this.boundAttrs,
            [key]: value,
        });
    }

    public trace(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        logInternal(LogLevel.TRACE, message, this.name, this.boundAttrs, attrs);
    }

    public debug(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        logInternal(LogLevel.DEBUG, message, this.name, this.boundAttrs, attrs);
    }

    public info(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        logInternal(LogLevel.INFO, message, this.name, this.boundAttrs, attrs);
    }

    public warn(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        logInternal(LogLevel.WARN, message, this.name, this.boundAttrs, attrs);
    }

    public error(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        logInternal(LogLevel.ERROR, message, this.name, this.boundAttrs, attrs);
    }
}

let defaultLogger = new Logger();

export function setDefault(logger: Logger): void {
    defaultLogger = logger;
}

export function getDefault(): Logger {
    return defaultLogger;
}

export const log = {
    setLevel: setLogLevel,
    trace(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        defaultLogger.trace(message, ...attrs);
    },
    debug(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        defaultLogger.debug(message, ...attrs);
    },
    info(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        defaultLogger.info(message, ...attrs);
    },
    warn(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        defaultLogger.warn(message, ...attrs);
    },
    error(message: LogAttrValue, ...attrs: LogAttrValue[]) {
        defaultLogger.error(message, ...attrs);
    },
    withComponent(component: string): Logger {
        return getDefault().with("component", component);
    },
};
