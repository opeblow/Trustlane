'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { rowsFromEvaluations } from '@autopilot/ag-grid';
import type {
  AuditEventT,
  HealthResponseT,
  NumericConstraintT,
  RunDetailResponseT,
  RunT,
  UserPolicyT,
} from '@autopilot/schemas';

import { ComparisonGrid } from '@/components/grid/ComparisonGrid';
import { EventGrid } from '@/components/grid/EventGrid';
import { RunGrid } from '@/components/grid/RunGrid';
import { ToolCallGrid } from '@/components/grid/ToolCallGrid';
import { api, describeError, money, titleCase } from '@/lib/api';

const NAV_ITEMS = [
  { id: 'overview', icon: '⌂', label: 'Overview' },
  { id: 'purchases', icon: '↗', label: 'Purchase review' },
  { id: 'policies', icon: '≡', label: 'Policies' },
  { id: 'activity', icon: '◷', label: 'Activity' },
] as const;

type Section = (typeof NAV_ITEMS)[number]['id'];

const CRUMB_LABELS: Record<Section, string> = {
  overview: 'Overview',
  purchases: 'Purchase review',
  policies: 'Policies',
  activity: 'Activity',
};

const DEFAULT_REQUEST =
  'Find me a work laptop under $1,500 with at least 16GB RAM. Ask me before you buy.';

interface Notice {
  tone: 'ok' | 'bad';
  title: string;
  body?: string;
}

export function Dashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [health, setHealth] = useState<HealthResponseT | null>(null);
  const [runs, setRuns] = useState<RunT[]>([]);
  const [events, setEvents] = useState<AuditEventT[]>([]);
  const [policies, setPolicies] = useState<UserPolicyT[]>([]);
  const [detail, setDetail] = useState<RunDetailResponseT | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rescoreNeeded, setRescoreNeeded] = useState(false);
  const [overviewRequest, setOverviewRequest] = useState(DEFAULT_REQUEST);
  const [purchaseRequest, setPurchaseRequest] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const stored = window.localStorage.getItem('trustlane-theme');
    if (stored === 'dark' || stored === 'light') setTheme(stored);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('trustlane-theme', next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healthResult, runResult, policyResult, eventResult] = await Promise.all([
        api.health(),
        api.runs(50),
        api.policies(),
        api.events(80),
      ]);
      setHealth(healthResult);
      setRuns(runResult.runs);
      setPolicies(policyResult.policies);
      setEvents(eventResult.events);
      setOffline(null);
    } catch (error) {
      setHealth(null);
      setRuns([]);
      setEvents([]);
      setPolicies([]);
      setOffline(describeError(error, 'The Trustlane API is not reachable.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedRunId || runs.length === 0) return;
    const newest = [...runs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const preferred = newest.find((run) => run.candidateCount > 0 && run.status !== 'blocked') ?? newest[0];
    if (preferred) setSelectedRunId(preferred.id);
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setRescoreNeeded(false);
    api
      .run(selectedRunId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, runs]);

  const comparisonRows = useMemo(
    () =>
      detail
        ? rowsFromEvaluations({
            products: detail.products,
            evaluations: detail.evaluations,
            pinnedProductIds: detail.shortlist
              ? detail.shortlist.entries.map((entry) => entry.productId)
              : detail.run.shortlistedProductIds,
          })
        : [],
    [detail],
  );

  const startReview = useCallback(
    async (text: string) => {
      if (!health) {
        setNotice({ tone: 'bad', title: 'Connect the Trustlane API first', body: 'Run npm run dev:api in another terminal, then retry.' });
        return;
      }
      setBusy(true);
      setNotice({ tone: 'ok', title: 'Creating your review', body: 'Parsing the request and starting product discovery. No payment is being made.' });
      try {
        const intentResponse = await api.createIntent(text);
        const runResponse = await api.startRun(intentResponse.intent.id);
        setNotice({
          tone: 'ok',
          title: `Review started · ${runResponse.run.id}`,
          body: `Status ${runResponse.run.status} · ${runResponse.run.progressLabel || runResponse.run.stage}. Payment is not captured by starting a review.`,
        });
        setSelectedRunId(runResponse.run.id);
        setSection('purchases');
        await load();
      } catch (error) {
        setNotice({
          tone: 'bad',
          title: 'Could not start the review',
          body: describeError(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [health, load],
  );

  /** Grid cell edit → hard constraint on the intent. Scoring is server-side, so the
   *  grid narrows instantly and a re-run is offered to rescore the shortlist. */
  const applyConstraintEdit = useCallback(
    async (field: string, value: number) => {
      if (!detail) return;
      const existing = detail.intent.constraints.numeric.filter((constraint) => constraint.field === field);
      const next: NumericConstraintT = {
        field,
        label: existing[0]?.label ?? field,
        op: 'gte',
        value,
        ...(existing[0]?.unit ? { unit: existing[0].unit } : {}),
        source: 'user',
        weight: 1,
        hard: true,
      };
      const numeric = [
        ...detail.intent.constraints.numeric.filter((constraint) => constraint.field !== field),
        next,
      ];
      setBusy(true);
      try {
        await api.updateIntentConstraints(detail.intent.id, numeric);
        setNotice({
          tone: 'ok',
          title: `Constraint updated · ${field} ≥ ${value}`,
          body: 'The grid now filters on this hard constraint. Re-run the evaluation to rescore candidates and rebuild the shortlist.',
        });
        setRescoreNeeded(true);
        const refreshed = await api.run(detail.run.id);
        setDetail(refreshed);
      } catch (error) {
        setNotice({
          tone: 'bad',
          title: 'Could not update the constraint',
          body: describeError(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [detail],
  );

  const rerunEvaluation = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await api.startRun(detail.intent.id);
      setRescoreNeeded(false);
      setNotice({
        tone: 'ok',
        title: `Re-running evaluation · ${response.run.id}`,
        body: `Status ${response.run.status}. Scores, disqualifications and the shortlist are recomputed against the edited request.`,
      });
      setSelectedRunId(response.run.id);
      await load();
    } catch (error) {
      setNotice({
        tone: 'bad',
        title: 'Could not re-run the evaluation',
        body: describeError(error),
      });
    } finally {
      setBusy(false);
    }
  }, [detail, load]);

  const clearConstraints = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.updateIntentConstraints(detail.intent.id, []);
      const refreshed = await api.run(detail.run.id);
      setDetail(refreshed);
      setRescoreNeeded(true);
      setNotice({
        tone: 'ok',
        title: 'Grid filters cleared',
        body: 'Constraints from the request were removed. Re-run the evaluation to score every candidate again.',
      });
    } catch (error) {
      setNotice({ tone: 'bad', title: 'Could not clear constraints', body: describeError(error) });
    } finally {
      setBusy(false);
    }
  }, [detail]);

  const policy = policies[0] ?? null;
  const completed = runs.filter((run) => run.status === 'completed').length;
  const blocked = runs.filter((run) => run.status === 'blocked' || run.status === 'failed').length;
  const mode = health ? String(health.mode ?? 'unknown').toUpperCase() : 'Not connected';

  return (
    <div className="shell">
      <aside className="rail" role="navigation" aria-label="Workspace navigation">
        <a className="brand" href="/" aria-label="Trustlane home">
          <span className="mark" aria-hidden="true">
            T
          </span>
          <span className="brand-name">Trustlane</span>
        </a>
        <div className="workspace-label">Workspace</div>
        <nav className="nav" aria-label="Main sections">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              title={item.label}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav-text">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <div className="mode-box">
            <div className="mode-label">Payment mode</div>
            <div className="mode-value">{mode}</div>
            <div className="mode-sub">No payment without approval</div>
          </div>
          <a className="back-link" href="/">
            <span aria-hidden="true">←</span> Back to Trustlane
          </a>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <div className="breadcrumb">
            Trustlane <span aria-hidden="true">/</span> <strong>{CRUMB_LABELS[section]}</strong>
          </div>
          <div className="top-right">
            <div className="top-actions">
              <button type="button" className="ghost-btn" onClick={toggleTheme} aria-pressed={theme === 'dark'}>
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <button type="button" className="ghost-btn" onClick={() => void load()} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <div className={`connection${health ? ' connected' : ''}`} role="status" aria-live="polite">
              <i className={`dot${health ? ' on' : ''}`} aria-hidden="true" />
              <span>{health ? `API ${health.status}` : offline ? 'API offline' : 'Checking API'}</span>
            </div>
            <div className="avatar" aria-label="Local workspace" title="Local workspace">
              TL
            </div>
          </div>
        </header>

        <main className="content">
          {offline ? (
            <div className="alert show" role="alert">
              <strong>Workspace API is not connected.</strong> Start it in another terminal with{' '}
              <code>npm run dev:api</code>. {offline}
            </div>
          ) : null}

          {section === 'overview' ? (
            <section className="section active" aria-label="Overview">
              <div className="page-head">
                <div>
                  <div className="eyebrow">Trustlane workspace</div>
                  <h1>Good to see you.</h1>
                  <p className="intro">A clear view of purchase decisions, policies, and payment activity.</p>
                </div>
                <button className="button" type="button" onClick={() => setSection('purchases')}>
                  Start a purchase review <span aria-hidden="true">↗</span>
                </button>
              </div>

              <div className="metrics">
                <div className="metric">
                  <div className="metric-label">Purchase reviews</div>
                  <div className="metric-value">{health ? runs.length : '—'}</div>
                  <div className="metric-sub">{completed} completed · {blocked} blocked</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Active policies</div>
                  <div className="metric-value">{health ? policies.length : '—'}</div>
                  <div className="metric-sub">Spending rules applied to requests</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Payment adapter</div>
                  <div className="metric-value" style={{ fontSize: 17 }}>
                    {mode}
                  </div>
                  <div className="metric-sub">Provider state from the API</div>
                </div>
              </div>

              <div className="grid">
                <div className="card">
                  <div className="card-head">
                    <span className="card-title">Start with a purchase request</span>
                    <span className="card-kicker">01 / New review</span>
                  </div>
                  <div className="card-body">
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void startReview(overviewRequest);
                      }}
                    >
                      <label className="field-label" htmlFor="request-text">
                        What should Trustlane help you find?
                      </label>
                      <textarea
                        id="request-text"
                        minLength={3}
                        maxLength={2000}
                        required
                        value={overviewRequest}
                        onChange={(event) => setOverviewRequest(event.target.value)}
                      />
                      <div className="form-foot">
                        <span className="hint">
                          Your request is parsed and evaluated against policy. This starts a review only — no payment is
                          ever captured.
                        </span>
                        <button className="button" type="submit" disabled={busy}>
                          {busy ? 'Starting review…' : 'Review request'} <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    </form>
                    {notice ? (
                      <div className={`result show${notice.tone === 'bad' ? ' error' : ''}`} role="status" aria-live="polite">
                        <strong>{notice.title}</strong>
                        {notice.body ? <p>{notice.body}</p> : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <span className="card-title">Guardrails</span>
                    <span className="card-kicker">Always on</span>
                  </div>
                  <div className="card-body">
                    <ul className="guard-list" aria-label="Always-on guardrails">
                      <li>
                        <span>Spending policy</span>
                        <span>Checked before execution</span>
                      </li>
                      <li>
                        <span>Human approval</span>
                        <span>Required before payment</span>
                      </li>
                      <li>
                        <span>Plan changes</span>
                        <span>Invalidate prior approval</span>
                      </li>
                      <li>
                        <span>Payment verification</span>
                        <span>Required before automation</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="card wide-card">
                <div className="card-head">
                  <span className="card-title">Recent purchase reviews</span>
                  <button className="button outline" type="button" onClick={() => setSection('activity')}>
                    View activity
                  </button>
                </div>
                {health ? (
                  <RunGrid runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} fileName="trustlane-reviews" />
                ) : (
                  <div className="empty">
                    <strong>API connection required</strong>
                    Start the Trustlane API to load purchase reviews.
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {section === 'purchases' ? (
            <section className="section active" aria-label="Purchase review">
              <div className="page-head">
                <div>
                  <div className="eyebrow">Purchase review</div>
                  <h1>What are you looking for?</h1>
                  <p className="intro">Start a review. You stay in control before any payment.</p>
                </div>
              </div>

              <div className="card" style={{ maxWidth: 760 }}>
                <div className="card-head">
                  <span className="card-title">New purchase request</span>
                  <span className="card-kicker">No payment will be captured</span>
                </div>
                <div className="card-body">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void startReview(purchaseRequest);
                    }}
                  >
                    <label className="field-label" htmlFor="request-text-secondary">
                      Describe the item, budget, and any requirements
                    </label>
                    <textarea
                      id="request-text-secondary"
                      minLength={3}
                      maxLength={2000}
                      placeholder="For example: Find me a laptop under $1,500 with at least 16GB RAM."
                      required
                      value={purchaseRequest}
                      onChange={(event) => setPurchaseRequest(event.target.value)}
                    />
                    <div className="form-foot">
                      <span className="hint">
                        Trustlane will create an intent and begin discovery and evaluation.
                      </span>
                      <button className="button" type="submit" disabled={busy}>
                        {busy ? 'Starting review…' : 'Start review'} <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </form>
                  {notice ? (
                    <div className={`result show${notice.tone === 'bad' ? ' error' : ''}`} role="status" aria-live="polite">
                      <strong>{notice.title}</strong>
                      {notice.body ? <p>{notice.body}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="card wide-card">
                <div className="card-head">
                  <span className="card-title">Candidate comparison</span>
                  <span className="card-kicker">
                    {detail ? `${detail.run.stage} · ${detail.run.status}` : 'Select a review'}
                  </span>
                </div>
                {detail && comparisonRows.length > 0 ? (
                  <>
                    {rescoreNeeded ? (
                      <div className="result show" role="status" aria-live="polite">
                        <strong>Request changed · scores are from the previous run</strong>
                        <p>
                          The grid filters on your edited constraints, but scores, disqualifications and the
                          shortlist are computed server-side. Re-run the evaluation to refresh them.
                        </p>
                        <button type="button" className="button" onClick={() => void rerunEvaluation()} disabled={busy}>
                          {busy ? 'Re-running…' : 'Re-run evaluation'} <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    ) : null}
                    <ComparisonGrid
                      rows={comparisonRows}
                      intent={detail.intent}
                      evaluations={detail.evaluations}
                      selectedRunId={detail.run.id}
                      onConstraintEdit={(field, value) => void applyConstraintEdit(field, value)}
                      onClearConstraints={() => void clearConstraints()}
                    />
                    {detail.shortlist?.explanation?.length ? (
                      <div className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
                        <div className="card-kicker" style={{ marginBottom: 8 }}>
                          Why these candidates
                        </div>
                        <ul className="guard-list">
                          {detail.shortlist.explanation.map((line) => (
                            <li key={line}>
                              <span>Decision</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="empty">
                    <strong>No evaluated candidates yet</strong>
                    Pick a review with candidates, or start a new one above.
                  </div>
                )}
              </div>

              <div className="card wide-card">
                <div className="card-head">
                  <span className="card-title">Your reviews</span>
                  <span className="card-kicker">Select a row to load its candidates</span>
                </div>
                {health ? (
                  <RunGrid runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} fileName="trustlane-reviews" />
                ) : (
                  <div className="empty">Connect the API to load review history.</div>
                )}
              </div>
            </section>
          ) : null}

          {section === 'policies' ? (
            <section className="section active" aria-label="Policies">
              <div className="page-head">
                <div>
                  <div className="eyebrow">Spending rules</div>
                  <h1>Policies</h1>
                  <p className="intro">The limits and approval rules used to evaluate purchase requests.</p>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <span className="card-title">Connected policy</span>
                  <span className="card-kicker">{policy ? `Version ${policy.version}` : 'API status'}</span>
                </div>
                {policy ? (
                  <div className="policy-grid">
                    <div className="policy-item">
                      <span>Policy</span>
                      <strong>{policy.name || policy.id}</strong>
                    </div>
                    <div className="policy-item">
                      <span>Per-transaction limit</span>
                      <strong>{money(policy.maxTransaction.amount, policy.maxTransaction.currency)}</strong>
                    </div>
                    <div className="policy-item">
                      <span>Rolling daily limit</span>
                      <strong>{money(policy.dailyLimit.amount, policy.dailyLimit.currency)}</strong>
                    </div>
                    <div className="policy-item">
                      <span>Approval threshold</span>
                      <strong>{money(policy.approvalThreshold.amount, policy.approvalThreshold.currency)}</strong>
                    </div>
                    <div className="policy-item">
                      <span>Approval required</span>
                      <strong>{policy.requireApproval ? 'Always' : 'Above threshold'}</strong>
                    </div>
                    <div className="policy-item">
                      <span>Emergency stop</span>
                      <strong>{policy.emergencyStop ? 'Active' : 'Off'}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="empty">
                    <strong>{offline ? 'Start the Trustlane API to load policy settings.' : 'No policy records returned by the API.'}</strong>
                  </div>
                )}
              </div>

              <div className="card wide-card">
                <div className="card-head">
                  <span className="card-title">Execution safeguards</span>
                </div>
                <div className="card-body">
                  <ul className="guard-list" aria-label="Execution safeguards">
                    <li>
                      <span>Emergency stop</span>
                      <span>Blocks all money-affecting actions</span>
                    </li>
                    <li>
                      <span>Quote freshness</span>
                      <span>Stale prices are flagged and blocked</span>
                    </li>
                    <li>
                      <span>Approval binding</span>
                      <span>Approval is tied to the exact reviewed plan</span>
                    </li>
                    <li>
                      <span>Verification gate</span>
                      <span>Automation waits for verified payment state</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          {section === 'activity' ? (
            <section className="section active" aria-label="Activity">
              <div className="page-head">
                <div>
                  <div className="eyebrow">Audit trail</div>
                  <h1>Activity</h1>
                  <p className="intro">Events from your connected Trustlane workspace.</p>
                </div>
                <button className="button outline" type="button" onClick={() => void load()} disabled={loading}>
                  Refresh
                </button>
              </div>

              <div className="card">
                <div className="card-head">
                  <span className="card-title">Recent events</span>
                  <span className="card-kicker">Read-only</span>
                </div>
                {health ? (
                  <EventGrid events={events} fileName="trustlane-events" onSelectRun={setSelectedRunId} />
                ) : (
                  <div className="empty">Connect the API to load activity.</div>
                )}
              </div>

              <div className="card wide-card">
                <div className="card-head">
                  <span className="card-title">Agent tool calls</span>
                  <span className="card-kicker">
                    {detail ? `${detail.toolCalls.length} calls in ${titleCase(detail.run.stage)}` : 'Select a review'}
                  </span>
                </div>
                {detail && detail.toolCalls.length > 0 ? (
                  <ToolCallGrid toolCalls={detail.toolCalls} fileName="trustlane-tool-calls" />
                ) : (
                  <div className="empty">
                    <strong>No tool calls for this review</strong>
                    Select a review in Purchase review to see how the agent worked.
                  </div>
                )}
              </div>
            </section>
          ) : null}

          <footer className="footer">
            Trustlane · Human approval before money moves · <a href="/">Return to landing page</a>
          </footer>
        </main>
      </div>
    </div>
  );
}