import {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TableState {
  [key: string]: {
    pagination: {
      pageIndex: number;
      pageSize: number;
    };
    sorting: SortingState;
    columnFilters: ColumnFiltersState;
    columnVisibility: VisibilityState;
  };
}

interface TableStore {
  tables: TableState;
  updateTableState: (
    tableKey: string,
    newState: Partial<TableState[string]>,
  ) => void;
}

export const useTableStore = create<TableStore>()(
  persist(
    (set) => ({
      tables: {},
      updateTableState: (tableKey, newState) =>
        set((state) => ({
          tables: {
            ...state.tables,
            [tableKey]: {
              ...state.tables[tableKey],
              ...newState,
            },
          },
        })),
    }),
    {
      name: "table-store",
    },
  ),
);
