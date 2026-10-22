export type DebriefRaceHint =
	| {
			kind: 'match';
			goalId: string;
			goalName: string;
			pinned: boolean;
			missingMedalDetails: boolean;
			bib_number: string;
			result_url: string;
			medal_notes: string;
	  }
	| { kind: 'race_no_goal' };

export type ActivityFeelInput = {
	id: number;
	effort?: number | null;
	body_scores?: import('$lib/body-scores').BodyScore[];
	legs?: number | null;
	energy?: number | null;
	wanted_faster?: boolean | null;
	surface?: string;
	notes?: string;
	session?: string;
	cadence?: number | null;
	gear?: string;
	before_notes?: string;
	after_notes?: string;
};
