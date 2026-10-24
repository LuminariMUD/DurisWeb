import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const execute = promisify(execFile);
const program = fileURLToPath(
	new URL("./initial-download.mjs", import.meta.url),
);
for (const base of ["/", "/community/", "/community/deep/"]) {
	test(`counts actual build files under deployment base ${base}`, async () => {
		const directory = await mkdtemp(
			path.join(os.tmpdir(), "durisweb-download-"),
		);
		try {
			await mkdir(path.join(directory, "assets"));
			for (const name of ["main.js", "style.css", "font.woff2"])
				await writeFile(path.join(directory, "assets", name), "fixture");
			await writeFile(
				path.join(directory, "index.html"),
				`<script type="module" src="${base}assets/main.js"></script><link rel="stylesheet" href="${base}assets/style.css"><link rel="preload" href="${base}assets/font.woff2">`,
			);
			const { stdout } = await execute(process.execPath, [program, directory]);
			const result = JSON.parse(stdout);
			assert.equal(result.assets, 3);
			assert.equal(result.rawBytes, 21);
			assert.deepEqual(result.files.map((file) => file.name).sort(), [
				"assets/font.woff2",
				"assets/main.js",
				"assets/style.css",
			]);
		} finally {
			await rm(directory, { recursive: true });
		}
	});
}
