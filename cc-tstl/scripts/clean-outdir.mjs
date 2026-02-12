import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const configPath = process.env.TSCONFIG ?? "tsconfig.json";
const absoluteConfigPath = path.resolve(process.cwd(), configPath);

const { config, error } = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);
if (error) {
    console.error(ts.formatDiagnosticsWithColorAndContext([error], {
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getCanonicalFileName: (fileName) => fileName,
        getNewLine: () => ts.sys.newLine,
    }));
    process.exit(1);
}

const outDir = config?.compilerOptions?.outDir;
if (!outDir) {
    process.exit(0);
}

const resolvedOutDir = path.resolve(path.dirname(absoluteConfigPath), outDir);
try {
    const entries = await fs.readdir(resolvedOutDir, { withFileTypes: true });
    await Promise.all(
        entries.map((entry) =>
            fs.rm(path.join(resolvedOutDir, entry.name), {
                recursive: true,
                force: true,
            }),
        ),
    );
} catch (err) {
    if (err && err.code === "ENOENT") {
        process.exit(0);
    }
    throw err;
}
