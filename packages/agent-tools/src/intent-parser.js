import { newId, nowIso, } from '@autopilot/schemas';
export const ATTRIBUTE_RULES = [
    {
        field: 'ram_gb',
        label: 'Memory',
        unit: 'GB',
        synonyms: ['ram', 'memory', 'gb of ram', 'system memory'],
        defaultOp: 'gte',
        qualitative: { minimum: 16, at_least: 16, '32gb': 32, '16gb': 16, lots: 32, plenty: 32, big: 32 },
    },
    {
        field: 'storage_gb',
        label: 'Storage',
        unit: 'GB',
        synonyms: ['storage', 'ssd', 'disk', 'drive', 'nvme'],
        defaultOp: 'gte',
        qualitative: { minimum: 512, plenty: 1024, fast: 1024, large: 1024 },
    },
    {
        field: 'cpu_cores',
        label: 'CPU cores',
        unit: 'cores',
        synonyms: ['cpu cores', 'cores', 'cpu threads', 'threads', 'multicore', 'multi-core'],
        defaultOp: 'gte',
        qualitative: { strong: 12, fast: 12, powerful: 12, many: 12 },
    },
    {
        field: 'cpu_score',
        label: 'CPU benchmark score',
        unit: 'pts',
        synonyms: ['cpu performance', 'cpu speed', 'cpu score', 'single core', 'cinebench', 'compute performance'],
        defaultOp: 'gte',
        qualitative: { strong: 22000, fast: 22000, excellent: 22000, top: 30000, ml: 22000 },
    },
    {
        field: 'gpu_vram_gb',
        label: 'GPU memory',
        unit: 'GB',
        synonyms: ['vram', 'gpu memory', 'gpu vram', 'dedicated gpu', 'graphics memory'],
        defaultOp: 'gte',
        qualitative: { large: 12, big: 16, ml: 12 },
    },
    {
        field: 'gpu_score',
        label: 'GPU benchmark score',
        unit: 'pts',
        synonyms: ['gpu performance', 'gpu score', 'graphics performance', 'cuda cores'],
        defaultOp: 'gte',
        qualitative: { strong: 15000, fast: 15000, ml: 15000 },
    },
    {
        field: 'display_in',
        label: 'Display size',
        unit: 'in',
        synonyms: ['screen', 'display', 'monitor size', 'screen size'],
        defaultOp: 'gte',
        qualitative: { large: 16, big: 16, small: 13 },
    },
    {
        field: 'weight_kg',
        label: 'Weight',
        unit: 'kg',
        synonyms: ['weight', 'portable', 'lightweight'],
        defaultOp: 'lte',
        qualitative: { portable: 1.8, light: 1.5, ultralight: 1.2, featherweight: 1.1 },
    },
    {
        field: 'battery_wh',
        label: 'Battery',
        unit: 'Wh',
        synonyms: ['battery', 'battery life', 'runtime'],
        defaultOp: 'gte',
        qualitative: { long: 90, good: 70, all_day: 90 },
    },
    {
        field: 'warranty_years',
        label: 'Warranty',
        unit: 'years',
        synonyms: ['warranty', 'support'],
        defaultOp: 'gte',
        qualitative: { long: 3 },
    },
];
export const CATEGORY_KEYWORDS = [
    { category: 'laptop', keywords: ['laptop', 'notebook', 'macbook', 'ultrabook', 'workstation'] },
    { category: 'desktop', keywords: ['desktop', 'tower', 'workstation pc', 'pc build'] },
    { category: 'monitor', keywords: ['monitor', 'display', 'screen'] },
    { category: 'components', keywords: ['gpu', 'graphics card', 'cpu', 'processor', 'motherboard', 'ram stick', 'ssd'] },
    { category: 'phone', keywords: ['phone', 'smartphone', 'iphone', 'pixel'] },
    { category: 'tablet', keywords: ['tablet', 'ipad'] },
    { category: 'audio', keywords: ['headphones', 'headset', 'earbuds', 'speaker', 'audio'] },
    { category: 'accessory', keywords: ['dock', 'keyboard', 'mouse', 'bag', 'charger', 'stand', 'hub'] },
];
const CURRENCY_BY_SYMBOL = {
    $: 'USD',
    'us$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    'ca$': 'CAD',
    'a$': 'AUD',
    '¥': 'JPY',
};
const APPROVAL_PHRASES = [
    'without my approval',
    'without approval',
    'ask me first',
    'ask before',
    'confirm before',
    'check with me',
    'require approval',
    'needs my approval',
    'get my approval',
    'do not buy',
    "don't buy",
    'never buy',
    'no purchase without',
];
const AUTO_APPROVE_PHRASES = [
    'you have approval',
    'pre-approved',
    'preapproved',
    'auto approve',
    'auto-approve',
    'no need to ask',
    'just buy it',
    'go ahead and buy',
    'buy it without asking',
];
/**
 * Deterministic intent interpreter. It is the product's guaranteed path: the
 * same sentence always yields the same structured constraints, which is what
 * makes money-affecting behaviour auditable. An LLM may enrich the result, but
 * never replaces this parser's authority over budget and approval fields.
 */
export function parseIntentDeterministic(text, defaultCurrency = 'USD') {
    const raw = text.trim();
    const lower = raw.toLowerCase();
    const notes = [];
    const openQuestions = [];
    // --- category -----------------------------------------------------------
    let category = 'other';
    let bestScore = 0;
    for (const entry of CATEGORY_KEYWORDS) {
        const score = entry.keywords.reduce((acc, kw) => acc + (new RegExp(`\\b${escapeRegex(kw)}\\b`).test(lower) ? kw.split(' ').length : 0), 0);
        if (score > bestScore) {
            bestScore = score;
            category = entry.category;
        }
    }
    if (bestScore === 0) {
        openQuestions.push('No product category was detected — tell me what kind of product to look for.');
    }
    // --- currency -----------------------------------------------------------
    let currency = defaultCurrency;
    const symbolMatch = lower.match(/(us\$|ca\$|a\$|[$€£¥])\s?([\d,]+(?:\.\d+)?)/);
    if (symbolMatch?.[1]) {
        currency = CURRENCY_BY_SYMBOL[symbolMatch[1]] ?? defaultCurrency;
    }
    const isoMatch = lower.match(/\b(usd|eur|gbp|cad|aud|jpy)\b/);
    if (isoMatch?.[1])
        currency = isoMatch[1].toUpperCase();
    // --- budget -------------------------------------------------------------
    let budgetMax;
    let budgetMin;
    const budgetPatterns = [
        { re: /(?:budget|max budget|spend|keep it under|under|below|less than|at most|no more than|up to|within)\s*(?:us\$|ca\$|a\$|[$€£¥])?\s*([\d,]+(?:\.\d+)?)/i, kind: 'max' },
        { re: /(?:over|above|at least|no less than|minimum of)\s*(?:us\$|ca\$|a\$|[$€£¥])?\s*([\d,]+(?:\.\d+)?)/i, kind: 'min' },
        { re: /(?:between)\s*(?:us\$|ca\$|a\$|[$€£¥])?\s*([\d,]+(?:\.\d+)?)\s*(?:and|-|to)\s*(?:us\$|ca\$|a\$|[$€£¥])?\s*([\d,]+(?:\.\d+)?)/i, kind: 'both' },
    ];
    for (const { re, kind } of budgetPatterns) {
        const m = raw.match(re);
        if (!m?.[1])
            continue;
        const value = parseAmount(m[1]);
        if (value === undefined)
            continue;
        if (kind === 'max') {
            if (budgetMax === undefined)
                budgetMax = value;
        }
        else if (kind === 'min') {
            if (budgetMin === undefined)
                budgetMin = value;
        }
        else {
            budgetMin = value;
            if (m[2])
                budgetMax = parseAmount(m[2]);
        }
    }
    if (budgetMax !== undefined) {
        notes.push(`Budget ceiling interpreted as ${budgetMax} ${currency}.`);
    }
    if (budgetMax === undefined && budgetMin === undefined && category !== 'other') {
        openQuestions.push('No budget was given — what is the maximum you want to spend?');
    }
    // --- numeric attribute constraints -------------------------------------
    const numeric = [];
    for (const rule of ATTRIBUTE_RULES) {
        const attrAlternation = rule.synonyms.map(escapeRegex).join('|');
        const unitPattern = '[a-z]+';
        const valuePattern = '([\\d,]+(?:\\.\\d+)?)';
        const explicitPatterns = [
            {
                op: 'gte',
                re: new RegExp(`(?:at least|minimum(?: of)?|no less than|>=|more than|or more)\\s*(?:${attrAlternation})\\s*(?:of\\s*)?[:=]?\\s*${valuePattern}\\s*(?:${unitPattern})?`, 'i'),
            },
            {
                op: 'gte',
                re: new RegExp(`(?:at least|minimum(?: of)?|no less than|>=|more than|or more)\\s*${valuePattern}\\s*(?:${unitPattern})?\\s*(?:${attrAlternation})`, 'i'),
            },
            {
                op: 'lte',
                re: new RegExp(`(?:at most|no more than|under|below|less than|<=|max(?:imum)?(?:\\s+of)?)\\s*(?:${attrAlternation})\\s*(?:of\\s*)?[:=]?\\s*${valuePattern}\\s*(?:${unitPattern})?`, 'i'),
            },
            {
                op: 'lte',
                re: new RegExp(`(?:at most|no more than|under|below|less than|<=|max(?:imum)?(?:\\s+of)?)\\s*${valuePattern}\\s*(?:${unitPattern})?\\s*(?:${attrAlternation})`, 'i'),
            },
        ];
        for (const { op, re } of explicitPatterns) {
            const match = lower.match(re);
            if (!match?.[1])
                continue;
            const value = parseAmount(match[1]);
            const normalized = value === undefined ? undefined : normalizeAmount(value, match[0]);
            if (normalized === undefined)
                continue;
            pushConstraint(numeric, {
                field: rule.field,
                label: rule.label,
                op,
                value: normalized,
                unit: rule.unit,
                source: 'user',
                weight: 1,
                hard: true,
            });
            break;
        }
        if (numeric.some((c) => c.field === rule.field && (c.op === 'gte' || c.op === 'lte')))
            continue;
        const bareMatch = lower.match(new RegExp(`${valuePattern}\\s*(?:${unitPattern})?\\s*(?:${attrAlternation})`, 'i'));
        if (bareMatch?.[1] && mentionsAttribute(lower, rule.synonyms)) {
            const value = parseAmount(bareMatch[1]);
            const normalized = value === undefined ? undefined : normalizeAmount(value, bareMatch[0]);
            if (normalized !== undefined) {
                pushConstraint(numeric, {
                    field: rule.field,
                    label: rule.label,
                    op: rule.defaultOp,
                    value: normalized,
                    unit: rule.unit,
                    source: 'user',
                    weight: 1,
                    hard: true,
                });
            }
        }
        // qualitative mentions such as "prefer strong CPU performance"
        if (mentionsAttribute(lower, rule.synonyms)) {
            for (const [word, value] of Object.entries(rule.qualitative ?? {})) {
                if (new RegExp(`\\b${escapeRegex(word)}\\b`).test(lower)) {
                    pushConstraint(numeric, {
                        field: rule.field,
                        label: rule.label,
                        op: rule.defaultOp,
                        value,
                        unit: rule.unit,
                        source: 'inferred',
                        weight: 0.6,
                        hard: false,
                    });
                    notes.push(`"${word}" was interpreted as ${rule.label} ≥ ${value}${rule.unit ? ` ${rule.unit}` : ''} (soft constraint).`);
                    break;
                }
            }
        }
    }
    // --- preferences / keywords --------------------------------------------
    const preferences = [];
    const preferenceRe = /(?:prefer|prefers|preferred|i like|priority|must have|needs? to have|important to me|optimi[sz]e(?:d)? for|good for)\s+([^.;!?\n]+)/gi;
    let prefMatch;
    while ((prefMatch = preferenceRe.exec(lower)) !== null) {
        const value = prefMatch[1]?.trim();
        if (value)
            preferences.push(value);
    }
    const keywords = [];
    for (const entry of CATEGORY_KEYWORDS) {
        for (const kw of entry.keywords) {
            if (new RegExp(`\\b${escapeRegex(kw)}\\b`).test(lower))
                keywords.push(kw);
        }
    }
    keywords.push(...preferences);
    // --- approval ----------------------------------------------------------
    const approvalMentioned = APPROVAL_PHRASES.some((p) => lower.includes(p)) || AUTO_APPROVE_PHRASES.some((p) => lower.includes(p));
    const requireApproval = APPROVAL_PHRASES.some((p) => lower.includes(p))
        ? true
        : AUTO_APPROVE_PHRASES.some((p) => lower.includes(p))
            ? false
            : true;
    if (approvalMentioned) {
        notes.push(requireApproval
            ? 'Approval required for every payment, as stated in the request.'
            : 'Request grants standing approval; the active policy may still require confirmation.');
    }
    else {
        notes.push('No approval instruction found — approval is required by default.');
    }
    // --- confidence --------------------------------------------------------
    const signals = [
        category !== 'other',
        budgetMax !== undefined || budgetMin !== undefined,
        numeric.length > 0,
        approvalMentioned,
        preferences.length > 0,
    ];
    const found = signals.filter(Boolean).length;
    const confidence = Math.min(1, Number((0.35 + found * 0.13).toFixed(2)));
    return {
        category,
        currency,
        budgetMax,
        budgetMin,
        numeric,
        keywords: dedupe(keywords),
        preferences: dedupe(preferences),
        requireApproval,
        approvalMentioned,
        notes,
        openQuestions,
        confidence,
    };
}
export function buildIntent(input) {
    const { parsed } = input;
    const currency = parsed.currency;
    const budget = parsed.budgetMax !== undefined
        ? { amount: parsed.budgetMax, currency }
        : parsed.budgetMin !== undefined
            ? { amount: parsed.budgetMin, currency }
            : undefined;
    const requireApproval = input.requireApprovalOverride ?? parsed.requireApproval;
    return {
        id: newId('int'),
        runId: input.runId,
        rawText: input.rawText,
        category: parsed.category,
        constraints: {
            currency,
            budgetMax: parsed.budgetMax !== undefined ? { amount: parsed.budgetMax, currency } : undefined,
            budgetMin: parsed.budgetMin !== undefined ? { amount: parsed.budgetMin, currency } : undefined,
            numeric: parsed.numeric,
            keywords: parsed.keywords,
            preferences: parsed.preferences,
            blockedCategories: [],
            excludedTerms: [],
            requireApproval,
        },
        budget,
        approvalRequired: requireApproval,
        createdAt: nowIso(),
        status: 'interpreted',
        engine: input.engine,
        confidence: parsed.confidence,
        notes: parsed.notes,
        openQuestions: parsed.openQuestions,
    };
}
function mentionsAttribute(text, synonyms) {
    return synonyms.some((s) => new RegExp(`\\b${escapeRegex(s)}\\b`).test(text));
}
function pushConstraint(list, constraint) {
    const existing = list.findIndex((c) => c.field === constraint.field && c.op === constraint.op && c.source === 'user');
    if (existing >= 0) {
        // A user-stated value always wins over an inferred one.
        if (list[existing].source === 'user' && constraint.source !== 'user')
            return;
        list[existing] = constraint;
        return;
    }
    list.push(constraint);
}
function normalizeAmount(value, text) {
    const lowerText = text.toLowerCase();
    if (/(\d+(?:\.\d+)?)\s*(?:t|tb)\b/i.test(lowerText)) {
        return value * 1000;
    }
    if (/(\d+(?:\.\d+)?)\s*(?:m|mb)\b/i.test(lowerText)) {
        return value / 1000;
    }
    return value;
}
function parseAmount(input) {
    const cleaned = input.replace(/,/g, '').trim();
    const value = Number.parseFloat(cleaned);
    if (Number.isNaN(value))
        return undefined;
    return Math.round(value * 100) / 100;
}
function dedupe(values) {
    return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=intent-parser.js.map