// You may comment out any events you don't need to save space. Make sure to
// delete them from eventInitializers as well.

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
