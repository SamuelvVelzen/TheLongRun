import {
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors
} from '@dnd-kit/core';
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '$lib/ui';
import { createContext, use, type ReactNode, type Ref, type CSSProperties } from 'react';
import { buttonClass } from './Button';
import { compactIconButtonClass } from './IconButtons';

/** Default surface tweak while an item is dragged. */
export const sortableDraggingClass = 'shadow-lg ring-1 ring-line opacity-95';

function useSortableListSensors() {
	return useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);
}

/** Vertical list reordering — wraps dnd-kit context + sortable scope. */
export function ReorderableList({
	itemIds,
	onDragEnd,
	className,
	children
}: {
	itemIds: string[];
	onDragEnd: (event: DragEndEvent) => void;
	className?: string;
	children: ReactNode;
}) {
	const sensors = useSortableListSensors();
	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				<div className={className}>{children}</div>
			</SortableContext>
		</DndContext>
	);
}

/** Reorder `items` when drag ends; returns `null` when nothing moved. */
export function reorderOnDragEnd<T>(
	items: T[],
	event: DragEndEvent,
	getId: (item: T) => string
): T[] | null {
	const { active, over } = event;
	if (!over || active.id === over.id) return null;
	const oldIndex = items.findIndex((item) => getId(item) === active.id);
	const newIndex = items.findIndex((item) => getId(item) === over.id);
	if (oldIndex < 0 || newIndex < 0) return null;
	return arrayMove(items, oldIndex, newIndex);
}

type SortableHandleContextValue = {
	attributes: ReturnType<typeof useSortable>['attributes'];
	listeners: ReturnType<typeof useSortable>['listeners'];
	setActivatorNodeRef: ReturnType<typeof useSortable>['setActivatorNodeRef'];
	isDragging: boolean;
};

const SortableHandleContext = createContext<SortableHandleContextValue | null>(null);

/** One sortable row/card; pair with {@link SortableDragHandle} for handle-only activation. */
export function SortableItem({
	id,
	className,
	draggingClassName = sortableDraggingClass,
	style: styleProp,
	children
}: {
	id: string;
	className?: string;
	draggingClassName?: string | false;
	style?: CSSProperties;
	children: ReactNode;
}) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
		useSortable({ id });

	const style: CSSProperties = {
		...styleProp,
		transform: CSS.Transform.toString(transform),
		transition,
		zIndex: isDragging ? 1 : styleProp?.zIndex
	};

	const handleCtx: SortableHandleContextValue = {
		attributes,
		listeners,
		setActivatorNodeRef,
		isDragging
	};

	return (
		<SortableHandleContext value={handleCtx}>
			<div
				ref={setNodeRef}
				style={style}
				className={cn(className, isDragging && draggingClassName !== false && draggingClassName)}
			>
				{children}
			</div>
		</SortableHandleContext>
	);
}

/** Grip control that starts a drag without activating inputs inside the item. */
export function SortableDragHandle({
	label,
	className,
	icon = <SortableGripIcon />
}: {
	label: string;
	className?: string;
	icon?: ReactNode;
}) {
	const ctx = use(SortableHandleContext);
	if (!ctx) throw new Error('SortableDragHandle must be used inside SortableItem');

	const setRef = ctx.setActivatorNodeRef as Ref<HTMLButtonElement>;

	return (
		<button
			type="button"
			ref={setRef}
			className={cn(
				compactIconButtonClass,
				buttonClass({ variant: 'ghost', size: 'icon' }),
				'touch-none cursor-grab text-muted active:cursor-grabbing',
				className
			)}
			aria-label={label}
			title={label}
			{...ctx.attributes}
			{...ctx.listeners}
		>
			{icon}
		</button>
	);
}

export function SortableGripIcon() {
	return (
		<svg className="block size-5" viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="currentColor"
				d="M9 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9-12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"
			/>
		</svg>
	);
}