import { AuditLogger } from '../core/AuditLogger';
declare global {
    var testUtils: {
        createMockAuditLogger(): AuditLogger;
        createTestTimeout(ms: number): Promise<void>;
        expectEventually<T>(check: () => T | Promise<T>, timeout?: number, interval?: number): Promise<T>;
    };
}
//# sourceMappingURL=setup.d.ts.map