import { emptyActivityHabits } from '$lib/activity-habits';
import { SignInPanel, useAuthed } from '$lib/auth';
import { dateRangeFromSearch, type RangeKind } from '$lib/date-range';
import { composeDebriefPrompt, debriefWriteupUnitsFromCoach } from '$lib/debrief';
import {
	readGenerateDraft,
	scheduleWriteGenerateDraft,
	type GenerateDraft
} from '$lib/generate-draft';
import {
	clearDebriefHabits,
	readDebriefHabits,
	seedDebriefHabits,
	setDebriefHabitField
} from '$lib/debrief-habits';
import {
	clearDebriefWriteups,
	readDebriefWriteups,
	writeDebriefWriteups
} from '$lib/debrief-writeups';
import type { BodySuggestion } from '$lib/body-notes';
import type { FuelEntry } from '$lib/fuel';
import type { GearContext, GearKind, GearWear } from '$lib/gear';
import { formatHorizonShort } from '$lib/goals';
import {
	formatAllWeeksClipboard,
	formatWeekPlanClipboard,
	isoDateLocal,
	planWeekDateRange,
	planWeekDateRangeShort
} from '$lib/plan';
import {
	createActivityGroupFn,
	getCoachBrief,
	getCoachPlan,
	getDebriefPrompt,
	getWeekPattern,
	saveActivityFeel,
	saveDebrief,
	savePlanWeeks,
	saveWeekPattern,
	ungroupActivitiesFn
} from '$lib/server/functions';
import { appHead } from '$lib/title';
import { cn } from '$lib/ui';
import type { ActivityType } from '$lib/activity';
import {
	formatWeekSetupProse,
	weekSetupsEqual,
	type DayLimit,
	type WeekSetup
} from '$lib/week-mix';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DateRangeFilter, type RangeSearch } from '../DateRangeFilter';
import { DebriefActivityTitle } from '../DebriefActivityTitle';
import { DebriefFeelForm, type DebriefDraftClearPick } from '../DebriefFeelForm';
import { DebriefRacePanel } from '../DebriefRacePanel';
import { AiPromptFlow } from '../AiPromptFlow';
import { DeferredData } from '../DeferredData';
import { BodySuggestionsDialog } from '../BodySuggestionsDialog';
import { FuelSuggestionsDialog } from '../FuelSuggestionsDialog';
import { GpxImport } from '../GpxImport';
import { Icon } from '../Icon';
import { JsonPasteForm } from '../JsonPasteForm';
import {
	Actions,
	Button,
	Checkbox,
	Field,
	Form,
	IconLabelButton,
	PageHero,
	PageTabs,
	Panel,
	PanelTitle,
	Select,
	Textarea,
	errorMessage,
	useLeaveGuard,
	useSnackbar
} from '../ui';
import { buttonClass } from '../ui/Button';
import {
	rowsFrom,
	toPattern,
	WeekPatternEditor,
	type SlotRow
} from '../WeekPatternEditor';
import { WeekPlanBoard } from '../WeekPlanBoard';
import {
	type CoachTab,
	withCoachSearch
} from '$lib/coach/search';

export function GenerateBriefForm({
	weekPhrase,
	mixNote,
	question,
	questionPlaceholder,
	hasBrief,
	onMixNoteChange,
	onQuestionChange,
	onGenerate
}: {
	weekPhrase: string;
	mixNote: string;
	question: string;
	questionPlaceholder: string;
	hasBrief: boolean;
	onMixNoteChange: (text: string) => void;
	onQuestionChange: (text: string) => void;
	onGenerate: (mixNote: string, question: string) => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);

	return (
		<Form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				if (busy) return;
				setBusy(true);
				void onGenerate(mixNote, question).finally(() => setBusy(false));
			}}
		>
			<Field
				label={`Anything unusual ${weekPhrase}? (optional)`}
				hint="Logged extras that did not match the plan are included automatically. Use this for extras that have not happened yet."
			>
				<Textarea
					rows={2}
					placeholder="e.g. extra walk Wednesday, considering a Saturday bike instead of the hike-prep walk"
					value={mixNote}
					onChange={(e) => onMixNoteChange(e.target.value)}
				/>
			</Field>
			<Field label="Your question for the AI">
				<Textarea
					rows={3}
					placeholder={questionPlaceholder}
					value={question}
					onChange={(e) => onQuestionChange(e.target.value)}
				/>
			</Field>
			<Actions>
				<Button type="submit" variant="primary" disabled={busy}>
					<Icon name="sparkle" size={16} />
					{busy ? 'Building…' : hasBrief ? 'Regenerate prompt' : 'Generate prompt'}
				</Button>
			</Actions>
		</Form>
	);
}
