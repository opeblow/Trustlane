'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  ColDef,
  FilterModel,
  GridApi,
  GridReadyEvent,
  SelectionChangedEvent,
} from 'ag-grid-community';
import {
  buildColumns,
  constraintsToGridFilters,
  summariseConstraintResults,
  type AgGridColumn,
  type ComparisonRow,
} from '@autopilot/ag-grid';
import type { EvaluationT, IntentT } from '@autopilot/schemas';

import {
  AttributeCell,
  EvidenceChipCell,
  MoneyCell,
  RankCell,
  ScoreBarCell,
  StatusPillCell,
  TradeoffCell,
  WrapCell,
} from './cells';
import { GridToolbar } from './GridToolbar';
import {
  baseColDef,
  GRID_MODULES,
  GRID_THEME_CLASS,
  PAGINATION,
  SCORE_FILTER_PARAMS,
  TEXT_FILTER_PARAMS,
} from './setup';

const DEFAULT_COL_DEF: ColDef<ComparisonRow> = {
  ...baseColDef<ComparisonRow>(),
  filterParams: TEXT_FILTER_PARAMS,
};

const RENDERERS: Record<string, unknown> = {
  rankBadge: RankCell,
  availabilityBadge: StatusPillCell,
  tradeoffBar: ScoreBarCell,
  attribute: AttributeCell,
  evidenceBadge: EvidenceChipCell,
  tradeoff: TradeoffCell,
  wrap: WrapCell,
};

const OPERATOR_TO_FILTER_TYPE: Record<string, string> = {
  gte: 'greaterThanOrEqual',
  lte: 'lessThanOrEqual',
  gt: 'greaterThan',
  lt: 'lessThan',
  eq: 'equals',
  neq: 'notEqual',
  between: 'inRange',
};

function toColDef(column: AgGridColumn): ColDef<ComparisonRow> {
  const isAttribute = column.field.startsWith('attributes.');
  const def: ColDef<ComparisonRow> = {
    field: column.field as ColDef<ComparisonRow>['field'],
    colId: column.colId,
    headerName: column.headerName,
    width: column.width,
    minWidth: column.minWidth,
    pinned: column.pinned,
    sortable: column.sortable !== false,
    resizable: true,
    cellDataType: column.type === 'numeric' ? 'number' : undefined,
    filter: column.type === 'numeric' ? 'agNumberColumnFilter' : 'agTextColumnFilter',
    filterParams: column.type === 'numeric' ? SCORE_FILTER_PARAMS : TEXT_FILTER_PARAMS,
    cellRenderer: RENDERERS[column.cellRenderer ?? ''] ?? undefined,
    headerTooltip: column.requiresEvidence
      ? `${column.headerName} · evidence required before this value can be presented as fact`
      : column.headerName,
  };

  if (column.field === 'price') {
    def.cellRenderer = MoneyCell;
    def.cellDataType = 'number';
    def.filter = 'agNumberColumnFilter';
  }
  if (isAttribute) {
    def.editable = true;
    def.cellEditor = 'agNumberCellEditor';
    def.cellEditorParams = { precision: 0 };
    def.headerTooltip = `${column.headerName} · edit to add or change a hard constraint`;
  }
  return def;
}

function buildColumnGroups(): (ColDef<ComparisonRow> | { headerName: string; children: ColDef<ComparisonRow>[] })[] {
  const columns = buildColumns();
  const base: ColDef<ComparisonRow>[] = [];
  const attributes: ColDef<ComparisonRow>[] = [];
  const evidence: ColDef<ComparisonRow>[] = [];

  for (const column of columns) {
    const def = toColDef(column);
    if (column.field.startsWith('attributes.')) {
      attributes.push(def);
      continue;
    }
    if (column.colId === 'evidenceScore') {
      // Stored 0..1, rendered on the same 0..100 scale as the composite score.
      def.valueGetter = (params) => Math.round((params.data?.evidenceScore ?? 0) * 100);
      def.cellRenderer = ScoreBarCell;
      evidence.push(def);
      continue;
    }
    if (column.colId === 'unverifiedCount') {
      def.cellRenderer = EvidenceChipCell;
      evidence.push(def);
      continue;
    }
    if (column.colId.startsWith('tradeoffs.')) {
      def.cellRenderer = TradeoffCell;
      evidence.push(def);
      continue;
    }
    base.push(def);
  }

  return [
    ...base,
    ...(attributes.length ? [{ headerName: 'Verified attributes', children: attributes }] : []),
    ...(evidence.length ? [{ headerName: 'Evidence quality', children: evidence }] : []),
  ];
}

function constraintFilterModel(intent: IntentT | null): FilterModel {
  if (!intent) return {};
  const model: FilterModel = {};
  for (const filter of constraintsToGridFilters(intent.constraints.numeric)) {
    const colId = filter.field.replace(/^attributes\./, '');
    model[colId] = {
      filterType: 'number',
      type: OPERATOR_TO_FILTER_TYPE[filter.operator] ?? filter.operator,
      filter: filter.value,
      filterTo: filter.value2,
    };
  }
  return model;
}

export interface ComparisonGridProps {
  rows: ComparisonRow[];
  intent: IntentT | null;
  evaluations: EvaluationT[];
  selectedRunId?: string | null;
  onConstraintEdit: (field: string, value: number) => void;
  onClearConstraints: () => void;
}

export function ComparisonGrid({
  rows,
  intent,
  evaluations,
  selectedRunId,
  onConstraintEdit,
  onClearConstraints,
}: ComparisonGridProps) {
  const [api, setApi] = useState<GridApi<ComparisonRow> | null>(null);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(0);
  const [selected, setSelected] = useState<ComparisonRow | null>(null);
  const columnDefs = useMemo(buildColumnGroups, []);
  const filterModel = useMemo(() => constraintFilterModel(intent), [intent]);
  const hasConstraints = (intent?.constraints.numeric.length ?? 0) > 0;

  const onReady = useCallback((event: GridReadyEvent<ComparisonRow>) => {
    setApi(event.api);
  }, []);

  useEffect(() => {
    if (!api) return;
    api.setFilterModel(filterModel);
  }, [api, filterModel]);

  useEffect(() => {
    setShown(api?.getDisplayedRowCount() ?? rows.length);
  }, [api, rows, search]);

  const onSelectionChanged = useCallback((event: SelectionChangedEvent<ComparisonRow>) => {
    setSelected(event.api.getSelectedRows()[0] ?? null);
  }, []);

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<ComparisonRow>) => {
      if (!event.colDef?.colId || !event.colDef.field?.startsWith('attributes.')) return;
      if (event.newValue === null || event.newValue === undefined || event.newValue === '') return;
      const value = Number(event.newValue);
      if (!Number.isFinite(value)) return;
      onConstraintEdit(String(event.colDef.colId), value);
    },
    [onConstraintEdit],
  );

  const selectedEvaluation = useMemo(
    () => (selected ? (evaluations.find((evaluation) => evaluation.productId === selected.productId) ?? null) : null),
    [evaluations, selected],
  );

  return (
    <div>
      <GridToolbar
        api={api}
        search={search}
        onSearch={setSearch}
        fileName={`trustlane-candidates${selectedRunId ? `-${selectedRunId}` : ''}`}
        shown={shown}
        total={rows.length}
        placeholder="Search candidates, brands, providers…"
        extra={
          hasConstraints ? (
            <button type="button" className="tool-btn active" onClick={onClearConstraints} title="Remove the constraints parsed from the request">
              {intent?.constraints.numeric.length} constraint(s) applied
            </button>
          ) : undefined
        }
      />
      <div className={`${GRID_THEME_CLASS} ag-host tall`}>
        <AgGridReact<ComparisonRow>
          theme="legacy"
          modules={GRID_MODULES}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={DEFAULT_COL_DEF}
          quickFilterText={search}
          getRowId={(params) => params.data.productId}
          rowSelection={{ mode: 'singleRow', enableClickSelection: true, checkboxes: false }}
          rowClassRules={{ 'row-blocked': (params) => (params.data?.disqualified?.length ?? 0) > 0 }}
          onGridReady={onReady}
          onSelectionChanged={onSelectionChanged}
          onCellValueChanged={onCellValueChanged}
          onModelUpdated={(event) => setShown(event.api.getDisplayedRowCount())}
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          multiSortKey="ctrl"
          animateRows
          enableCellTextSelection
          overlayNoRowsTemplate={'<span class="empty"><strong>No candidates yet</strong>Start a review to evaluate products against your request.</span>'}
          {...PAGINATION}
        />
      </div>

      {selected ? (
        <div className="detail">
          <div className="detail-head">
            <div>
              <div className="detail-title">{selected.title}</div>
              <div className="detail-sub">
                {selected.brand || 'Unbranded'} · {selected.provider} · {selected.category}
              </div>
            </div>
            <span className={`pill ${selected.disqualified.length ? 'bad' : 'ok'}`}>
              {selected.disqualified.length ? 'Disqualified' : 'Eligible'}
            </span>
          </div>

          <div className="kv-grid">
            <div className="kv-row">
              <span>Score</span>
              <span>{selected.score.toFixed(1)} / 100</span>
            </div>
            <div className="kv-row">
              <span>Rank</span>
              <span>{selected.rank ?? '—'}</span>
            </div>
            <div className="kv-row">
              <span>Price</span>
              <span>{selected.price.toFixed(2)} {selected.currency}</span>
            </div>
            <div className="kv-row">
              <span>Availability</span>
              <span>{selected.availability}</span>
            </div>
            <div className="kv-row">
              <span>Evidence score</span>
              <span>{Math.round(selected.evidenceScore * 100)}%</span>
            </div>
            <div className="kv-row">
              <span>Unverified fields</span>
              <span>{selected.unverifiedCount}</span>
            </div>
          </div>

          {selected.disqualified.length > 0 ? (
            <div className="evidence-list">
              {selected.disqualified.map((reason) => (
                <div className="evidence-item" key={reason}>
                  <span>Fails hard constraint</span>
                  <strong>{reason}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {selectedEvaluation ? (
            <div className="evidence-list">
              {selectedEvaluation.tradeoffs.map((tradeoff) => (
                <div className="evidence-item" key={`${tradeoff.aspect}-${tradeoff.direction}`}>
                  <span>
                    {tradeoff.direction === 'pro' ? 'Pro' : 'Con'} · weight {tradeoff.weight.toFixed(2)}
                  </span>
                  <strong>
                    {tradeoff.aspect}: {tradeoff.detail}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}

          {selectedEvaluation?.scoreBreakdown?.length ? (
            <pre className="json">{JSON.stringify(selectedEvaluation.scoreBreakdown, null, 2)}</pre>
          ) : null}

          {selectedEvaluation?.constraintResults?.length ? (
            <div className="detail-sub" style={{ marginTop: 12 }}>
              Request constraints: {summariseConstraintResults(selectedEvaluation.constraintResults)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}