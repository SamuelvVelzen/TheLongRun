import type { ClothingItem, Wardrobe } from '$lib/wardrobe';
import { useEffect, useState } from 'react';
import { WardrobeAiImportPanel } from './WardrobeAiDialog';
import { ClothingForm } from './WardrobeClothingForm';
import { Dialog, PageTabs } from './ui';

type Tab = 'add' | 'ai';

export function WardrobeAddDialog({
	open,
	busy,
	wardrobe,
	onClose,
	onAdd,
	onSaveWardrobe
}: {
	open: boolean;
	busy: boolean;
	wardrobe: Wardrobe;
	onClose: () => void;
	onAdd: (item: ClothingItem) => Promise<boolean>;
	onSaveWardrobe: (next: Wardrobe, okMessage: string) => Promise<boolean>;
}) {
	const [tab, setTab] = useState<Tab>('ai');

	useEffect(() => {
		if (open) setTab('ai');
	}, [open]);

	return (
		<Dialog
			open={open}
			size="medal"
			title="Add clothing"
			onClose={busy ? () => {} : onClose}
			className="sm:max-w-[min(38rem,100%)]!"
		>
			<PageTabs
				sticky={false}
				aria-label="Add clothing"
				value={tab}
				onChange={setTab}
				className="mb-4"
				options={[
					{ value: 'ai', label: 'Import with AI' },
					{ value: 'add', label: 'Add item' }
				]}
			/>
			{tab === 'add' ? (
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
			) : (
				<WardrobeAiImportPanel
					wardrobe={wardrobe}
					busy={busy}
					onClose={onClose}
					onSave={onSaveWardrobe}
				/>
			)}
		</Dialog>
	);
}
