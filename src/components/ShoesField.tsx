/** Shoes input with a dropdown of your Context shoes (active + rotation), still free-typeable. */
export function ShoesField({
	options,
	defaultValue,
	name = 'shoes'
}: {
	options: string[];
	defaultValue?: string;
	name?: string;
}) {
	const opts = [...new Set(options.map((o) => o.trim()).filter(Boolean))];
	return (
		<label className="field">
			<span>Shoes</span>
			<input name={name} list="shoes-options" defaultValue={defaultValue ?? ''} placeholder="Shoe" />
			<datalist id="shoes-options">
				{opts.map((o) => (
					<option key={o} value={o} />
				))}
			</datalist>
		</label>
	);
}
