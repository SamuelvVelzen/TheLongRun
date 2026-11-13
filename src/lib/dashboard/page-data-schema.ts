import { emptyGear } from '$lib/gear';
import { timelinePageDataSchema } from '$lib/timeline/page-data-schema';
import { z } from 'zod';

/** Fields the dashboard renders without optional chaining — same contract as the timeline loader. */
export const dashboardCoreDataSchema = z.object({
	runs: timelinePageDataSchema.shape.runs,
	groups: timelinePageDataSchema.shape.groups,
	gear: timelinePageDataSchema.shape.gear
});

export type DashboardCoreData = z.infer<typeof dashboardCoreDataSchema>;

export function emptyDashboardCoreData(): DashboardCoreData {
	return {
		runs: [],
		groups: [],
		gear: emptyGear()
	};
}

export function formatDashboardCoreIssues(error: z.ZodError, max = 6): string {
	const lines = error.issues.slice(0, max).map((i) => {
		const path = i.path.length ? i.path.join('.') : '(root)';
		return `${path}: ${i.message}`;
	});
	const extra = error.issues.length > max ? ` (+${error.issues.length - max} more)` : '';
	return lines.join('; ') + extra;
}
