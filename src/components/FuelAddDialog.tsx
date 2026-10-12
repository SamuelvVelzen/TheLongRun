import { FUEL_PHASE_META, type FuelPhase } from '$lib/fuel';
import type { FuelFormValues } from '$lib/fuel-schema';
import { cn } from '$lib/ui';
import { emptyFuelForm, FuelEntryForm } from './FuelEntryForm';
import { Dialog, dialogPanelMedalClass } from './ui';

export function FuelAddDialog({
	open,
	phase,
	busy,
	onClose,
	onAdd
}: {
	open: boolean;
	phase: FuelPhase;
	busy: boolean;
	onClose: () => void;
	onAdd: (values: FuelFormValues) => Promise<boolean>;
}) {
	return (
		<Dialog
			open={open}
			title={`Add · ${FUEL_PHASE_META[phase].label}`}
			onClose={busy ? () => {} : onClose}
			className={cn(dialogPanelMedalClass, 'sm:max-w-[min(38rem,100%)]!')}
		>
			<FuelEntryForm
				className="mt-0"
				initial={emptyFuelForm(phase)}
				submitLabel="Add try"
				busy={busy}
				onCancel={onClose}
				onSave={async (values) => {
					const ok = await onAdd(values);
					if (ok) onClose();
					return ok;
				}}
			/>
		</Dialog>
	);
}
