import { createFormHook } from '@tanstack/react-form';
import { ChipField, NumberField, SelectField, TextAreaField, TextField } from './fields';
import { fieldContext, formContext } from './form-context';
import { SubmitButton } from './SubmitButton';

export { useFieldContext, useFormContext } from './form-context';

export const { useAppForm, withForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		TextField,
		NumberField,
		TextAreaField,
		SelectField,
		ChipField
	},
	formComponents: {
		SubmitButton
	}
});
