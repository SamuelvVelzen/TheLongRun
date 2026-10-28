/**
 * One-time local setup: point this clone at .githooks/ (pre-push runs ci:check before push).
 * Not wired into npm install — run `npm run setup:hooks` yourself after clone.
 */
const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const hooksDir = path.join(root, '.githooks');

function git(args, { optional = false } = {}) {
	try {
		return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	} catch {
		if (optional) return undefined;
		throw new Error(`git ${args.join(' ')} failed`);
	}
}

try {
	git(['rev-parse', '--git-dir']);
} catch {
	process.stderr.write('install-githooks: not a git repo — skipping hook setup\n');
	process.exit(0);
}

if (!fs.existsSync(hooksDir)) {
	process.stderr.write('install-githooks: missing .githooks directory\n');
	process.exit(1);
}

const prePush = path.join(hooksDir, 'pre-push');
if (fs.existsSync(prePush)) {
	try {
		fs.chmodSync(prePush, 0o755);
	} catch {
		/* Windows may ignore mode */
	}
}

const current = git(['config', '--get', 'core.hooksPath'], { optional: true });
if (current === '.githooks') {
	process.exit(0);
}

if (current && current !== '.githooks') {
	process.stderr.write(
		`install-githooks: core.hooksPath is already "${current}" — not changing (set to .githooks manually to use repo hooks)\n`
	);
	process.exit(0);
}

execSync('git config core.hooksPath .githooks', { cwd: root, stdio: 'inherit' });
