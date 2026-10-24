// Isolated HTTP comparison: real ps/df diagnostics, synthetic SQL/cache/presence.
// Run after the backend build, with Node's --experimental-test-module-mocks flag.
import assert from "node:assert/strict";
import { ChildProcess, execFileSync } from "node:child_process";
import { mock } from "node:test";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(root, "backend/package.json"));
const { default: express } = await import(
	pathToFileURL(require.resolve("express")).href
);
const { transpileModule, ModuleKind, ScriptTarget } = require("typescript");
const mode = process.argv[2];
assert(
	["baseline", "candidate"].includes(mode),
	"Choose baseline or candidate",
);
const baseline = process.argv[3];
assert(
	mode !== "baseline" || /^[a-f0-9]{7,40}$/.test(baseline ?? ""),
	"Supply a baseline commit",
);
const ticksPerSecond = Number(
	execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }),
);
const fixture = await mkdtemp(
	path.join(os.tmpdir(), "durisweb-status-traffic-"),
);
const compiled = (relative) =>
	pathToFileURL(path.join(root, "backend/dist", relative)).href;
const query = async (sql) => {
	const text = typeof sql === "string" ? sql : sql.sql;
	if (text.includes("FROM statistics"))
		return [[{ average: 4, samples: 12, invalid_samples: 0 }]];
	return [[{ count: 0 }]];
};
const pool = {
	query,
	pool: { _allConnections: [], config: { connectionLimit: 10 } },
};
mock.module(compiled("config/environment.js"), {
	namedExports: {
		getBackendConfiguration: () => ({
			mud: { directory: fixture },
			publicPopulationDelayHours: 6,
		}),
	},
});
mock.module(compiled("db/connection.js"), {
	namedExports: { pool, mudPool: pool },
});
mock.module(compiled("db/redis.js"), {
	namedExports: { getCache: async () => null, setCache: async () => {} },
});
mock.module(compiled("services/onlinePlayersService.js"), {
	namedExports: { getOnlinePlayerCount: async () => 0 },
});
mock.module(compiled("utils/logger.js"), {
	defaultExport: { error() {}, warn() {}, info() {} },
});

let routeUrl = compiled("routes/status.js");
if (mode === "baseline") {
	const source = execFileSync(
		"git",
		["show", `${baseline}:backend/src/routes/status.ts`],
		{ cwd: root, encoding: "utf8" },
	);
	let { outputText } = transpileModule(source, {
		compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
	});
	outputText = outputText.replace(
		/from 'express'/g,
		`from '${pathToFileURL(require.resolve("express")).href}'`,
	);
	outputText = outputText.replace(
		/'((?:\.\.\/|\.\/)[^']+\.js)'/g,
		(_match, relative) =>
			`'${new URL(relative, compiled("routes/status.js")).href}'`,
	);
	routeUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const { default: routes } = await import(routeUrl);
const app = express();
app.use("/api/status", routes);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address === "object");
const url = `http://127.0.0.1:${address.port}/api/status`;
const spawned = mock.method(ChildProcess.prototype, "spawn");
async function childTicks() {
	const stat = await readFile("/proc/self/stat", "utf8");
	const fields = stat.slice(stat.lastIndexOf(")") + 2).split(/\s+/);
	return Number(fields[13]) + Number(fields[14]);
}
const responses = [];
let unavailablePopulationResponses = 0;
async function request() {
	const start = performance.now();
	const response = await fetch(url);
	const body = await response.json();
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("cache-control"), "no-store");
	assert(body.population.estimate === 4 || body.population.estimate === null);
	if (body.population.estimate === null) unavailablePopulationResponses++;
	assert(!Object.hasOwn(body, "onlinePlayers"));
	responses.push(performance.now() - start);
}
try {
	const cpu = process.cpuUsage();
	const children = await childTicks();
	const start = performance.now();
	// 120 absolute starts at 30/s, then one 20-request simultaneous burst.
	await Promise.all(
		Array.from({ length: 120 }, async (_value, index) => {
			await delay(Math.max(0, start + (index * 1000) / 30 - performance.now()));
			await request();
		}),
	);
	await Promise.all(Array.from({ length: 20 }, request));
	const elapsedMs = performance.now() - start;
	const usage = process.cpuUsage(cpu);
	const childCpuMs =
		(((await childTicks()) - children) * 1000) / ticksPerSecond;
	responses.sort((a, b) => a - b);
	const commands = spawned.mock.calls.map((call) => call.arguments[0].file);
	console.log(
		JSON.stringify(
			{
				mode,
				baseline: mode === "baseline" ? baseline : undefined,
				requests: responses.length,
				unavailablePopulationResponses,
				elapsedMs,
				p95Ms: responses[Math.ceil(responses.length * 0.95) - 1],
				p99Ms: responses[Math.ceil(responses.length * 0.99) - 1],
				parentCpuMs: (usage.user + usage.system) / 1000,
				childCpuMs,
				directDiagnosticStarts: commands.length,
				psStarts: commands.filter((command) => command === "ps").length,
				diskShellStarts: commands.filter((command) => command === "/bin/sh")
					.length,
				scope:
					"Loopback HTTP, real host diagnostics, synthetic SQL/cache/presence; no MUD process or production service is operated.",
			},
			null,
			2,
		),
	);
} finally {
	spawned.mock.restore();
	await new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	await rm(fixture, { recursive: true });
}
