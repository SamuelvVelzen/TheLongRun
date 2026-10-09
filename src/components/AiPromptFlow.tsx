import { cn } from '$lib/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Button, Field, Textarea, buttonClass } from './ui';

function formatUpdatedAt(ms: number): string {
	return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Bumps when `prompt` changes — use for “Updated 14:32” hints. */
export function usePromptUpdated(prompt: string, enabled = true) {
	const [updatedAt, setUpdatedAt] = useState(() => Date.now());
	const [flash, setFlash] = useState(false);
	const skipInitial = useRef(true);

	useEffect(() => {
		if (!enabled) return;
		if (skipInitial.current) {
			skipInitial.current = false;
			return;
		}
		setUpdatedAt(Date.now());
		setFlash(true);
		const t = window.setTimeout(() => setFlash(false), 1400);
		return () => window.clearTimeout(t);
	}, [prompt, enabled]);

	return {
		updatedAt,
		flash,
		label: `Updated ${formatUpdatedAt(updatedAt)}`
	};
}

export function PromptSummary({
	flash,
	label,
	className
}: {
	flash: boolean;
	label: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 text-[0.85rem] transition-colors duration-300',
				flash ? 'text-accent-fg' : 'text-muted',
				className
			)}
		>
			<span>{label}</span>
			{flash ? (
				<Icon name="spinner" size={14} className="animate-spin text-accent-fg" />
			) : (
				<Icon name="save" size={14} className="text-muted/80" aria-hidden />
			)}
		</span>
	);
}

/**
 * Shared “extra → collapsible prompt → copy → AI result” block (Wardrobe Ask AI, Fuel describe, Goals generate, …).
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
	const { flash, label } = usePromptUpdated(prompt, promptReady);

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
		<div className={cn('grid gap-3', className)}>
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
					<details className="group/prompt">
						<summary
							className="flex items-center gap-2 min-h-11 py-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
						>
							<PromptSummary flash={flash} label={label} className="flex-1 min-w-0" />
							<span
								className="inline-flex items-center gap-1.5 shrink-0 text-[0.9rem] font-semibold text-fg group-open/prompt:hidden"
							>
								<span className="text-muted font-normal" aria-hidden>→</span>
								Show prompt
								<span
									className={buttonClass({
										variant: 'ghost',
										size: 'icon',
										className: 'pointer-events-none -mr-0.5'
									})}
									aria-hidden
								>
									<Icon
										name="arrow"
										size={16}
										className="rotate-90 transition-transform duration-150"
									/>
								</span>
							</span>
							<span
								className="hidden group-open/prompt:inline-flex items-center gap-1.5 shrink-0 text-[0.9rem] font-semibold text-muted"
							>
								Hide prompt
								<span
									className={buttonClass({
										variant: 'ghost',
										size: 'icon',
										className: 'pointer-events-none -mr-0.5'
									})}
									aria-hidden
								>
									<Icon
										name="arrow"
										size={16}
										className="-rotate-90 transition-transform duration-150"
									/>
								</span>
							</span>
						</summary>
						<Textarea
							variant="editor"
							rows={promptRows}
							value={prompt}
							readOnly={!promptEditable}
							className="mt-2"
							onChange={promptEditable && onPromptChange ? (e) => onPromptChange(e.target.value) : undefined}
						/>
					</details>
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="primary" disabled={copyDisabled} onClick={() => void copy()}>
							<Icon name={copied ? 'check' : 'copy'} size={16} />
							{copied ? 'Copied' : 'Copy prompt'}
						</Button>
						{afterCopy}
					</div>
					{result}
				</>
			)}
		</div>
	);
}
