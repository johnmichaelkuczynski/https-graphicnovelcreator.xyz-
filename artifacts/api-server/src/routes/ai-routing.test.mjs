// Isolated route test: replace authentication and upstream providers; no app,
// database, network provider, or real credentials are used.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import express from "express";

const bundled = await build({
  entryPoints: [new URL("./ai.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  packages: "external",
  plugins: [{
    name: "mock-auth",
    setup(build) {
      build.onResolve({ filter: /^\.\.\/auth$/ }, () => ({ path: "auth", namespace: "mock-auth" }));
      build.onLoad({ filter: /.*/, namespace: "mock-auth" }, () => ({
        contents: "export const isAuthenticated = (_req, _res, next) => next();",
        loader: "js",
      }));
    },
  }],
});
// Load CJS from within this package so its external dependencies resolve locally.
import { createRequire } from "node:module";
import { writeFile, unlink } from "node:fs/promises";
const require = createRequire(import.meta.url);
const filename = new URL("./.ai-routing-test.tmp.cjs", import.meta.url);
await writeFile(filename, bundled.outputFiles[0].contents);
const router = require(filename.pathname).default;
await unlink(filename);

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const calls = [];
let veniceFailure = false;
const originalFetch = globalThis.fetch;
const oldKeys = {
  VENICE_API_KEY: process.env.VENICE_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  DEZGO_API_KEY: process.env.DEZGO_API_KEY,
};
process.env.VENICE_API_KEY = "mock-venice";
process.env.ANTHROPIC_API_KEY = "mock-anthropic";
process.env.DEZGO_API_KEY = "mock-dezgo";
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  calls.push({ url, body });
  if (veniceFailure && url.includes("api.venice.ai")) return new Response("Unavailable", { status: 503 });
  if (url.includes("/chat/completions")) return Response.json({ choices: [{ message: { content: "story" } }] });
  if (url.includes("/messages")) return Response.json({ content: [{ type: "text", text: "story" }] });
  return new Response(png, { headers: { "content-type": "image/png" } });
};
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.log = { error() {}, warn() {} }; next(); });
app.use("/api", router);
const server = app.listen(0);
before(() => new Promise((resolve) => server.once("listening", resolve)));
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldKeys)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  server.close();
});

function request(path, body) {
  return originalFetch(`http://127.0.0.1:${server.address().port}/api/ai/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("mature uses Venice for both script and images; standard keeps original providers", async () => {
  const messages = [{ role: "user", content: "A quiet city." }];
  assert.equal((await request("script", { mode: "mature", messages })).status, 200);
  assert.equal((await request("image", { mode: "mature", prompt: "A quiet city.", seed: 123 })).status, 200);
  assert.equal((await request("script", { mode: "standard", messages })).status, 200);
  assert.equal((await request("image", { mode: "standard", prompt: "A quiet city." })).status, 200);
  assert.deepEqual(calls.map((c) => new URL(c.url).host), [
    "api.venice.ai", "api.venice.ai", "api.anthropic.com", "api.dezgo.com",
  ]);
  assert.equal(calls[1].body.model, "venice-sd35");
  assert.equal(calls[1].body.return_binary, true);
  assert.equal(calls[1].body.seed, 123);
});

test("unknown modes and arbitrary provider fields are rejected", async () => {
  const count = calls.length;
  assert.equal((await request("image", { mode: "other", prompt: "x" })).status, 400);
  assert.equal((await request("image", { mode: "mature", prompt: "x", model: "other" })).status, 400);
  assert.equal((await request("script", { mode: "mature", messages: [{ role: "user", content: "x" }], baseUrl: "https://example.com" })).status, 400);
  assert.equal(calls.length, count);
});

test("mature unavailable never falls back", async () => {
  delete process.env.VENICE_API_KEY;
  const count = calls.length;
  assert.equal((await request("script", { mode: "mature", messages: [{ role: "user", content: "x" }] })).status, 503);
  assert.equal((await request("image", { mode: "mature", prompt: "x" })).status, 503);
  assert.equal(calls.length, count);
  process.env.VENICE_API_KEY = "mock-venice";
});

test("upstream Venice failure does not retry with standard providers", async () => {
  veniceFailure = true;
  const count = calls.length;
  try {
    assert.equal((await request("script", { mode: "mature", messages: [{ role: "user", content: "x" }] })).status, 502);
    assert.equal((await request("image", { mode: "mature", prompt: "x" })).status, 502);
    assert.deepEqual(calls.slice(count).map((c) => new URL(c.url).host), ["api.venice.ai", "api.venice.ai"]);
  } finally {
    veniceFailure = false;
  }
});