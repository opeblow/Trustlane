export interface OpenApiOptions {
    title?: string;
    version?: string;
    description?: string;
    serverUrl?: string;
}
export declare function buildOpenApiDocument(options?: OpenApiOptions): Record<string, unknown>;
export declare function openApiAsJsonString(options?: OpenApiOptions): string;
//# sourceMappingURL=openapi.d.ts.map