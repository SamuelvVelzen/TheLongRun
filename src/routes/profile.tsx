import { SignInPanel, useAuthed } from '$lib/auth';
import { MAX_COACH_NOTES } from '$lib/body-notes';
import { getProfileData, saveCoachNotes } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { cn } from '$lib/ui';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BodyNotesPanel } from '../components/BodyNotesPanel';
import { CoachNotesAiDialog } from '../components/CoachNotesAiDialog';
import { DeferredData } from '../components/DeferredData';
import { Icon } from '../components/Icon';
import {
	Actions,
	Form,
	IconLabelButton,
	PageHero,
	Panel,
	PanelTitle,
	errorMessage,
	useAppForm,
	useSnackbar
} from '../components/ui';

export const Route = createFileRoute('/profile')({
	loader: () => ({ page: getProfileData() }),
	head: () => appHead('Profile'),
	component: ProfilePage
});

function ProfilePage() {
	const { page } = Route.useLoaderData();
	const authed = useAuthed();
	return (
		<>
			<PageHero variant="quiet" kicker="Standing notes" title="Profile" />
			{!authed ? <SignInPanel title="Sign in to edit profile" /> : null}
			<DeferredData promise={page}>
				{(data) => (
					<>
						<BodyNotesPanel initial={data.body} authed={authed} />
						<CoachNotesPanel initial={data.coachNotes} authed={authed} />
					</>
				)}
			</DeferredData>
		</>
	);
}

function CoachNotesPanel({ initial, authed }: { initial: string; authed: boolean }) {
	const router = useRouter();
	const snack = useSnackbar();
	const [importAi, setImportAi] = useState(false);
	const [busy, setBusy] = useState(false);
	const form = useAppForm({
		defaultValues: { text: initial },
		onSubmit: async ({ value }) => {
			try {
				const res = await saveCoachNotes({ data: { text: value.text } });
				form.reset({ text: res.coachNotes });
				snack.success('Saved notes for your coach');
				await router.invalidate();
			} catch (err) {
				snack.error(errorMessage(err, 'Save failed'));
			}
		}
	});

	useEffect(() => {
		form.reset({ text: initial });
	}, [initial]);

	async function saveCoachText(text: string, okMessage: string): Promise<boolean> {
		setBusy(true);
		try {
			const res = await saveCoachNotes({ data: { text } });
			form.reset({ text: res.coachNotes });
			snack.success(okMessage);
			await router.invalidate();
			return true;
		} catch (err) {
			snack.error(errorMessage(err, 'Save failed'));
			return false;
		} finally {
			setBusy(false);
		}
	}

	return (
		<Panel form={authed} className="mb-5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<PanelTitle className="m-0 mb-0 pb-0 border-b-0">Notes for my coach</PanelTitle>
				{authed && (
					<IconLabelButton
						label="Import with AI"
						disabled={busy || form.state.isSubmitting}
						icon={<Icon name="sparkle" size={16} />}
						onClick={() => setImportAi(true)}
					/>
				)}
			</div>
			<p className={cn('text-muted', 'm-0 mt-1 text-[0.9rem]')}>
				Optional. Personal rules and context that apply to every plan — not generic training advice, the AI
				already knows that.
			</p>
			{authed ? (
				<Form
					className="mt-2"
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<form.AppField
						name="text"
						children={(field) => (
							<field.TextAreaField
								rows={6}
								maxLength={MAX_COACH_NOTES}
								placeholder="Night shifts every other week. No running before 7am. I prefer trail long runs."
							/>
						)}
					/>
					<form.Subscribe selector={(s) => s.values.text}>
						{(value) =>
							value !== initial ? (
								<Actions>
									<form.AppForm>
										<form.SubmitButton busyLabel="Saving…">Save notes</form.SubmitButton>
									</form.AppForm>
								</Actions>
							) : null
						}
					</form.Subscribe>
				</Form>
			) : initial ? (
				<p className="m-0 mt-2 whitespace-pre-wrap">{initial}</p>
			) : (
				<p className={cn('text-muted', 'm-0 mt-2 text-[0.9rem]')}>No notes yet.</p>
			)}
			{authed && (
				<CoachNotesAiDialog
					open={importAi}
					coachNotes={form.state.values.text}
					busy={busy}
					onClose={() => setImportAi(false)}
					onSave={saveCoachText}
				/>
			)}
		</Panel>
	);
}
