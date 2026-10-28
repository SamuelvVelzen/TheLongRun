import { formatTokenEstimate } from '$lib/prompt';
import { cn } from '$lib/ui';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from './Icon';
import { Button, Field, IconLabelButton, Textarea } from './ui';
import { buttonClass } from './ui/Button';

function formatUpdatedAt(ms: number): string {
	return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isFlowField(el: EventTarget | null): boolean {
	return (
		el instanceof HTMLTextAreaElement ||
		el instanceof HTMLInputElement ||
		(el instanceof HTMLElement && el.isContentEditable)
	);
}

/** Bumps when `prompt` changes and no field in `root` is focused — “Updated 14:32” hints. */
export function usePromptUpdated(
	prompt: string,
	enabled: boolean,
	root: RefObject<HTMLElement | null>
) {
	const [updatedAt, setUpdatedAt] = useState(() => Date.now());
	const committed = useRef(prompt);
	const inputFocused = useRef(false);
	const promptRef = useRef(prompt);
	const enabledRef = useRef(enabled);
	promptRef.current = prompt;
	enabledRef.current = enabled;

	function commitIfNew() {
		const next = promptRef.current;
		if (!enabledRef.current) return;
		if (next === committed.current) return;
		committed.current = next;
		setUpdatedAt(Date.now());
	}

	useEffect(() => {
		if (!enabled) {
			committed.current = prompt;
			return;
		}
		if (!inputFocused.current) commitIfNew();
	}, [prompt, enabled]);

	useEffect(() => {
		const el = root.current;
		if (!el || !enabled) return;

		function focusStillInside() {
			const active = document.activeElement;
			return active instanceof Node && el!.contains(active) && isFlowField(active);
		}

		function onFocusIn(e: FocusEvent) {
			if (!isFlowField(e.target)) return;
			inputFocused.current = true;
		}

		function onFocusOut() {
			window.requestAnimationFrame(() => {
				inputFocused.current = focusStillInside();
				if (!inputFocused.current) commitIfNew();
			});
		}

		el.addEventListener('focusin', onFocusIn);
		el.addEventListener('focusout', onFocusOut);
		return () => {
			el.removeEventListener('focusin', onFocusIn);
			el.removeEventListener('focusout', onFocusOut);
		};
	}, [enabled, root]);

	const isSaving = enabled && prompt !== committed.current;

	return {
		updatedAt,
		isSaving,
		label: `Updated ${formatUpdatedAt(updatedAt)}`
	};
}

export function PromptSummary({
	isSaving,
	label,
	className
}: {
	isSaving: boolean;
	label: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 text-[0.85rem] transition-colors duration-300 shrink-0',
				isSaving ? 'text-accent-fg' : 'text-muted',
				className
			)}
		>
			<span>{label}</span>
			{isSaving ? (
				<Icon name="spinner" size={14} className="animate-spin text-accent-fg" aria-hidden />
			) : (
				<Icon name="save" size={14} className="text-muted/80" aria-hidden />
			)}
		</span>
	);
}

/**
 * Shared “extra → copy + show prompt + updated → AI result” block (Wardrobe Ask AI, Fuel describe, Goals generate, …).
 */
export function AiPromptFlow({
	intro,
	extraLabel,
	extra,
	onExtraChange,
	extraPlaceholder,
	extraRows = 3,
	prompt,
	promptReady = true,
	promptRows = 10,
	promptEditable = false,
	onPromptChange,
	copyDisabled,
	afterCopy,
	result,
	className,
	children
}: {
	intro?: ReactNode;
	extraLabel?: ReactNode;
	extra?: string;
	onExtraChange?: (text: string) => void;
	extraPlaceholder?: string;
	extraRows?: number;
	prompt: string;
	/** When false, hide prompt + copy until the user has typed extra (Fuel-style). */
	promptReady?: boolean;
	promptRows?: number;
	promptEditable?: boolean;
	onPromptChange?: (text: string) => void;
	copyDisabled?: boolean;
	afterCopy?: ReactNode;
	/** JsonPasteForm or similar — shown when `promptReady`. */
	result?: ReactNode;
	className?: string;
	children?: ReactNode;
}) {
	const [copied, setCopied] = useState(false);
	const [promptOpen, setPromptOpen] = useState(false);
	const flowRef = useRef<HTMLDivElement>(null);
	const { isSaving, label } = usePromptUpdated(prompt, promptReady, flowRef);

	async function copy() {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
		} catch {
			/* ignore */
		}
	}

	const hasExtraField = extraLabel != null && onExtraChange != null;

	return (
		<div ref={flowRef} className={cn('grid gap-3', className)}>
			{intro ? <div className={cn('text-muted', 'm-0 text-[0.9rem]')}>{intro}</div> : null}
			{hasExtraField && (
				<Field label={extraLabel}>
					<Textarea
						rows={extraRows}
						value={extra ?? ''}
						placeholder={extraPlaceholder}
						onChange={(e) => onExtraChange(e.target.value)}
					/>
				</Field>
			)}
			{children}
			{promptReady && (
				<>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-h-11">
						<IconLabelButton
							label={copied ? 'Copied' : 'Copy prompt'}
							variant="primary"
							disabled={copyDisabled}
							icon={<Icon name={copied ? 'check' : 'copy'} size={16} />}
							onClick={() => void copy()}
						/>
						<span
							className="text-muted text-[0.85rem] tabular-nums"
							title="Rough size of the prompt (about 4 characters per token)"
						>
							{formatTokenEstimate(prompt)}
						</span>
						{afterCopy}
						<button
							type="button"
							className="inline-flex items-center gap-1.5 text-[0.9rem] font-semibold text-fg hover:text-accent-fg transition-colors"
							aria-expanded={promptOpen}
							onClick={() => setPromptOpen((open) => !open)}
						>
							<span className="text-muted font-normal" aria-hidden>
								→
							</span>
							{promptOpen ? 'Hide prompt' : 'Show prompt'}
							<span
								className={buttonClass({
									variant: 'ghost',
									size: 'icon',
									className: 'pointer-events-none -mx-0.5'
								})}
								aria-hidden
							>
								<Icon
									name="arrow"
									size={16}
									className={cn(
										'transition-transform duration-150',
										promptOpen ? '-rotate-90' : 'rotate-90'
									)}
								/>
							</span>
						</button>
						<PromptSummary isSaving={isSaving} label={label} className="ml-auto" />
					</div>
					<div className={cn(!promptOpen && 'hidden')} aria-hidden={!promptOpen}>
						<Textarea
							variant="editor"
							rows={promptRows}
							value={prompt}
							readOnly={!promptEditable}
							tabIndex={promptOpen ? undefined : -1}
							onChange={
								promptEditable && onPromptChange ? (e) => onPromptChange(e.target.value) : undefined
							}
						/>
					</div>
					{result}
				</>
			)}
		</div>
	);
}
