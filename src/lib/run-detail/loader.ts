import { getRunDetail } from '$lib/server/functions';
import { notFound } from '@tanstack/react-router';

export async function loadRunDetail(slug: string) {
	const detail = await getRunDetail({ data: slug });
	if (!detail) throw notFound();
	return detail;
}
