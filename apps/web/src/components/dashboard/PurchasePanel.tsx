'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RunDetailResponseT } from '@autopilot/schemas';

import { money, titleCase } from '@/lib/api';

interface PurchasePanelProps {
  detail: RunDetailResponseT;
  busy: boolean;
  /** PayPal approval link, when the provider needs the payer to approve there. */
  approvalUrl: string | null;
  onPrepare: (productId: string) => void;
  onApprove: () => void;
  onCapture: () => void;
}

/** Plan states after which a new plan has to be prepared. */
const RESTARTABLE = new Set(['policy_blocked', 'failed', 'expired', 'cancelled', 'stale']);

/**
 * The human gate. Every step that moves towards money is an explicit button:
 * prepare a plan, approve its exact terms, then pay. Nothing here happens on
 * its own.
 */
export function PurchasePanel({ detail, busy, approvalUrl, onPrepare, onApprove, onCapture }: PurchasePanelProps) {
  const options = useMemo(() => {
    const titles = new Map(detail.products.map((product) => [product.id, product]));
    return (detail.shortlist?.entries ?? []).map((entry) => {
      const product = titles.get(entry.productId);
      return {
        id: entry.productId,
        label: product
          ? `#${entry.rank} · ${product.title} · ${money(product.price.amount, product.price.currency)}`
          : `#${entry.rank} · ${entry.productId}`,
      };
    });
  }, [detail]);

  const [productId, setProductId] = useState('');
  useEffect(() => {
    setProductId(options[0]?.id ?? '');
  }, [options]);

  const { plan, approval, payment } = detail;
  const canPrepare = options.length > 0 && (!plan || RESTARTABLE.has(plan.status));
  const blockers = plan ? plan.policyResult.rules.filter((rule) => rule.outcome === 'block') : [];
  const awaitingApproval = plan?.status === 'awaiting_approval' || plan?.status === 'paypal_order_created';
  const payable = plan?.status === 'approved' || plan?.status === 'payment_pending';
  const needsVerification = plan?.status === 'paid';

  return (
    <div className="card wide-card">
      <div className="card-head">
        <span className="card-title">Purchase and payment</span>
        <span className="card-kicker">{plan ? titleCase(plan.status) : 'No plan yet'}</span>
      </div>

      {plan ? (
        <>
          <div className="policy-grid">
            <div className="policy-item">
              <span>Item</span>
              <strong>{plan.product.title}</strong>
            </div>
            <div className="policy-item">
              <span>Total</span>
              <strong>{money(plan.total.amount, plan.total.currency)}</strong>
            </div>
            <div className="policy-item">
              <span>Policy decision</span>
              <strong>{titleCase(plan.policyResult.outcome)}</strong>
            </div>
            <div className="policy-item">
              <span>Approval</span>
              <strong>{approval ? titleCase(approval.status) : 'Not requested'}</strong>
            </div>
            <div className="policy-item">
              <span>Payment</span>
              <strong>
                {payment ? `${titleCase(payment.status)} · ${titleCase(payment.verificationState)}` : 'Not started'}
              </strong>
            </div>
            <div className="policy-item">
              <span>Payment mode</span>
              <strong>{payment ? payment.mode.toUpperCase() : plan.paypalOrderId ? 'Order created' : '—'}</strong>
            </div>
          </div>

          {blockers.length > 0 || plan.riskFlags.length > 0 ? (
            <div className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
              <ul className="guard-list" aria-label="Policy and risk notes">
                {blockers.map((rule) => (
                  <li key={`block-${rule.rule}`}>
                    <span>Blocked · {titleCase(rule.rule)}</span>
                    <span>{rule.message}</span>
                  </li>
                ))}
                {plan.riskFlags
                  .filter((flag) => flag.severity !== 'block')
                  .map((flag) => (
                    <li key={flag.code}>
                      <span>{flag.severity === 'warn' ? 'Note' : 'Info'}</span>
                      <span>{flag.message}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <div className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
            {awaitingApproval ? (
              <div className="form-foot">
                <span className="hint">
                  {approval?.authorizationScope.description ??
                    'Approving authorises exactly this item and total. Any change to the plan invalidates it.'}
                </span>
                <button className="button" type="button" onClick={onApprove} disabled={busy}>
                  {busy ? 'Working…' : `Approve ${money(plan.total.amount, plan.total.currency)}`}
                </button>
              </div>
            ) : null}

            {payable ? (
              <div className="form-foot">
                <span className="hint">
                  {approvalUrl ? (
                    <>
                      First approve the payment with PayPal:{' '}
                      <a href={approvalUrl} target="_blank" rel="noreferrer">
                        open PayPal approval
                      </a>
                      . Then come back and pay.
                    </>
                  ) : (
                    'Approved. Paying captures the payment and then verifies it with the provider.'
                  )}
                </span>
                <button className="button" type="button" onClick={onCapture} disabled={busy}>
                  {busy ? 'Working…' : `Pay ${money(plan.total.amount, plan.total.currency)}`}
                </button>
              </div>
            ) : null}

            {needsVerification ? (
              <div className="form-foot">
                <span className="hint">
                  The payment was captured but is not verified yet. Verifying does not charge again.
                </span>
                <button className="button" type="button" onClick={onCapture} disabled={busy}>
                  {busy ? 'Working…' : 'Verify payment'}
                </button>
              </div>
            ) : null}

            {plan.status === 'verified' && payment ? (
              <div className="result show" role="status">
                <strong>
                  Paid and verified · {money(payment.amount.amount, payment.amount.currency)}
                  {payment.mode === 'simulated' ? ' (simulated — no money moved)' : ''}
                </strong>
                <p>
                  Transaction {payment.transactionId ?? '—'} · order {payment.paypalOrderId}
                </p>
              </div>
            ) : null}

            {RESTARTABLE.has(plan.status) ? (
              <div className="result show error" role="status">
                <strong>This plan is {titleCase(plan.status).toLowerCase()}</strong>
                <p>
                  {plan.status === 'policy_blocked'
                    ? 'Policy does not allow this purchase. Pick another candidate or change the policy.'
                    : (payment?.lastError ?? 'Prepare the purchase again to continue.')}
                </p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {canPrepare ? (
        <div className="card-body" style={plan ? { borderTop: '1px solid var(--line)' } : undefined}>
          <label className="field-label" htmlFor="purchase-product">
            Candidate to buy
          </label>
          <div className="form-foot">
            <select
              id="purchase-product"
              className="purchase-select"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="button" type="button" onClick={() => onPrepare(productId)} disabled={busy || !productId}>
              {busy ? 'Working…' : 'Prepare purchase'} <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Preparing re-checks the price and your policy and asks for your approval. It does not pay.
          </p>
        </div>
      ) : null}

      {!plan && options.length === 0 ? (
        <div className="empty">
          <strong>Nothing to buy yet</strong>
          This review has no shortlisted candidate.
        </div>
      ) : null}
    </div>
  );
}
