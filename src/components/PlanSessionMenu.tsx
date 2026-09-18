import { useAuthed } from '$lib/auth';
import { isRestLike, isSkippedStatus, sessionCanLinkRoute, type WeekSessionView } from '$lib/plan';
import { setPlanSessionSkipped } from '$lib/server/functions';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { Icon } from './Icon';
import { plannedSessionLogSearch } from './LogPlannedStrength';
import { MoreMenu, type MoreMenuItem } from './MoreMenu';
import { errorMessage, useSnackbar } from './Snackbar';

export function PlanSessionMenu({
	week,
	session,
	linked,
	onAddRoute
}: {
	week: number;
	session: WeekSessionView;
	linked: boolean;
	onAddRoute: () => void;
}) {
	const authed = useAuthed();
	const router = useRouter();
	const navigate = useNavigate();
	const snack = useSnackbar();
	const [busy, setBusy] = useState(false);

	if (!authed || session.done) return null;

	const rest = isRestLike(session.label);
	const storedSkip = isSkippedStatus(session.status);
	const canSkip = !session.skipped && !rest;
	const canUndoSkip = storedSkip;
	const canLog = !session.skipped && !rest;
	const canAddRoute =
		!session.skipped && !linked && sessionCanLinkRoute(session);

	async function persistSkipped(skipped: boolean) {
		await setPlanSessionSkipped({
			data: {
				week,
				day: session.day,
				label: session.label,
				activity_type: session.activity_type,
				skipped
			}
		});
		await router.invalidate();
	}

	async function setSkipped(skipped: boolean) {
		if (busy) return;
		setBusy(true);
		try {
			await persistSkipped(skipped);
			if (skipped) {
				snack.success(`Skipped ${session.label}`, {
					action: {
						label: 'Undo',
						onClick: () => {
							void persistSkipped(false).then(
								() => snack.success(`Restored ${session.label}`),
								(error) =>
									snack.error(errorMessage(error, 'Could not restore this session'))
							);
						}
					}
				});
			} else {
				snack.success(`Restored ${session.label}`);
			}
		} catch (error) {
			snack.error(
				errorMessage(error, skipped ? 'Could not skip this session' : 'Could not restore this session')
			);
		} finally {
			setBusy(false);
		}
	}

	const items: MoreMenuItem[] = [
		...(canSkip
			? [
					{
						label: 'Mark as skip',
						icon: <Icon name="skip" size={16} />,
						onClick: () => void setSkipped(true),
						disabled: busy
					}
				]
			: []),
		...(canUndoSkip
			? [
					{
						label: 'Undo skip',
						icon: <Icon name="undo" size={16} />,
						onClick: () => void setSkipped(false),
						disabled: busy
					}
				]
			: []),
		...(canLog
			? [
					{
						label: 'Log activity',
						icon: <Icon name="plus" size={16} />,
						onClick: () => {
							void navigate({ to: '/import', search: plannedSessionLogSearch(session) });
						},
						disabled: busy
					}
				]
			: []),
		...(canAddRoute
			? [
					{
						label: 'Add route to plan',
						icon: <Icon name="routes" size={16} />,
						onClick: onAddRoute,
						disabled: busy
					}
				]
			: [])
	];

	return <MoreMenu compact items={items} label="Session actions" />;
}
