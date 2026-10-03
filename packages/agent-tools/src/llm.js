import { z } from 'zod';
export function loadLlmConfig(env = process.env) {
    const provider = (env.LLM_PROVIDER ?? 'none').toLowerCase();
    const apiKey = env.LLM_API_KEY;
    if (!apiKey || provider === 'none')
        return null;
    if (provider !== 'openai' && provider !== 'anthropic' && provider !== 'gemini')
        return null;
    return {
        provider,
        apiKey,
        model: env.LLM_MODEL ?? defaultModel(provider),
        baseUrl: env.LLM_BASE_URL,
        timeoutMs: Number(env.LLM_TIMEOUT_MS ?? 20000),
    };
}
function defaultModel(provider) {
    switch (provider) {
        case 'openai':
            return 'gpt-4o-mini';
        case 'anthropic':
            return 'claude-3-5-haiku-latest';
        case 'gemini':
            return 'gemini-2.0-flash';
        default:
            return 'unknown';
    }
}
export class LlmError extends Error {
    detail;
    constructor(message, detail = '') {
        super(message);
        this.name = 'LlmError';
        this.detail = detail;
    }
}
/**
 * Strict structured completion. The model is asked for JSON matching a schema
 * and its answer is validated with zod before it is allowed anywhere near
 * product state. Any failure raises `LlmError`; callers fall back to the
 * deterministic path and record that in the audit trail.
 */
export async function completeJson(config, schema, args) {
    const started = Date.now();
    const jsonSchema = toJsonSchemaHint(schema);
    const { url, headers, body } = buildRequest(config, args.system, args.user, jsonSchema);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 20000);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        const text = await response.text();
        if (!response.ok) {
            throw new LlmError(`LLM request failed with status ${response.status}`, text.slice(0, 500));
        }
        const raw = JSON.parse(text);
        const content = extractContent(config.provider, raw);
        const parsedJson = extractJson(content);
        const parsed = schema.safeParse(parsedJson);
        if (!parsed.success) {
            throw new LlmError('LLM response did not satisfy the schema', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
        }
        return { data: parsed.data, model: config.model, latencyMs: Date.now() - started, raw: parsedJson };
    }
    catch (error) {
        if (error instanceof LlmError)
            throw error;
        throw new LlmError(error instanceof Error ? error.message : String(error));
    }
    finally {
        clearTimeout(timer);
    }
}
function buildRequest(config, system, user, jsonSchema) {
    const instructions = `${system}\n\nRespond with a single JSON object matching this schema and nothing else:\n${JSON.stringify(jsonSchema)}`;
    if (config.provider === 'openai') {
        return {
            url: `${config.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`,
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.apiKey}`,
            },
            body: {
                model: config.model,
                temperature: 0,
                messages: [
                    { role: 'system', content: instructions },
                    { role: 'user', content: user },
                ],
                response_format: { type: 'json_object' },
            },
        };
    }
    if (config.provider === 'anthropic') {
        return {
            url: `${config.baseUrl ?? 'https://api.anthropic.com/v1'}/messages`,
            headers: {
                'content-type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: {
                model: config.model,
                max_tokens: 1024,
                temperature: 0,
                system: instructions,
                messages: [{ role: 'user', content: user }],
            },
        };
    }
    return {
        url: `${config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/models'}/${config.model}:generateContent?key=${config.apiKey}`,
        headers: { 'content-type': 'application/json' },
        body: {
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        },
    };
}
function extractContent(provider, raw) {
    if (provider === 'openai') {
        const choices = raw.choices;
        return choices?.[0]?.message?.content ?? '';
    }
    if (provider === 'anthropic') {
        const content = raw.content;
        return (content ?? []).map((part) => part.text ?? '').join('');
    }
    const candidates = raw.candidates;
    return (candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');
}
function extractJson(content) {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced?.[1]?.trim() ?? trimmed;
    try {
        return JSON.parse(candidate);
    }
    catch {
        const first = candidate.indexOf('{');
        const last = candidate.lastIndexOf('}');
        if (first >= 0 && last > first) {
            return JSON.parse(candidate.slice(first, last + 1));
        }
        throw new LlmError('LLM response was not valid JSON', candidate.slice(0, 200));
    }
}
/**
 * Minimal JSON-schema hint for the model. Deliberately not a full JSON Schema
 * implementation — zod remains the source of truth on our side.
 */
function toJsonSchemaHint(schema) {
    const described = schema.description;
    const shape = schema.shape;
    if (!shape)
        return { type: 'object', description: described };
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(shape)) {
        properties[key] = describeZod(value);
        if (!value.isOptional())
            required.push(key);
    }
    return { type: 'object', properties, required };
}
function describeZod(schema) {
    if (schema instanceof z.ZodString)
        return { type: 'string' };
    if (schema instanceof z.ZodNumber)
        return { type: 'number' };
    if (schema instanceof z.ZodBoolean)
        return { type: 'boolean' };
    if (schema instanceof z.ZodArray) {
        return { type: 'array', items: describeZod(schema.element) };
    }
    if (schema instanceof z.ZodEnum)
        return { type: 'string', enum: schema.options };
    if (schema instanceof z.ZodObject) {
        const properties = {};
        const required = [];
        for (const [key, value] of Object.entries(schema.shape)) {
            properties[key] = describeZod(value);
            if (!value.isOptional())
                required.push(key);
        }
        return { type: 'object', properties, required };
    }
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
        return describeZod(schema.unwrap());
    }
    return { type: 'string' };
}
export function engineInfo(input) {
    return {
        name: input.usedLlm ? 'llm-assisted' : 'deterministic',
        provider: input.provider,
        model: input.model,
        usedLlm: input.usedLlm,
        latencyMs: input.latencyMs,
    };
}
//# sourceMappingURL=llm.js.map