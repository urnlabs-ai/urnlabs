import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import {
  Agent,
  AgentDeployment,
  DeploymentStatus,
  AgentTemplate,
  DeploymentError,
  ApiResponse
} from '../types/index.js';

export interface ContainerConfig {
  image: string;
  name: string;
  environment?: Record<string, string>;
  ports?: Record<string, string>;
  volumes?: string[];
  resources?: {
    cpu?: string;
    memory?: string;
  };
  healthCheck?: {
    test: string[];
    interval?: string;
    timeout?: string;
    retries?: number;
  };
  restartPolicy?: {
    name: 'always' | 'unless-stopped' | 'on-failure' | 'no';
    maximumRetryCount?: number;
  };
}

export class DockerOrchestratorService extends EventEmitter {
  private docker: Docker;
  private redis: Redis;
  private runningContainers: Map<string, Docker.Container> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(redis: Redis, dockerOptions?: Docker.DockerOptions) {
    super();
    this.docker = new Docker(dockerOptions);
    this.redis = redis;
  }

  /**
   * Start the Docker orchestrator service
   */
  async start(): Promise<void> {
    try {
      // Verify Docker connection
      await this.docker.ping();
      console.log('Docker connection established');

      // Start health check monitoring
      this.startHealthCheckMonitoring();

      // Restore running containers from previous session
      await this.restoreRunningContainers();

      console.log('Docker orchestrator service started');
    } catch (error) {
      throw new Error(`Failed to start Docker orchestrator: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop the Docker orchestrator service
   */
  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Gracefully stop all managed containers
    const stopPromises = Array.from(this.runningContainers.values()).map(container =>
      this.stopContainer(container.id, true)
    );

    await Promise.allSettled(stopPromises);
    this.runningContainers.clear();

    console.log('Docker orchestrator service stopped');
  }

  /**
   * Deploy an agent using Docker
   */
  async deployAgent(
    deployment: AgentDeployment,
    agent?: Agent,
    template?: AgentTemplate
  ): Promise<ApiResponse<AgentDeployment>> {
    try {
      // Generate container configuration
      const containerConfig = this.generateContainerConfig(deployment, agent, template);

      // Pull image if needed
      await this.ensureImageAvailable(containerConfig.image);

      // Create and start container
      const container = await this.createContainer(containerConfig);
      await container.start();

      // Store container reference
      this.runningContainers.set(deployment.id!, container);

      // Update deployment with container info
      const updatedDeployment = await this.updateDeploymentWithContainerInfo(deployment, container);

      // Start monitoring the container
      this.monitorContainer(deployment.id!, container);

      this.emit('deploymentStarted', {
        deploymentId: deployment.id,
        containerId: container.id,
        containerName: containerConfig.name
      });

      return {
        success: true,
        data: updatedDeployment,
        message: 'Agent deployed successfully'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('deploymentFailed', {
        deploymentId: deployment.id,
        error: errorMessage
      });

      throw new DeploymentError(`Failed to deploy agent: ${errorMessage}`, deployment.id);
    }
  }

  /**
   * Stop a deployment
   */
  async stopDeployment(deploymentId: string): Promise<ApiResponse<void>> {
    try {
      const container = this.runningContainers.get(deploymentId);
      
      if (!container) {
        throw new DeploymentError(`No running container found for deployment ${deploymentId}`, deploymentId);
      }

      await this.stopContainer(container.id);
      this.runningContainers.delete(deploymentId);

      this.emit('deploymentStopped', { deploymentId });

      return {
        success: true,
        message: 'Deployment stopped successfully'
      };

    } catch (error) {
      throw new DeploymentError(
        `Failed to stop deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        deploymentId
      );
    }
  }

  /**
   * Restart a deployment
   */
  async restartDeployment(deploymentId: string): Promise<ApiResponse<void>> {
    try {
      const container = this.runningContainers.get(deploymentId);
      
      if (!container) {
        throw new DeploymentError(`No running container found for deployment ${deploymentId}`, deploymentId);
      }

      await container.restart();

      this.emit('deploymentRestarted', { deploymentId });

      return {
        success: true,
        message: 'Deployment restarted successfully'
      };

    } catch (error) {
      throw new DeploymentError(
        `Failed to restart deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        deploymentId
      );
    }
  }

  /**
   * Scale deployment (change replica count)
   */
  async scaleDeployment(
    deploymentId: string,
    replicas: number,
    deployment: AgentDeployment
  ): Promise<ApiResponse<void>> {
    try {
      const currentReplicas = deployment.config.replicas || 1;
      
      if (replicas > currentReplicas) {
        // Scale up - create additional containers
        await this.scaleUp(deploymentId, deployment, replicas - currentReplicas);
      } else if (replicas < currentReplicas) {
        // Scale down - remove containers
        await this.scaleDown(deploymentId, currentReplicas - replicas);
      }

      this.emit('deploymentScaled', { deploymentId, replicas });

      return {
        success: true,
        message: `Deployment scaled to ${replicas} replicas`
      };

    } catch (error) {
      throw new DeploymentError(
        `Failed to scale deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        deploymentId
      );
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(deploymentId: string, lines: number = 100): Promise<ApiResponse<string[]>> {
    try {
      const container = this.runningContainers.get(deploymentId);
      
      if (!container) {
        throw new DeploymentError(`No running container found for deployment ${deploymentId}`, deploymentId);
      }

      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        tail: lines,
        timestamps: true
      });

      const logs = logStream.toString().split('\n').filter(line => line.trim());

      return {
        success: true,
        data: logs
      };

    } catch (error) {
      throw new DeploymentError(
        `Failed to get container logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        deploymentId
      );
    }
  }

  /**
   * Get container statistics
   */
  async getContainerStats(deploymentId: string): Promise<ApiResponse<any>> {
    try {
      const container = this.runningContainers.get(deploymentId);
      
      if (!container) {
        throw new DeploymentError(`No running container found for deployment ${deploymentId}`, deploymentId);
      }

      const stats = await container.stats({ stream: false });

      return {
        success: true,
        data: this.parseContainerStats(stats)
      };

    } catch (error) {
      throw new DeploymentError(
        `Failed to get container stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        deploymentId
      );
    }
  }

  /**
   * Update deployment configuration
   */
  async updateDeployment(
    deploymentId: string,
    deployment: AgentDeployment,
    agent?: Agent,
    template?: AgentTemplate
  ): Promise<ApiResponse<AgentDeployment>> {
    try {
      // Stop current deployment
      await this.stopDeployment(deploymentId);

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Redeploy with new configuration
      return await this.deployAgent(deployment, agent, template);

    } catch (error) {
      throw new DeploymentError(
        `Failed to update deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        deploymentId
      );
    }
  }

  // Private helper methods

  private generateContainerConfig(
    deployment: AgentDeployment,
    agent?: Agent,
    template?: AgentTemplate
  ): ContainerConfig {
    const config: ContainerConfig = {
      image: this.getContainerImage(agent, template),
      name: `agent-${deployment.name}-${deployment.id}`,
      environment: {
        AGENT_ID: deployment.agentId || '',
        DEPLOYMENT_ID: deployment.id || '',
        ORGANIZATION_ID: deployment.organizationId,
        ...deployment.config.environment
      }
    };

    // Add resource limits
    if (deployment.config.resources) {
      config.resources = {
        cpu: deployment.config.resources.cpu,
        memory: deployment.config.resources.memory
      };
    }

    // Add port mappings
    if (deployment.config.ports) {
      config.ports = {};
      deployment.config.ports.forEach(port => {
        config.ports![`${port.port}/tcp`] = [{ HostPort: port.targetPort?.toString() || port.port.toString() }];
      });
    }

    // Add health check
    config.healthCheck = {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3
    };

    // Add restart policy
    config.restartPolicy = {
      name: 'unless-stopped'
    };

    return config;
  }

  private getContainerImage(agent?: Agent, template?: AgentTemplate): string {
    if (template?.dockerImage) {
      const tag = template.dockerTag || 'latest';
      return `${template.dockerImage}:${tag}`;
    }

    if (agent?.type) {
      // Default images based on agent type
      const imageMap: Record<string, string> = {
        'code-reviewer': 'urnlabs/code-reviewer-agent:latest',
        'deployment-agent': 'urnlabs/deployment-agent:latest',
        'testing-agent': 'urnlabs/testing-agent:latest',
        'monitoring-agent': 'urnlabs/monitoring-agent:latest',
        'security-agent': 'urnlabs/security-agent:latest'
      };

      return imageMap[agent.type] || 'urnlabs/generic-agent:latest';
    }

    return 'urnlabs/generic-agent:latest';
  }

  private async ensureImageAvailable(image: string): Promise<void> {
    try {
      // Check if image exists locally
      await this.docker.getImage(image).inspect();
    } catch (error) {
      // Image doesn't exist, pull it
      console.log(`Pulling image: ${image}`);
      await this.docker.pull(image);
    }
  }

  private async createContainer(config: ContainerConfig): Promise<Docker.Container> {
    const createOptions: Docker.ContainerCreateOptions = {
      Image: config.image,
      name: config.name,
      Env: Object.entries(config.environment || {}).map(([key, value]) => `${key}=${value}`),
      ExposedPorts: config.ports ? Object.keys(config.ports).reduce((acc, port) => {
        acc[port] = {};
        return acc;
      }, {} as any) : undefined,
      HostConfig: {
        PortBindings: config.ports,
        Memory: this.parseMemoryLimit(config.resources?.memory),
        CpuShares: this.parseCpuLimit(config.resources?.cpu),
        RestartPolicy: config.restartPolicy
      },
      Healthcheck: config.healthCheck ? {
        Test: config.healthCheck.test,
        Interval: this.parseDuration(config.healthCheck.interval || '30s'),
        Timeout: this.parseDuration(config.healthCheck.timeout || '10s'),
        Retries: config.healthCheck.retries || 3
      } : undefined
    };

    return await this.docker.createContainer(createOptions);
  }

  private async stopContainer(containerId: string, graceful: boolean = true): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      
      if (graceful) {
        // Try graceful stop first
        await container.stop({ t: 10 });
      } else {
        await container.kill();
      }

      // Remove the container
      await container.remove();
    } catch (error) {
      console.error(`Error stopping container ${containerId}:`, error);
      throw error;
    }
  }

  private async updateDeploymentWithContainerInfo(
    deployment: AgentDeployment,
    container: Docker.Container
  ): Promise<AgentDeployment> {
    const containerInfo = await container.inspect();

    if (!deployment.containers) {
      deployment.containers = [];
    }

    deployment.containers.push({
      id: container.id,
      image: containerInfo.Config.Image,
      status: containerInfo.State.Status,
      restartCount: containerInfo.RestartCount
    });

    deployment.status = DeploymentStatus.RUNNING;
    deployment.deployedAt = new Date();
    deployment.updatedAt = new Date();

    return deployment;
  }

  private monitorContainer(deploymentId: string, container: Docker.Container): void {
    // Monitor container events
    container.attach({
      stream: true,
      stdout: true,
      stderr: true
    }).then(stream => {
      stream.on('data', (data) => {
        // Log container output
        console.log(`Container ${deploymentId} output:`, data.toString());
      });
    }).catch(error => {
      console.error(`Error attaching to container ${deploymentId}:`, error);
    });

    // Monitor container state changes
    const checkInterval = setInterval(async () => {
      try {
        const containerInfo = await container.inspect();
        
        if (!containerInfo.State.Running) {
          clearInterval(checkInterval);
          this.runningContainers.delete(deploymentId);
          
          this.emit('containerStopped', {
            deploymentId,
            containerId: container.id,
            exitCode: containerInfo.State.ExitCode
          });
        }
      } catch (error) {
        clearInterval(checkInterval);
        this.runningContainers.delete(deploymentId);
        
        this.emit('containerError', {
          deploymentId,
          containerId: container.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 30000); // Check every 30 seconds
  }

  private startHealthCheckMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [deploymentId, container] of this.runningContainers) {
        try {
          const containerInfo = await container.inspect();
          
          // Check health status
          if (containerInfo.State.Health) {
            const healthStatus = containerInfo.State.Health.Status;
            
            this.emit('healthStatusChanged', {
              deploymentId,
              containerId: container.id,
              healthStatus
            });
          }
        } catch (error) {
          console.error(`Health check failed for container ${deploymentId}:`, error);
        }
      }
    }, 60000); // Check every minute
  }

  private async restoreRunningContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({
        filters: {
          label: ['managed-by=urnlabs-agent-registry']
        }
      });

      for (const containerInfo of containers) {
        const container = this.docker.getContainer(containerInfo.Id);
        const deploymentId = containerInfo.Labels['deployment-id'];
        
        if (deploymentId) {
          this.runningContainers.set(deploymentId, container);
          this.monitorContainer(deploymentId, container);
        }
      }

      console.log(`Restored ${containers.length} running containers`);
    } catch (error) {
      console.error('Error restoring running containers:', error);
    }
  }

  private async scaleUp(deploymentId: string, deployment: AgentDeployment, additionalReplicas: number): Promise<void> {
    // Create additional containers based on the same configuration
    for (let i = 0; i < additionalReplicas; i++) {
      const containerConfig = this.generateContainerConfig(deployment);
      containerConfig.name = `${containerConfig.name}-replica-${i + 1}`;
      
      const container = await this.createContainer(containerConfig);
      await container.start();
      
      // Add to tracking (with modified key for replicas)
      this.runningContainers.set(`${deploymentId}-replica-${i + 1}`, container);
      this.monitorContainer(`${deploymentId}-replica-${i + 1}`, container);
    }
  }

  private async scaleDown(deploymentId: string, removeCount: number): Promise<void> {
    const replicaKeys = Array.from(this.runningContainers.keys())
      .filter(key => key.startsWith(`${deploymentId}-replica-`))
      .slice(0, removeCount);

    for (const key of replicaKeys) {
      const container = this.runningContainers.get(key);
      if (container) {
        await this.stopContainer(container.id);
        this.runningContainers.delete(key);
      }
    }
  }

  private parseContainerStats(stats: any): any {
    return {
      cpuUsage: this.calculateCpuUsage(stats),
      memoryUsage: this.calculateMemoryUsage(stats),
      networkIO: stats.networks,
      blockIO: stats.blkio_stats
    };
  }

  private calculateCpuUsage(stats: any): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemCpuDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const numberCpus = stats.cpu_stats.online_cpus;

    return (cpuDelta / systemCpuDelta) * numberCpus * 100.0;
  }

  private calculateMemoryUsage(stats: any): { used: number, limit: number, percentage: number } {
    const used = stats.memory_stats.usage;
    const limit = stats.memory_stats.limit;
    const percentage = (used / limit) * 100;

    return { used, limit, percentage };
  }

  private parseMemoryLimit(memory?: string): number | undefined {
    if (!memory) return undefined;
    
    const units: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };

    const match = memory.match(/^(\d+)([A-Z]+)$/i);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2].toUpperCase();
      return value * (units[unit] || 1);
    }

    return parseInt(memory);
  }

  private parseCpuLimit(cpu?: string): number | undefined {
    if (!cpu) return undefined;
    
    // Convert CPU limit to Docker CPU shares (1 CPU = 1024 shares)
    const cpuValue = parseFloat(cpu);
    return Math.floor(cpuValue * 1024);
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smh])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      
      switch (unit) {
        case 's': return value * 1000000000; // nanoseconds
        case 'm': return value * 60 * 1000000000;
        case 'h': return value * 60 * 60 * 1000000000;
        default: return value * 1000000000;
      }
    }
    
    return parseInt(duration) * 1000000000;
  }
}