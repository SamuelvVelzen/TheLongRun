import type { ClothingItem } from '$lib/wardrobe';
import { Dialog } from './ui';
import { cn } from '$lib/ui';
import { ClothingForm } from './WardrobeClothingForm';

export function WardrobeAddDialog({
	open,
	busy,
	onClose,
	onAdd
}: {
	open: boolean;
	busy: boolean;
	onClose: () => void;
	onAdd: (item: ClothingItem) => Promise<boolean>;
}) {
	return (
		<Dialog
			open={open}
			size="medal"
			title="Add clothing"
			onClose={busy ? () => {} : onClose}
			className="sm:max-w-[min(38rem,100%)]!"
		>
			<ClothingForm
				className="mt-0"
				item={null}
				category="top"
				busy={busy}
				submitLabel="Add"
				onCancel={onClose}
				onSubmit={async (item) => {
					const ok = await onAdd(item);
					if (ok) onClose();
					return ok;
				}}
			/>
		</Dialog>
	);
}
