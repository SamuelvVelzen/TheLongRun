import { getTheme, THEME_EVENT, toggleTheme, type Theme } from '$lib/theme';
import { useEffect, useState, type MouseEventHandler } from 'react';
import { Icon } from './Icon';

export function ThemeToggle({
	className,
	showLabel = false,
	onClick
}: {
	className?: string;
	showLabel?: boolean;
	onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
	const [theme, setTheme] = useState<Theme>(() => getTheme());

	useEffect(() => {
		setTheme(getTheme());
		const onChange = () => setTheme(getTheme());
		window.addEventListener(THEME_EVENT, onChange);
		return () => window.removeEventListener(THEME_EVENT, onChange);
	}, []);

	const next: Theme = theme === 'dark' ? 'light' : 'dark';
	const label = next === 'light' ? 'Light mode' : 'Dark mode';

	return (
		<button
			type="button"
			className={className}
			aria-label={label}
			title={label}
			suppressHydrationWarning
			onClick={(e) => {
				setTheme(toggleTheme());
				onClick?.(e);
			}}
		>
			<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={showLabel ? 18 : 20} />
			{showLabel ? label : null}
		</button>
	);
}
