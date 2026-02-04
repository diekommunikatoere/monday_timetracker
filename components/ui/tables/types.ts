// components/ui/tables/types.ts
import { ReactNode } from "react";

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

export interface HeaderProps<T> {
	data: T[];
}

export interface CellProps<T> {
	row: T;
	index: number;
}
