import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureDataDirs, uploadsDir } from './paths';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function saveUpload(file: File, kind: 'summary' | 'splits', slug: string) {
	ensureDataDirs();
	if (!file || !file.size) return '';
	const type = file.type || 'application/octet-stream';
	if (!ALLOWED.has(type) && !file.name.match(/\.(jpe?g|png|webp|heic)$/i)) {
		throw new Error(`Unsupported image type: ${type || file.name}`);
	}
	const ext =
		file.name.split('.').pop()?.toLowerCase() ||
		(type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg');
	const filename = `${slug}-${kind}.${ext}`;
	const filepath = path.join(uploadsDir, filename);
	const buffer = Buffer.from(await file.arrayBuffer());
	writeFileSync(filepath, buffer);
	return `/uploads/${filename}`;
}
