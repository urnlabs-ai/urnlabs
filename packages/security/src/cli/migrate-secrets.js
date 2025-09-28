#!/usr/bin/env node

/**
 * Secrets Migration Tool
 * Migrates hardcoded secrets from Docker Compose and configuration files to Vault
 */

const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');
const axios = require('axios');

program
  .description('Migrate hardcoded secrets to HashiCorp Vault')
  .option('--vault-addr <url>', 'Vault server address', 'http://localhost:8200')
  .option('--vault-token <token>', 'Vault root token')
  .option('--dry-run', 'Show what would be migrated without making changes', false)
  .option('--source-dir <dir>', 'Source directory to scan for secrets', '.')
  .option('--backup', 'Create backup of original files', true)
  .option('--force', 'Force migration even if secrets already exist in Vault', false)
  .parse();

const options = program.opts();

class SecretsMigrator {
  constructor(config) {
    this.vaultAddr = config.vaultAddr;
    this.vaultToken = config.vaultToken;
    this.dryRun = config.dryRun;
    this.sourceDir = config.sourceDir;
    this.backup = config.backup;
    this.force = config.force;

    this.secrets = new Map();
    this.migrations = [];
    this.errors = [];
  }

  async migrate() {
    console.log('🔐 Starting secrets migration...');
    console.log(`Vault Address: ${this.vaultAddr}`);
    console.log(`Source Directory: ${this.sourceDir}`);
    console.log(`Dry Run: ${this.dryRun}`);

    try {
      // Initialize Vault client
      await this.initializeVault();

      // Scan for secrets in various files
      await this.scanForSecrets();

      // Generate migration plan
      this.generateMigrationPlan();

      // Execute migration if not dry run
      if (!this.dryRun) {
        await this.executeMigration();
      }

      // Generate report
      this.generateReport();

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }
  }

  async initializeVault() {
    console.log('\n📡 Initializing Vault connection...');

    try {
      const response = await axios.get(`${this.vaultAddr}/v1/sys/health`);
      console.log('✅ Vault is healthy and accessible');

      // Enable KV v2 secrets engine if not already enabled
      await this.enableSecretsEngine();

    } catch (error) {
      throw new Error(`Failed to connect to Vault: ${error.message}`);
    }
  }

  async enableSecretsEngine() {
    try {
      await axios.post(`${this.vaultAddr}/v1/sys/mounts/secret`, {
        type: 'kv',
        options: { version: '2' }
      }, {
        headers: { 'X-Vault-Token': this.vaultToken }
      });
      console.log('✅ KV v2 secrets engine enabled');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('ℹ️  KV v2 secrets engine already enabled');
      } else {
        console.warn('⚠️  Could not enable KV v2 secrets engine:', error.message);
      }
    }
  }

  async scanForSecrets() {
    console.log('\n🔍 Scanning for secrets...');

    const scanTasks = [
      () => this.scanDockerCompose(),
      () => this.scanEnvFiles(),
      () => this.scanConfigFiles(),
      () => this.scanKubernetesManifests(),
      () => this.scanSourceCode()
    ];

    for (const task of scanTasks) {
      try {
        await task();
      } catch (error) {
        console.warn(`⚠️  Scan task failed: ${error.message}`);
      }
    }

    console.log(`Found ${this.secrets.size} potential secrets`);
  }

  async scanDockerCompose() {
    const files = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'docker-compose-local.yml',
      'docker-compose.prod.yml'
    ];

    for (const file of files) {
      try {
        const filePath = path.join(this.sourceDir, file);
        const content = await fs.readFile(filePath, 'utf8');

        // Parse YAML-like content for environment variables
        const envVarPattern = /^\s*([A-Z_]+):\s*['"]?([^'"]+)['"]?\s*$/gm;
        let match;

        while ((match = envVarPattern.exec(content)) !== null) {
          const [, key, value] = match;

          if (this.isSecret(key, value)) {
            this.addSecret({
              key,
              value,
              source: file,
              type: 'docker-compose',
              path: `urnlabs/docker/${key.toLowerCase()}`
            });
          }
        }

        console.log(`✅ Scanned ${file}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`⚠️  Could not scan ${file}: ${error.message}`);
        }
      }
    }
  }

  async scanEnvFiles() {
    const patterns = [
      '.env',
      '.env.local',
      '.env.production',
      '.env.development',
      'apps/*/.env',
      'packages/*/.env'
    ];

    for (const pattern of patterns) {
      try {
        const files = await this.globFiles(pattern);

        for (const file of files) {
          const content = await fs.readFile(file, 'utf8');
          const lines = content.split('\n');

          for (const line of lines) {
            const match = line.match(/^([A-Z_]+)=(.+)$/);
            if (match) {
              const [, key, value] = match;

              if (this.isSecret(key, value)) {
                const appName = this.extractAppName(file);
                this.addSecret({
                  key,
                  value,
                  source: file,
                  type: 'env-file',
                  path: `urnlabs/${appName}/${key.toLowerCase()}`
                });
              }
            }
          }
        }

        console.log(`✅ Scanned .env files (${files.length} files)`);
      } catch (error) {
        console.warn(`⚠️  Could not scan .env files: ${error.message}`);
      }
    }
  }

  async scanConfigFiles() {
    const configFiles = [
      'apps/*/src/config.ts',
      'apps/*/src/lib/config.ts',
      'packages/*/src/config.ts'
    ];

    for (const pattern of configFiles) {
      try {
        const files = await this.globFiles(pattern);

        for (const file of files) {
          const content = await fs.readFile(file, 'utf8');

          // Look for hardcoded secrets in config files
          const secretPatterns = [
            /secret['\"]?\s*:\s*['"]([^'"]+)['"]/gi,
            /password['\"]?\s*:\s*['"]([^'"]+)['"]/gi,
            /token['\"]?\s*:\s*['"]([^'"]+)['"]/gi,
            /key['\"]?\s*:\s*['"]([^'"]+)['"]/gi
          ];

          for (const pattern of secretPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              const value = match[1];
              if (this.isSecret('CONFIG_SECRET', value)) {
                const appName = this.extractAppName(file);
                this.addSecret({
                  key: `CONFIG_${match[0].split(':')[0].toUpperCase()}`,
                  value,
                  source: file,
                  type: 'config-file',
                  path: `urnlabs/${appName}/config_secret`
                });
              }
            }
          }
        }

        console.log(`✅ Scanned config files (${files.length} files)`);
      } catch (error) {
        console.warn(`⚠️  Could not scan config files: ${error.message}`);
      }
    }
  }

  async scanKubernetesManifests() {
    // Future implementation for Kubernetes deployments
    console.log('ℹ️  Kubernetes manifest scanning (placeholder for future implementation)');
  }

  async scanSourceCode() {
    // Scan for potential hardcoded secrets in source code
    const sourcePatterns = [
      'apps/*/src/**/*.ts',
      'apps/*/src/**/*.js',
      'packages/*/src/**/*.ts'
    ];

    for (const pattern of sourcePatterns) {
      try {
        const files = await this.globFiles(pattern);

        for (const file of files) {
          const content = await fs.readFile(file, 'utf8');

          // Look for suspicious hardcoded values
          const suspiciousPatterns = [
            /['"]([A-Za-z0-9+/]{32,})['"]/, // Base64-like strings
            /['"]([a-f0-9]{32,})['"]/, // Hex strings
            /['"]([A-Z0-9_]{20,})['"]/ // API key-like strings
          ];

          for (const pattern of suspiciousPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              const value = match[1];
              if (this.isSecret('HARDCODED_SECRET', value)) {
                console.warn(`⚠️  Potential hardcoded secret in ${file}: ${value.substring(0, 10)}...`);
                // These would need manual review
              }
            }
          }
        }

        console.log(`✅ Scanned source code (${files.length} files)`);
      } catch (error) {
        console.warn(`⚠️  Could not scan source code: ${error.message}`);
      }
    }
  }

  isSecret(key, value) {
    // Skip non-secret values
    if (!value || value.length < 8) return false;
    if (value === 'localhost' || value === '127.0.0.1') return false;
    if (value.startsWith('http://') || value.startsWith('https://')) return false;
    if (/^\d+$/.test(value)) return false; // Pure numbers

    // Check for secret indicators in key names
    const secretKeywords = [
      'secret', 'password', 'token', 'key', 'auth', 'credential',
      'api_key', 'private', 'secure', 'encryption', 'signature'
    ];

    const keyLower = key.toLowerCase();
    return secretKeywords.some(keyword => keyLower.includes(keyword));
  }

  addSecret(secretInfo) {
    const existing = this.secrets.get(secretInfo.key);
    if (!existing || existing.source !== secretInfo.source) {
      this.secrets.set(secretInfo.key, secretInfo);
    }
  }

  extractAppName(filePath) {
    const parts = filePath.split('/');
    if (parts.includes('apps')) {
      const appIndex = parts.indexOf('apps');
      return parts[appIndex + 1] || 'unknown';
    }
    if (parts.includes('packages')) {
      const packageIndex = parts.indexOf('packages');
      return parts[packageIndex + 1] || 'unknown';
    }
    return 'common';
  }

  async globFiles(pattern) {
    // Simple glob implementation for basic patterns
    const { glob } = await import('glob');
    return glob.sync(pattern, { cwd: this.sourceDir });
  }

  generateMigrationPlan() {
    console.log('\n📋 Generating migration plan...');

    for (const [key, secret] of this.secrets) {
      this.migrations.push({
        action: 'store',
        key,
        path: secret.path,
        source: secret.source,
        type: secret.type,
        vaultPath: `secret/data/${secret.path}`
      });
    }

    console.log(`📊 Migration plan: ${this.migrations.length} secrets to migrate`);

    if (this.dryRun) {
      console.log('\n🔍 DRY RUN - Migration plan:');
      for (const migration of this.migrations) {
        console.log(`  • ${migration.key} → ${migration.vaultPath} (from ${migration.source})`);
      }
    }
  }

  async executeMigration() {
    console.log('\n🚀 Executing migration...');

    for (const migration of this.migrations) {
      try {
        await this.migrateSecret(migration);
        console.log(`✅ Migrated ${migration.key}`);
      } catch (error) {
        console.error(`❌ Failed to migrate ${migration.key}: ${error.message}`);
        this.errors.push({ migration, error: error.message });
      }
    }

    // Generate replacement templates
    await this.generateReplacementTemplates();
  }

  async migrateSecret(migration) {
    const secret = this.secrets.get(migration.key);

    // Store secret in Vault
    const data = {
      data: {
        value: secret.value,
        source: secret.source,
        migrated_at: new Date().toISOString(),
        type: secret.type
      }
    };

    await axios.post(`${this.vaultAddr}/v1/${migration.vaultPath}`, data, {
      headers: { 'X-Vault-Token': this.vaultToken }
    });
  }

  async generateReplacementTemplates() {
    console.log('\n📝 Generating replacement templates...');

    const templates = {
      'docker-compose': this.generateDockerComposeTemplate(),
      'env-files': this.generateEnvFileTemplates(),
      'config-files': this.generateConfigFileTemplates()
    };

    for (const [type, template] of Object.entries(templates)) {
      if (template) {
        const templatePath = `secrets-migration-${type}.template`;
        await fs.writeFile(templatePath, template);
        console.log(`✅ Generated ${templatePath}`);
      }
    }
  }

  generateDockerComposeTemplate() {
    const dockerSecrets = Array.from(this.secrets.values())
      .filter(s => s.type === 'docker-compose');

    if (dockerSecrets.length === 0) return null;

    let template = `# Docker Compose Template - Replace secrets with Vault references
# Use the following environment variables to reference Vault secrets:

`;

    for (const secret of dockerSecrets) {
      template += `# Original: ${secret.key}=${secret.value}\n`;
      template += `${secret.key}: \${VAULT_SECRET_${secret.key}}\n\n`;
    }

    template += `
# Add this to your service configuration:
# secrets:
#   - vault_token
# environment:
#   - VAULT_ADDR=http://vault:8200
#   - VAULT_TOKEN_FILE=/run/secrets/vault_token
`;

    return template;
  }

  generateEnvFileTemplates() {
    const envSecrets = Array.from(this.secrets.values())
      .filter(s => s.type === 'env-file');

    if (envSecrets.length === 0) return null;

    let template = `# Environment File Template - Replace with Vault references
# Use vault-agent or similar to inject these values

`;

    for (const secret of envSecrets) {
      template += `# Original: ${secret.key}=${secret.value}\n`;
      template += `${secret.key}={{ with secret "${secret.path}" }}{{ .Data.data.value }}{{ end }}\n\n`;
    }

    return template;
  }

  generateConfigFileTemplates() {
    return `# Configuration File Template
# Use the SecretsManager class to retrieve secrets at runtime:

import { SecretsManager } from '@urnlabs/security';

const secretsManager = new SecretsManager({
  vault: {
    address: process.env.VAULT_ADDR,
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.VAULT_SECRET_ID,
  }
});

// Replace hardcoded secrets with:
const apiKey = await secretsManager.getSecret('urnlabs/api/api_key');
const dbPassword = await secretsManager.getSecret('urnlabs/database/password');
`;
  }

  generateReport() {
    console.log('\n📊 Migration Report');
    console.log('===================');
    console.log(`Total secrets found: ${this.secrets.size}`);
    console.log(`Migrations planned: ${this.migrations.length}`);

    if (!this.dryRun) {
      console.log(`Successful migrations: ${this.migrations.length - this.errors.length}`);
      console.log(`Failed migrations: ${this.errors.length}`);
    }

    console.log('\nSecrets by type:');
    const typeCount = {};
    for (const secret of this.secrets.values()) {
      typeCount[secret.type] = (typeCount[secret.type] || 0) + 1;
    }

    for (const [type, count] of Object.entries(typeCount)) {
      console.log(`  ${type}: ${count}`);
    }

    if (this.errors.length > 0) {
      console.log('\n❌ Failed migrations:');
      for (const error of this.errors) {
        console.log(`  • ${error.migration.key}: ${error.error}`);
      }
    }

    console.log('\n📚 Next steps:');
    console.log('1. Review generated template files');
    console.log('2. Update your application code to use SecretsManager');
    console.log('3. Test with development environment');
    console.log('4. Deploy Vault agent for production secret injection');
    console.log('5. Remove original secret files after verification');
  }
}

async function main() {
  if (!options.vaultToken) {
    console.error('❌ Vault token is required. Set --vault-token or VAULT_TOKEN environment variable');
    process.exit(1);
  }

  const migrator = new SecretsMigrator({
    vaultAddr: options.vaultAddr,
    vaultToken: options.vaultToken || process.env.VAULT_TOKEN,
    dryRun: options.dryRun,
    sourceDir: options.sourceDir,
    backup: options.backup,
    force: options.force
  });

  await migrator.migrate();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}