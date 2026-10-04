import {
  type ConstraintResultT,
  type EvaluationT,
  type IntentT,
  type NumericConstraintT,
  type ProductT,
} from '@autopilot/schemas';

export interface ComparisonRow {
  productId: string;
  title: string;
  brand: string;
  provider: string;
  category: string;
  price: number;
  currency: string;
  availability: ProductT['availability']['status'];
  score: number;
  rank: number | null;
  evidenceScore: number;
  unverifiedCount: number;
  disqualified: string[];
  tradeoffs: { pro: number; con: number };
  attributes: Record<string, number | string | boolean | null>;
  evidence: Record<string, 'verified' | 'unverified'>;
  pinned: boolean;
}

export interface AgGridColumn {
  field: string;
  headerName: string;
  /** Stable identity for column-state persistence. */
  colId: string;
  width?: number;
  minWidth?: number;
  type?: 'numeric' | 'string' | 'boolean' | 'date';
  editable?: boolean;
  filter?: 'agNumberColumnFilter' | 'agTextColumnFilter' | 'agSetColumnFilter';
  sortable?: boolean;
  comparator?: string;
  pinned?: 'left' | 'right';
  cellRenderer?: 'attribute' | 'evidenceBadge' | 'tradeoffBar' | 'rankBadge' | 'availabilityBadge';
  valueGetter?: string;
  /** Fields the agent must never present as fact. */
  requiresEvidence?: boolean;
}

export const BASE_COLUMNS: AgGridColumn[] = [
  { field: 'rank', headerName: '#', colId: 'rank', width: 64, type: 'numeric', pinned: 'left', cellRenderer: 'rankBadge' },
  { field: 'title', headerName: 'Product', colId: 'title', width: 260, minWidth: 200, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'price', headerName: 'Price', colId: 'price', width: 120, type: 'numeric', filter: 'agNumberColumnFilter' },
  { field: 'availability', headerName: 'Availability', colId: 'availability', width: 140, cellRenderer: 'availabilityBadge' },
  { field: 'score', headerName: 'Score', colId: 'score', width: 110, type: 'numeric', filter: 'agNumberColumnFilter', cellRenderer: 'tradeoffBar' },
];

export const ATTRIBUTE_COLUMNS: AgGridColumn[] = [
  { field: 'attributes.ram_gb', headerName: 'Memory (GB)', colId: 'ram_gb', width: 130, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
  { field: 'attributes.cpu_cores', headerName: 'CPU cores', colId: 'cpu_cores', width: 120, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
  { field: 'attributes.cpu_score', headerName: 'CPU score', colId: 'cpu_score', width: 130, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
  { field: 'attributes.gpu_vram_gb', headerName: 'GPU mem (GB)', colId: 'gpu_vram_gb', width: 130, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
  { field: 'attributes.storage_gb', headerName: 'Storage (GB)', colId: 'storage_gb', width: 130, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
  { field: 'attributes.display_in', headerName: 'Display (in)', colId: 'display_in', width: 130, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
  { field: 'attributes.weight_kg', headerName: 'Weight (kg)', colId: 'weight_kg', width: 130, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
  { field: 'attributes.battery_wh', headerName: 'Battery (Wh)', colId: 'battery_wh', width: 130, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
  { field: 'attributes.warranty_years', headerName: 'Warranty (y)', colId: 'warranty_years', width: 130, type: 'numeric', filter: 'agNumberColumnFilter', requiresEvidence: true },
];

export const SCORE_COLUMNS: AgGridColumn[] = [
  { field: 'evidenceScore', headerName: 'Evidence', colId: 'evidenceScore', width: 120, type: 'numeric' },
  { field: 'unverifiedCount', headerName: 'Unverified', colId: 'unverifiedCount', width: 130, type: 'numeric' },
  { field: 'tradeoffs.pro', headerName: 'Pros', colId: 'pro', width: 100, type: 'numeric' },
  { field: 'tradeoffs.con', headerName: 'Cons', colId: 'con', width: 100, type: 'numeric' },
];

/**
 * Framework-agnostic column model. apps/web renders it with AG Grid; keeping it
 * here means the grid layout is testable without a browser and reusable by the
 * API (e.g. for column-state defaults).
 */
export function buildColumns(options: { attributeKeys?: string[] } = {}): AgGridColumn[] {
  const keys = options.attributeKeys ?? ATTRIBUTE_COLUMNS.map((c) => c.colId);
  const attributes = keys
    .map((key) => ATTRIBUTE_COLUMNS.find((c) => c.colId === key))
    .filter((c): c is AgGridColumn => Boolean(c));
  return [...BASE_COLUMNS, ...attributes, ...SCORE_COLUMNS];
}

export function rowsFromEvaluations(input: {
  products: ProductT[];
  evaluations: EvaluationT[];
  pinnedProductIds?: string[];
}): ComparisonRow[] {
  const byProduct = new Map(input.evaluations.map((e) => [e.productId, e]));
  const pinned = new Set(input.pinnedProductIds ?? []);

  return input.products
    .map((product) => {
      const evaluation = byProduct.get(product.id);
      const attributes: Record<string, number | string | boolean | null> = {};
      const evidence: Record<string, 'verified' | 'unverified'> = {};
      for (const attribute of product.attributes) {
        attributes[attribute.key] =
          attribute.numericValue ?? (attribute.value === null ? null : attribute.value);
        evidence[attribute.key] = attribute.evidence.kind === 'unverified' ? 'unverified' : 'verified';
      }
      return {
        productId: product.id,
        title: product.title,
        brand: product.brand ?? '',
        provider: product.provider,
        category: product.category,
        price: product.price.amount,
        currency: product.price.currency,
        availability: product.availability.status,
        score: evaluation?.score ?? 0,
        rank: evaluation?.rank ?? null,
        evidenceScore: evaluation?.evidenceQuality.score ?? 0,
        unverifiedCount: evaluation?.evidenceQuality.unverifiedFields.length ?? 0,
        disqualified: evaluation?.disqualified ?? [],
        tradeoffs: {
          pro: evaluation?.tradeoffs.filter((t) => t.direction === 'pro').length ?? 0,
          con: evaluation?.tradeoffs.filter((t) => t.direction === 'con').length ?? 0,
        },
        attributes,
        evidence,
        pinned: pinned.has(product.id),
      } satisfies ComparisonRow;
    })
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.score - a.score);
}

/**
 * Resolve the grid field a constraint filters on. Base columns such as 'price'
 * map to their own field so the filter model always targets a column that
 * exists; everything else is an attribute key living under `attributes`.
 */
export function gridFieldForConstraint(field: string): string {
  const base = BASE_COLUMNS.find((column) => column.colId === field);
  if (base) return base.field;
  const attribute = ATTRIBUTE_COLUMNS.find((column) => column.colId === field);
  if (attribute) return attribute.field;
  return field.startsWith('attributes.') ? field : `attributes.${field}`;
}

/**
 * Translate an intent constraint into an AG Grid numeric filter so an edited
 * constraint immediately narrows the comparison table.
 */
export function constraintToGridFilter(constraint: NumericConstraintT): {
  field: string;
  operator: string;
  value: number;
  value2?: number;
} {
  return {
    field: gridFieldForConstraint(constraint.field),
    operator: constraint.op === 'gte' ? 'greaterThanOrEqual' : constraint.op === 'lte' ? 'lessThanOrEqual' : constraint.op,
    value: constraint.value,
    ...(constraint.valueMax !== undefined ? { value2: constraint.valueMax } : {}),
  };
}

export function constraintsToGridFilters(constraints: NumericConstraintT[]) {
  return constraints.map(constraintToGridFilter);
}

/** Which constraint a grid edit changed — used to re-run evaluation server-side. */
export function constraintFromGridEdit(input: {
  field: string;
  op: string;
  value: number;
  intent: IntentT;
}): NumericConstraintT | null {
  const key = input.field.startsWith('attributes.') ? input.field.slice('attributes.'.length) : input.field;
  const existing = input.intent.constraints.numeric.find((c) => c.field === key);
  const op = (input.op === 'greaterThanOrEqual'
    ? 'gte'
    : input.op === 'lessThanOrEqual'
      ? 'lte'
      : input.op === 'equals'
        ? 'eq'
        : (input.op as NumericConstraintT['op'])) ?? 'gte';
  return {
    field: key,
    label: existing?.label ?? key,
    op,
    value: input.value,
    unit: existing?.unit,
    source: 'user',
    weight: existing?.weight ?? 1,
    hard: existing?.hard ?? true,
  };
}

export function summariseConstraintResults(results: ConstraintResultT[]): string {
  const failed = results.filter((r) => r.satisfied === false);
  const unknown = results.filter((r) => r.satisfied === null);
  const parts: string[] = [];
  if (failed.length > 0) {
    parts.push(`fails ${failed.map((f) => f.label).join(', ')}`);
  }
  if (unknown.length > 0) {
    parts.push(`has unverified ${unknown.map((u) => u.label).join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'satisfies every hard constraint';
}