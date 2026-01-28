/** @noSelfInFile */
export {};

declare global {
    namespace string {
        /** Narrowed match result: captures or undefined. */
        function match(
            s: string,
            pattern: string,
            init?: number
        ): LuaMultiReturn<string[] | [undefined]>;

        /** Iterator yielding captures or undefined. */
        function gmatch(
            s: string,
            pattern: string
        ): LuaIterable<LuaMultiReturn<string[] | [undefined]>>;
    }
}
