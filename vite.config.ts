import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

function resolveBuildId() {
	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return Date.now().toString(36);
	}
}

const buildId = resolveBuildId();
process.env.VITE_BUILD_ID = buildId;

function stampServiceWorker(): Plugin {
	const stamp = (file: string) => {
		if (!existsSync(file)) return false;
		const src = readFileSync(file, 'utf8');
		if (!src.includes('__SW_BUILD_ID__')) return false;
		writeFileSync(file, src.replaceAll('__SW_BUILD_ID__', buildId));
		return true;
	};

	const stampKnownOutputs = () => {
		for (const file of [
			join('.cloudflare/output/v0/workers/default/assets/sw.js'),
			join('dist/client/sw.js'),
			join('dist/sw.js')
		]) {
			if (stamp(file)) break;
		}
	};

	return {
		name: 'stamp-sw',
		apply: 'build',
		writeBundle: {
			sequential: true,
			order: 'post',
			handler(options) {
				if (options.dir) stamp(join(options.dir, 'sw.js'));
			}
		},
		closeBundle: {
			sequential: true,
			order: 'post',
			handler: stampKnownOutputs
		}
	};
}

export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	plugins: [
		// Order matters: Cloudflare first, then TanStack Start, then React.
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		tanstackStart(),
		react(),
		tailwindcss(),
		stampServiceWorker()
	]
});
