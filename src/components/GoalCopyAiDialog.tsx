import type { GoalBriefDraft } from '$lib/server/functions';
import { getGoalBrief } from '$lib/server/functions';
import { cn } from '$lib/ui';
import {
	planGoalCopyImport,
	parseGoalCopyReplyText,
	type GoalCopyChange
} from '$lib/goal-copy-schema';
import { useEffect, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { Button, Checkbox, Dialog, errorMessage, useSnackbar } from './ui';

export function GoalCopyAiDialog({
	open,
	draft,
	busy,
	onClose,
	onApply
}: {
	open: boolean;
	draft: GoalBriefDraft;
	busy?: boolean;
	onClose: () => void;
	onApply: (patch: { primary?: string; notes?: string }) => void;
}) {
	const snack = useSnackbar();
	const [extra, setExtra] = useState('');
	const [briefText, setBriefText] = useState('');
	const [briefBusy, setBriefBusy] = useState(false);
	const [changes, setChanges] = useState<GoalCopyChange[]>([]);
	const [picked, setPicked] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (open) return;
		setBriefText('');
		setChanges([]);
		setPicked(new Set());
	}, [open]);

	async function generateBrief() {
		setBriefBusy(true);
		try {
			const next = await getGoalBrief({
				data: {
					...draft,
					extra
				}
			});
			setBriefText(next);
		} catch (e) {
			snack.error(errorMessage(e, 'Could not build the prompt.'));
		} finally {
			setBriefBusy(false);
		}
	}

	function apply() {
		const patch: { primary?: string; notes?: string } = {};
		for (const c of changes) {
			if (!picked.has(c.key)) continue;
			if (c.key === 'primary') patch.primary = c.lines.join('\n');
			else patch.notes = c.text;
		}
		if (!Object.keys(patch).length) return;
		onApply(patch);
		setExtra('');
		onClose();
	}

	const count = picked.size;
	const confirming = changes.length > 0;

	return (
		<Dialog
			open={open}
			title="Import priorities with AI"
			className="sm:max-w-[min(42rem,100%)]!"
			onClose={busy || briefBusy ? () => {} : onClose}
			actions={
				confirming ? (
					<>
						<Button variant="ghost" disabled={busy} onClick={() => setChanges([])}>
							Back
						</Button>
						<Button variant="primary" disabled={busy || count === 0} onClick={apply}>
							<Icon name="check" size={16} />
							{busy ? 'Applying…' : `Apply ${count}`}
						</Button>
					</>
				) : undefined
			}
		>
			{confirming ? (
				<>
					<p className={cn('text-muted', 'm-0')}>Untick anything you don't want in the form.</p>
					<div className="grid gap-1">
						{changes.map((c) =>
							c.key === 'primary' ? (
								<Checkbox
									key={c.key}
									className="py-2"
									checked={picked.has(c.key)}
									disabled={busy}
									onChange={(on) =>
										setPicked((prev) => {
											const next = new Set(prev);
											if (on) next.add(c.key);
											else next.delete(c.key);
											return next;
										})
									}
									label={
										<>
											<strong className="font-display">Priorities</strong>
											<ul className="m-0 mt-1 pl-[1.1rem] text-[0.9rem]">
												{c.lines.map((line) => (
													<li key={line}>{line}</li>
												))}
											</ul>
										</>
									}
								/>
							) : (
								<Checkbox
									key={c.key}
									className="py-2"
									checked={picked.has(c.key)}
									disabled={busy}
									onChange={(on) =>
										setPicked((prev) => {
											const next = new Set(prev);
											if (on) next.add(c.key);
											else next.delete(c.key);
											return next;
										})
									}
									label={
										<>
											<strong className="font-display">Notes</strong>
											<p className={cn('text-muted', 'm-0 mt-1 whitespace-pre-wrap text-[0.9rem]')}>
												{c.text}
											</p>
										</>
									}
								/>
							)
						)}
					</div>
				</>
			) : (
				<AiPromptFlow
					intro={
						<p className="m-0">
							Same brief as Generate: training context plus this goal. Copy the prompt, paste JSON back — only
							priorities and notes are applied to the form.
						</p>
					}
					extraLabel="Anything extra for the prompt? (optional)"
					extra={extra}
					onExtraChange={setExtra}
					extraPlaceholder="Hilly course, travel the day before, conservative first 5k…"
					prompt={briefText}
					promptReady={Boolean(briefText)}
					promptRows={12}
					result={
						briefText ? (
							<JsonPasteForm
								description={<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>Paste the AI's reply</p>}
								rows={5}
								placeholder='{ "primary": ["…"], "notes": "…" }'
								submitLabel="Check reply"
								submitIcon="check"
								errorLabel="Could not read that reply."
								onSubmit={(text) => {
									const next = planGoalCopyImport(parseGoalCopyReplyText(text));
									setChanges(next);
									setPicked(new Set(next.map((c) => c.key)));
								}}
							/>
						) : (
							<Button variant="primary" disabled={briefBusy} onClick={() => void generateBrief()}>
								<Icon name="sparkle" size={16} />
								{briefBusy ? 'Building…' : 'Generate prompt'}
							</Button>
						)
					}
				>
					{briefText ? (
						<Button variant="ghost" disabled={briefBusy} onClick={() => void generateBrief()}>
							<Icon name="sparkle" size={16} />
							{briefBusy ? 'Building…' : 'Regenerate prompt'}
						</Button>
					) : null}
				</AiPromptFlow>
			)}
		</Dialog>
	);
}
