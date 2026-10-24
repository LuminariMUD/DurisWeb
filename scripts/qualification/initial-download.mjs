// Count the complete HTML-declared initial asset set, including shared chunks
// and preloaded fonts. Browser route loads and service-worker traffic are extra.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = path.resolve(process.argv[2] ?? path.join(root, "frontend/dist"));
const html = await readFile(path.join(dist, "index.html"), "utf8");
const urls = new Set();
let deploymentBase = "/";
for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
	if (
		tag[0].startsWith("<link") &&
		!/rel="(?:modulepreload|stylesheet|preload)"/.test(tag[0])
	)
		continue;
	const url = /(?:src|href)="([^"]+)"/.exec(tag[0])?.[1];
	if (url && tag[0].startsWith("<script") && /type="module"/.test(tag[0])) {
		const entryPath = new URL(url, "http://fixture.invalid").pathname;
		const assetsStart = entryPath.lastIndexOf("/assets/");
		if (assetsStart >= 0) deploymentBase = entryPath.slice(0, assetsStart + 1);
	}
	if (url) urls.add(url);
}
const files = await Promise.all(
	[...urls].map(async (url) => {
		const resolved = new URL(url, `http://fixture.invalid${deploymentBase}`);
		assert.equal(
			resolved.origin,
			"http://fixture.invalid",
			"Expected a local build asset",
		);
		assert(
			resolved.pathname.startsWith(deploymentBase),
			"Asset must use the deployment base",
		);
		const name = decodeURIComponent(
			resolved.pathname.slice(deploymentBase.length),
		);
		const file = path.resolve(dist, name);
		assert(
			!path.relative(dist, file).startsWith(".."),
			"Asset must stay inside build output",
		);
		const bytes = await readFile(file);
		return { name, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length };
	}),
);
console.log(
	JSON.stringify(
		{
			assets: files.length,
			javascript: files.filter((file) => file.name.endsWith(".js")).length,
			css: files.filter((file) => file.name.endsWith(".css")).length,
			fonts: files.filter((file) => /\.woff2?$/.test(file.name)).length,
			rawBytes: files.reduce((sum, file) => sum + file.rawBytes, 0),
			gzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
			editorChunks: files.filter((file) => /editor/i.test(file.name)),
			iconChunks: files.filter((file) => /icons/i.test(file.name)),
			files,
			scope:
				"HTML-declared initial assets only; browser route imports, images, APIs and service-worker installation measured separately.",
		},
		null,
		2,
	),
);
