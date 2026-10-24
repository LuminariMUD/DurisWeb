// Disposable full-app qualification. Never pass production configuration.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, access, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const require = createRequire(
	new URL("../../backend/package.json", import.meta.url),
);
const mysql = require("mysql2/promise");
const { WebSocket } = require("ws");
const [directory, selected] = process.argv.slice(2);
const port = Number(selected);
assert(
	[23436, 23437].includes(port) &&
		directory?.startsWith("/tmp/durisweb-issue98"),
);
const config = JSON.parse(
	await readFile(`${directory}/config-${port}.json`, "utf8"),
);
assert.equal(config.DB_HOST, "127.0.0.1");
assert.equal(config.DB_NAME, `durisweb_qualification_issue98_${port}`);
const httpPort = port === 23436 ? 8139 : 8142;
const base = `http://127.0.0.1:${httpPort}`;
const sql = await mysql.createConnection({
	host: "127.0.0.1",
	port,
	user: "root",
	password: "",
	database: config.DB_NAME,
});
const observations = {
	port,
	accounts: 0,
	loginConcurrency: 5,
	routes: [],
	terminal: {},
};
const clients = [];
function client() {
	const cookies = new Map();
	return {
		cookies,
		async request(path, body) {
			const headers = {
				Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
			};
			if (body) {
				headers["Content-Type"] = "application/json";
				headers["X-CSRF-Token"] = cookies.get("csrf_token");
			}
			const start = performance.now();
			const response = await fetch(base + path, {
				method: body ? "POST" : "GET",
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(15000),
			});
			for (const value of response.headers.getSetCookie()) {
				const [pair] = value.split(";");
				const index = pair.indexOf("=");
				cookies.set(pair.slice(0, index), pair.slice(index + 1));
			}
			const data = await response.json();
			return { status: response.status, data, ms: performance.now() - start };
		},
	};
}
async function until(predicate) {
	const deadline = performance.now() + 5000;
	while (performance.now() < deadline) {
		if (await predicate()) return;
		await delay(20);
	}
	throw new Error("Fixture condition timed out");
}
async function socket() {
	const ws = new WebSocket(`ws://127.0.0.1:${httpPort}/ws`);
	clients.push(ws);
	const messages = [];
	ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
	await new Promise((resolve, reject) => {
		ws.once("open", resolve);
		ws.once("error", reject);
	});
	return {
		ws,
		messages,
		send: (value) => ws.send(JSON.stringify(value)),
		async wait(type, predicate = () => true) {
			let found;
			await until(() => {
				found = messages.find(
					(value) => value.type === type && predicate(value),
				);
				return found;
			});
			return found;
		},
	};
}
async function waitEnded(id) {
	await until(async () => {
		const [rows] = await sql.query(
			"SELECT status FROM terminal_sessions WHERE id=?",
			[id],
		);
		return rows[0]?.status !== "active";
	});
}
function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
try {
	// Keep the synthetic future event hidden across a long qualification run.
	await sql.query(
		"UPDATE pkill_event SET stamp=DATE_ADD(NOW(),INTERVAL 7 DAY) WHERE id=50001",
	);
	const [old] = await sql.query(
		"SELECT COUNT(*) AS count FROM terminal_sessions",
	);
	if (Number(old[0].count) === 0)
		await sql.query("ALTER TABLE terminal_sessions AUTO_INCREMENT=900000000");
	for (let start = 0; start < 48; start += 5) {
		await Promise.all(
			Array.from({ length: Math.min(5, 48 - start) }, async (_, offset) => {
				const index = start + offset,
					accountName = `Traffic${String(index).padStart(4, "0")}`,
					current = client();
				assert.equal((await current.request("/api/site-config")).status, 200);
				const login = await current.request("/api/auth/login", {
					username: accountName,
					password: "isolated-fixture-password",
				});
				assert.equal(login.status, 200);
				assert.equal(login.data.user.accountName, accountName);
				const me = await current.request("/api/auth/me");
				assert.equal(me.data.user.accountName, accountName);
				clients[index + 1000] = current;
				observations.accounts++;
			}),
		);
	}
	const admin = clients[1000],
		player = clients[1001];
	for (const path of [
		"/api/pvp/events?page=1&limit=50",
		"/api/pvp/events?page=2&limit=50",
		"/api/pvp/events?player=Trafficchar0001&limit=50",
		"/api/forum/categories/10001/threads?page=1&limit=50",
		"/api/forum/threads/10001",
		"/api/forum/search?query=quartz&scope=both&limit=50",
		"/api/forum/search?query=quartz&scope=both&author=Traffic0001&limit=50",
		"/api/changelog?limit=100",
	]) {
		const response = await player.request(path);
		assert.equal(response.status, 200, path);
		observations.routes.push({
			path,
			status: response.status,
			ms: response.ms,
		});
	}
	const token = (await admin.request("/api/auth/terminal-token")).data.token;
	assert.equal(typeof token, "string");
	const denied = await socket();
	denied.send({
		type: "TERMINAL_CONNECT",
		token: (await player.request("/api/auth/terminal-token")).data.token,
	});
	assert.match((await denied.wait("TERMINAL_ERROR")).message, /permission/i);
	denied.ws.close();
	observations.terminal.playerDenied = true;
	// Hold only the owned terminal table, after authentication/capability issuance.
	await sql.query("LOCK TABLES terminal_sessions WRITE");
	const pending = await socket();
	pending.send({ type: "TERMINAL_CONNECT", token });
	try {
		await until(async () => {
			const [rows] = await sql.query("SHOW PROCESSLIST");
			return rows.some(
				(row) =>
					row.db === config.DB_NAME &&
					row.Info?.startsWith("INSERT INTO terminal_sessions"),
			);
		});
		pending.ws.close();
		await new Promise((resolve) => pending.ws.once("close", resolve));
	} finally {
		await sql.query("UNLOCK TABLES");
	}
	await until(async () => {
		const [rows] = await sql.query(
			"SELECT status,pid FROM terminal_sessions ORDER BY id DESC LIMIT 1",
		);
		return rows[0]?.status !== "active" && rows[0]?.pid === null;
	});
	observations.terminal.closeDuringInsert = true;
	const normal = await socket();
	normal.send({ type: "TERMINAL_CONNECT", token });
	normal.send({ type: "TERMINAL_CONNECT", token });
	const connected = await normal.wait("TERMINAL_CONNECTED");
	await until(
		() =>
			normal.messages.filter((value) => value.type === "TERMINAL_CONNECTED")
				.length === 2,
	);
	assert(
		normal.messages
			.filter((value) => value.type === "TERMINAL_CONNECTED")
			.every((value) => value.sessionId === connected.sessionId),
	);
	assert(connected.sessionId >= 900000000);
	await assert.rejects(access(`/tmp/.duris_bashrc-${connected.sessionId}`));
	normal.send({ type: "TERMINAL_INPUT", data: "native qualification\n" });
	await normal.wait("TERMINAL_OUTPUT", (value) =>
		value.data.includes("ISOLATED_ECHO:native qualification"),
	);
	observations.terminal.realPtyEcho = true;
	observations.terminal.concurrentSingleSession = true;
	const [rows] = await sql.query(
		"SELECT pid FROM terminal_sessions WHERE id=?",
		[connected.sessionId],
	);
	const pid = Number(rows[0].pid);
	assert(alive(pid));
	await sql.query("LOCK TABLES terminal_logs WRITE,terminal_sessions READ");
	try {
		normal.send({ type: "TERMINAL_INPUT", data: "blocked final log\n" });
		await normal.wait("TERMINAL_OUTPUT", (value) =>
			value.data.includes("ISOLATED_ECHO:blocked final log"),
		);
		const started = performance.now();
		normal.ws.close();
		await until(() => !alive(pid));
		observations.terminal.killWhileSqlBlockedMs = performance.now() - started;
	} finally {
		await sql.query("UNLOCK TABLES");
	}
	await waitEnded(connected.sessionId);
	const revoked = await socket();
	revoked.send({ type: "TERMINAL_CONNECT", token });
	const next = await revoked.wait("TERMINAL_CONNECTED");
	assert.equal((await admin.request("/api/auth/logout", {})).status, 200);
	revoked.send({ type: "TERMINAL_INPUT", data: "must not reach the PTY\n" });
	assert.match(
		(await revoked.wait("TERMINAL_ERROR")).message,
		/no longer active/,
	);
	await waitEnded(next.sessionId);
	const oldToken = await socket();
	oldToken.send({ type: "TERMINAL_CONNECT", token });
	assert.match(
		(await oldToken.wait("TERMINAL_ERROR")).message,
		/no longer active/,
	);
	observations.terminal.logoutRevokes = true;
	if (process.argv.includes("--shutdown")) {
		assert.equal(
			(
				await admin.request("/api/auth/login", {
					username: "Traffic0000",
					password: "isolated-fixture-password",
				})
			).status,
			200,
		);
		const last = await socket();
		last.send({
			type: "TERMINAL_CONNECT",
			token: (await admin.request("/api/auth/terminal-token")).data.token,
		});
		const session = await last.wait("TERMINAL_CONNECTED");
		const [rows] = await sql.query(
			"SELECT pid FROM terminal_sessions WHERE id=?",
			[session.sessionId],
		);
		const childPid = Number(rows[0].pid);
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
						candidates.push(Number(entry));
				} catch {}
			}
		assert.equal(candidates.length, 1);
		await sql.query("LOCK TABLES terminal_logs WRITE,terminal_sessions READ");
		try {
			last.send({ type: "TERMINAL_INPUT", data: "shutdown drain fixture\n" });
			await last.wait("TERMINAL_OUTPUT", (value) =>
				value.data.includes("ISOLATED_ECHO:shutdown drain fixture"),
			);
			process.kill(candidates[0], "SIGTERM");
			await until(() => !alive(childPid));
			await delay(100);
			assert(
				alive(candidates[0]),
				"Application must retain its pending cleanup before SQL closes",
			);
		} finally {
			await sql.query("UNLOCK TABLES");
		}
		await until(() => !alive(candidates[0]));
		await waitEnded(session.sessionId);
		observations.terminal.shutdownDrainsSql = true;
	}
	await writeFile(
		`${directory}/runtime-journey-${port}.json`,
		JSON.stringify(observations, null, 2),
		{ mode: 0o600 },
	);
	console.log(JSON.stringify(observations, null, 2));
} finally {
	await sql.query("UNLOCK TABLES");
	for (const value of clients)
		if (value instanceof WebSocket) value.terminate();
	await sql.end();
}
