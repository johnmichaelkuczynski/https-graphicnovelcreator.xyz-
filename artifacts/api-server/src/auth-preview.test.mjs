// Authorization-only tests: no server, database, providers, or real credentials.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { writeFile, unlink } from "node:fs/promises";

const bundled = await build({
  entryPoints: [new URL("./auth.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  packages: "external",
  plugins: [{
    name: "mock-storage",
    setup(build) {
      build.onResolve({ filter: /^\.\/storage$/ }, () => ({ path: "storage", namespace: "mock-storage" }));
      build.onLoad({ filter: /.*/, namespace: "mock-storage" }, () => ({
        contents: "export const storage = {};",
        loader: "js",
      }));
    },
  }],
});
const filename = new URL("./.auth-preview-test.tmp.cjs", import.meta.url);
await writeFile(filename, bundled.outputFiles[0].contents);
const { developmentPreviewUser, isAuthenticated, isAdmin } = createRequire(import.meta.url)(filename.pathname);
await unlink(filename);

const keys = ["NODE_ENV", "REPLIT_DEV_DOMAIN", "REPLIT_DEPLOYMENT"];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
function environment(values) {
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}
function request(host, authenticated = false, email = null) {
  return {
    get: (key) => key === "host" ? host : undefined,
    isAuthenticated: () => authenticated,
    user: authenticated ? { email } : undefined,
  };
}
function outcome(middleware, req) {
  let result;
  const res = {
    status(code) { result = code; return this; },
    json() { return this; },
  };
  middleware(req, res, () => { result = "next"; });
  return result;
}

after(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

  test("development preview opens AI gate without an account, never admin", () => {
    environment({ NODE_ENV: "development", REPLIT_DEV_DOMAIN: "preview.example.test" });
    const req = request("preview.example.test");
    assert.deepEqual(developmentPreviewUser(req), {
      id: -1, username: "development-preview", email: null,
      displayName: "Development preview", devPreview: true,
    });
    assert.equal(outcome(isAuthenticated, req), "next");
    assert.equal(outcome(isAdmin, req), 403);
  });

  test("production and deployments cannot bypass with a preview host", () => {
    for (const values of [
      { NODE_ENV: "production", REPLIT_DEV_DOMAIN: "preview.example.test" },
      { NODE_ENV: "development", REPLIT_DEV_DOMAIN: "preview.example.test", REPLIT_DEPLOYMENT: "1" },
      { NODE_ENV: "development" },
      { NODE_ENV: "development", REPLIT_DEV_DOMAIN: "preview.example.test" },
    ]) {
      environment(values);
      const req = request(values.REPLIT_DEV_DOMAIN ? (
        values.NODE_ENV === "development" && values.REPLIT_DEPLOYMENT !== "1"
          ? "production.example.test" : "preview.example.test"
      ) : "preview.example.test");
      assert.equal(developmentPreviewUser(req), null);
      assert.equal(outcome(isAuthenticated, req), 401);
      assert.equal(outcome(isAdmin, req), 403);
    }
  });

  test("real Google sessions retain existing authorization", () => {
    environment({ NODE_ENV: "production", REPLIT_DEV_DOMAIN: "preview.example.test" });
    assert.equal(outcome(isAuthenticated, request("production.example.test", true)), "next");
    assert.equal(outcome(isAdmin, request("production.example.test", true, "other@example.test")), 403);
    assert.equal(outcome(isAdmin, request("production.example.test", true, "johnmichaelkuczynski@gmail.com")), "next");
  });