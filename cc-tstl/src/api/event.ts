// You may comment out any events you don't need to save space. Make sure to
// delete them from eventInitializers as well.
// import { running } from "../main";
import { z, type Schema } from "../zod-lite";
import type { MetricsData, ResourceMetrics } from "./metrics";

const parseEventArgs = <T>(args: unknown[], schema: Schema<T>): T => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
        throw "Invalid event type";
    }
    return parsed.data;
};

export interface IEvent {
    get_name(): string;
    get_args(): any[];
}

class BaseEvent {
    static TYPES: string[] = [];
    static init(args: any[]): any { return new this(); }
}

let eventInitializers: Record<string, (args: unknown[]) => IEvent | undefined> = {};
function addEventInit<T extends typeof BaseEvent>(eventClass: T): void {
    eventClass.TYPES.forEach((type) => {
        if (eventInitializers[type] !== undefined) {
            throw "event of type " + type + " has already been defined"
        }
        eventInitializers[type] = eventClass.init;
    })
}


const charArgsSchema = z.literalArray([z.literal("char"), z.string()]);

export class CharEvent implements IEvent {
    public static TYPES = ["char"];
    public character: string = "";
    public get_name() {
        return "char";
    }
    public get_args() {
        return [this.character];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, character] = parseEventArgs(args, charArgsSchema);
        let ev = new CharEvent();
        ev.character = character;
        return ev;
    }
}
addEventInit(CharEvent);

const keyArgsSchema = z.union([
    z.literalArray([z.literal("key"), z.number(), z.boolean().optional()]),
    z.literalArray([z.literal("key_up"), z.number()]),
]);

export class KeyEvent implements IEvent {
    public static TYPES = ["key", "key_up"];
    public key: Key = 0;
    public isHeld: boolean = false;
    public isUp: boolean = false;
    public get_name() {
        return this.isUp ? "key_up" : "key";
    }
    public get_args() {
        return [this.key, this.isUp ? undefined : this.isHeld];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [name, key, isHeld] = parseEventArgs(args, keyArgsSchema);
        let ev = new KeyEvent();
        ev.key = key;
        ev.isUp = name == "key_up";
        ev.isHeld = ev.isUp ? false : (isHeld ?? false);
        return ev;
    }
}
addEventInit(KeyEvent);

const pasteArgsSchema = z.literalArray([z.literal("paste"), z.string()]);

export class PasteEvent implements IEvent {
    public static TYPES = ["paste"];
    public text: string = "";
    public get_name() {
        return "paste";
    }
    public get_args() {
        return [this.text as any];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, text] = parseEventArgs(args, pasteArgsSchema);
        let ev = new PasteEvent();
        ev.text = text;
        return ev;
    }
}
addEventInit(PasteEvent);

const timerArgsSchema = z.union([
    z.literalArray([z.literal("timer"), z.number()]),
    z.literalArray([z.literal("alarm"), z.number()]),
]);

export class TimerEvent implements IEvent {
    public static TYPES = ["timer", "alarm"];
    public id: number = 0;
    public isAlarm: boolean = false;
    public get_name() {
        return this.isAlarm ? "alarm" : "timer";
    }
    public get_args() {
        return [this.id];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [name, id] = parseEventArgs(args, timerArgsSchema);
        let ev = new TimerEvent();
        ev.id = id;
        ev.isAlarm = name == "alarm";
        return ev;
    }
}
addEventInit(TimerEvent);

const taskCompleteSuccessArgsSchema = z.literalArray([
    z.literal("task_complete"),
    z.number(),
    z.literal(true),
]);
const taskCompleteFailureArgsSchema = z.literalArray([
    z.literal("task_complete"),
    z.number(),
    z.literal(false),
    z.string().optional(),
]);
const taskCompleteArgsSchema = z.union([
    taskCompleteSuccessArgsSchema,
    taskCompleteFailureArgsSchema,
]);

export class TaskCompleteEvent implements IEvent {
    public static TYPES = ["task_complete"];
    public id: number = 0;
    public success: boolean = false;
    public error: string | undefined = undefined;
    public params: any[] = [];
    public get_name() {
        return "task_complete";
    }
    public get_args() {
        if (this.success) return [this.id, this.success].concat(this.params);
        else return [this.id, this.success, this.error];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, id, success, error] = parseEventArgs(
            args,
            taskCompleteArgsSchema,
        );
        let ev = new TaskCompleteEvent();
        ev.id = id;
        ev.success = success;
        if (ev.success) {
            ev.error = undefined;
            ev.params = args.slice(3);
        } else {
            ev.error = error ?? "";
            ev.params = [];
        }
        return ev;
    }
}
addEventInit(TaskCompleteEvent);

const redstoneArgsSchema = z.literalArray([z.literal("redstone")]);

export class RedstoneEvent implements IEvent {
    public static TYPES = ["redstone"];
    public get_name() {
        return "redstone";
    }
    public get_args() {
        return [];
    }
    public static init(args: unknown[]): IEvent | undefined {
        parseEventArgs(args, redstoneArgsSchema);
        let ev = new RedstoneEvent();
        return ev;
    }
}
addEventInit(RedstoneEvent);

const terminateArgsSchema = z.literalArray([z.literal("terminate")]);

export class TerminateEvent implements IEvent {
    public static TYPES = ["terminate"];
    public get_name() {
        return "terminate";
    }
    public get_args() {
        return [];
    }
    public static init(args: unknown[]): IEvent | undefined {
        parseEventArgs(args, terminateArgsSchema);
        let ev = new TerminateEvent();
        return ev;
    }
}
addEventInit(TerminateEvent);

const diskArgsSchema = z.union([
    z.literalArray([z.literal("disk"), z.string()]),
    z.literalArray([z.literal("disk_eject"), z.string()]),
]);

export class DiskEvent implements IEvent {
    public static TYPES = ["disk", "disk_eject"];
    public side: string = "";
    public eject: boolean = false;
    public get_name() {
        return this.eject ? "disk_eject" : "disk";
    }
    public get_args() {
        return [this.side];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [name, side] = parseEventArgs(args, diskArgsSchema);
        let ev = new DiskEvent();
        ev.side = side;
        ev.eject = name == "disk_eject";
        return ev;
    }
}
addEventInit(DiskEvent);

const peripheralArgsSchema = z.union([
    z.literalArray([z.literal("peripheral"), z.string()]),
    z.literalArray([z.literal("peripheral_detach"), z.string()]),
]);

export class PeripheralEvent implements IEvent {
    public static TYPES = ["peripheral", "peripheral_detach"];
    public side: string = "";
    public detach: boolean = false;
    public get_name() {
        return this.detach ? "peripheral_detach" : "peripheral";
    }
    public get_args() {
        return [this.side];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [name, side] = parseEventArgs(args, peripheralArgsSchema);
        let ev = new PeripheralEvent();
        ev.side = side;
        ev.detach = name == "peripheral_detach";
        return ev;
    }
}
addEventInit(PeripheralEvent);

const rednetMessageArgsSchema = z.literalArray([
    z.literal("rednet_message"),
    z.number(),
    z.unknown(),
    z.string().optional(),
]);

export class RednetMessageEvent implements IEvent {
    public static TYPES = ["rednet_message"];
    public sender: number = 0;
    public message: any;
    public protocol: string | undefined = undefined;
    public get_name() {
        return "rednet_message";
    }
    public get_args() {
        return [this.sender, this.message, this.protocol];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, sender, message, protocol] = parseEventArgs(
            args,
            rednetMessageArgsSchema,
        );
        let ev = new RednetMessageEvent();
        ev.sender = sender;
        ev.message = message;
        ev.protocol = protocol;
        return ev;
    }
}
addEventInit(RednetMessageEvent);

const modemMessageArgsSchema = z.literalArray([
    z.literal("modem_message"),
    z.string(),
    z.number(),
    z.number(),
    z.unknown(),
    z.number(),
]);

export class ModemMessageEvent implements IEvent {
    public static TYPES = ["modem_message"];
    public side: string = "";
    public channel: number = 0;
    public replyChannel: number = 0;
    public message: any;
    public distance: number = 0;
    public get_name() {
        return "modem_message";
    }
    public get_args() {
        return [
            this.side,
            this.channel,
            this.replyChannel,
            this.message,
            this.distance,
        ];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, side, channel, replyChannel, message, distance] =
            parseEventArgs(args, modemMessageArgsSchema);
        let ev = new ModemMessageEvent();
        ev.side = side;
        ev.channel = channel;
        ev.replyChannel = replyChannel;
        ev.message = message;
        ev.distance = distance;
        return ev;
    }
}
addEventInit(ModemMessageEvent);

const httpSuccessArgsSchema = z.literalArray([
    z.literal("http_success"),
    z.string(),
    z.unknown(),
]);
const httpFailureArgsSchema = z.literalArray([
    z.literal("http_failure"),
    z.string(),
    z.string().optional(),
    z.unknown().optional(),
]);
const httpArgsSchema = z.union([httpSuccessArgsSchema, httpFailureArgsSchema]);

export class HTTPEvent implements IEvent {
    public static TYPES = ["http_success", "http_failure"];
    public url: string = "";
    public handle: HTTPResponse | undefined = undefined;
    public error: string | undefined = undefined;
    public get_name() {
        return this.error === undefined ? "http_success" : "http_failure";
    }
    public get_args() {
        return [
            this.url,
            this.error === undefined ? this.handle : this.error,
            this.error !== undefined ? this.handle : undefined,
        ];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [name, url, value, handle] = parseEventArgs(args, httpArgsSchema);
        let ev = new HTTPEvent();
        ev.url = url;
        if (name == "http_success") {
            ev.error = undefined;
            ev.handle = value as HTTPResponse;
        } else {
            ev.error = (value as string | undefined) ?? "";
            ev.handle = handle as HTTPResponse | undefined;
        }
        return ev;
    }
}
addEventInit(HTTPEvent);

const websocketMessageArgsSchema = z.literalArray([
    z.literal("websocket_message"),
    z.string(),
    z.string(),
    z.boolean(),
]);

export class WebSocketMessageEvent implements IEvent {
    public static TYPES = ["websocket_message"];
    public url: string = "";
    public content: string = "";
    public isBinary: boolean = false;
    public get_name() {
        return "websocket_message";
    }
    public get_args() {
        return [this.url, this.content, this.isBinary];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, url, content, isBinary] = parseEventArgs(
            args,
            websocketMessageArgsSchema,
        );
        let ev = new WebSocketMessageEvent();
        ev.url = url;
        ev.content = content;
        ev.isBinary = isBinary;
        return ev;
    }
}
addEventInit(WebSocketMessageEvent);

const websocketClosedArgsSchema = z.literalArray([
    z.literal("websocket_closed"),
    z.string(),
    z.string().optional(),
    z.number().optional(),
]);

export class WebSocketCloseEvent implements IEvent {
    public static TYPES = ["websocket_closed"];
    public url: string = "";
    public reason: string | undefined = undefined;
    public code: number | undefined = undefined;
    public get_name() {
        return "websocket_closed";
    }
    public get_args() {
        return [this.url, this.reason, this.code];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, url, reason, code] = parseEventArgs(
            args,
            websocketClosedArgsSchema,
        );
        let ev = new WebSocketCloseEvent();
        ev.url = url;
        ev.reason = reason;
        ev.code = code;
        return ev;
    }
}
addEventInit(WebSocketCloseEvent);

const websocketSuccessArgsSchema = z.literalArray([
    z.literal("websocket_success"),
    z.unknown(),
]);
const websocketFailureArgsSchema = z.literalArray([
    z.literal("websocket_failure"),
    z.string().optional(),
]);
const websocketArgsSchema = z.union([
    websocketSuccessArgsSchema,
    websocketFailureArgsSchema,
]);

export class WebSocketConnectEvent implements IEvent {
    public static TYPES = ["websocket_success", "websocket_failure"];
    public handle: WebSocket | undefined = undefined;
    public error: string | undefined = undefined;
    public get_name() {
        return this.error === undefined
            ? "websocket_success"
            : "websocket_failure";
    }
    public get_args() {
        return [this.handle === undefined ? this.error : this.handle];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [name, value] = parseEventArgs(args, websocketArgsSchema);
        let ev = new WebSocketConnectEvent();
        if (name == "websocket_success") {
            ev.handle = value as WebSocket;
            ev.error = undefined;
        } else {
            ev.error = (value as string | undefined) ?? "";
            ev.handle = undefined;
        }
        return ev;
    }
}
addEventInit(WebSocketConnectEvent);

export enum MouseEventType {
    Click,
    Up,
    Scroll,
    Drag,
    Touch,
    Move,
}

const mouseArgsSchema = z.union([
    z.literalArray([
        z.literal("mouse_click"),
        z.number(),
        z.number(),
        z.number(),
    ]),
    z.literalArray([z.literal("mouse_up"), z.number(), z.number(), z.number()]),
    z.literalArray([
        z.literal("mouse_scroll"),
        z.number(),
        z.number(),
        z.number(),
    ]),
    z.literalArray([
        z.literal("mouse_drag"),
        z.number(),
        z.number(),
        z.number(),
    ]),
    z.literalArray([
        z.literal("monitor_touch"),
        z.string(),
        z.number(),
        z.number(),
    ]),
    z.literalArray([
        z.literal("mouse_move"),
        z.number(),
        z.number(),
        z.number(),
    ]),
]);

export class MouseEvent implements IEvent {
    public static TYPES = [
        "mouse_click",
        "mouse_up",
        "mouse_scroll",
        "mouse_drag",
        "monitor_touch",
        "mouse_move",
    ];
    public button: number = 0;
    public x: number = 0;
    public y: number = 0;
    public side: string | undefined = undefined;
    public type: MouseEventType = MouseEventType.Click;
    public get_name() {
        return {
            [MouseEventType.Click]: "mouse_click",
            [MouseEventType.Up]: "mouse_up",
            [MouseEventType.Scroll]: "mouse_scroll",
            [MouseEventType.Drag]: "mouse_drag",
            [MouseEventType.Touch]: "monitor_touch",
            [MouseEventType.Move]: "mouse_move",
        }[this.type];
    }
    public get_args() {
        return [
            this.type == MouseEventType.Touch ? this.side : this.button,
            this.x,
            this.y,
        ];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [type, first, x, y] = parseEventArgs(args, mouseArgsSchema);
        let ev = new MouseEvent();

        if (type == "mouse_click") {
            ev.type = MouseEventType.Click;
            ev.button = first as number;
            ev.side = undefined;
        } else if (type == "mouse_up") {
            ev.type = MouseEventType.Up;
            ev.button = first as number;
            ev.side = undefined;
        } else if (type == "mouse_scroll") {
            ev.type = MouseEventType.Scroll;
            ev.button = first as number;
            ev.side = undefined;
        } else if (type == "mouse_drag") {
            ev.type = MouseEventType.Drag;
            ev.button = first as number;
            ev.side = undefined;
        } else if (type == "monitor_touch") {
            ev.type = MouseEventType.Touch;
            ev.button = 0;
            ev.side = first as string;
        } else if (type == "mouse_move") {
            ev.type = MouseEventType.Move;
            ev.button = first as number;
            ev.side = undefined;
        } else throw "Invalid event type";
        ev.x = x;
        ev.y = y;
        return ev;
    }
}
addEventInit(MouseEvent);

const resizeArgsSchema = z.union([
    z.literalArray([z.literal("term_resize")]),
    z.literalArray([z.literal("monitor_resize"), z.string()]),
]);

export class ResizeEvent implements IEvent {
    public static TYPES = ["term_resize", "monitor_resize"];
    public side: string | undefined = undefined;
    public get_name() {
        return this.side === undefined ? "term_resize" : "monitor_resize";
    }
    public get_args() {
        return [this.side];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [name, side] = parseEventArgs(args, resizeArgsSchema);
        let ev = new ResizeEvent();
        if (name == "monitor_resize") {
            ev.side = side;
        } else {
            ev.side = undefined;
        }
        return ev;
    }
}
addEventInit(ResizeEvent);

const turtleInventoryArgsSchema = z.literalArray([
    z.literal("turtle_inventory"),
]);

export class TurtleInventoryEvent implements IEvent {
    public static TYPES = ["turtle_inventory"];
    public get_name() {
        return "turtle_inventory";
    }
    public get_args() {
        return [];
    }
    public static init(args: unknown[]): IEvent | undefined {
        parseEventArgs(args, turtleInventoryArgsSchema);
        let ev = new TurtleInventoryEvent();
        return ev;
    }
}
addEventInit(TurtleInventoryEvent);

const speakerAudioEmptyArgsSchema = z.literalArray([
    z.literal("speaker_audio_empty"),
    z.string(),
]);

class SpeakerAudioEmptyEvent implements IEvent {
    public static TYPES = ["speaker_audio_empty"];
    public side: string = "";
    public get_name() {
        return "speaker_audio_empty";
    }
    public get_args() {
        return [this.side];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, side] = parseEventArgs(args, speakerAudioEmptyArgsSchema);
        let ev: SpeakerAudioEmptyEvent = new SpeakerAudioEmptyEvent();
        ev.side = side;
        return ev;
    }
}
addEventInit(SpeakerAudioEmptyEvent);

const computerCommandArgsSchema = z.literalArray([
    z.literal("computer_command"),
]);

class ComputerCommandEvent implements IEvent {
    public static TYPES = ["computer_command"];
    public args: string[] = [];
    public get_name() {
        return "computer_command";
    }
    public get_args() {
        return this.args;
    }
    public static init(args: unknown[]): IEvent | undefined {
        parseEventArgs(args, computerCommandArgsSchema);
        let ev: ComputerCommandEvent = new ComputerCommandEvent();
        ev.args = args.slice(1) as string[];
        return ev;
    }
}
addEventInit(ComputerCommandEvent);

/*
class Event implements IEvent {
    
    public get_name() {return "";}
    public get_args() {return [(: any)];}
    public static init(args: any[]): IEvent | undefined {
        if (!(typeof args[0] === "string") || (args[0] as string) != "")
            return undefined;
        let ev: Event;

        return ev;
    }
}
*/

export class GenericEvent implements IEvent {
    public args: unknown[] = [];
    public get_name() {
        return this.args[0] as string;
    }
    public get_args() {
        return this.args.slice(1);
    }
    public static init(args: unknown[]): IEvent {
        let ev = new GenericEvent();
        ev.args = args;
        return ev;
    }
}

export class LogLevel {
    public static readonly TRACE = new LogLevel(0, "TRACE");
    public static readonly DEBUG = new LogLevel(1, "DEBUG");
    public static readonly INFO = new LogLevel(2, "INFO");
    public static readonly WARNING = new LogLevel(3, "WARNING");
    public static readonly ERROR = new LogLevel(4, "ERROR");
    public static readonly CRITICAL = new LogLevel(5, "CRITICAL");

    private static readonly LEVELS = [
        LogLevel.DEBUG,
        LogLevel.INFO,
        LogLevel.WARNING,
        LogLevel.ERROR,
    ];
    public static fromLevel(level: number): LogLevel {
        if (level < 0 || level >= LogLevel.LEVELS.length) {
            throw new Error(`Invalid log level: ${level}`);
        }
        return LogLevel.LEVELS[level];
    }

    private constructor(
        private readonly level: number,
        private readonly name: string,
    ) {}

    public getLevel(): number {
        return this.level;
    }

    public getName(): string {
        return this.name;
    }
}

const logArgsSchema = z.literalArray([
    z.literal("log"),
    z.number(),
    z.string(),
    z.unknown().optional(),
    z.array(z.unknown()).optional(),
]);

export class LogEvent implements IEvent {
    public static TYPES = ["log"];
    public level: LogLevel = LogLevel.DEBUG;
    public message: string = "";
    public info?: Partial<debug.FunctionInfo>;
    public trace?: Partial<debug.FunctionInfo>[];
    public get_name() {
        return "log";
    }
    public get_args() {
        return [this.level.getLevel(), this.message, this.info, this.trace];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, level, message, info, trace] = parseEventArgs(
            args,
            logArgsSchema,
        );
        let ev = new LogEvent();
        ev.level = LogLevel.fromLevel(level);
        ev.message = message;
        ev.info = info as Partial<debug.FunctionInfo> | undefined;
        ev.trace = trace as Partial<debug.FunctionInfo>[] | undefined;
        return ev;
    }
    public static emit(
        level: LogLevel,
        message: string,
        info?: Partial<debug.FunctionInfo>,
        trace?: Partial<debug.FunctionInfo>[],
    ) {
        os.queueEvent("log", level, message, info, trace);
    }
}
addEventInit(LogEvent);

const metricArgsSchema = z.literalArray([
    z.literal("metric"),
    z.unknown().optional(),
]);

export class MetricEvent implements IEvent {
    public static TYPES = ["metric"];
    public data: MetricsData = { resource_metrics: [] };
    public get_name() {
        return "metric";
    }
    public get_args() {
        return [this.data];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, data] = parseEventArgs(args, metricArgsSchema);
        let ev = new MetricEvent();
        ev.data = (data as MetricsData | undefined) ?? { resource_metrics: [] };
        return ev;
    }
    public static emit(data: MetricsData) {
        os.queueEvent("metric", data);
    }
}
addEventInit(MetricEvent);

const metricRegisterArgsSchema = z.literalArray([
    z.literal("metric_register"),
    z.string(),
]);

export class MetricRegisterEvent implements IEvent {
    public static TYPES = ["metric_register"];
    public publisher_id: string = "";
    public get_name() {
        return "metric_register";
    }
    public get_args() {
        return [this.publisher_id];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, publisherId] = parseEventArgs(args, metricRegisterArgsSchema);
        let ev = new MetricRegisterEvent();
        ev.publisher_id = publisherId;
        return ev;
    }
    public static emit(publisherId: string) {
        os.queueEvent("metric_register", publisherId);
    }
}
addEventInit(MetricRegisterEvent);

const metricUnregisterArgsSchema = z.literalArray([
    z.literal("metric_unregister"),
    z.string(),
]);

export class MetricUnregisterEvent implements IEvent {
    public static TYPES = ["metric_unregister"];
    public publisher_id: string = "";
    public get_name() {
        return "metric_unregister";
    }
    public get_args() {
        return [this.publisher_id];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, publisherId] = parseEventArgs(
            args,
            metricUnregisterArgsSchema,
        );
        let ev = new MetricUnregisterEvent();
        ev.publisher_id = publisherId;
        return ev;
    }
    public static emit(publisherId: string) {
        os.queueEvent("metric_unregister", publisherId);
    }
}
addEventInit(MetricUnregisterEvent);

const metricCollectArgsSchema = z.literalArray([
    z.literal("metric_collect"),
    z.number(),
    z.number(),
]);

export class MetricCollectEvent implements IEvent {
    public static TYPES = ["metric_collect"];
    public request_id: number = 0;
    public collection_time_unix_nano: number = 0;
    public get_name() {
        return "metric_collect";
    }
    public get_args() {
        return [this.request_id, this.collection_time_unix_nano];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, requestId, collectionTimeUnixNano] = parseEventArgs(
            args,
            metricCollectArgsSchema,
        );
        let ev = new MetricCollectEvent();
        ev.request_id = requestId;
        ev.collection_time_unix_nano = collectionTimeUnixNano;
        return ev;
    }
    public static emit(requestId: number, collectionTimeUnixNano: number) {
        os.queueEvent("metric_collect", requestId, collectionTimeUnixNano);
    }
}
addEventInit(MetricCollectEvent);

const metricResponseArgsSchema = z.literalArray([
    z.literal("metric_response"),
    z.number(),
    z.string(),
    z.unknown().optional(),
]);

export class MetricResponseEvent implements IEvent {
    public static TYPES = ["metric_response"];
    public request_id: number = 0;
    public publisher_id: string = "";
    public resource_metrics: ResourceMetrics[] = [];
    public get_name() {
        return "metric_response";
    }
    public get_args() {
        return [this.request_id, this.publisher_id, this.resource_metrics];
    }
    public static init(args: unknown[]): IEvent | undefined {
        const [, requestId, publisherId, resourceMetrics] = parseEventArgs(
            args,
            metricResponseArgsSchema,
        );
        let ev = new MetricResponseEvent();
        ev.request_id = requestId;
        ev.publisher_id = publisherId;
        ev.resource_metrics =
            (resourceMetrics as ResourceMetrics[] | undefined) ?? [];
        return ev;
    }
    public static emit(
        requestId: number,
        publisherId: string,
        resourceMetrics: ResourceMetrics[],
    ) {
        os.queueEvent(
            "metric_response",
            requestId,
            publisherId,
            resourceMetrics,
        );
    }
}
addEventInit(MetricResponseEvent);

export interface MetricProvider {
    (
        requestId: number,
        collectionTimeUnixNano: number,
    ): ResourceMetrics[] | undefined;
}

export interface MetricCollectorOptions {
    interval_seconds: number;
    response_timeout_seconds?: number;
    on_flush?: (data: MetricsData) => void;
}

export function runMetricProvider(
    publisherId: string,
    provider: MetricProvider,
) {
    MetricRegisterEvent.emit(publisherId);
    while (true) {
        const { match, event } = pullEventAs(
            MetricCollectEvent,
        );
        if (!match) continue;
        const response = provider(
            event.request_id,
            event.collection_time_unix_nano,
        );
        if (response && response.length > 0) {
            MetricResponseEvent.emit(event.request_id, publisherId, response);
        } else {
            MetricResponseEvent.emit(event.request_id, publisherId, []);
        }
    }
}

export function runMetricCollector(options: MetricCollectorOptions) {
    const publisherIds: Record<string, true> = {};
    let requestId = 1;
    const intervalSeconds = math.max(0.05, options.interval_seconds);
    const responseTimeout =
        options.response_timeout_seconds ?? intervalSeconds * 0.5;
    let timerId = os.startTimer(intervalSeconds);
    while (true) {
        const raw = pullEventRaw();
        if (!raw) continue;
        if (raw instanceof MetricRegisterEvent) {
            publisherIds[raw.publisher_id] = true;
        } else if (raw instanceof MetricUnregisterEvent) {
            delete publisherIds[raw.publisher_id];
        } else if (raw instanceof TimerEvent && raw.id === timerId) {
            const currentTimeUnixNano = os.epoch("utc") * 1_000_000;
            const currentRequestId = requestId;
            requestId += 1;
            MetricCollectEvent.emit(currentRequestId, currentTimeUnixNano);

            const expected = Object.keys(publisherIds).length;
            const received: Record<string, true> = {};
            const collected: ResourceMetrics[] = [];
            let timeoutTimerId = os.startTimer(responseTimeout);

            while (Object.keys(received).length < expected) {
                const collectEvent = pullEventRaw();
                if (!collectEvent) continue;
                if (collectEvent instanceof MetricResponseEvent) {
                    if (collectEvent.request_id !== currentRequestId) continue;
                    if (!received[collectEvent.publisher_id]) {
                        received[collectEvent.publisher_id] = true;
                        for (const entry of collectEvent.resource_metrics) {
                            collected.push(entry);
                        }
                    }
                } else if (collectEvent instanceof MetricRegisterEvent) {
                    publisherIds[collectEvent.publisher_id] = true;
                } else if (collectEvent instanceof MetricUnregisterEvent) {
                    delete publisherIds[collectEvent.publisher_id];
                } else if (
                    collectEvent instanceof TimerEvent &&
                    collectEvent.id === timeoutTimerId
                ) {
                    break;
                }
            }

            const payload: MetricsData = { resource_metrics: collected };
            if (options.on_flush) {
                options.on_flush(payload);
            } else {
                MetricEvent.emit(payload);
            }
            timerId = os.startTimer(intervalSeconds);
        } else if (raw instanceof TerminateEvent) {
            break;
        }
    }
}

export function pullEventRaw(
    filter: string | undefined = undefined,
): IEvent {
    let args = table.pack(...coroutine.yield(filter));
    if (eventInitializers[args[0]] !== undefined) {
        const event = eventInitializers[args[0]](args);
        if (event === undefined) {
            throw "Unexpected failure to parse event";
        }
        return event;
    }
    return GenericEvent.init(args);
}

export function pullMultipleEventRaw(
    filters: string[]
): IEvent {
    let ev: IEvent | undefined = undefined;
    do {
        ev = pullEventRaw();
        if (ev instanceof TerminateEvent) {
            continue;
        }
        if (filters.includes(ev.get_name())) {
            continue;
        }
        ev = undefined;
    } while (ev === undefined)
    return ev;
}

type ValidEvent<T> =
    | { match: true; event: T }
    | { match: false; event: IEvent };
export function pullEventAs<T extends typeof BaseEvent>(
    type: T,
    filter?: string,
): ValidEvent<InstanceType<T>> {
    const filters = filter !== undefined ? [filter] : type.TYPES;
    let ev: IEvent;
    if (filters.length <= 1) {
        ev = pullEventRaw(filters[0]);
    } else {
        ev = pullMultipleEventRaw(filters);
    }
    if (ev instanceof type) return { match: true, event: ev as InstanceType<T> };
    return { match: false, event: ev };
}