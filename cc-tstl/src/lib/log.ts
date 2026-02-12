export enum LogLevel {
    TRACE = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
}

// Logging configuration
export const LOG_LEVEL: LogLevel = LogLevel.TRACE;
export const LOG_INCLUDE_LINE: boolean = true;
export const LOG_INCLUDE_FUNCTION: boolean = false;

const levelNames: string[] = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

type CallerInfo = {
    line?: number;
    func?: string;
};

const getCallerInfo = (depth: number): CallerInfo => {
    if (
        (!LOG_INCLUDE_LINE && !LOG_INCLUDE_FUNCTION) ||
        type(debug) !== "table" ||
        debug.getinfo === undefined
    ) {
        return {};
    }

    const info = debug.getinfo(depth, "Slfn") as any;
    if (!info) return {};

    return {
        line: LOG_INCLUDE_LINE ? (info.currentline as number | undefined) : undefined,
        func: LOG_INCLUDE_FUNCTION
            ? ((info.name as string | undefined) ??
                  (info.what as string | undefined))
            : undefined,
    };
};

const formatCallerInfo = (caller: CallerInfo): string => {
    const parts: string[] = [];
    if (caller.line !== undefined) {
        parts.push(tostring(caller.line));
    }
    const location = parts.length > 0 ? ` (${parts.join(":")})` : "";
    const funcPart =
        caller.func !== undefined ? ` ${caller.func}` : "";
    return `${funcPart}${location}`;
};

const shouldLog = (level: LogLevel) => level >= LOG_LEVEL;

const logInternal = (level: LogLevel, message: unknown, loggerName?: string) => {
    if (!shouldLog(level)) return;

    const name = levelNames[level] ?? "INFO";
    const caller = getCallerInfo(4);
    const suffix = formatCallerInfo(caller);
    const prefix = loggerName ? `[${loggerName}] ` : "";
    print(`[${name}] ${prefix}${tostring(message)}${suffix}`);
};

export class Logger {
    public readonly name: string;

    constructor(name: string) {
        this.name = name;
    }

    public trace(message: unknown) {
        logInternal(LogLevel.TRACE, message, this.name);
    }

    public debug(message: unknown) {
        logInternal(LogLevel.DEBUG, message, this.name);
    }

    public info(message: unknown) {
        logInternal(LogLevel.INFO, message, this.name);
    }

    public warn(message: unknown) {
        logInternal(LogLevel.WARN, message, this.name);
    }

    public error(message: unknown) {
        logInternal(LogLevel.ERROR, message, this.name);
    }
}
