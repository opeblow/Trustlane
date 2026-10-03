import { DatabaseSync } from 'node:sqlite';
export interface DatabaseOptions {
    /** Absolute path, relative path, or ':memory:' for tests. */
    path: string;
}
export interface AutopilotDatabase {
    db: DatabaseSync;
    path: string;
    close(): void;
}
export declare function openDatabase(options: DatabaseOptions): AutopilotDatabase;
export declare function toJson(value: unknown): string;
export declare function fromJson<T>(value: unknown, fallback: T): T;
//# sourceMappingURL=database.d.ts.map