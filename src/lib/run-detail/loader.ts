import { entityNotFound } from '$lib/not-found';
import { getRunDetail } from '$lib/server/functions';

export async function loadRunDetail(slug: string) {
	const detail = await getRunDetail({ data: slug });
	if (!detail) throw entityNotFound('activity');
	return detail;
}
