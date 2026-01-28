/** @noSelfInFile */

/** Message icon types used by rawterm notifications. */
export type RawtermMessageType = "error" | "warning" | "info";

/** Transport delegate used for raw mode communication. */
export interface RawtermDelegate {
    /** Send a raw protocol message. */
    send(data: string): void;
    /** Receive a raw protocol message (optionally with timeout). */
    receive(timeout?: number): string | undefined | null;
    /** Close the underlying transport. */
    close?(): void;
}

/** Delegate for client mode with optional UI hooks. */
export interface RawtermClientDelegate extends RawtermDelegate {
    /** Update the local window title. */
    setTitle?(title: string): void;
    /** Show a message on the client UI. */
    showMessage?(type: RawtermMessageType | undefined, title: string, message: string): void;
    /** Notification for unknown window IDs. */
    windowNotification?(id: number, width: number, height: number, title: string): void;
}

/** Render target with terminal/window-style APIs. */
export interface RawtermRenderTarget {
    write?(text: string): void;
    blit?(text: string, fg: string, bg: string): void;
    clear?(): void;
    clearLine?(): void;
    getCursorPos?(): LuaMultiReturn<[number, number]>;
    setCursorPos?(x: number, y: number): void;
    getCursorBlink?(): boolean;
    setCursorBlink?(blink: boolean): void;
    isColor?(): boolean;
    getSize?(pixels?: boolean): LuaMultiReturn<[number, number]>;
    scroll?(lines: number): void;
    getTextColor?(): number;
    setTextColor?(color: number): void;
    getBackgroundColor?(): number;
    setBackgroundColor?(color: number): void;
    getPaletteColor?(color: number): LuaMultiReturn<[number, number, number]>;
    setPaletteColor?(color: number, r: number, g?: number, b?: number): void;
    getGraphicsMode?(): false | number;
    setGraphicsMode?(mode: boolean | number): void;
    drawPixels?(x: number, y: number, pixels: string[] | number[][], width?: number, height?: number): void;
    getPosition?(): LuaMultiReturn<[number, number]>;
    reposition?(x?: number, y?: number, width?: number, height?: number): void;
    setVisible?(visible: boolean): void;
}

/** Server-side window object returned by `rawterm.server`. */
export interface RawtermServerWindow {
    /** Write text at the current cursor position. */
    write(text: string): void;
    /** Write text with explicit colors. */
    blit(text: string, fg: string, bg: string): void;
    /** Clear the screen. */
    clear(): void;
    /** Clear the current line. */
    clearLine(): void;
    /** Get cursor position. */
    getCursorPos(): LuaMultiReturn<[number, number]>;
    /** Set cursor position. */
    setCursorPos(x: number, y: number): void;
    /** Get cursor blink state. */
    getCursorBlink(): boolean;
    /** Set cursor blink state. */
    setCursorBlink(blink: boolean): void;
    /** Check color support. */
    isColor(): boolean;
    /** Get size in characters (or pixels if true). */
    getSize(pixels?: boolean): LuaMultiReturn<[number, number]>;
    /** Scroll the window contents. */
    scroll(lines: number): void;
    /** Get current text color. */
    getTextColor(): number;
    /** Set current text color. */
    setTextColor(color: number): void;
    /** Get current background color. */
    getBackgroundColor(): number;
    /** Set current background color. */
    setBackgroundColor(color: number): void;
    /** Get palette color. */
    getPaletteColor(color: number): LuaMultiReturn<[number, number, number]>;
    /** Set palette color. */
    setPaletteColor(color: number, r: number, g?: number, b?: number): void;
    /** Get graphics mode (false for text). */
    getGraphicsMode(): false | number;
    /** Set graphics mode. */
    setGraphicsMode(mode: boolean | number): void;
    /** Get a pixel color. */
    getPixel(x: number, y: number): number | undefined;
    /** Set a pixel color. */
    setPixel(x: number, y: number, color: number): void;
    /** Draw pixel data. */
    drawPixels(
        x: number,
        y: number,
        pixels: number | string[] | number[][],
        width?: number,
        height?: number
    ): void;
    /** Read pixel data. */
    getPixels(x: number, y: number, width: number, height: number, asString?: boolean): string[] | number[][];
    /** British spelling aliases. */
    isColour: RawtermServerWindow["isColor"];
    getTextColour: RawtermServerWindow["getTextColor"];
    setTextColour: RawtermServerWindow["setTextColor"];
    getBackgroundColour: RawtermServerWindow["getBackgroundColor"];
    setBackgroundColour: RawtermServerWindow["setBackgroundColor"];
    getPaletteColour: RawtermServerWindow["getPaletteColor"];
    setPaletteColour: RawtermServerWindow["setPaletteColor"];
    /** Get a line of text and color data. */
    getLine(line: number): LuaMultiReturn<[string, string, string] | [undefined]>;
    /** Check visibility. */
    isVisible(): boolean;
    /** Set visibility. */
    setVisible(visible: boolean): void;
    /** Redraw pending changes. */
    redraw(): void;
    /** Restore cursor on parent window. */
    restoreCursor(): void;
    /** Get the window position. */
    getPosition(): LuaMultiReturn<[number, number]>;
    /** Reposition/resize window and optionally change parent. */
    reposition(x?: number, y?: number, width?: number, height?: number, parent?: RawtermRenderTarget): void;
    /** Pull events, including raw input. */
    pullEvent(filter?: string, ignoreLocalEvents?: boolean): LuaMultiReturn<[string, ...unknown[]]>;
    /** Set window title and notify client. */
    setTitle(title: string): void;
    /** Send a message to the client. */
    sendMessage(type: RawtermMessageType | undefined, title: string, message: string): void;
    /** Close the window connection. */
    close(): void;
}

/** File attributes from the raw FS protocol. */
export interface RawtermFsAttributes {
    size: number;
    created: number;
    modified: number;
    isDir: boolean;
    isReadOnly: boolean;
}

/** Read handle returned from remote FS open. */
export interface RawtermReadHandle {
    /** Read a chunk (or single byte in binary mode). */
    read(count?: number): string | number | undefined;
    /** Read a line. */
    readLine(strip?: boolean): string | undefined;
    /** Read all remaining data. */
    readAll(): string | undefined;
    /** Close the handle. */
    close(): void;
    /** Seek within the buffered data if available. */
    seek?(whence?: "set" | "cur" | "end", offset?: number): number;
}

/** Write handle returned from remote FS open. */
export interface RawtermWriteHandle {
    /** Write a string or byte. */
    write(data: string | number): void;
    /** Write a line with newline. */
    writeLine(data: string): void;
    /** Flush buffered output. */
    flush(): void;
    /** Close and flush. */
    close(): void;
}

/** Remote filesystem handle (subset of fs API). */
export interface RawtermFsHandle {
    exists(path: string): boolean;
    isDir(path: string): boolean;
    isReadOnly(path: string): boolean;
    getSize(path: string): number;
    getDrive(path: string): string;
    getCapacity(path: string): number;
    getFreeSpace(path: string): number;
    list(path: string): string[];
    attributes(path: string): RawtermFsAttributes | undefined;
    find(path: string): string[];
    makeDir(path: string): void;
    delete(path: string): void;
    copy(path: string, dest: string): void;
    move(path: string, dest: string): void;
    /** Open a file; returns handle or [undefined, error]. */
    open(path: string, mode: string): RawtermReadHandle | RawtermWriteHandle | LuaMultiReturn<[undefined, string]>;
}

/** Client handle returned by `rawterm.client`. */
export interface RawtermClientHandle {
    /** Update window state from a raw message. */
    update(message: string): string | undefined;
    /** Send an event to the server. */
    queueEvent(event: string, ...params: unknown[]): void;
    /** Resize the window and notify the server. */
    resize(width: number, height: number): void;
    /** Close the connection. */
    close(): void;
    /** Run a receive/event loop. */
    run(): void;
    /** Remote filesystem handle (if supported). */
    fs?: RawtermFsHandle;
}

/** Create a server-side window. */
export function server(
    delegate: RawtermDelegate,
    width: number,
    height: number,
    id?: number,
    title?: string,
    parent?: RawtermRenderTarget,
    x?: number,
    y?: number,
    blockFSAccess?: boolean
): RawtermServerWindow;

/** Create a client handle that renders to a window. */
export function client(
    delegate: RawtermClientDelegate,
    id: number,
    window?: RawtermRenderTarget
): RawtermClientHandle;

/** Create a WebSocket delegate. */
export function wsDelegate(
    url: string
): LuaMultiReturn<[RawtermDelegate | undefined, string | undefined]>;

/** Create a rednet delegate. */
export function rednetDelegate(id: number, protocol?: string): RawtermDelegate;
