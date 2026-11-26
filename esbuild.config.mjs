import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";

const prod = process.argv[2] === "production";

const scriptContext = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
        ...builtinModules
    ],
    format: "cjs",
    target: "es2018",
    // Obsidian’s CommonJS loader has no native dynamic-import callback.
    supported: { "dynamic-import": false },
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    minify: prod
});

const styleContext = await esbuild.context({
    entryPoints: ["src/styles.entry.css"],
    loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    bundle: true,
    target: "es2018",
    logLevel: "info",
    sourcemap: false,
    outfile: "styles.css",
    minify: prod
});

if (prod) {
    await Promise.all([
        scriptContext.rebuild(),
        styleContext.rebuild()
    ]);
    await Promise.all([
        scriptContext.dispose(),
        styleContext.dispose()
    ]);
    process.exit(0);
} else {
    await Promise.all([
        scriptContext.watch(),
        styleContext.watch()
    ]);
}
