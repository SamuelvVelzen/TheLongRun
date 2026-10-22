import { zipStoreBytes } from '$lib/zip';

export function zipFilePayload(filename: string, entries: { name: string; data: string }[]) {
	const bytes = zipStoreBytes(entries);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
	return {
		filename,
		mime: 'application/zip',
		encoding: 'base64' as const,
		body: btoa(binary)
	};
}
