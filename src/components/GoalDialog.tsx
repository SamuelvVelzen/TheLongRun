import type { Goal } from '$lib/types';
import { cn } from '$lib/ui';
import { GoalForm } from './GoalForm';
import { Dialog } from './ui';

export type GoalDialogVariant = 'race' | 'lookahead';

export function goalDialogTitle(
	variant: GoalDialogVariant,
	mode: 'add' | 'edit',
	opts: { goalName?: string; hasActiveGoal?: boolean }
): string {
	if (mode === 'edit' && opts.goalName) {
		return variant === 'lookahead' ? `Edit ${opts.goalName}` : `Edit ${opts.goalName}`;
	}
	if (variant === 'lookahead') return 'Add look-ahead';
	if (opts.hasActiveGoal) return 'Add race';
	return 'Set a race';
}

export function goalDialogDescription(
	variant: GoalDialogVariant,
	mode: 'add' | 'edit',
	opts: { hasActiveGoal?: boolean }
): string {
	if (mode === 'edit' && variant === 'race') {
		return 'Updates name, date, distance, and notes. Medal time stays tied to the linked activity when this race is on the wall.';
	}
	if (variant === 'lookahead') {
		return 'Month only — coach can see it when planning. It never sets race day or plan length.';
	}
	if (opts.hasActiveGoal) {
		return 'Later dates wait. A sooner date takes over as active and resets the plan.';
	}
	return 'The soonest booked race becomes active and sets the plan length.';
}

export function goalDialogSubmitLabel(
	variant: GoalDialogVariant,
	mode: 'add' | 'edit',
	opts: { hasActiveGoal?: boolean; isActiveGoal?: boolean }
): string {
	if (mode === 'edit') {
		if (variant === 'lookahead') return 'Save look-ahead';
		return opts.isActiveGoal ? 'Save goal' : 'Save race';
	}
	if (variant === 'lookahead') return 'Save look-ahead';
	if (opts.hasActiveGoal) return 'Add race';
	return 'Set race';
}

export function GoalDialog({
	open,
	variant,
	mode,
	initial,
	hasActiveGoal,
	isActiveGoal,
	onClose,
	onSaved
}: {
	open: boolean;
	variant: GoalDialogVariant;
	mode: 'add' | 'edit';
	initial: Goal | null;
	hasActiveGoal?: boolean;
	isActiveGoal?: boolean;
	onClose: () => void;
	onSaved: () => void | Promise<void>;
}) {
	const fixedKind = variant === 'lookahead' ? 'intention' : 'race';
	const title = goalDialogTitle(variant, mode, { goalName: initial?.name, hasActiveGoal });
	const description = goalDialogDescription(variant, mode, { hasActiveGoal });
	const submitLabel = goalDialogSubmitLabel(variant, mode, { hasActiveGoal, isActiveGoal });

	return (
		<Dialog
			open={open}
			title={title}
			onClose={onClose}
			size="medal"
			className="sm:max-w-[min(42rem,100%)]!"
		>
			<p className={cn('text-muted', 'm-0')}>{description}</p>
			{open ? (
				<GoalForm
					key={initial?.id ?? (variant === 'lookahead' ? 'new-look' : 'new-race')}
					initial={mode === 'edit' ? initial : null}
					fixedKind={fixedKind}
					submitLabel={submitLabel}
					onCancel={onClose}
					onSaved={onSaved}
				/>
			) : null}
		</Dialog>
	);
}
