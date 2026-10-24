import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import vm from "node:vm";

// Execute the actual CLI with synthetic I/O and a short, accelerated observation.
// No account, database, process or network outside this fixture is accessed.
const program = new URL("./runtime-soak.mjs", import.meta.url);
const source = (await readFile(program, "utf8"))
	.replace(/^import[^;]+;\n/gm, "")
	.replaceAll("import.meta.url", JSON.stringify(program.href))
	.replace("const duration = 900000", "const duration = 1200");

async function run({ lateFailure = false, silentSocket = -1 } = {}) {
	const timers = new Set();
	const intervals = new Set();
	let start;
	let issued = 0;
	let completed = 0;
	let report;
	let failure;
	let socketIndex = 0;
	class Socket extends EventEmitter {
		static OPEN = 1;
		readyState = 1;
		index = socketIndex++;
		constructor() {
			super();
			queueMicrotask(() => this.emit("open"));
		}
		send() {
			if (this.index !== silentSocket)
				queueMicrotask(() =>
					this.emit("message", Buffer.from('{"type":"pong"}')),
				);
		}
		terminate() {
			this.readyState = 3;
			this.emit("close");
		}
	}
	const context = {
		assert,
		URL,
		Buffer,
		process: {
			argv: [
				"node",
				program.pathname,
				"/tmp/durisweb-issue98-fixture",
				"23436",
			],
		},
		createRequire: () => () => ({ WebSocket: Socket }),
		performance: {
			now: () => (start === undefined ? 0 : (performance.now() - start) * 100),
		},
		readFile: async (name) => {
			if (name.endsWith(".json"))
				return JSON.stringify({
					DB_NAME: "durisweb_qualification_issue98_23436",
				});
			if (name.endsWith("cmdline"))
				return "/tmp/durisweb-issue98/start-full-app.mjs\0" + "23436\0";
			if (name.endsWith("status")) return "VmRSS: 1024\nVmHWM: 1024\n";
			if (name.endsWith("stat"))
				return "123 (fixture) " + Array(20).fill("0").join(" ");
			throw new Error("Unexpected fixture read");
		},
		readdir: async (name) => (name === "/proc" ? ["123"] : []),
		writeFile: async (_name, value) => {
			report = JSON.parse(value);
		},
		fetch: async (_url, options) => {
			const login =
				_url.endsWith("/api/site-config") || options.method === "POST";
			if (!login) {
				issued++;
				if (lateFailure)
					await new Promise((resolve) => {
						const timer = setTimeout(() => {
							timers.delete(timer);
							resolve();
						}, 50);
						timers.add(timer);
					});
				completed++;
			}
			return {
				status: !login && lateFailure ? 503 : 200,
				headers: { getSetCookie: () => [] },
				arrayBuffer: async () => new ArrayBuffer(0),
			};
		},
		AbortSignal,
		delay: (ms) => delay(Math.max(1, ms / 100)),
		setInterval: (callback, ms) => {
			start ??= performance.now();
			const interval = setInterval(callback, Math.max(1, ms / 100));
			intervals.add(interval);
			return interval;
		},
		clearInterval,
		console: { log() {} },
	};
	try {
		await vm.runInNewContext(`(async () => { ${source} })()`, context);
	} catch (error) {
		failure = error;
	} finally {
		for (const timer of timers) clearTimeout(timer);
		for (const interval of intervals) clearInterval(interval);
	}
	return { failure, report, issued, completed };
}

test("reports success only after all scheduled HTTP work and every socket reply", async () => {
	const result = await run();
	assert.ifError(result.failure);
	assert(result.issued > 0);
	assert.equal(result.completed, result.issued);
	assert.equal(result.report.errors, 0);
	assert(result.report.pongs >= 100);
});

test("drains late HTTP failures before writing the final report and refusing success", async () => {
	const result = await run({ lateFailure: true });
	assert(result.issued > 0);
	assert.equal(result.completed, result.issued);
	assert(result.report.errors > 0);
	assert(result.failure, "The CLI must fail for delayed non-200 responses");
});

test("refuses success when one socket never answers application pings", async () => {
	const result = await run({ silentSocket: 99 });
	assert(result.report.pongs >= 99);
	assert.equal(result.report.stopReason, "application heartbeat timeout");
	assert(
		result.failure,
		"Other sockets must not conceal a silent application path",
	);
});
