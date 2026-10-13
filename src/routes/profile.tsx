import { useAuthed } from '$lib/auth';
import { MAX_COACH_NOTES } from '$lib/body-notes';
import { getProfileData, saveCoachNotes } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { cn } from '$lib/ui';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { BodyNotesPanel } from '../components/BodyNotesPanel';
import { DeferredData } from '../components/DeferredData';
import { PageHero } from '../components/PageHero';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import { Actions, Form, formClass, formSectionTitleClass, panelClass, useAppForm } from '../components/ui';

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
			<PageHero
				variant="quiet"
				kicker="Standing notes"
				title="Profile"
				lead="What the coach can't work out from your logs. Paces, volume and PBs are computed from your activities; kit and usual habits live on Gear, food and drink on Fuel."
			/>
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

	return (
		<section className={panelClass(authed && formClass, 'mb-5')}>
			<h3 className={cn(formSectionTitleClass, 'm-0 mb-0 pb-0 border-b-0')}>Notes for my coach</h3>
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
		</section>
	);
}
