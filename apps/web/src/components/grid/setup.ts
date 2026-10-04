'use client';

import { AllCommunityModule } from 'ag-grid-community';
import type { ColDef, GridApi, INumberFilterParams, ITextFilterParams } from 'ag-grid-community';

/** Legacy CSS themes require this class; the grid opts into CSS mode via `theme="legacy"`. */
export const GRID_THEME_CLASS = 'ag-theme-quartz';

/** Registered per grid instance so nothing global leaks during server rendering. */
export const GRID_MODULES = [AllCommunityModule];

export function baseColDef<TData>(): ColDef<TData> {
  return {
    sortable: true,
    resizable: true,
    filter: true,
    minWidth: 84,
    suppressHeaderMenuButton: false,
  };
}

export const PAGINATION = {
  pagination: true,
  paginationPageSize: 10,
  paginationPageSizeSelector: [10, 25, 50, 100],
};

export function exportCsv<T>(api: GridApi<T> | null | undefined, fileName: string): void {
  api?.exportDataAsCsv({ fileName });
}

export function clearGrid<T>(api: GridApi<T> | null | undefined): void {
  api?.setFilterModel(null);
  api?.setGridOption('quickFilterText', '');
}

/** Two-condition filters keep the comparison grid genuinely queryable without Enterprise. */
export const SCORE_FILTER_PARAMS: INumberFilterParams = {
  filterOptions: ['inRange', 'greaterThan', 'lessThan', 'equals', 'notEqual'],
  maxNumConditions: 2,
};

export const TEXT_FILTER_PARAMS: ITextFilterParams = {
  filterOptions: ['contains', 'notContains', 'startsWith', 'equals', 'notEqual'],
  maxNumConditions: 2,
};