/** Minimal ZIP (store method, no compression) so mixed-type groups can download per-part GPXs. */

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(data: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
	return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff);
}

function u32(n: number): Uint8Array {
	return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

function concat(parts: Uint8Array[]): Uint8Array {
	const len = parts.reduce((a, p) => a + p.length, 0);
	const out = new Uint8Array(len);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

export type ZipEntry = { name: string; data: Uint8Array | string };

export function zipStoreBytes(entries: ZipEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBytes = encoder.encode(entry.name.replace(/\\/g, '/'));
		const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
		const crc = crc32(data);
		const local = concat([
			Uint8Array.of(0x50, 0x4b, 0x03, 0x04),
			u16(20),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(crc),
			u32(data.length),
			u32(data.length),
			u16(nameBytes.length),
			u16(0),
			nameBytes,
			data
		]);
		const central = concat([
			Uint8Array.of(0x50, 0x4b, 0x01, 0x02),
			u16(20),
			u16(20),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(crc),
			u32(data.length),
			u32(data.length),
			u16(nameBytes.length),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(0),
			u32(offset),
			nameBytes
		]);
		locals.push(local);
		centrals.push(central);
		offset += local.length;
	}

	const centralDir = concat(centrals);
	const end = concat([
		Uint8Array.of(0x50, 0x4b, 0x05, 0x06),
		u16(0),
		u16(0),
		u16(entries.length),
		u16(entries.length),
		u32(centralDir.length),
		u32(offset),
		u16(0)
	]);

	return concat([...locals, centralDir, end]);
}

export function zipStore(entries: ZipEntry[]): Blob {
	const bytes = zipStoreBytes(entries);
	const copy = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(copy).set(bytes);
	return new Blob([copy], { type: 'application/zip' });
}
