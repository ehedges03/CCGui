import { Logger } from "../lib/log";
import { Events } from "./event";

export namespace Thread {
    const logger = new Logger("Thread");
    export type ThreadId = number;
    export type ThreadFn = (...args: any[]) => any;

    class ThreadState {
        public readonly id: number;
        public priority: number;
        public readonly luaThread: LuaThread;
        public readonly children: ThreadId[] = [];

        constructor(id: number, priority: number, co: LuaThread) {
            this.id = id;
            this.priority = priority;
            this.luaThread = co;
        }
    }

    const threads: Record<ThreadId, ThreadState> = {};
    const newThreads: Record<ThreadId, ThreadState> = {};
    let nextId: number = 0;
    let currentThread: ThreadState | undefined = undefined;
    
    function buildLuaThread(fn: ThreadFn): LuaThread {
        return coroutine.create((...args: any[]) => fn(...args));
    }

    export function newThread(fn: ThreadFn, priority: number = 0): ThreadId {
        const id = nextId++;
        logger.trace(`new thread: ${id}`);
        const luaThread = buildLuaThread(fn);
        const thread = new ThreadState(id, priority, luaThread);
        newThreads[id] = thread;
        if (currentThread !== undefined) {
            currentThread.children.push(id);
        }
        return id;
    }
    
    export function sleep(timeout: number = 0) {
        const id = os.startTimer(timeout);
        return ["timer", id];
    }
    
    let yieldEventEmitted: boolean = false;
    
    // @ts-ignore
    export function yield() {
        if (!yieldEventEmitted) {
            Events.Yield.emit();
            yieldEventEmitted = true;
        }
        pullEvent(["yield"])
    }
    
    export function pullAnyEvent(): Events.Event {
        const [event] = coroutine.yield();
        if (!(event instanceof Events.Event)) {
            throw `Unexpected event: ${event}`;
        }
        return event;
    }

    export function pullEvent<T extends Events.EventType[]>(events: T): Events.EventToClass[T[number]] {
        let event: Events.Event | undefined;
        do {
            event = pullAnyEvent();
            logger.trace(`pulling event: ${event.get_name()} and matching ${events.join(", ")}`);
            if (!events.includes(event.get_name())) {
                event = undefined;
            }
        }while(event === undefined);

        return event as Events.EventToClass[T[number]];
    }
    
    export function run() {
        while (true) {
            for (const thread of Object.values(newThreads).sort((a, b) => b.priority - a.priority)) {
                coroutine.resume(thread.luaThread);
                delete newThreads[thread.id];
                if (coroutine.status(thread.luaThread) !== "dead") {
                    threads[thread.id] = thread;
                }
            }

            const event = Events.pullEventRaw();
            logger.trace(`pulled event: ${event.get_name()}`);
            if (event instanceof Events.Yield) {
                yieldEventEmitted = false;
            }

            logger.trace(`resuming ${Object.values(threads).length} threads`);
            for (const thread of Object.values(threads).sort((a, b) => b.priority - a.priority)) {
                logger.trace(`resuming thread: ${thread.id}`);
                coroutine.resume(thread.luaThread, event);
                if (coroutine.status(thread.luaThread) === "dead") {
                    delete threads[thread.id];
                }
            }
            
            if (Object.values(threads).length === 0 && Object.values(newThreads).length === 0) {
                logger.info("no more threads to run, exiting");
                break;
            }
        }
    }
}