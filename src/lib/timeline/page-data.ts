import {
	emptyTimelinePageData,
	formatTimelinePageDataIssues,
	timelinePageDataSchema,
	type TimelinePageData
} from './page-data-schema';

export type { TimelinePageData } from './page-data-schema';
export { timelinePageDataSchema } from './page-data-schema';

/** Server / trusted paths — invalid shape throws. */
export function assertTimelinePageData(raw: unknown): TimelinePageData {
	return timelinePageDataSchema.parse(raw);
}

/** Loader and client boundaries — invalid payloads fall back to an empty timeline. */
export function parseTimelinePageData(raw: unknown): TimelinePageData {
	const result = timelinePageDataSchema.safeParse(raw);
	if (result.success) return result.data;
	console.error('Invalid timeline page data:', formatTimelinePageDataIssues(result.error));
	return emptyTimelinePageData();
}
