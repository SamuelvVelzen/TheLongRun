import { BODY_NOTE_STATUS_META, capitalize, type BodyNote, type BodyNoteStatus } from '$lib/body-notes';
import { cn } from '$lib/ui';
import type { ReactNode } from 'react';
import { statusPillClass } from './ui';

const STATUS_TONE: Record<BodyNoteStatus, string> = {
	active: 'bg-warn/10 text-warn',
	monitoring: 'bg-accent/15 text-accent-fg',
	resolved: 'text-muted border border-line'
};

export function BodyStatusPill({ status }: { status: BodyNoteStatus }) {
	return <span className={statusPillClass(STATUS_TONE[status])}>{BODY_NOTE_STATUS_META[status].label}</span>;
}

export function BodyNoteLine({
	note,
	tag,
	actions,
	hideUpdated
}: {
	note: BodyNote;
	tag?: ReactNode;
	actions?: ReactNode;
	hideUpdated?: boolean;
}) {
	return (
		<div className="py-2">
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<strong className="font-display text-[1.02rem] tracking-[-0.02em]">{capitalize(note.area)}</strong>
				<BodyStatusPill status={note.status} />
				{note.tracked ? <span className={statusPillClass('text-muted border border-line')}>Scored</span> : null}
				{tag}
			</div>
			{note.trigger || note.helps ? (
				<p className={cn('text-muted', 'm-0 mt-1 text-[0.86rem]')}>
					{[note.trigger && `Trigger: ${note.trigger}`, note.helps && `Helps: ${note.helps}`]
						.filter(Boolean)
						.join(' · ')}
				</p>
			) : null}
			{hideUpdated ? null : (
				<p className={cn('text-muted', 'm-0 mt-1 text-[0.78rem]')}>Updated {note.updated}</p>
			)}
			{actions ? <div className="flex flex-wrap gap-2 mt-2">{actions}</div> : null}
		</div>
	);
}
