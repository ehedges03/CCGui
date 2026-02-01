export type IssuePath = Array<string | number>;

export interface Issue {
    path: IssuePath;
    message: string;
    expected?: string;
    received?: string;
}

export interface ZodLiteError {
    issues: Issue[];
}

export type SafeParseSuccess<T> = { success: true; data: T };
export type SafeParseFailure = { success: false; error: ZodLiteError };
export type SafeParseReturn<T> = SafeParseSuccess<T> | SafeParseFailure;

export interface Schema<T> {
    parse(input: unknown): T;
    safeParse(input: unknown, ctx?: ParseContext): SafeParseReturn<T>;
    default<D>(defaultValue: D): Schema<T | D>;
    optional(): Schema<T | undefined>;
}

export type Infer<TSchema extends Schema<unknown>> =
    TSchema extends Schema<infer T> ? T : never;

type ParseContext = {
    path: IssuePath;
    issues: Issue[];
};

type Parser<T> = (
    input: unknown,
    ctx: ParseContext,
) => { ok: true; value: T } | { ok: false };

const typeOf = (value: unknown): string => typeof value;

const addIssue = (
    ctx: ParseContext,
    message: string,
    expected?: string,
    received?: string,
): void => {
    ctx.issues.push({
        path: ctx.path.slice(),
        message,
        expected,
        received,
    });
};

const withPath = <T>(
    ctx: ParseContext,
    segment: string | number,
    fn: () => T,
): T => {
    ctx.path.push(segment);
    const result = fn();
    ctx.path.pop();
    return result;
};

const makeSchema = <T>(parser: Parser<T>): Schema<T> => {
    const safeParse = (
        input: unknown,
        ctx?: ParseContext,
    ): SafeParseReturn<T> => {
        if (ctx === undefined) {
            ctx = { path: [], issues: [] };
        }
        const result = parser(input, ctx);
        if (result.ok) {
            return { success: true, data: result.value };
        }
        return { success: false, error: { issues: ctx.issues } };
    };

    const parse = (input: unknown): T => {
        const result = safeParse(input);
        if (result.success) {
            return result.data;
        }
        const firstIssue = result.error.issues[0];
        const message =
            firstIssue !== undefined ? firstIssue.message : "Invalid value";
        error(message);
    };

    const defaultFunc = <D>(defaultValue: D): Schema<T | D> =>
        makeSchema<T | D>((input, ctx) => {
            const parse = parser(input, ctx);
            if (!parse.ok) {
                return { ok: true, value: defaultValue };
            }
            return parse;
        });

    const optional = (): Schema<T | undefined> =>
        makeSchema<T | undefined>((input, ctx) => {
            if (input === undefined) {
                return { ok: true, value: undefined };
            }
            return parser(input, ctx);
        });

    return { parse, safeParse, default: defaultFunc, optional };
};

export type Shape = Record<string, Schema<unknown>>;
type InferShape<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

const stringSchema = (): Schema<string> =>
    makeSchema<string>((input, ctx) => {
        if (typeof input !== "string") {
            addIssue(ctx, "Expected string", "string", typeOf(input));
            return { ok: false };
        }
        return { ok: true, value: input };
    });

const numberSchema = (): Schema<number> =>
    makeSchema<number>((input, ctx) => {
        if (typeof input !== "number" || input !== input) {
            addIssue(ctx, "Expected number", "number", typeOf(input));
            return { ok: false };
        }
        return { ok: true, value: input };
    });

const booleanSchema = (): Schema<boolean> =>
    makeSchema<boolean>((input, ctx) => {
        if (typeof input !== "boolean") {
            addIssue(ctx, "Expected boolean", "boolean", typeOf(input));
            return { ok: false };
        }
        return { ok: true, value: input };
    });

const unknownSchema = (): Schema<unknown> =>
    makeSchema<unknown>((input) => ({ ok: true, value: input }));

const literalSchema = <T extends string | number | boolean>(
    literal: T,
): Schema<T> =>
    makeSchema<T>((input, ctx) => {
        if (input !== literal) {
            addIssue(ctx, "Expected literal value", String(literal), String(input));
            return { ok: false };
        }
        return { ok: true, value: literal };
    });

const arraySchema = <T>(item: Schema<T>): Schema<T[]> =>
    makeSchema<T[]>((input, ctx) => {
        if (!Array.isArray(input)) {
            addIssue(ctx, "Expected array", "array", typeOf(input));
            return { ok: false };
        }
        const output: T[] = [];
        for (let i = 0; i < input.length; i++) {
            const value = input[i];
            const itemResult = withPath(ctx, i, () => item.safeParse(value, ctx));
            if (!itemResult.success) {
                return { ok: false };
            }
            output[i] = itemResult.data;
        }
        return { ok: true, value: output };
    });

type InferLiteralArray<T extends Schema<unknown>[]> = {
    [K in keyof T]: Infer<T[K]>;
};

const literalArraySchema = <const T extends Schema<unknown>[]>(
    item: T,
): Schema<InferLiteralArray<T>> =>
    // const literalArraySchema = <const T extends Schema<any>[]>(item: T)=>
    makeSchema<InferLiteralArray<T>>((input, ctx) => {
        if (!Array.isArray(input)) {
            addIssue(ctx, "Expected array", "array", typeOf(input));
            return { ok: false };
        }
        const output: unknown[] = [];
        for (let i = 0; i < item.length; i++) {
            const value = input[i];
            const schema = item[i];
            const itemResult = withPath(ctx, i, () => schema.safeParse(value,ctx));
            if (!itemResult.success) {
                return { ok: false };
            }
            output[i] = itemResult.data;
        }
        return { ok: true, value: output as InferLiteralArray<T> };
    });

const objectSchema = <S extends Shape>(shape: S): Schema<InferShape<S>> =>
    makeSchema<InferShape<S>>((input, ctx) => {
        if (
            typeof input !== "object" || Array.isArray(input)
        ) {
            addIssue(ctx, "Expected object", "object", typeOf(input));
            return { ok: false };
        }
        const output = {} as InferShape<S>;
        for (const key in shape) {
            const schema = shape[key];
            const value = (input as Record<string, unknown>)[key];
            const itemResult = withPath(ctx, key, () =>
                schema.safeParse(value, ctx),
            );
            if (!itemResult.success) {
                return { ok: false };
            }
            (output as Record<string, unknown>)[key] = itemResult.data;
        }
        return { ok: true, value: output };
    });

const unionSchema = <T extends Schema<unknown>[]>(
    options: T,
): Schema<Infer<T[number]>> =>
    makeSchema<Infer<T[number]>>((input, ctx) => {
        for (const option of options) {
            const result = option.safeParse(input);
            if (result.success) {
                return { ok: true, value: result.data as Infer<T[number]> };
            }
        }
        addIssue(ctx, "No union variant matched", "union", typeOf(input));
        return { ok: false };
    });

const optionalSchema = <T>(schema: Schema<T>): Schema<T | undefined> =>
    schema.optional();
export const z = {
    string: stringSchema,
    number: numberSchema,
    boolean: booleanSchema,
    unknown: unknownSchema,
    literal: literalSchema,
    array: arraySchema,
    literalArray: literalArraySchema,
    object: objectSchema,
    union: unionSchema,
    optional: optionalSchema,
};
