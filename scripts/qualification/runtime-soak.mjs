import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const require = createRequire(
	new URL("../../backend/package.json", import.meta.url),
);
const { WebSocket } = require("ws");
const [directory, selected] = process.argv.slice(2),
	port = Number(selected);
assert(
	[23436, 23437].includes(port) &&
		directory?.startsWith("/tmp/durisweb-issue98"),
);
const config = JSON.parse(
	await readFile(`${directory}/config-${port}.json`, "utf8"),
);
assert.equal(config.DB_NAME, `durisweb_qualification_issue98_${port}`);
const target = port === 23436 ? 8139 : 8142,
	base = `http://127.0.0.1:${target}`;
const duration = 900000,
	started = performance.now(),
	sockets = [],
	users = [],
	samples = [],
	routes = new Map();
let inFlight = 0,
	requests = 0,
	errors = 0,
	pongs = 0,
	opened = 0,
	closed = 0,
	stopReason = "completed";
const candidates = [];
for (const entry of await readdir("/proc"))
	if (/^\d+$/.test(entry)) {
		try {
			const args = (await readFile(`/proc/${entry}/cmdline`, "utf8")).split(
				"\0",
			);
			if (
				args.includes("/tmp/durisweb-issue98/start-full-app.mjs") &&
				args.includes(String(port))
			)
				candidates.push(entry);
		} catch {}
	}
assert.equal(candidates.length, 1);
const pid = candidates[0];
async function login(index) {
	const jar = new Map();
	const request = async (path, body) => {
		const headers = {
			Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
		};
		if (body) {
			headers["Content-Type"] = "application/json";
			headers["X-CSRF-Token"] = jar.get("csrf_token");
		}
		const response = await fetch(base + path, {
			method: body ? "POST" : "GET",
			headers,
			body: body ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(5000),
		});
		for (const value of response.headers.getSetCookie()) {
			const [pair] = value.split(";"),
				at = pair.indexOf("=");
			jar.set(pair.slice(0, at), pair.slice(at + 1));
		}
		return response;
	};
	assert.equal((await request("/api/site-config")).status, 200);
	const response = await request("/api/auth/login", {
		username: `Traffic${String(index).padStart(4, "0")}`,
		password: "isolated-fixture-password",
	});
	assert.equal(response.status, 200);
	await response.arrayBuffer();
	return { request, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
}
function percentile(values, fraction) {
	const sorted = [...values].sort((a, b) => a - b);
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
		0
	);
}
async function observe() {
	const status = await readFile(`/proc/${pid}/status`, "utf8"),
		stat = (await readFile(`/proc/${pid}/stat`, "utf8"))
			.slice((await readFile(`/proc/${pid}/stat`, "utf8")).lastIndexOf(")") + 2)
			.split(" ");
	samples.push({
		ms: performance.now() - started,
		rssKiB: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]),
		highWaterKiB: Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1]),
		cpuTicks: Number(stat[11]) + Number(stat[12]),
		fds: (await readdir(`/proc/${pid}/fd`)).length,
		sockets: opened - closed,
		inFlight,
	});
	const last = samples.at(-1);
	if (last.rssKiB > 512 * 1024) stopReason = "RSS stop threshold";
	const progress = {
		port,
		elapsedMs: performance.now() - started,
		requests,
		errors,
		pongs,
		opened,
		closed,
		stopReason,
		samples,
		routes: [...routes].map(([path, metrics]) => ({
			path,
			count: metrics.ms.length,
			statuses: metrics.statuses,
			p95Ms: percentile(metrics.ms, 0.95),
			p99Ms: percentile(metrics.ms, 0.99),
		})),
	};
	await writeFile(
		`${directory}/runtime-soak-${port}.json`,
		JSON.stringify(progress, null, 2),
		{ mode: 0o600 },
	);
}
try {
	for (let i = 0; i < 48; i += 5)
		users.push(
			...(await Promise.all(
				Array.from({ length: Math.min(5, 48 - i) }, (_, n) => login(i + n)),
			)),
		);
	for (let i = 0; i < 100; i++) {
		const ws = new WebSocket(`ws://127.0.0.1:${target}/ws`, {
			headers: { Cookie: users[i % 48].cookie },
		});
		sockets.push(ws);
		ws.on("message", (data) => {
			if (JSON.parse(data.toString()).type === "pong") pongs++;
		});
		ws.on("close", () => closed++);
		await new Promise((resolve, reject) => {
			ws.once("open", () => {
				opened++;
				resolve();
			});
			ws.once("error", reject);
		});
	}
	const paths = [
		"/api/pvp/events?limit=50",
		"/api/forum/categories/10001/threads?limit=50",
		"/api/forum/threads/10001",
		"/api/forum/search?query=quartz&scope=both&limit=50",
		"/api/status",
		"/api/changelog?limit=100",
		"/api/auth/me",
		"/health",
	];
	const traffic = setInterval(() => {
		if (inFlight >= 20) {
			stopReason = "request concurrency stop threshold";
			return;
		}
		const path = paths[requests % paths.length],
			user = users[requests % users.length];
		requests++;
		inFlight++;
		const before = performance.now();
		void user
			.request(path)
			.then(async (response) => {
				await response.arrayBuffer();
				const metrics = routes.get(path) ?? { ms: [], statuses: {} };
				metrics.ms.push(performance.now() - before);
				metrics.statuses[response.status] =
					(metrics.statuses[response.status] ?? 0) + 1;
				routes.set(path, metrics);
				if (response.status !== 200) errors++;
			})
			.catch(() => errors++)
			.finally(() => inFlight--);
	}, 100);
	const ping = setInterval(() => {
		for (const ws of sockets)
			if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
	}, 10000);
	try {
		while (
			performance.now() - started < duration &&
			stopReason === "completed"
		) {
			await observe();
			if (closed || errors > Math.max(2, requests * 0.01)) {
				stopReason = "connection/error stop threshold";
				break;
			}
			await delay(Math.min(10000, duration - (performance.now() - started)));
		}
	} finally {
		clearInterval(traffic);
		clearInterval(ping);
	}
	await delay(1000);
	await observe();
	assert.equal(stopReason, "completed");
	assert.equal(errors, 0);
	assert.equal(opened, 100);
	assert.equal(closed, 0);
	console.log(
		JSON.stringify({
			port,
			durationMs: performance.now() - started,
			requests,
			errors,
			pongs,
			samples: samples.length,
			first: samples[0],
			last: samples.at(-1),
		}),
	);
} finally {
	for (const ws of sockets) ws.terminate();
}
