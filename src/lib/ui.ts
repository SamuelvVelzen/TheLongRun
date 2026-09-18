/** Shared class-name joiner. Visual tokens live in `src/components/ui`. */

export function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
