import { FastifyInstance } from 'fastify';
export declare class ProxyManager {
    private fastify;
    private healthChecks;
    constructor(fastify: FastifyInstance);
    registerRoutes(): Promise<void>;
    private registerProxy;
    private getServiceNameFromPrefix;
    startHealthChecks(): Promise<void>;
    private checkServiceHealth;
    private storeHealthStatus;
    isServiceHealthy(serviceName: string): Promise<boolean>;
    getServiceStatus(serviceName: string): Promise<any>;
    getAllServiceStatuses(): Promise<Record<string, any>>;
    stopHealthChecks(): void;
}
export default ProxyManager;
//# sourceMappingURL=proxy.d.ts.map