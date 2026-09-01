import { cn } from '$lib/ui';
import { useCallback, useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
	const nav = window.navigator as Navigator & { standalone?: boolean };
	return (
		nav.standalone === true ||
		window.matchMedia('(display-mode: standalone)').matches ||
		window.matchMedia('(display-mode: fullscreen)').matches ||
		window.matchMedia('(display-mode: minimal-ui)').matches
	);
}

function isIos(): boolean {
	const ua = window.navigator.userAgent;
	return (
		/iphone|ipad|ipod/i.test(ua) ||
		(window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
	);
}

export function PwaInstall({ className }: { className?: string }) {
	const [installed, setInstalled] = useState(true);
	const [ios, setIos] = useState(false);
	const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
	const [helpOpen, setHelpOpen] = useState(false);

	useEffect(() => {
		setInstalled(isStandalone());
		setIos(isIos());

		const onPrompt = (e: Event) => {
			e.preventDefault();
			setDeferred(e as BeforeInstallPromptEvent);
		};
		const onInstalled = () => {
			setDeferred(null);
			setInstalled(true);
		};
		window.addEventListener('beforeinstallprompt', onPrompt);
		window.addEventListener('appinstalled', onInstalled);
		return () => {
			window.removeEventListener('beforeinstallprompt', onPrompt);
			window.removeEventListener('appinstalled', onInstalled);
		};
	}, []);

	const install = useCallback(async () => {
		if (deferred) {
			await deferred.prompt();
			const choice = await deferred.userChoice;
			if (choice.outcome === 'accepted') setInstalled(true);
			setDeferred(null);
			return;
		}
		setHelpOpen(true);
	}, [deferred]);

	if (installed || (!deferred && !ios)) return null;

	return (
		<>
			<button
				type="button"
				className={cn(className, 'w-full text-left')}
				onClick={(e) => {
					const details = e.currentTarget.closest('details');
					if (details) {
						requestAnimationFrame(() => {
							details.open = false;
						});
					}
					void install();
				}}
			>
				<Icon name="install" size={18} />
				Install app
			</button>
			<Dialog open={helpOpen} title="Install The Long Run" onClose={() => setHelpOpen(false)}>
				<p className="m-0 text-muted leading-[1.45]">
					On iPhone, open the Share sheet (the square with the arrow), then tap{' '}
					<strong className="text-fg font-semibold">Add to Home Screen</strong>.
				</p>
			</Dialog>
		</>
	);
}
