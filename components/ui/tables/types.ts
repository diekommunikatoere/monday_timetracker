// components/ui/tables/types.ts
// Column-definition types powering the data table (used by TimeEntryTable et al.).
import { ReactNode } from "react";

/**
 * Declarative definition of a single table column.
 *
 * Used by the time-entry tables (see `components/shared/time-entries/TimeEntryTable.tsx`
 * and `TimeEntryTableConfigs.tsx`) to describe how a column is identified,
 * sized, aligned and rendered. The `header`/`cell` accessors receive typed
 * prop objects ({@link HeaderProps} / {@link CellProps}) parameterized by the
 * row type `T`, so consumers get full type-safety across the row shape.
 *
 * @typeParam T - The row data type the column operates on.
 * @property id        - Stable column identifier; used for keys and state.
 * @property header    - Header content, either a static `ReactNode` or a render function receiving {@link HeaderProps}.
 * @property cell      - Cell renderer invoked per row with {@link CellProps}.
 * @property width     - Preferred column width (CSS length or number of pixels).
 * @property minWidth  - Minimum column width (CSS length or number of pixels).
 * @property maxWidth  - Maximum column width (CSS length or number of pixels).
 * @property align     - Horizontal alignment: `"left"`, `"center"` or `"right"`.
 * @property hidden    - When true, the column is defined but not rendered.
 */
export interface ColumnDef<T> {
	id: string;
	header: ReactNode | ((props: HeaderProps<T>) => ReactNode);
	cell: (props: CellProps<T>) => ReactNode;
	width?: string | number;
	minWidth?: string | number;
	maxWidth?: string | number;
	align?: "left" | "center" | "right";
	hidden?: boolean;
}

/**
 * Props passed to a {@link ColumnDef}`.header` render function.
 *
 * @typeParam T - The row data type.
 * @property data - The full ordered array of rows currently in the table.
 */
export interface HeaderProps<T> {
	data: T[];
}

/**
 * Props passed to a {@link ColumnDef}`.cell` render function for a single row.
 *
 * @typeParam T - The row data type.
 * @property row   - The row's data object.
 * @property index - Zero-based index of the row within the current dataset.
 */
export interface CellProps<T> {
	row: T;
	index: number;
}
