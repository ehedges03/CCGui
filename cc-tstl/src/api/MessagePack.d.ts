/** @noSelfInFile */

/**
 * Type bindings for `MessagePack.lua`.
 * Based on lua-MessagePack 0.5.4.
 */

export type MessagePackStringMode = "string_compat" | "string" | "binary";
export type MessagePackArrayMode = "without_hole" | "with_hole" | "always_as_map";
export type MessagePackIntegerMode = "unsigned" | "signed";
export type MessagePackNumberMode = "float" | "double";

export interface MessagePackCursor {
    s: string;
    i: number;
    j: number;
    underflow(pos: number): void;
}

export type MessagePackPacker = (buffer: string[], ...args: unknown[]) => void;
export type MessagePackExtPacker = (buffer: string[], tag: number, data: string) => void;

export interface MessagePackPackers {
    [name: string]: MessagePackPacker | MessagePackExtPacker;
    nil: MessagePackPacker;
    boolean: MessagePackPacker;
    string: MessagePackPacker;
    string_compat: MessagePackPacker;
    binary: MessagePackPacker;
    map: MessagePackPacker;
    array: MessagePackPacker;
    table: MessagePackPacker;
    unsigned: MessagePackPacker;
    signed: MessagePackPacker;
    integer: MessagePackPacker;
    float: MessagePackPacker;
    double: MessagePackPacker;
    number: MessagePackPacker;
    ext: MessagePackExtPacker;
    fixext1: MessagePackExtPacker;
    fixext2: MessagePackExtPacker;
    fixext4: MessagePackExtPacker;
    fixext8: MessagePackExtPacker;
    fixext16: MessagePackExtPacker;
}

export const packers: MessagePackPackers;

export function set_string(mode: MessagePackStringMode): void;
export function set_array(mode: MessagePackArrayMode): void;
export function set_integer(mode: MessagePackIntegerMode): void;
export function set_number(mode: MessagePackNumberMode): void;

export function pack(data: unknown): string;
export function unpack_cursor(cursor: MessagePackCursor): unknown;
export function build_ext(tag: number, data: string): unknown;
export function unpack(data: string): unknown;

export function unpacker(src: string): () => LuaMultiReturn<[number, unknown] | []>;
export function unpacker(
    src: () => string | undefined | null
): () => LuaMultiReturn<[true, unknown] | []>;

export let sentinel: unknown;
export const small_lua: boolean | undefined;
export const long_double: boolean | undefined;
export const _VERSION: string;
export const _DESCRIPTION: string;
export const _COPYRIGHT: string;
