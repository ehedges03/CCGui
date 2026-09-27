import { Logger } from "../lib/log";
import { z } from "../lib/zod-lite";
import { Events } from "./event";

export namespace Threads {
    let forceQuitted = false;
    let currentThread: ThreadInternal | undefined = undefined;
    const threads: Set<ThreadInternal> = new Set();
    let yieldEventEmitted: boolean = false;

    const logger = new Logger("Threads");
    export type ThreadId = number;
    export type ThreadFn = (...args: any[]) => any;

    export interface Runnable {
        run: ThreadFn;
    }

    export enum Priority {
        LOWEST = -2,
        LOW = -1,
        DEFAULT = 0,
        HIGH = 1,
        HIGHEST = 2,
    }

    class SimpleRunnable implements Runnable {
        private fn: ThreadFn;

        public constructor(fn: ThreadFn) {
            this.fn = fn;
        }

        public run() {
            this.fn();
        }
    }

    abstract class Thread {
        public abstract start(): void;
        public abstract isRunning(): ReturnType<(typeof coroutine)["status"]>;
        public abstract setPriority(priority: number): void;
    }

    type ThreadOptions = {
        priority?: Priority;
        debugId?: string;
        // Whether or not this threads existence should block application closure (default: true)
        blocking?: boolean;
    };

    let nextDebugId = 0;

    class ThreadInternal implements Thread {
        public priority: Priority;
        public debugId: string;
        public runnable: Runnable;
        public luaThread: LuaThread | undefined;
        public initialized = false;
        public blocking;
        public readonly children: ThreadInternal[] = [];

        constructor(runnable: Runnable, options?: ThreadOptions) {
            this.runnable = runnable;
            this.priority = options?.priority ?? Priority.DEFAULT;
            this.debugId = options?.debugId ?? tostring(nextDebugId++);
            this.blocking = options?.blocking ?? true;
        }

        public start() {
            if (this.luaThread !== undefined) {
                logger.error(
                    `tried to start thread ${this.debugId} but it had already started`,
                );
                return;
            }

            logger.trace(`starting thread: ${this.debugId}`);
            this.luaThread = buildLuaThread(() => this.runnable.run());
            threads.add(this);
        }

        protected handleRemoval() {
            logger.trace(`handling removal of ${this.debugId}`);
            for (const child of this.children) {
                child.handleRemoval();
            }

            threads.delete(this);
        }

        public resume(event?: Events.Event) {
            if (this.luaThread === undefined) {
                logger.error(
                    `tried to resume a non started thread ${this.debugId}`,
                );
                return;
            }

            if (event === undefined && this.initialized) {
                logger.error(
                    `tried to initialize a thread ${this.debugId} that was already initialized`,
                );
                return;
            }

            logger.trace(
                `${event === undefined ? "initailizing" : "resuming"} thread ${this.debugId}`,
            );
            const lastCurrentThread = currentThread;
            currentThread = this;
            const [ok, result] =
                event === undefined
                    ? coroutine.resume(this.luaThread)
                    : coroutine.resume(this.luaThread, event);
            currentThread = lastCurrentThread;
            if (!ok) {
                logger.error(
                    `thread ${this.debugId} failed: ${tostring(result)}`,
                );
                this.handleRemoval();
            } else if (coroutine.status(this.luaThread) === "dead") {
                this.handleRemoval();
            }
        }

        public isRunning() {
            if (this.luaThread === undefined) {
                return "suspended";
            }

            return coroutine.status(this.luaThread);
        }

        public setPriority(priority: number): void {
            this.priority = priority;
        }
    }

    function buildLuaThread(fn: ThreadFn): LuaThread {
        return coroutine.create((...args: any[]) => fn(...args));
    }

    function getRunnable(runnableOrFn: ThreadFn | Runnable): Runnable {
        if (typeof runnableOrFn === "function") {
            return new SimpleRunnable(runnableOrFn);
        }

        return runnableOrFn;
    }

    export function createThread(
        runnableOrFn: ThreadFn | Runnable,
        options?: ThreadOptions,
    ): Thread {
        const thread = new ThreadInternal(getRunnable(runnableOrFn), options);
        if (currentThread !== undefined) {
            currentThread.children.push(thread);
        }
        return thread;
    }

    export function sleep(timeout: number = 0) {
        const id = os.startTimer(timeout);
        while (pullEvent(["timer"]).id !== id) {}
    }

    // @ts-ignore
    export function yield() {
        if (!yieldEventEmitted) {
            Events.Yield.emit();
            yieldEventEmitted = true;
        }
        pullEvent(["yield"]);
    }

    export function pullAnyEvent(): Events.Event {
        const [event] = coroutine.yield();
        if (!(event instanceof Events.Event)) {
            throw `unexpected event: ${event}`;
        }
        return event;
    }

    export function pullEvent<T extends Events.EventType[]>(
        events: T,
    ): Events.EventToClass[T[number]] {
        let event: Events.Event | undefined;
        do {
            event = pullAnyEvent();
            logger.trace(
                `pulling event: ${event.get_name()} and matching ${events.join(", ")}`,
            );
            if (!events.includes(event.get_name())) {
                event = undefined;
            }
        } while (event === undefined);

        return event as Events.EventToClass[T[number]];
    }

    export function run() {
        while (!forceQuitted) {
            let threadsToInitialize: ThreadInternal[] = [];
            do {
                threadsToInitialize = [];

                for (const thread of threads) {
                    if (!thread.initialized) {
                        threadsToInitialize.push(thread);
                    }
                }

                for (const thread of threadsToInitialize.sort(
                    (a, b) => b.priority - a.priority,
                )) {
                    thread.resume();
                    thread.initialized = true;
                }
            } while (threadsToInitialize.length !== 0);

            const event = Events.pullEventRaw();
            logger.trace(`pulled event: ${event.get_name()}`);
            if (event instanceof Events.Yield) {
                yieldEventEmitted = false;
            }

            logger.trace(`resuming ${threads.size} threads`);
            for (const thread of [...threads].sort(
                (a, b) => b.priority - a.priority,
            )) {
                thread.resume(event);
            }
            let blockingThreadsRemain = false;
            for (const thread of threads) {
                if (thread.blocking) {
                    blockingThreadsRemain = true;
                    break;
                }
            }
            if (!blockingThreadsRemain) {
                logger.info("no more threads to run, exiting");
                break;
            }
        }
    }

    export function stopScheduler() {
        forceQuitted = true;
    }
}
