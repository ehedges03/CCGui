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
export const LOG_INCLUDE_SOURCE: boolean = true;
export const LOG_INCLUDE_FUNCTION: boolean = false;
let whatInfo = "";
export function updateWhatInfo() {
    whatInfo = "";
    if (LOG_INCLUDE_LINE) {
        whatInfo += "l";
    }
    if (LOG_INCLUDE_FUNCTION) {
        whatInfo += "n";
    }
    if (LOG_INCLUDE_SOURCE) {
        whatInfo += "S";
    }
}

updateWhatInfo();

const levelNames: string[] = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

type CallerInfo = ReturnType<typeof debug.getinfo> & {
    calculatedLine?: number;
    calculatedFile?: string;
};

const getCallerInfo = (depth: number): CallerInfo => {
    if (
        (!LOG_INCLUDE_LINE && !LOG_INCLUDE_FUNCTION) ||
        type(debug) !== "table" ||
        debug.getinfo === undefined
    ) {
        return {};
    }

    const info = debug.getinfo(depth, whatInfo);
    if (!info) return {};
    let line = info.currentline;
    let file = info.short_src;
    if (line && file && _G.__TS__sourcemap) {
        let tsLine = _G.__TS__sourcemap[file][tostring(line)];
        if (tsLine) {
            line = typeof tsLine === "object" ? tsLine.line : tsLine;
            file = file.split(".")[0] + ".ts";
        }
    }

    return {
        ...info,
        calculatedLine: line,
        calculatedFile: file,
    };
};

const formatCallerInfo = (caller: CallerInfo): string => {
    const parts: string[] = [];
    if (caller.calculatedFile !== undefined) {
        parts.push(tostring(caller.calculatedFile));
    }
    if (caller.calculatedLine !== undefined) {
        parts.push(tostring(caller.calculatedLine));
    }
    const location = parts.length > 0 ? ` (${parts.join(":")})` : "";
    const funcPart = caller.name !== undefined ? ` ${caller.func}` : "";
    return `${funcPart}${location}`;
};

const shouldLog = (level: LogLevel) => level >= LOG_LEVEL;

const logInternal = (
    level: LogLevel,
    message: unknown,
    loggerName?: string,
) => {
    if (!shouldLog(level)) return;

    const name = levelNames[level] ?? "INFO";
    const caller = getCallerInfo(4);
    const suffix = formatCallerInfo(caller);
    const prefix = loggerName ? `[${loggerName}] ` : "";
    print(`[${name}] ${prefix}${tostring(message)}${suffix}`);
};

export class Logger {
    public readonly name: string;

    constructor(name: string, sourceName?: string) {
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
