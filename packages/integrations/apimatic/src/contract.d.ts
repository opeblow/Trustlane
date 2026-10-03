import { z } from 'zod';
export interface FailureMode {
    status: number;
    code: string;
    description: string;
}
export interface OperationSpec<Req = unknown, Res = unknown> {
    operationId: string;
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    path: string;
    tag: string;
    summary: string;
    description: string;
    successStatus: number;
    request?: {
        schema: z.ZodType<Req>;
        required: boolean;
    };
    query?: z.ZodType<unknown>;
    response: z.ZodType<Res>;
    pathParams?: Array<{
        name: string;
        description: string;
    }>;
    headers?: Array<{
        name: string;
        description: string;
        required: boolean;
        example?: string;
    }>;
    failureModes?: FailureMode[];
}
/**
 * The API contract, declared once and used for three things: the OpenAPI
 * document served by the API, the generated Postman collection, and a
 * verification step that fails if a documented route is not implemented.
 */
export declare const OPERATIONS: OperationSpec[];
export declare const TAGS: string[];
export declare const ERROR_SCHEMA: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        correlationId: z.ZodOptional<z.ZodString>;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare function operationIds(): string[];
export declare function operationKey(method: string, path: string): string;
export declare function findOperation(method: string, path: string): OperationSpec | undefined;
export declare function allFailureCodes(): string[];
//# sourceMappingURL=contract.d.ts.map