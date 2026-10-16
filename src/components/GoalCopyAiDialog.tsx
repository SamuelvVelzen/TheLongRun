import { getGoalBrief } from '$lib/server/functions';
import { cn } from '$lib/ui';
import {
	GOAL_EXTRA_TOKEN,
	injectGoalExtra,
	planGoalCopyImport,
	parseGoalCopyReplyText,
	type GoalCopyChange,
	type GoalCopyDraft,
	type GoalCopyPatch
} from '$lib/goal-copy-schema';
import { useEffect, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { Button, Checkbox, Dialog, errorMessage, useDiscardGuard, useSnackbar } from './ui';

const RACE_PLACEHOLDER = `{
  "name": "Amersfoort 10K",
  "date": "2026-11-01",
  "distance_km": 10,
  "sport": "run",
  "time_goal": "45:00",
  "plan_start": "2026-09-07",
  "url": "",
  "itinerary_url": "",
  "primary": ["…"],
  "notes": "…"
}`;

const INTENTION_PLACEHOLDER = `{
  "name": "Half marathon",
  "horizon": "2027-04",
  "distance_km": 21.1,
  "sport": "run",
  "time_goal": "",
  "url": "",
  "itinerary_url": "",
  "primary": ["…"],
  "notes": "…"
}`;

export function GoalCopyAiDialog({
	open,
	draft,
	kind,
	busy,
	onClose,
	onApply
}: {
	open: boolean;
	draft: GoalCopyDraft;
	kind: 'race' | 'intention';
	busy?: boolean;
	onClose: () => void;
	onApply: (patch: GoalCopyPatch) => void;
}) {
	const snack = useSnackbar();
	const [extra, setExtra] = useState('');
	const [template, setTemplate] = useState('');
	const [briefBusy, setBriefBusy] = useState(false);
	const [changes, setChanges] = useState<GoalCopyChange[]>([]);
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const briefKey = JSON.stringify(
		kind === 'intention' ? { ...draft, date: '', plan_start: '' } : draft
	);

	useEffect(() => {
		if (!open) {
			setTemplate('');
			setChanges([]);
			setPicked(new Set());
			return;
		}
		let cancelled = false;
		setBriefBusy(true);
		getGoalBrief({ data: { ...(JSON.parse(briefKey) as GoalCopyDraft), extra: GOAL_EXTRA_TOKEN } })
			.then((next) => {
				if (!cancelled) setTemplate(next);
			})
			.catch((e) => {
				if (!cancelled) snack.error(errorMessage(e, 'Could not build the prompt.'));
			})
			.finally(() => {
				if (!cancelled) setBriefBusy(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, briefKey, snack]);

	const prompt = template ? injectGoalExtra(template, extra) : '';

	function apply() {
		const patch: GoalCopyPatch = {};
		for (const c of changes) {
			if (picked.has(c.key)) Object.assign(patch, c.patch);
		}
		if (!Object.keys(patch).length) return;
		onApply(patch);
		setExtra('');
		onClose();
	}

	function toggle(key: string, on: boolean) {
		setPicked((prev) => {
			const next = new Set(prev);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});
	}

	const count = picked.size;
	const confirming = changes.length > 0;
	const dirty = confirming || extra !== '';
	const [requestClose, discardGuard] = useDiscardGuard({
		dirty,
		busy: busy || briefBusy,
		onDiscard: onClose,
		title: 'Discard this import?',
		description: 'Your pasted reply and picks will be lost.'
	});

	return (
		<>
			<Dialog
				open={open}
				title={kind === 'race' ? 'Import race details with AI' : 'Import goal details with AI'}
				className="sm:max-w-[min(42rem,100%)]!"
				onClose={requestClose}
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
							{changes.map((c) => (
								<Checkbox
									key={c.key}
									className="py-2"
									checked={picked.has(c.key)}
									disabled={busy}
									onChange={(on) => toggle(c.key, on)}
									label={
										c.lines ? (
											<>
												<strong className="font-display">{c.label}</strong>
												<ul className="m-0 mt-1 pl-[1.1rem] text-[0.9rem]">
													{c.lines.map((line) => (
														<li key={line}>{line}</li>
													))}
												</ul>
											</>
										) : c.multiline ? (
											<>
												<strong className="font-display">{c.label}</strong>
												<p
													className={cn('text-muted', 'm-0 mt-1 text-[0.9rem] whitespace-pre-wrap')}
												>
													{c.preview}
												</p>
											</>
										) : (
											<>
												<span>
													<strong className="font-display">{c.label}:</strong>{' '}
													<span className="break-all">{c.preview}</span>
												</span>
												{c.was ? (
													<span className={cn('text-muted', 'block text-[0.85rem]')}>
														Was {c.was}
													</span>
												) : null}
												{c.hint ? (
													<span className={cn('text-muted', 'block text-[0.85rem]')}>{c.hint}</span>
												) : null}
											</>
										)
									}
								/>
							))}
						</div>
					</>
				) : (
					<AiPromptFlow
						intro={
							<p className="m-0">
								Training context plus this goal. Copy the prompt, paste the JSON back, then pick
								which fields to apply to the form.
							</p>
						}
						extraLabel="Anything extra for the prompt? (optional)"
						extra={extra}
						onExtraChange={setExtra}
						extraPlaceholder="Hilly course, travel the day before, conservative first 5k…"
						prompt={prompt}
						promptReady={Boolean(prompt)}
						promptRows={12}
						result={
							<JsonPasteForm
								description={
									<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>Paste the AI's reply</p>
								}
								rows={8}
								placeholder={kind === 'race' ? RACE_PLACEHOLDER : INTENTION_PLACEHOLDER}
								submitLabel="Check reply"
								submitIcon="check"
								errorLabel="Could not read that reply."
								onSubmit={(text) => {
									const next = planGoalCopyImport(parseGoalCopyReplyText(text), draft, kind);
									setChanges(next);
									setPicked(new Set(next.map((c) => c.key)));
								}}
							/>
						}
					>
						{briefBusy && !prompt ? (
							<p className={cn('text-muted', 'm-0')}>Building prompt…</p>
						) : null}
					</AiPromptFlow>
				)}
			</Dialog>
			{discardGuard}
		</>
	);
}
