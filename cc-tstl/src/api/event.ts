// You may comment out any events you don't need to save space. Make sure to
// delete them from eventInitializers as well.
import { running } from "../main";
import type {
    MetricsData,
    ResourceMetrics,
} from "./metrics";

export interface IEvent {
    get_name(): string;
    get_args(): any[];
}

export class CharEvent implements IEvent {
    public static TYPES = ["char"];
    public character: string = "";
    public get_name() {
        return "char";
    }
    public get_args() {
        return [this.character];
    }
    public static init(args: any[]): IEvent | null {
        if (!(typeof args[0] === "string") || (args[0] as string) != "char")
            return null;
        let ev = new CharEvent();
        ev.character = args[1] as string;
        return ev;
    }
}

export class KeyEvent implements IEvent {
    public static TYPES = ["key", "key_up"];
    public key: Key = 0;
    public isHeld: boolean = false;
    public isUp: boolean = false;
    public get_name() {
        return this.isUp ? "key_up" : "key";
    }
    public get_args() {
        return [this.key, this.isUp ? null : this.isHeld];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            ((args[0] as string) != "key" && (args[0] as string) != "key_up")
        )
            return null;
        let ev = new KeyEvent();
        ev.key = args[1] as number;
        ev.isUp = (args[0] as string) == "key_up";
        ev.isHeld = ev.isUp ? false : (args[2] as boolean);
        return ev;
    }
}

export class PasteEvent implements IEvent {
    public static TYPES = ["paste"];
    public text: string = "";
    public get_name() {
        return "paste";
    }
    public get_args() {
        return [this.text as any];
    }
    public static init(args: any[]): IEvent | null {
        if (!(typeof args[0] === "string") || (args[0] as string) != "paste")
            return null;
        let ev = new PasteEvent();
        ev.text = args[1] as string;
        return ev;
    }
}

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
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            ((args[0] as string) != "timer" && (args[0] as string) != "alarm")
        )
            throw "Invalid event type";
        let ev = new TimerEvent();
        ev.id = args[1] as number;
        ev.isAlarm = (args[0] as string) == "alarm";
        return ev;
    }
}

export class TaskCompleteEvent implements IEvent {
    public static TYPES = ["task_complete"];
    public id: number = 0;
    public success: boolean = false;
    public error: string | null = null;
    public params: any[] = [];
    public get_name() {
        return "task_complete";
    }
    public get_args() {
        if (this.success) return [this.id, this.success].concat(this.params);
        else return [this.id, this.success, this.error];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "task_complete"
        )
            throw "Invalid event type";
        let ev = new TaskCompleteEvent();
        ev.id = args[1] as number;
        ev.success = args[2] as boolean;
        if (ev.success) {
            ev.error = null;
            ev.params = args.slice(3);
        } else {
            ev.error = args[3] as string;
            ev.params = [];
        }
        return ev;
    }
}

export class RedstoneEvent implements IEvent {
    public static TYPES = ["redstone"];
    public get_name() {
        return "redstone";
    }
    public get_args() {
        return [];
    }
    public static init(args: any[]): IEvent | null {
        if (!(typeof args[0] === "string") || (args[0] as string) != "redstone")
            throw "Invalid event type";
        let ev = new RedstoneEvent();
        return ev;
    }
}

export class TerminateEvent implements IEvent {
    public static TYPES = ["terminate"];
    public get_name() {
        return "terminate";
    }
    public get_args() {
        return [];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "terminate"
        )
            throw "Invalid event type";
        let ev = new TerminateEvent();
        return ev;
    }
}

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
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            ((args[0] as string) != "disk" &&
                (args[0] as string) != "disk_eject")
        )
            throw "Invalid event type";
        let ev = new DiskEvent();
        ev.side = args[1] as string;
        ev.eject = (args[0] as string) == "disk_eject";
        return ev;
    }
}

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
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            ((args[0] as string) != "peripheral" &&
                (args[0] as string) != "peripheral_detach")
        )
            throw "Invalid event type";
        let ev = new PeripheralEvent();
        ev.side = args[1] as string;
        ev.detach = (args[0] as string) == "peripheral_detach";
        return ev;
    }
}

export class RednetMessageEvent implements IEvent {
    public static TYPES = ["rednet_message"];
    public sender: number = 0;
    public message: any;
    public protocol: string | null = null;
    public get_name() {
        return "rednet_message";
    }
    public get_args() {
        return [this.sender, this.message, this.protocol];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "rednet_message"
        )
            throw "Invalid event type";
        let ev = new RednetMessageEvent();
        ev.sender = args[1] as number;
        ev.message = args[2];
        ev.protocol = args[3] as string;
        return ev;
    }
}

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
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "modem_message"
        )
            throw "Invalid event type";
        let ev = new ModemMessageEvent();
        ev.side = args[1] as string;
        ev.channel = args[2] as number;
        ev.replyChannel = args[3] as number;
        ev.message = args[4];
        ev.distance = args[5] as number;
        return ev;
    }
}

export class HTTPEvent implements IEvent {
    public static TYPES = ["http_success", "http_failure"];
    public url: string = "";
    public handle: HTTPResponse | null = null;
    public error: string | null = null;
    public get_name() {
        return this.error == null ? "http_success" : "http_failure";
    }
    public get_args() {
        return [
            this.url,
            this.error == null ? this.handle : this.error,
            this.error != null ? this.handle : null,
        ];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            ((args[0] as string) != "http_success" &&
                (args[0] as string) != "http_failure")
        )
            throw "Invalid event type";
        let ev = new HTTPEvent();
        ev.url = args[1] as string;
        if ((args[0] as string) == "http_success") {
            ev.error = null;
            ev.handle = args[2] as HTTPResponse;
        } else {
            ev.error = args[2] as string;
            if (ev.error == null) ev.error = "";
            ev.handle = args[3] as HTTPResponse;
        }
        return ev;
    }
}

export class WebSocketEvent implements IEvent {
    public static TYPES = ["websocket_success", "websocket_failure"];
    public handle: WebSocket | null = null;
    public error: string | null = null;
    public get_name() {
        return this.error == null ? "websocket_success" : "websocket_failure";
    }
    public get_args() {
        return [this.handle == null ? this.error : this.handle];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            ((args[0] as string) != "websocket_success" &&
                (args[0] as string) != "websocket_failure")
        )
            throw "Invalid event type";
        let ev = new WebSocketEvent();
        if ((args[0] as string) == "websocket_success") {
            ev.handle = args[1] as WebSocket;
            ev.error = null;
        } else {
            ev.error = args[1] as string;
            ev.handle = null;
        }
        return ev;
    }
}

export enum MouseEventType {
    Click,
    Up,
    Scroll,
    Drag,
    Touch,
    Move,
}

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
    public side: string | null = null;
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
    public static init(args: any[]): IEvent | null {
        if (!(typeof args[0] === "string")) return null;
        let ev = new MouseEvent();
        const type = args[0] as string;

        if (type == "mouse_click") {
            ev.type = MouseEventType.Click;
            ev.button = args[1] as number;
            ev.side = null;
        } else if (type == "mouse_up") {
            ev.type = MouseEventType.Up;
            ev.button = args[1] as number;
            ev.side = null;
        } else if (type == "mouse_scroll") {
            ev.type = MouseEventType.Scroll;
            ev.button = args[1] as number;
            ev.side = null;
        } else if (type == "mouse_drag") {
            ev.type = MouseEventType.Drag;
            ev.button = args[1] as number;
            ev.side = null;
        } else if (type == "monitor_touch") {
            ev.type = MouseEventType.Touch;
            ev.button = 0;
            ev.side = args[1] as string;
        } else if (type == "mouse_move") {
            ev.type = MouseEventType.Move;
            ev.button = args[1] as number;
            ev.side = null;
        } else throw "Invalid event type";
        ev.x = args[2] as number;
        ev.y = args[3] as number;
        return ev;
    }
}

export class ResizeEvent implements IEvent {
    public static TYPES = ["term_resize", "monitor_resize"];
    public side: string | null = null;
    public get_name() {
        return this.side == null ? "term_resize" : "monitor_resize";
    }
    public get_args() {
        return [this.side];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            ((args[0] as string) != "term_resize" &&
                (args[0] as string) != "monitor_resize")
        )
            throw "Invalid event type";
        let ev = new ResizeEvent();
        if ((args[0] as string) == "monitor_resize")
            ev.side = args[1] as string;
        else ev.side = null;
        return ev;
    }
}

export class TurtleInventoryEvent implements IEvent {
    public static TYPES = ["turtle_inventory"];
    public get_name() {
        return "turtle_inventory";
    }
    public get_args() {
        return [];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "turtle_inventory"
        )
            throw "Invalid event type";
        let ev = new TurtleInventoryEvent();
        return ev;
    }
}

class SpeakerAudioEmptyEvent implements IEvent {
    public static TYPES = ["speaker_audio_empty"];
    public side: string = "";
    public get_name() {
        return "speaker_audio_empty";
    }
    public get_args() {
        return [this.side];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "speaker_audio_empty"
        )
            throw "Invalid event type";
        let ev: SpeakerAudioEmptyEvent = new SpeakerAudioEmptyEvent();
        ev.side = args[1] as string;
        return ev;
    }
}

class ComputerCommandEvent implements IEvent {
    public static TYPES = ["computer_command"];
    public args: string[] = [];
    public get_name() {
        return "computer_command";
    }
    public get_args() {
        return this.args;
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "computer_command"
        )
            throw "Invalid event type";
        let ev: ComputerCommandEvent = new ComputerCommandEvent();
        ev.args = args.slice(1);
        return ev;
    }
}

/*
class Event implements IEvent {
    
    public get_name() {return "";}
    public get_args() {return [(: any)];}
    public static init(args: any[]): IEvent | null {
        if (!(typeof args[0] === "string") || (args[0] as string) != "") return null;
        let ev: Event;

        return ev;
    }
}
*/

export class GenericEvent implements IEvent {
    public args: any[] = [];
    public get_name() {
        return this.args[0] as string;
    }
    public get_args() {
        return this.args.slice(1);
    }
    public static init(args: any[]): IEvent | null {
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
    
    private static readonly LEVELS = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARNING, LogLevel.ERROR];
    public static fromLevel(level: number): LogLevel {
        if (level < 0 || level >= LogLevel.LEVELS.length) {
            throw new Error(`Invalid log level: ${level}`);
        }
        return LogLevel.LEVELS[level];
    }

    private constructor(private readonly level: number, private readonly name: string) {}

    public getLevel(): number {
        return this.level;
    }
    
    public getName(): string {
        return this.name;
    }
}

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
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "log" ||
            typeof args[1] !== "number" || 
            typeof args[2] !== "string" ||
            (args[3] !== undefined && typeof args[3] !== "object") ||
            (args[4] !== undefined && typeof args[4] !== "object")
        )
            throw "Invalid event type";
        let ev = new LogEvent();
        ev.level = LogLevel.fromLevel(args[1]);
        ev.message = args[2];
        ev.info = args[3] as Partial<debug.FunctionInfo>;
        ev.trace = args[4] as Partial<debug.FunctionInfo>[];
        return ev;
    }
    public static emit(level: LogLevel, message: string, info?: Partial<debug.FunctionInfo>, trace?: Partial<debug.FunctionInfo>[]) {
        os.queueEvent("log", level, message, info, trace);
    }
}

export class MetricEvent implements IEvent {
    public static TYPES = ["metric"];
    public data: MetricsData = { resource_metrics: [] };
    public get_name() {
        return "metric";
    }
    public get_args() {
        return [this.data];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "metric"
        )
            throw "Invalid event type";
        let ev = new MetricEvent();
        ev.data = (args[1] as MetricsData) ?? { resource_metrics: [] };
        return ev;
    }
    public static emit(data: MetricsData) {
        os.queueEvent("metric", data);
    }
}

export class MetricRegisterEvent implements IEvent {
    public static TYPES = ["metric_register"];
    public publisher_id: string = "";
    public get_name() {
        return "metric_register";
    }
    public get_args() {
        return [this.publisher_id];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "metric_register"
        )
            throw "Invalid event type";
        let ev = new MetricRegisterEvent();
        ev.publisher_id = args[1] as string;
        return ev;
    }
    public static emit(publisherId: string) {
        os.queueEvent("metric_register", publisherId);
    }
}

export class MetricUnregisterEvent implements IEvent {
    public static TYPES = ["metric_unregister"];
    public publisher_id: string = "";
    public get_name() {
        return "metric_unregister";
    }
    public get_args() {
        return [this.publisher_id];
    }
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "metric_unregister"
        )
            throw "Invalid event type";
        let ev = new MetricUnregisterEvent();
        ev.publisher_id = args[1] as string;
        return ev;
    }
    public static emit(publisherId: string) {
        os.queueEvent("metric_unregister", publisherId);
    }
}

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
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "metric_collect"
        )
            throw "Invalid event type";
        let ev = new MetricCollectEvent();
        ev.request_id = args[1] as number;
        ev.collection_time_unix_nano = args[2] as number;
        return ev;
    }
    public static emit(requestId: number, collectionTimeUnixNano: number) {
        os.queueEvent("metric_collect", requestId, collectionTimeUnixNano);
    }
}

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
    public static init(args: any[]): IEvent | null {
        if (
            !(typeof args[0] === "string") ||
            (args[0] as string) != "metric_response"
        )
            throw "Invalid event type";
        let ev = new MetricResponseEvent();
        ev.request_id = args[1] as number;
        ev.publisher_id = args[2] as string;
        ev.resource_metrics = (args[3] as ResourceMetrics[]) ?? [];
        return ev;
    }
    public static emit(
        requestId: number,
        publisherId: string,
        resourceMetrics: ResourceMetrics[],
    ) {
        os.queueEvent("metric_response", requestId, publisherId, resourceMetrics);
    }
}

export interface MetricProvider {
    (requestId: number, collectionTimeUnixNano: number): ResourceMetrics[] | null;
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
        const ev = pullEventAs(MetricCollectEvent, "metric_collect");
        if (!ev) continue;
        const response = provider(ev.request_id, ev.collection_time_unix_nano);
        if (response && response.length > 0) {
            MetricResponseEvent.emit(ev.request_id, publisherId, response);
        } else {
            MetricResponseEvent.emit(ev.request_id, publisherId, []);
        }
    }
}

export function runMetricCollector(options: MetricCollectorOptions) {
    const publisherIds: Record<string, true> = {};
    let requestId = 1;
    const intervalSeconds = math.max(0.05, options.interval_seconds);
    const responseTimeout = options.response_timeout_seconds ?? intervalSeconds * 0.5;
    let timerId = os.startTimer(intervalSeconds);
    while (running) {
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
                } else if (collectEvent instanceof TimerEvent && collectEvent.id === timeoutTimerId) {
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

let eventInitializers: Record<string, (args: any[]) => IEvent | null> = {}

CharEvent.TYPES.forEach(type => {
    eventInitializers[type] = CharEvent.init;
});
KeyEvent.TYPES.forEach(type => {
    eventInitializers[type] = KeyEvent.init;
});
PasteEvent.TYPES.forEach(type => {
    eventInitializers[type] = PasteEvent.init;
});
TimerEvent.TYPES.forEach(type => {
    eventInitializers[type] = TimerEvent.init;
});
TaskCompleteEvent.TYPES.forEach(type => {
    eventInitializers[type] = TaskCompleteEvent.init;
});
RedstoneEvent.TYPES.forEach(type => {
    eventInitializers[type] = RedstoneEvent.init;
});
TerminateEvent.TYPES.forEach(type => {
    eventInitializers[type] = TerminateEvent.init;
});
DiskEvent.TYPES.forEach(type => {
    eventInitializers[type] = DiskEvent.init;
});
PeripheralEvent.TYPES.forEach(type => {
    eventInitializers[type] = PeripheralEvent.init;
});
RednetMessageEvent.TYPES.forEach(type => {
    eventInitializers[type] = RednetMessageEvent.init;
});
ModemMessageEvent.TYPES.forEach(type => {
    eventInitializers[type] = ModemMessageEvent.init;
});
HTTPEvent.TYPES.forEach(type => {
    eventInitializers[type] = HTTPEvent.init;
});
WebSocketEvent.TYPES.forEach(type => {
    eventInitializers[type] = WebSocketEvent.init;
});
MouseEvent.TYPES.forEach(type => {
    eventInitializers[type] = MouseEvent.init;
});
ResizeEvent.TYPES.forEach(type => {
    eventInitializers[type] = ResizeEvent.init;
});
TurtleInventoryEvent.TYPES.forEach(type => {
    eventInitializers[type] = TurtleInventoryEvent.init;
});
SpeakerAudioEmptyEvent.TYPES.forEach(type => {
    eventInitializers[type] = SpeakerAudioEmptyEvent.init;
});
ComputerCommandEvent.TYPES.forEach(type => {
    eventInitializers[type] = ComputerCommandEvent.init;
});
MetricEvent.TYPES.forEach(type => {
    eventInitializers[type] = MetricEvent.init;
});
MetricRegisterEvent.TYPES.forEach(type => {
    eventInitializers[type] = MetricRegisterEvent.init;
});
MetricUnregisterEvent.TYPES.forEach(type => {
    eventInitializers[type] = MetricUnregisterEvent.init;
});
MetricCollectEvent.TYPES.forEach(type => {
    eventInitializers[type] = MetricCollectEvent.init;
});
MetricResponseEvent.TYPES.forEach(type => {
    eventInitializers[type] = MetricResponseEvent.init;
});


type Constructor<T extends {} = {}> = new (...args: any[]) => T;
export function pullEventRaw(filter: string | null = null): IEvent | null {
    let args = table.pack(...coroutine.yield(filter));
    if (eventInitializers[args[0]]) {
        return eventInitializers[args[0]](args);
    }
    return GenericEvent.init(args);
}
export function pullEvent(filter: string | null = null): IEvent | null {
    let ev = pullEventRaw(filter);
    if (ev instanceof TerminateEvent) throw "Terminated";
    return ev;
}
export function pullEventRawAs<T extends IEvent>(
    type: Constructor<T>,
    filter: string | null = null,
): T | null {
    let ev = pullEventRaw(filter);
    if (ev instanceof type) return ev as T;
    else return null;
}
export function pullEventAs<T extends IEvent>(
    type: Constructor<T>,
    filter: string | null = null,
): T | null {
    let ev = pullEvent(filter);
    if (ev instanceof type) return ev as T;
    else return null;
}

