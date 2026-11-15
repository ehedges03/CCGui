import * as log from "../lib/log";
import { z } from "../lib/zod-lite";
import { Events } from "./event";

export namespace Threads {
    let running = false;
    let stopping = false;
    let currentThread: ThreadInternal | undefined = undefined;
    const threads: Set<ThreadInternal> = new Set();
    let yieldEventEmitted: boolean = false;
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

    export enum ShutdownRank {
        WATCH = 0,
        CONNECTION = 1,
        SINK = 2,
        APP = 3,
    }

    type ThreadOptions = {
        priority?: Priority;
        debugId?: string;
        shutdownRank?: ShutdownRank;
    };

    let nextDebugId = 0;

    class ThreadInternal implements Thread {
        public priority: Priority;
        public debugId: string;
        public runnable: Runnable;
        public luaThread: LuaThread | undefined;
        public initialized = false;
        public shutdownRank: ShutdownRank;
        public readonly children: ThreadInternal[] = [];

        constructor(runnable: Runnable, options?: ThreadOptions) {
            this.runnable = runnable;
            this.priority = options?.priority ?? Priority.DEFAULT;
            this.debugId = options?.debugId ?? tostring(nextDebugId++);
            this.shutdownRank = options?.shutdownRank ?? ShutdownRank.APP;
        }

        public start() {
            if (this.luaThread !== undefined) {
                log.error(
                    "tried to start thread but it had already started",
                    "debugId",
                    this.debugId,
                );
                return;
            }

            log.trace("starting thread", "debugId", this.debugId);
            this.luaThread = buildLuaThread(() => this.runnable.run());
            threads.add(this);
        }

        protected handleRemoval() {
            log.trace("handling thread removal", "debugId", this.debugId);
            for (const child of this.children) {
                child.handleRemoval();
            }

            threads.delete(this);
        }

        public resume(event?: Events.Event) {
            if (this.luaThread === undefined) {
                log.error(
                    "tried to resume a non started thread",
                    "debugId",
                    this.debugId,
                );
                return;
            }

            if (event === undefined && this.initialized) {
                log.error(
                    "tried to initialize a thread that was already initialized",
                    "debugId",
                    this.debugId,
                );
                return;
            }

            log.trace(
                event === undefined ? "initializing thread" : "resuming thread",
                "debugId",
                this.debugId,
            );
            const lastCurrentThread = currentThread;
            currentThread = this;
            const [ok, result] =
                event === undefined
                    ? coroutine.resume(this.luaThread)
                    : coroutine.resume(this.luaThread, event);
            currentThread = lastCurrentThread;
            if (!ok) {
                log.error(
                    "thread failed",
                    "debugId",
                    this.debugId,
                    "err",
                    tostring(result),
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

    export function sleep(timeout: number = 0): Events.Terminate | undefined {
        const id = os.startTimer(timeout);
        let event: Events.Terminate | Events.Timer;
        do {
            event = pullEvent(["timer", "terminate"]);
            if (event instanceof Events.Terminate) {
                return event;
            }
        } while (event.id !== id);
    }

    // @ts-ignore
    export function yield(): Events.Terminate | undefined {
        if (!yieldEventEmitted) {
            Events.Yield.emit();
            yieldEventEmitted = true;
        }
        const event = pullEvent(["yield", "terminate"]);
        if (event instanceof Events.Terminate) {
            return event;
        }
    }

    export function pullAnyEvent(): Events.Event {
        const [event] = coroutine.yield();
        if (!(event instanceof Events.Event)) {
            throw `unexpected event: ${event}`;
        }
        return event;
    }

    export function pullEvent<T extends readonly Events.EventType[]>(
        events: T,
    ): Events.EventToClass[T[number]] {
        let event: Events.Event | undefined;
        do {
            event = pullAnyEvent();
            log.trace(
                "pulling event",
                "event",
                event.get_name(),
                "matching",
                events.join(", "),
            );
            if (!events.includes(event.get_name())) {
                event = undefined;
            }
        } while (event === undefined);

        return event as Events.EventToClass[T[number]];
    }

    export function run() {
        running = true;
        while (running) {
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

            if (stopping) {
                Events.Terminate.emit();
            }
            const event = Events.pullEventRaw();
            log.trace("pulled event", "event", event.get_name());
            if (event instanceof Events.Yield) {
                yieldEventEmitted = false;
            }

            if (event instanceof Events.Terminate) {
                stopping = true;
                let highestRank: ShutdownRank = ShutdownRank.WATCH;
                let highestRankThreads: ThreadInternal[] = [];

                for (const thread of threads) {
                    if (thread.shutdownRank > highestRank) {
                        highestRankThreads = [];
                        highestRank = thread.shutdownRank;
                    }
                    if (thread.shutdownRank === highestRank) {
                        highestRankThreads.push(thread);
                    }
                }

                log.trace(
                    "terminating threads",
                    "rank",
                    highestRank,
                    "count",
                    highestRankThreads.length,
                );
                for (const thread of [...highestRankThreads].sort(
                    (a, b) => b.priority - a.priority,
                )) {
                    thread.resume(event);
                }
            } else {
                log.trace("resuming threads", "count", threads.size);
                for (const thread of [...threads].sort(
                    (a, b) => b.priority - a.priority,
                )) {
                    thread.resume(event);
                }
            }

            if (threads.size === 0) {
                log.info("no more threads to run, exiting");
                running = false;
            }
        }
    }

    export function stop() {
        stopping = true;
    }

    export function dangerouslyForceStopScheduler() {
        running = false;
    }
}
