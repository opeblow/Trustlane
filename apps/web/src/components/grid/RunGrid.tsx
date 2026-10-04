'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridApi, GridReadyEvent, RowClickedEvent } from 'ag-grid-community';
import type { RunT } from '@autopilot/schemas';

import {
  EngineCell,
  ProgressCell,
  RelativeTimeCell,
  StatusPillCell,
  WrapCell,
  type AttributeRow,
} from './cells';
import { GridToolbar } from './GridToolbar';
import { baseColDef, GRID_MODULES, GRID_THEME_CLASS, PAGINATION, SCORE_FILTER_PARAMS, TEXT_FILTER_PARAMS } from './setup';

type RunRow = RunT & AttributeRow;

const COLUMN_DEFS: ColDef<RunRow>[] = [
  {
    field: 'id',
    headerName: 'Review',
    colId: 'id',
    width: 190,
    pinned: 'left',
    filter: 'agTextColumnFilter',
    cellClass: 'cell-run-id',
  },
  { field: 'status', headerName: 'Status', colId: 'status', width: 130, filter: 'agTextColumnFilter', cellRenderer: StatusPillCell },
  { field: 'stage', headerName: 'Stage', colId: 'stage', width: 130, filter: 'agTextColumnFilter', cellRenderer: StatusPillCell },
  {
    field: 'progress',
    headerName: 'Progress',
    colId: 'progress',
    width: 150,
    filter: 'agNumberColumnFilter',
    filterParams: SCORE_FILTER_PARAMS,
    cellRenderer: ProgressCell,
  },
  { field: 'candidateCount', headerName: 'Candidates', colId: 'candidateCount', width: 120, filter: 'agNumberColumnFilter', cellDataType: 'number' },
  { field: 'engine', headerName: 'Engine', colId: 'engine', width: 150, cellRenderer: EngineCell, sortable: false, filter: false },
  {
    field: 'updatedAt',
    headerName: 'Updated',
    colId: 'updatedAt',
    width: 130,
    filter: 'agTextColumnFilter',
    cellRenderer: RelativeTimeCell,
  },
  {
    field: 'blockedReason',
    headerName: 'Blocked reason',
    colId: 'blockedReason',
    minWidth: 220,
    flex: 1,
    filter: 'agTextColumnFilter',
    cellRenderer: WrapCell,
  },
  {
    field: 'summary',
    headerName: 'Summary',
    colId: 'summary',
    minWidth: 240,
    flex: 1.4,
    filter: 'agTextColumnFilter',
    cellRenderer: WrapCell,
  },
];

const DEFAULT_COL_DEF: ColDef<RunRow> = { ...baseColDef<RunRow>(), filterParams: TEXT_FILTER_PARAMS };

export interface RunGridProps {
  runs: RunT[];
  selectedRunId?: string | null;
  onSelect: (runId: string) => void;
  fileName: string;
  size?: 'short' | 'tall';
}

export function RunGrid({ runs, selectedRunId, onSelect, fileName, size = 'short' }: RunGridProps) {
  const [api, setApi] = useState<GridApi<RunRow> | null>(null);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(runs.length);

  const rowData = useMemo<RunRow[]>(
    () =>
      [...runs].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      ),
    [runs],
  );

  const onReady = useCallback((event: GridReadyEvent<RunRow>) => setApi(event.api), []);
  const onRowClicked = useCallback(
    (event: RowClickedEvent<RunRow>) => {
      if (event.data) onSelect(event.data.id);
    },
    [onSelect],
  );

  useEffect(() => {
    if (!api) return;
    api.forEachNode((node) => {
      const shouldSelect = Boolean(selectedRunId) && node.data?.id === selectedRunId;
      if (node.isSelected() !== shouldSelect) node.setSelected(shouldSelect);
    });
  }, [api, selectedRunId, rowData]);

  return (
    <div>
      <GridToolbar
        api={api}
        search={search}
        onSearch={setSearch}
        fileName={fileName}
        shown={shown}
        total={rowData.length}
        placeholder="Filter reviews by id, stage or summary…"
      />
      <div className={`${GRID_THEME_CLASS} ag-host ${size}`}>
        <AgGridReact<RunRow>
          theme="legacy"
          modules={GRID_MODULES}
          rowData={rowData}
          columnDefs={COLUMN_DEFS}
          defaultColDef={DEFAULT_COL_DEF}
          quickFilterText={search}
          getRowId={(params) => params.data.id}
          rowSelection={{
            mode: 'singleRow',
            checkboxes: false,
            enableClickSelection: true,
          }}
          rowClassRules={{
            'row-blocked': (params) => params.data?.status === 'blocked' || params.data?.status === 'failed',
          }}
          onGridReady={onReady}
          onRowClicked={onRowClicked}
          onModelUpdated={(event) => setShown(event.api.getDisplayedRowCount())}
          animateRows
          enableCellTextSelection
          multiSortKey="ctrl"
          overlayNoRowsTemplate={'<span class="empty"><strong>No purchase reviews yet</strong>Start a review above — nothing is purchased without your approval.</span>'}
          {...PAGINATION}
        />
      </div>
    </div>
  );
}