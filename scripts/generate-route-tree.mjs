import { Generator, getConfig } from '@tanstack/router-generator';
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

console.log(`Wrote ${config.generatedRouteTree}`);
