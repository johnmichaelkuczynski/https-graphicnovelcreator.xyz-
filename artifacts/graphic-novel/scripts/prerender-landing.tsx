import { mkdir, readFile, writeFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Landing from "../src/pages/Landing";

const outputPath = new URL("../dist/public/index.html", import.meta.url);
const html = await readFile(outputPath, "utf8");
// Match the live app's query context. Effects do not run during static
// rendering, so the visitor counter cannot record visits during the build.
const queryClient = new QueryClient();
const landingMarkup = renderToStaticMarkup(
  <QueryClientProvider client={queryClient}>
    <Landing />
  </QueryClientProvider>,
).replace(
  /<link rel="preload"[^>]*>/g,
  "",
);
// Keep local builds usable before a deployment URL is configured. Vite leaves
// an unknown HTML environment placeholder untouched, so use a valid
// root-relative canonical in that case.
const buildSafeHtml = html.replace(/%VITE_SITE_URL%\//g, "/");
const rootPattern = /<div id="root"><\/div>/;

if (!rootPattern.test(buildSafeHtml)) {
  throw new Error("Could not find the empty application root in the built HTML.");
}

const publicDocument = buildSafeHtml.replace(
  rootPattern,
  `<div id="root" data-prerendered="landing">${landingMarkup}</div>`,
);

await writeFile(outputPath, publicDocument);

const privateDocument = buildSafeHtml
  .replace(/<link rel="canonical"[^>]*>\s*/g, "")
  .replace(
    /<title>[^<]*<\/title>/,
    "<title>Sign in required | Graphic Novel Creator</title>",
  )
  .replace(
    /<meta name="description"[^>]*>/,
    '<meta name="description" content="Sign in to access Graphic Novel Creator." />',
  )
  .replace(
    /<meta name="robots"[^>]*>/,
    '<meta name="robots" content="noindex, nofollow" />',
  )
  .replace(
    /<meta property="og:title"[^>]*>/,
    '<meta property="og:title" content="Sign in required | Graphic Novel Creator" />',
  )
  .replace(
    /<meta property="og:description"[^>]*>/,
    '<meta property="og:description" content="Sign in to access Graphic Novel Creator." />',
  )
  .replace(
    /<meta name="twitter:title"[^>]*>/,
    '<meta name="twitter:title" content="Sign in required | Graphic Novel Creator" />',
  )
  .replace(
    /<meta name="twitter:description"[^>]*>/,
    '<meta name="twitter:description" content="Sign in to access Graphic Novel Creator." />',
  );

for (const route of ["library", "admin"]) {
  const routeDirectory = new URL(`../dist/public/${route}/`, import.meta.url);
  await mkdir(routeDirectory, { recursive: true });
  await writeFile(new URL("index.html", routeDirectory), privateDocument);
}