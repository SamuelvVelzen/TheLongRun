import { activityLabel } from '$lib/activity';
import { sessionMeasureLabel, type WeekSessionView } from '$lib/plan';
import { ActivityIcon } from './Icon';
import { PlanSessionDetailsContent } from './PlanSessionBody';
import { Dialog } from './ui';

function sessionSportLine(session: WeekSessionView): string {
	return [activityLabel(session.activity_type ?? 'run'), sessionMeasureLabel(session)]
		.filter(Boolean)
		.join(' · ');
}

export function PlanSessionDetailsDialog({
	open,
	session,
	onClose
}: {
	open: boolean;
	session: WeekSessionView;
	onClose: () => void;
}) {
	const sportLine = sessionSportLine(session);

	return (
		<Dialog
			open={open}
			title={session.label}
			onClose={onClose}
			compactClose
			className="gap-3 sm:max-w-[min(28rem,100%)]!"
		>
			<div className="-mt-1 flex min-w-0 items-center gap-1.5 text-[0.84rem] font-semibold text-muted">
				<ActivityIcon type={session.activity_type ?? 'run'} size={14} />
				<span className="[overflow-wrap:anywhere]">{sportLine}</span>
			</div>
			<PlanSessionDetailsContent session={session} presentation="dialog" className="mt-1" />
		</Dialog>
	);
}
