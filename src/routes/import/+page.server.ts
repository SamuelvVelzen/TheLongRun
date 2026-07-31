import { fail } from '@sveltejs/kit';
import {
	extractFitFromZip,
	importFitFiles,
	isFitFilename,
	type ImportSummary
} from '$lib/server/import-fit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {};
};

async function fileFromForm(value: FormDataEntryValue | null): Promise<{
	name: string;
	buffer: Buffer;
} | null> {
	if (!(value instanceof File) || !value.size) return null;
	return { name: value.name, buffer: Buffer.from(await value.arrayBuffer()) };
}

export const actions: Actions = {
	default: async ({ request }) => {
		const fd = await request.formData();
		const runsOnly = fd.getAll('runs_only').map(String).includes('1');
		const files: { name: string; buffer: Buffer }[] = [];
		let csvText: string | undefined;

		const csvFile = await fileFromForm(fd.get('activities_csv'));
		if (csvFile) {
			csvText = csvFile.buffer.toString('utf8');
		}

		const zipFile = await fileFromForm(fd.get('zip'));
		if (zipFile) {
			try {
				const extracted = await extractFitFromZip(zipFile.buffer);
				files.push(...extracted.files);
				if (extracted.csvText) csvText = extracted.csvText;
			} catch (e) {
				return fail(400, {
					message: e instanceof Error ? e.message : 'Could not read zip'
				});
			}
		}

		const fitEntries = fd.getAll('fit_files');
		for (const entry of fitEntries) {
			const f = await fileFromForm(entry);
			if (!f) continue;
			if (!isFitFilename(f.name)) {
				return fail(400, { message: `Not a FIT file: ${f.name}` });
			}
			files.push(f);
		}

		if (!files.length) {
			return fail(400, {
				message: 'Upload one or more .fit / .fit.gz files, or a Strava export zip.'
			});
		}

		let summary: ImportSummary;
		try {
			summary = await importFitFiles({ files, csvText, runsOnly });
		} catch (e) {
			return fail(500, {
				message: e instanceof Error ? e.message : 'Import failed'
			});
		}

		return {
			ok: true,
			message: `Imported ${summary.created} new, updated ${summary.updated}, skipped ${summary.skipped}, errors ${summary.errors}.`,
			summary
		};
	}
};
