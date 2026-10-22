import type { PlanWeek } from '$lib/types';
import { readContextFile, writeContextFile } from './context-io';

export async function loadPlan(): Promise<PlanWeek[]> {
	const raw = await readContextFile('plan.json');
	if (!raw) return [];
	try {
		return JSON.parse(raw) as PlanWeek[];
	} catch {
		return [];
	}
}

export async function savePlan(plan: PlanWeek[]): Promise<void> {
	await writeContextFile('plan.json', `${JSON.stringify(plan, null, 2)}\n`);
}
