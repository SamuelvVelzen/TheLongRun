import { cn } from '$lib/ui';
import { useState } from 'react';
import { Field, Form, Textarea } from '../ui';

export function GenerateBriefForm({
	weekPhrase,
	mixNote,
	question,
	questionPlaceholder,
	briefBusy,
	onMixNoteChange,
	onQuestionChange,
	onFieldsBlur
}: {
	weekPhrase: string;
	mixNote: string;
	question: string;
	questionPlaceholder: string;
	briefBusy: boolean;
	onMixNoteChange: (text: string) => void;
	onQuestionChange: (text: string) => void;
	onFieldsBlur: () => void;
}) {
	const hasMixNote = mixNote.trim().length > 0;
	const [mixOpen, setMixOpen] = useState(hasMixNote);

	return (
		<Form>
			<p className={cn('text-muted', 'm-0 mb-1 text-[0.88rem]')}>
				Prompt rebuilds when the history window changes or you finish editing a field.
				{briefBusy ? ' Building…' : null}
			</p>
			<Field label="Your question for the AI">
				<Textarea
					rows={3}
					placeholder={questionPlaceholder}
					value={question}
					disabled={briefBusy}
					onChange={(e) => onQuestionChange(e.target.value)}
					onBlur={onFieldsBlur}
				/>
			</Field>
			<div className="mt-1">
				<button
					type="button"
					className="appearance-none self-start bg-transparent border-0 p-0 min-h-11 text-accent-fg font-semibold cursor-pointer text-left disabled:opacity-50 disabled:cursor-not-allowed"
					aria-expanded={mixOpen}
					disabled={briefBusy}
					onClick={() => setMixOpen((open) => !open)}
				>
					{mixOpen
						? `Hide anything unusual ${weekPhrase}?`
						: hasMixNote
							? `Edit anything unusual ${weekPhrase}?`
							: `Add anything unusual ${weekPhrase}? (optional)`}
				</button>
				{mixOpen ? (
					<Field
						className="mt-1"
						label={`Anything unusual ${weekPhrase}?`}
						hint="Logged extras that did not match the plan are included automatically. Use this for extras that have not happened yet."
					>
						<Textarea
							rows={2}
							placeholder="e.g. extra walk Wednesday, considering a Saturday bike instead of the hike-prep walk"
							value={mixNote}
							disabled={briefBusy}
							onChange={(e) => onMixNoteChange(e.target.value)}
							onBlur={onFieldsBlur}
						/>
					</Field>
				) : null}
			</div>
		</Form>
	);
}
