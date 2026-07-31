import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.env.DATA_DIR
	? path.resolve(process.env.DATA_DIR)
	: path.resolve(process.cwd(), 'data');

export const dataRoot = root;
export const runsDir = path.join(root, 'runs');
export const uploadsDir = path.join(root, 'uploads');
export const contextDir = path.join(root, 'context');

export function ensureDataDirs() {
	for (const dir of [root, runsDir, uploadsDir, contextDir]) {
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	}
}
