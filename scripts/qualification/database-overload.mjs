// Read-only experiments on explicitly owned fixtures. Prototypes here are not runtime policy.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import http from "node:http";
const require = createRequire(
	new URL("../../backend/package.json", import.meta.url),
);
const mysql = require("mysql2/promise");
const [directory, selected] = process.argv.slice(2),
	port = Number(selected);
assert(
	[23436, 23437].includes(port) &&
		directory?.startsWith("/tmp/durisweb-issue98"),
);
const config = JSON.parse(
	await readFile(`${directory}/config-${port}.json`, "utf8"),
);
assert.equal(config.DB_HOST, "127.0.0.1");
assert.equal(config.DB_NAME, `durisweb_qualification_issue98_${port}`);
await import("../../backend/dist/test/setupEnvironment.js");
Object.assign(process.env, config);
const { pool, verifyPoolSessionInvariants, closeDatabaseConnection } =
	await import("../../backend/dist/db/connection.js");
const { closeRedisConnection } = await import("../../backend/dist/db/redis.js");
const { getPvPEvents } = await import(
	"../../backend/dist/services/pvpService.js"
);
const { searchForum, getThreadsByCategory } = await import(
	"../../backend/dist/services/forumService.js"
);
const permission = {
	accountName: "Traffic0001",
	role: "player",
	immortalLevel: null,
	maxLevel: 56,
	canAccessImmortalForum: false,
	canAccessGodForum: false,
	guilds: [],
	canModerate: false,
	canBan: false,
	canEditPosts: false,
	canDeletePosts: false,
	canPinThreads: false,
	canLockThreads: false,
	adminPermissions: [],
};
const connection = {
	host: "127.0.0.1",
	port,
	user: config.DB_USER,
	password: config.DB_PASSWORD,
	database: config.DB_NAME,
	dateStrings: true,
};
function stats(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const at = (p) =>
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
	return {
		count: values.length,
		p50Ms: at(0.5),
		p95Ms: at(0.95),
		p99Ms: at(0.99),
		maxMs: sorted.at(-1) ?? 0,
	};
}
async function admission(bounded) {
	const testPool = mysql.createPool({
		...connection,
		connectionLimit: 10,
		queueLimit: bounded ? 20 : 0,
		waitForConnections: true,
	});
	const held = await Promise.all(
		Array.from({ length: 10 }, () => testPool.getConnection()),
	);
	let executed = 0,
		expired = 0;
	const server = http.createServer((req, res) => {
		let done = false,
			timer;
		const busy = () => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			res.writeHead(503, {
				"Content-Type": "application/json",
				"Retry-After": "1",
				"Cache-Control": "no-store",
			});
			res.end('{"error":"Database busy; retry shortly"}');
		};
		if (bounded)
			timer = setTimeout(() => {
				expired++;
				busy();
			}, 100);
		void testPool.getConnection().then(async (lease) => {
			if (done) {
				lease.release();
				return;
			}
			done = true;
			clearTimeout(timer);
			try {
				executed++;
				await lease.query("SELECT 1");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end('{"ok":true}');
			} finally {
				lease.release();
			}
		}, busy);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert(address && typeof address === "object");
	let released = false;
	const releaseHeld = () => {
		if (released) return;
		released = true;
		held.forEach((lease) => lease.release());
	};
	const release = setTimeout(releaseHeld, 250);
	try {
		const responses = await Promise.all(
			Array.from({ length: 40 }, async () => {
				const started = performance.now(),
					response = await fetch(`http://127.0.0.1:${address.port}`, {
						signal: AbortSignal.timeout(3000),
					});
				const body = await response.json();
				if (bounded) {
					assert.equal(response.status, 503);
					assert.equal(response.headers.get("retry-after"), "1");
					assert.equal(body.error, "Database busy; retry shortly");
				} else assert.equal(response.status, 200);
				return { ms: performance.now() - started, status: response.status };
			}),
		);
		await delay(300);
		assert.equal(executed, bounded ? 0 : 40);
		return {
			policy: bounded
				? "prototype queue=20 acquisition deadline=100ms"
				: "current queue=0 no acquisition deadline",
			responses: responses.length,
			statuses: responses.reduce(
				(counts, response) => ({
					...counts,
					[response.status]: (counts[response.status] ?? 0) + 1,
				}),
				{},
			),
			latency: stats(responses.map((response) => response.ms)),
			executed,
			expired,
		};
	} finally {
		clearTimeout(release);
		releaseHeld();
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
		await testPool.end();
	}
}
async function queryDeadline() {
	const monitor = await mysql.createConnection({ ...connection });
	const worker = await mysql.createConnection({ ...connection });
	const started = performance.now();
	let errorCode;
	try {
		await worker.query({
			sql: "SELECT SLEEP(0.5) /* issue98_deadline_probe */",
			timeout: 100,
		});
	} catch (error) {
		errorCode = error.code;
	} finally {
		worker.destroy();
	}
	assert.equal(errorCode, "PROTOCOL_SEQUENCE_TIMEOUT");
	const clientMs = performance.now() - started;
	let serverMs = clientMs;
	while (performance.now() - started < 2000) {
		const [rows] = await monitor.query("SHOW PROCESSLIST");
		if (
			!rows.some(
				(row) =>
					row.db === config.DB_NAME &&
					row.Info?.startsWith("SELECT SLEEP(0.5)"),
			)
		)
			break;
		await delay(20);
		serverMs = performance.now() - started;
	}
	await monitor.end();
	return {
		clientTimeoutMs: clientMs,
		serverWorkObservedUntilMs: serverMs,
		errorCode,
	};
}
const waits = [],
	queries = [],
	routeMetrics = new Map();
const actualQuery = pool.query.bind(pool);
pool.query = async (...args) => {
	const waiting = performance.now(),
		lease = await pool.getConnection();
	waits.push(performance.now() - waiting);
	const started = performance.now();
	try {
		return await lease.query(...args);
	} finally {
		queries.push(performance.now() - started);
		lease.release();
	}
};
const results = {
	port,
	poolSize: 10,
	dataset: { events: 50001, snapshots: 200000, threads: 500, posts: 20000 },
	representative: [],
	admission: [],
};
try {
	await verifyPoolSessionInvariants();
	for (const concurrency of [10, 50]) {
		const previousWait = waits.length,
			previousQuery = queries.length;
		await Promise.all(
			Array.from({ length: concurrency }, async (_, index) => {
				const kind =
						index % 3 === 0
							? "pvp-page"
							: index % 3 === 1
								? "forum-search"
								: "forum-thread-list",
					started = performance.now();
				if (kind === "pvp-page") await getPvPEvents({ page: 1, limit: 50 });
				else if (kind === "forum-search")
					await searchForum(
						{ query: "quartz", scope: "both" },
						permission,
						1,
						50,
					);
				else await getThreadsByCategory(10001, 1, 50, permission);
				const values = routeMetrics.get(`${concurrency}:${kind}`) ?? [];
				values.push(performance.now() - started);
				routeMetrics.set(`${concurrency}:${kind}`, values);
			}),
		);
		results.representative.push({
			concurrency,
			acquisition: stats(waits.slice(previousWait)),
			query: stats(queries.slice(previousQuery)),
			routes: [...routeMetrics]
				.filter(([key]) => key.startsWith(`${concurrency}:`))
				.map(([route, values]) => ({ route, ...stats(values) })),
		});
	}
	results.admission.push(await admission(false), await admission(true));
	results.queryDeadline = await queryDeadline();
	await verifyPoolSessionInvariants();
	await writeFile(
		`${directory}/database-overload-${port}.json`,
		JSON.stringify(results, null, 2),
		{ mode: 0o600 },
	);
	console.log(JSON.stringify(results, null, 2));
} finally {
	pool.query = actualQuery;
	await closeRedisConnection();
	await closeDatabaseConnection();
}
