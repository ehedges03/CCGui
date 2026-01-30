export type IssuePath = Array<string | number>;

export const DEBUG_MODE = true;

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
    safeParse(input: unknown): SafeParseReturn<T>;
    optional(): Schema<T | undefined>;
    nullable(): Schema<T | null>;
}

export type Infer<TSchema extends Schema<unknown>> = TSchema extends Schema<infer T> ? T : never;

type ParseContext = {
    path: IssuePath;
    issues: Issue[];
};

type Parser<T> = (input: unknown, ctx: ParseContext) => { ok: true; value: T } | { ok: false };

const typeOf = (value: unknown): string => {
    if (value === null) {
        return "null";
    }
    return typeof value;
};

const addIssue = (ctx: ParseContext, message: string, expected?: string, received?: string): void => {
    ctx.issues.push({
        path: ctx.path.slice(),
        message,
        expected,
        received,
    });
};

const withPath = <T>(ctx: ParseContext, segment: string | number, fn: () => T): T => {
    ctx.path.push(segment);
    const result = fn();
    ctx.path.pop();
    return result;
};

const makeSchema = <T>(parser: Parser<T>): Schema<T> => {
    const safeParse = (input: unknown): SafeParseReturn<T> => {
        const ctx: ParseContext = { path: [], issues: [] };
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
        const message = firstIssue !== undefined ? firstIssue.message : "Invalid value";
        error(message);
    };

    const optional = (): Schema<T | undefined> =>
        makeSchema<T | undefined>((input, ctx) => {
            if (input === undefined) {
                return { ok: true, value: undefined };
            }
            return parser(input, ctx);
        });

    const nullable = (): Schema<T | null> =>
        makeSchema<T | null>((input, ctx) => {
            if (input === null) {
                return { ok: true, value: null };
            }
            return parser(input, ctx);
        });

    return { parse, safeParse, optional, nullable };
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

const literalSchema = <T extends string | number | boolean | null>(literal: T): Schema<T> =>
    makeSchema<T>((input, ctx) => {
        if (input !== literal) {
            addIssue(ctx, "Expected literal value", "literal", typeOf(input));
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
            const itemResult = withPath(ctx, i, () => item.safeParse(value));
            if (!itemResult.success) {
                return { ok: false };
            }
            output[i] = itemResult.data;
        }
        return { ok: true, value: output };
    });

const objectSchema = <S extends Shape>(shape: S): Schema<InferShape<S>> =>
    makeSchema<InferShape<S>>((input, ctx) => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
            addIssue(ctx, "Expected object", "object", typeOf(input));
            return { ok: false };
        }
        const output = {} as InferShape<S>;
        for (const key in shape) {
            const schema = shape[key];
            const value = (input as Record<string, unknown>)[key];
            const itemResult = withPath(ctx, key, () => schema.safeParse(value));
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

const optionalSchema = <T>(schema: Schema<T>): Schema<T | undefined> => schema.optional();
const nullableSchema = <T>(schema: Schema<T>): Schema<T | null> => schema.nullable();

const _z = {
    string: stringSchema,
    number: numberSchema,
    boolean: booleanSchema,
    literal: literalSchema,
    array: arraySchema,
    object: objectSchema,
    union: unionSchema,
    optional: optionalSchema,
    nullable: nullableSchema,
};

const noopSchema = <T>(): Schema<T> => {
    const parse = (input: unknown): T => input as T;
    const safeParse = (input: unknown): SafeParseReturn<T> => ({
        success: true,
        data: input as T,
    });
    return {
        parse,
        safeParse,
        optional: () => noopSchema<T | undefined>(),
        nullable: () => noopSchema<T | null>(),
    };
};

const _zNoop = {
    string: () => noopSchema<string>(),
    number: () => noopSchema<number>(),
    boolean: () => noopSchema<boolean>(),
    literal: <T extends string | number | boolean | null>(literal: T): Schema<T> =>
        noopSchema<T>(),
    array: <T>(item: Schema<T>): Schema<T[]> => noopSchema<T[]>(),
    object: <S extends Shape>(shape: S): Schema<InferShape<S>> => noopSchema<InferShape<S>>(),
    union: <T extends Schema<unknown>[]>(options: T): Schema<Infer<T[number]>> =>
        noopSchema<Infer<T[number]>>(),
    optional: <T>(schema: Schema<T>): Schema<T | undefined> => schema.optional(),
    nullable: <T>(schema: Schema<T>): Schema<T | null> => schema.nullable(),
};

export const z = DEBUG_MODE ? _z : _zNoop;
