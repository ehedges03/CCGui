/** @noSelfInFile */
export {};

declare global {
    namespace string {
        /**
         * Looks for the first match of pattern in the string s. If it finds one,
         * then match returns the captures from the pattern; otherwise it returns
         * nil. If pattern specifies no captures, then the whole match is returned.
         * An optional numeric argument init specifies where to start the search.
         *
         * This override narrows the return type to captures or [undefined].
         */
        function match(
            s: string,
            pattern: string,
            init?: number,
        ): LuaMultiReturn<string[] | [undefined]>;

        /**
         * Returns an iterator function that, each time it is called, returns the
         * next captures from pattern over the string s. If pattern specifies no
         * captures, then the whole match is produced in each call.
         *
         * This override narrows the yielded type to captures or [undefined].
         */
        function gmatch(
            s: string,
            pattern: string,
        ): LuaIterable<LuaMultiReturn<string[]>>;
    }

    /** @customName bit32 */
    const bit: typeof bit32;
}
