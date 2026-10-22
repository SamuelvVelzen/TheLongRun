import { loadRunDetail } from '$lib/run-detail/loader';
import { activityTitlePart, appHead } from '$lib/title';
import { createFileRoute } from '@tanstack/react-router';
import { RunDetail } from '../components/run-detail/RunDetail';

type RunSearch = { edit?: boolean };

export const Route = createFileRoute('/runs/$slug')({
	validateSearch: (s: Record<string, unknown>): RunSearch => ({
		edit: s.edit === true || s.edit === 'true' || s.edit === '1' ? true : undefined
	}),
	loader: async ({ params }) => loadRunDetail(params.slug),
	head: ({ loaderData }) =>
		appHead(loaderData ? activityTitlePart(loaderData.run) : null, 'Timeline'),
	component: RunDetail
});
