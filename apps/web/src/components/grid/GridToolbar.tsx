'use client';

import type { ReactNode } from 'react';
import type { GridApi } from 'ag-grid-community';

import { clearGrid, exportCsv } from './setup';

export interface GridToolbarProps<TData> {
  api: GridApi<TData> | null;
  search: string;
  onSearch: (value: string) => void;
  fileName: string;
  shown: number;
  total: number;
  placeholder?: string;
  extra?: ReactNode;
}

export function GridToolbar<TData>({
  api,
  search,
  onSearch,
  fileName,
  shown,
  total,
  placeholder = 'Search rows…',
  extra,
}: GridToolbarProps<TData>) {
  return (
    <div className="grid-toolbar">
      <div className="grid-search">
        <input
          type="search"
          value={search}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      <div className="grid-tools">
        {extra}
        <button
          type="button"
          className="tool-btn"
          onClick={() => exportCsv(api, `${fileName}.csv`)}
          disabled={!api}
        >
          Export CSV
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => {
            clearGrid(api);
            onSearch('');
          }}
          disabled={!api}
        >
          Reset
        </button>
      </div>
      <span className="grid-count">
        {shown === total ? `${total} rows` : `${shown} of ${total} rows`}
      </span>
    </div>
  );
}