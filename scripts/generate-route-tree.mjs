import { Generator, getConfig } from '@tanstack/router-generator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const config = getConfig(
	{
		target: 'react',
		routesDirectory: './src/routes',
		generatedRouteTree: './src/routeTree.gen.ts'
	},
	root
);

const generator = new Generator({ config, root });
await generator.run();

const treePath = path.isAbsolute(config.generatedRouteTree)
	? config.generatedRouteTree
	: path.join(root, config.generatedRouteTree);

let content = fs.readFileSync(treePath, 'utf8');

// Match what @tanstack/react-start's Vite plugin appends — without this, tsc loses route/loader types.
const startRegister = `
import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
`;

if (!content.includes("@tanstack/react-start'")) {
	content = content.trimEnd() + startRegister;
	fs.writeFileSync(treePath, content);
}

console.log(`Wrote ${config.generatedRouteTree}`);
