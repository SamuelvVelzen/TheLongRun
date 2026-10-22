import { getGoalsData } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { createFileRoute } from '@tanstack/react-router';
import { GoalsPage } from '../components/goals/GoalsPage';

type GoalsTab = 'races' | 'medals';
type GoalsSearch = { tab?: GoalsTab };

function parseTab(v: unknown): GoalsTab {
	return v === 'medals' ? 'medals' : 'races';
}

export const Route = createFileRoute('/goals')({
	validateSearch: (s: Record<string, unknown>): GoalsSearch => ({
		tab: parseTab(s.tab)
	}),
	loaderDeps: () => ({}),
	loader: () => ({ page: getGoalsData() }),
	head: () => appHead('Goals'),
	component: GoalsPage
});
