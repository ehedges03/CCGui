/**
 * Lua string.pack compatibility helpers implemented in `string_pack.lua`.
 */

/**
 * Pack values into a binary string using a Lua 5.3-style format.
 */
export function pack(fmt: string, ...values: unknown[]): string;

/**
 * Calculate the size of a packed string for a fixed-length format.
 */
export function packsize(fmt: string): number;

/**
 * Unpack values from a binary string. Returns the values and next position.
 */
export function unpack(
    fmt: string,
    str: string,
    pos?: number
): LuaMultiReturn<[...unknown[], number]>;
