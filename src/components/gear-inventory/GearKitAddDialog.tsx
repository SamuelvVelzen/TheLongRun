import { ACTIVITY_TYPES, activityLabel, type ActivityType } from '$lib/activity';
import { addGear, gearKindForActivity, gearMeta, type GearContext, type GearKind } from '$lib/gear';
import { useEffect, useState } from 'react';
import { ChoiceChips } from '../ChoiceChips';
import { Icon, sportChipLabel } from '../Icon';
import { GearAiImportPanel } from '../GearAiDialog';
import { Button, Dialog, Field, PageTabs } from '../ui';
import { buttonClass } from '../ui/Button';

type Tab = 'add' | 'ai';

const SPORT_OPTIONS = ACTIVITY_TYPES.map((t) => ({
	value: t,
	label: sportChipLabel(t, activityLabel(t))
}));

function kitKindForActivity(type: ActivityType): GearKind | null {
	if (type === 'strength') return null;
	return gearKindForActivity(type);
}

export function GearKitAddDialog({
	open,
	gear,
	busy,
	onClose,
	onPersist
}: {
	open: boolean;
	gear: GearContext;
	busy: boolean;
	onClose: () => void;
	onPersist: (next: GearContext, okMessage: string) => Promise<boolean>;
}) {
	const [tab, setTab] = useState<Tab>('ai');
	const [activity, setActivity] = useState<ActivityType>('run');
	const [name, setName] = useState('');

	useEffect(() => {
		if (open) setTab('ai');
	}, [open]);

	const kind = kitKindForActivity(activity);
	const meta = kind ? gearMeta(kind) : null;

	async function submitAdd() {
		if (!kind) return;
		const trimmed = name.trim();
		if (!trimmed) return;
		const ok = await onPersist(
			{ ...gear, [kind]: addGear(gear[kind], trimmed) },
			`Added ${trimmed}`
		);
		if (ok) {
			setName('');
			onClose();
		}
	}

	return (
		<Dialog
			open={open}
			title="Add kit"
			size="medal"
			className="sm:max-w-[min(38rem,100%)]!"
			onClose={busy ? () => {} : onClose}
		>
			<PageTabs
				sticky={false}
				aria-label="Add kit"
				value={tab}
				onChange={setTab}
				className="mb-4"
				options={[
					{ value: 'ai', label: 'Import with AI' },
					{ value: 'add', label: 'Add item' }
				]}
			/>
			{tab === 'add' ? (
				<div className="grid gap-4">
					<div className="grid gap-2">
						<span className="text-[0.9rem] text-muted">Sport</span>
						<ChoiceChips
							aria-label="Sport"
							value={activity}
							options={SPORT_OPTIONS}
							disabled={busy}
							onChange={setActivity}
						/>
					</div>
					{kind && meta ? (
						<>
							<Field as="label" label={`${meta.label} name`}>
								<input
									value={name}
									disabled={busy}
									placeholder={meta.addPlaceholder}
									onChange={(e) => setName(e.target.value)}
								/>
							</Field>
							<div className="flex justify-end gap-2">
								<button
									type="button"
									className={buttonClass({ variant: 'ghost' })}
									disabled={busy}
									onClick={onClose}
								>
									Cancel
								</button>
								<Button
									type="button"
									variant="primary"
									disabled={busy || !name.trim()}
									onClick={() => void submitAdd()}
								>
									<Icon name="plus" size={16} />
									Add
								</Button>
							</div>
						</>
					) : (
						<p className="m-0 text-muted text-[0.9rem]">
							Strength has no gear list — use habits in the Run section on the gear page.
						</p>
					)}
				</div>
			) : (
				<GearAiImportPanel gear={gear} busy={busy} onClose={onClose} onSave={onPersist} />
			)}
		</Dialog>
	);
}
