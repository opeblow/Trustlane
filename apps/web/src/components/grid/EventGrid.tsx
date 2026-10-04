'use client';

import { useCallback, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent } from 'ag-grid-community';
import type { AuditEventT } from '@autopilot/schemas';

import {
  ClockCell,
  RelativeTimeCell,
  SeverityCell,
  ShortIdCell,
  StatusPillCell,
  WrapCell,
} from './cells';
import { GridToolbar } from './GridToolbar';
import { baseColDef, GRID_MODULES, GRID_THEME_CLASS, PAGINATION, TEXT_FILTER_PARAMS } from './setup';

type EventRow = AuditEventT & { payloadText: string; clock: string };

const COLUMN_DEFS: ColDef<EventRow>[] = [
  {
    field: 'sequence',
    headerName: '#',
    colId: 'sequence',
    width: 74,
    pinned: 'left',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
  },
  { field: 'type', headerName: 'Event', colId: 'type', width: 220, filter: 'agTextColumnFilter', cellRenderer: StatusPillCell },
  { field: 'severity', headerName: 'Severity', colId: 'severity', width: 110, filter: 'agTextColumnFilter', cellRenderer: SeverityCell },
  { field: 'actor', headerName: 'Actor', colId: 'actor', width: 140, filter: 'agTextColumnFilter' },
  { field: 'source', headerName: 'Source', colId: 'source', width: 160, filter: 'agTextColumnFilter' },
  { field: 'runId', headerName: 'Run', colId: 'runId', width: 120, filter: 'agTextColumnFilter', cellRenderer: ShortIdCell },
  { field: 'timestamp', headerName: 'Time', colId: 'timestamp', width: 110, filter: 'agTextColumnFilter', cellRenderer: RelativeTimeCell, sort: 'desc' },
  { field: 'clock', headerName: 'Clock', colId: 'clock', width: 100, filter: false, cellRenderer: ClockCell, sortable: false },
  { field: 'payloadText', headerName: 'Payload', colId: 'payloadText', minWidth: 260, flex: 1.4, filter: 'agTextColumnFilter', cellRenderer: WrapCell },
];

function toRow(event: AuditEventT): EventRow {
  return {
    ...event,
    clock: event.timestamp.slice(11, 19),
    payloadText: JSON.stringify(event.payload),
  };
}

const DEFAULT_COL_DEF: ColDef<EventRow> = { ...baseColDef<EventRow>(), filterParams: TEXT_FILTER_PARAMS };

export interface EventGridProps {
  events: AuditEventT[];
  onSelectRun?: (runId: string) => void;
  fileName: string;
}

export function EventGrid({ events, onSelectRun, fileName }: EventGridProps) {
  const [api, setApi] = useState<GridApi<EventRow> | null>(null);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(events.length);
  const [selected, setSelected] = useState<EventRow | null>(null);

  const rowData = useMemo(
    () => [...events].sort((left, right) => right.sequence - left.sequence).map(toRow),
    [events],
  );

  const onReady = useCallback((event: GridReadyEvent<EventRow>) => setApi(event.api), []);
  const onSelectionChanged = useCallback((event: SelectionChangedEvent<EventRow>) => {
    const row = event.api.getSelectedRows()[0] ?? null;
    setSelected(row);
    if (row?.runId && onSelectRun) onSelectRun(row.runId);
  }, [onSelectRun]);

  return (
    <div>
      <GridToolbar
        api={api}
        search={search}
        onSearch={setSearch}
        fileName={fileName}
        shown={shown}
        total={rowData.length}
        placeholder="Search events, actors or payloads…"
      />
      <div className={`${GRID_THEME_CLASS} ag-host tall`}>
        <AgGridReact<EventRow>
          theme="legacy"
          modules={GRID_MODULES}
          rowData={rowData}
          columnDefs={COLUMN_DEFS}
          defaultColDef={DEFAULT_COL_DEF}
          quickFilterText={search}
          getRowId={(params) => params.data.id}
          rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
          onGridReady={onReady}
          onSelectionChanged={onSelectionChanged}
          onModelUpdated={(event) => setShown(event.api.getDisplayedRowCount())}
          animateRows
          enableCellTextSelection
          multiSortKey="ctrl"
          overlayNoRowsTemplate={'<span class="empty"><strong>No activity yet</strong>Trustlane events appear here as reviews progress.</span>'}
          {...PAGINATION}
        />
      </div>
      {selected ? (
        <div className="detail">
          <div className="detail-head">
            <div>
              <div className="detail-title">{selected.type}</div>
              <div className="detail-sub">
                {selected.actor} · {selected.source} · correlation {selected.correlationId}
              </div>
            </div>
            <span className="pill">{selected.severity}</span>
          </div>
          <pre className="json">{JSON.stringify(selected.payload, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}