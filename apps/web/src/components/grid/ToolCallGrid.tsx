'use client';

import { useCallback, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent } from 'ag-grid-community';
import type { ToolCallRecordT } from '@autopilot/schemas';

import { DurationCell, RelativeTimeCell, StatusPillCell, WrapCell } from './cells';
import { GridToolbar } from './GridToolbar';
import { baseColDef, GRID_MODULES, GRID_THEME_CLASS, PAGINATION, TEXT_FILTER_PARAMS } from './setup';

type ToolCallRow = ToolCallRecordT & { argumentsText: string };

const COLUMN_DEFS: ColDef<ToolCallRow>[] = [
  { field: 'tool', headerName: 'Tool', colId: 'tool', width: 210, pinned: 'left', filter: 'agTextColumnFilter', cellRenderer: StatusPillCell },
  { field: 'status', headerName: 'Outcome', colId: 'status', width: 120, filter: 'agTextColumnFilter', cellRenderer: StatusPillCell },
  { field: 'durationMs', headerName: 'Duration', colId: 'durationMs', width: 120, filter: 'agNumberColumnFilter', cellDataType: 'number', cellRenderer: DurationCell },
  { field: 'startedAt', headerName: 'Started', colId: 'startedAt', width: 130, filter: 'agTextColumnFilter', cellRenderer: RelativeTimeCell },
  { field: 'resultSummary', headerName: 'Result', colId: 'resultSummary', minWidth: 220, flex: 1, filter: 'agTextColumnFilter', cellRenderer: WrapCell },
  { field: 'error', headerName: 'Error', colId: 'error', minWidth: 200, flex: 1, filter: 'agTextColumnFilter', cellRenderer: WrapCell },
  { field: 'argumentsText', headerName: 'Arguments', colId: 'argumentsText', minWidth: 240, flex: 1.2, filter: 'agTextColumnFilter', cellRenderer: WrapCell },
];

function toRow(call: ToolCallRecordT): ToolCallRow {
  return { ...call, argumentsText: JSON.stringify(call.arguments) };
}

const DEFAULT_COL_DEF: ColDef<ToolCallRow> = {
  ...baseColDef<ToolCallRow>(),
  filterParams: TEXT_FILTER_PARAMS,
};

export interface ToolCallGridProps {
  toolCalls: ToolCallRecordT[];
  fileName: string;
}

export function ToolCallGrid({ toolCalls, fileName }: ToolCallGridProps) {
  const [api, setApi] = useState<GridApi<ToolCallRow> | null>(null);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(toolCalls.length);
  const [selected, setSelected] = useState<ToolCallRow | null>(null);

  const rowData = useMemo(
    () => [...toolCalls].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)).map(toRow),
    [toolCalls],
  );

  const onReady = useCallback((event: GridReadyEvent<ToolCallRow>) => setApi(event.api), []);
  const onSelectionChanged = useCallback((event: SelectionChangedEvent<ToolCallRow>) => {
    setSelected(event.api.getSelectedRows()[0] ?? null);
  }, []);

  const denied = rowData.filter((row) => row.status === 'denied').length;

  return (
    <div>
      <GridToolbar
        api={api}
        search={search}
        onSearch={setSearch}
        fileName={fileName}
        shown={shown}
        total={rowData.length}
        placeholder="Search tool calls…"
        extra={
          denied > 0 ? (
            <span className="tool-btn active" title="Tool calls refused by policy">
              {denied} denied
            </span>
          ) : undefined
        }
      />
      <div className={`${GRID_THEME_CLASS} ag-host`}>
        <AgGridReact<ToolCallRow>
          theme="legacy"
          modules={GRID_MODULES}
          rowData={rowData}
          columnDefs={COLUMN_DEFS}
          defaultColDef={DEFAULT_COL_DEF}
          quickFilterText={search}
          getRowId={(params) => params.data.id}
          rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
          rowClassRules={{ 'row-blocked': (params) => params.data?.status !== 'ok' }}
          onGridReady={onReady}
          onSelectionChanged={onSelectionChanged}
          onModelUpdated={(event) => setShown(event.api.getDisplayedRowCount())}
          animateRows
          enableCellTextSelection
          overlayNoRowsTemplate={'<span class="empty"><strong>No tool calls recorded</strong>Every tool the agent invokes is logged here.</span>'}
          {...PAGINATION}
        />
      </div>
      {selected ? (
        <div className="detail">
          <div className="detail-head">
            <div>
              <div className="detail-title">{selected.tool}</div>
              <div className="detail-sub">
                {selected.status} · {selected.durationMs}ms · {selected.correlationId}
              </div>
            </div>
            <span className={`pill ${selected.status === 'ok' ? 'ok' : 'bad'}`}>{selected.status}</span>
          </div>
          <pre className="json">{JSON.stringify(selected.arguments, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}