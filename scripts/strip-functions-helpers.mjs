import fs from 'node:fs';
import path from 'node:path';

const file = path.join(import.meta.dirname, '..', 'src/lib/server/functions.ts');
const lines = fs.readFileSync(file, 'utf8').split('\n');

function dropRanges(ranges) {
	const drop = new Set();
	for (const [a, b] of ranges) {
		for (let i = a; i <= b; i++) drop.add(i);
	}
	return lines.filter((_, i) => !drop.has(i + 1));
}

const importBlock = `import {
\tallTimeSummarySection,
\tbriefTableRow,
\tBRIEF_TABLE_HEAD,
\tDEFAULT_BRIEF_RANGE,
\tforecastSectionForBrief,
\tgearSectionForBrief,
\tHOW_TO_READ,
\thistoryWindowPhrase,
\tnotesForBriefRow,
\ttypicalStartTime,
\tweekHasSessions,
\tformatTrainingPlanBrief,
\tformatRunBriefLine
} from './coach-brief';
import {
\tbodyScoresExample,
\tdebriefRaceHint,
\tdebriefRunSummary,
\texpandDebriefFeatured,
\tfeelingsExample,
\tformatDebriefSessionUnit,
\tformatFeelForUnit,
\tformatPlannedForActivity,
\thasFeel,
\tparseDebriefIds,
\tparseDebriefSlugLabels,
\tplannedSessionForActivity
} from './debrief-prompt';
`;

const out = dropRanges([[663, 781], [793, 858], [1111, 1557]]);
const idx = out.findIndex((l) => l.includes("from './plan-mutations'"));
if (idx < 0) throw new Error('anchor not found');
out.splice(idx + 1, 0, importBlock);
fs.writeFileSync(file, out.join('\n'));
console.log('Stripped helpers from functions.ts');
