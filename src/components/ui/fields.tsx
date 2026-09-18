import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { ChoiceChips, type ChoiceOption } from './ChoiceChips';
import { Field } from './Field';
import { Input } from './Input';
import { Select, type SelectOption } from './Select';
import { Textarea, type TextareaVariant } from './Textarea';
import { useFieldContext } from './form-context';

function fieldError(errors: unknown[]): string | undefined {
	const err = errors[0];
	if (err == null) return undefined;
	if (typeof err === 'string') return err;
	if (typeof err === 'object' && err && 'message' in err) {
		return String((err as { message: unknown }).message);
	}
	return String(err);
}

function shownError(meta: { errors: unknown[] }) {
	return fieldError(meta.errors);
}

export function TextField({
	label,
	required,
	hint,
	as = 'label',
	className,
	...input
}: {
	label: ReactNode;
	required?: boolean;
	hint?: ReactNode;
	as?: 'label' | 'div';
	className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
	const field = useFieldContext<string>();
	return (
		<Field
			label={label}
			required={required}
			hint={hint}
			error={shownError(field.state.meta)}
			as={as}
			className={className}
		>
			<Input
				{...input}
				value={field.state.value ?? ''}
				onChange={(e) => field.handleChange(e.target.value)}
				onBlur={field.handleBlur}
			/>
		</Field>
	);
}

export function TextAreaField({
	label,
	required,
	hint,
	variant = 'default',
	className,
	...input
}: {
	label: ReactNode;
	required?: boolean;
	hint?: ReactNode;
	variant?: TextareaVariant;
	className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur'>) {
	const field = useFieldContext<string>();
	return (
		<Field label={label} required={required} hint={hint} error={shownError(field.state.meta)} className={className}>
			<Textarea
				{...input}
				variant={variant}
				value={field.state.value ?? ''}
				onChange={(e) => field.handleChange(e.target.value)}
				onBlur={field.handleBlur}
			/>
		</Field>
	);
}

export function SelectField({
	label,
	required,
	hint,
	options,
	placeholder,
	className
}: {
	label: ReactNode;
	required?: boolean;
	hint?: ReactNode;
	options: SelectOption[];
	placeholder?: string;
	className?: string;
}) {
	const field = useFieldContext<string>();
	return (
		<Field label={label} required={required} hint={hint} error={shownError(field.state.meta)} className={className}>
			<Select
				value={field.state.value ?? ''}
				onChange={(next) => field.handleChange(next)}
				options={options}
				placeholder={placeholder}
				aria-label={typeof label === 'string' ? label : undefined}
			/>
		</Field>
	);
}

export function ChipField<T extends string>({
	label,
	required,
	hint,
	options,
	className
}: {
	label: ReactNode;
	required?: boolean;
	hint?: ReactNode;
	options: ChoiceOption<T>[];
	className?: string;
}) {
	const field = useFieldContext<T>();
	return (
		<Field
			label={label}
			required={required}
			hint={hint}
			error={shownError(field.state.meta)}
			as="div"
			className={className}
		>
			<ChoiceChips
				aria-label={typeof label === 'string' ? label : undefined}
				value={field.state.value}
				options={options}
				onChange={(next) => field.handleChange(next)}
			/>
		</Field>
	);
}
