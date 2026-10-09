/** Marker in the server fuel prompt; the client fills this as you type. */
export const FUEL_TEXT_TOKEN = '<<<FUEL_TEXT>>>';

export const FUEL_TEXT_PLACEHOLDER = '(nothing written yet.)';

export function injectFuelText(template: string, text: string): string {
	const body = text.trim() || FUEL_TEXT_PLACEHOLDER;
	return template.split(FUEL_TEXT_TOKEN).join(body);
}

const DRAFT_KEY = 'fuel-describe-draft';

/** Describe-what-you-ate draft — survives refresh until saved. */
export function readFuelDraft(): string {
	try {
		return localStorage.getItem(DRAFT_KEY) ?? '';
	} catch {
		return '';
	}
}

export function writeFuelDraft(text: string) {
	try {
		if (text) localStorage.setItem(DRAFT_KEY, text);
		else localStorage.removeItem(DRAFT_KEY);
	} catch {
		/* ignore quota / private mode */
	}
}
