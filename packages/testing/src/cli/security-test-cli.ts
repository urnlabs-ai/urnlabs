#!/usr/bin/env node

import { Command } from 'commander';
import { Logger } from '@urnlabs/monitoring';
import { SecurityTestFramework } from '../security/SecurityTestFramework';
import { SecurityGates } from '../security/SecurityGates';
import { PenetrationTestRunner } from '../security/PenetrationTestRunner';
import { ComplianceValidator } from '../security/ComplianceValidator';
import { VulnerabilityScanner } from '../security/VulnerabilityScanner';
import { ThreatDetectionTester } from '../security/ThreatDetectionTester';
import { AuthenticationTester } from '../security/AuthenticationTester';
import { AuthorizationTester } from '../security/AuthorizationTester';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = new Logger('SecurityTestCLI');

const program = new Command();

program
  .name('security-test-cli')
  .description('Security Testing and Validation CLI')
  .version('1.0.0');

/**
 * Run security tests command
 */
program
  .command('run')
  .description('Run security tests')
  .option('-t, --type <type>', 'Test type (static, dynamic, dependencies, secrets, penetration, compliance, threat-detection, infrastructure, all)', 'all')
  .option('-e, --environment <env>', 'Environment (development, staging, production)', 'development')
  .option('-o, --output <path>', 'Output directory for results', './test-results')
  .option('-f, --format <format>', 'Output format (json, html, xml)', 'json')
  .option('-p, --parallel', 'Run tests in parallel', false)
  .option('-v, --verbose', 'Verbose output', false)
  .option('--timeout <ms>', 'Test timeout in milliseconds', '300000')
  .action(async (options) => {
    try {
      logger.info('Starting security tests', options);

      const framework = new SecurityTestFramework();
      await framework.initialize();

      // Configure output directory
      await fs.mkdir(options.output, { recursive: true });

      let results;

      switch (options.type) {
        case 'static':
          results = await runStaticAnalysis(framework, options);
          break;
        case 'dynamic':
          results = await runDynamicAnalysis(framework, options);
          break;
        case 'dependencies':
          results = await runDependencyTests(framework, options);
          break;
        case 'secrets':
          results = await runSecretsTests(framework, options);
          break;
        case 'penetration':
          results = await runPenetrationTests(options);
          break;
        case 'compliance':
          results = await runComplianceTests(options);
          break;
        case 'threat-detection':
          results = await runThreatDetectionTests(options);
          break;
        case 'infrastructure':
          results = await runInfrastructureTests(framework, options);
          break;
        case 'all':
          results = await runAllTests(framework, options);
          break;
        default:
          throw new Error(`Unknown test type: ${options.type}`);
      }

      // Save results
      const outputFile = path.join(options.output, `security-report.${options.format}`);
      await saveResults(results, outputFile, options.format);

      logger.info('Security tests completed', {
        type: options.type,
        score: results.overallScore,
        status: results.overallStatus
      });

      // Exit with appropriate code
      if (results.overallStatus === 'FAILED') {
        process.exit(1);
      }

    } catch (error) {
      logger.error('Security test execution failed', { error: error.message });
      process.exit(1);
    }
  });

/**
 * Security gates command
 */
program
  .command('gates')
  .description('Execute security gates')
  .option('-e, --environment <env>', 'Environment', 'development')
  .option('-g, --gate-ids <ids>', 'Comma-separated gate IDs to execute')
  .option('-o, --output <path>', 'Output directory', './test-results')
  .option('-p, --parallel', 'Execute gates in parallel', false)
  .option('--skip-non-blocking', 'Skip non-blocking gates', false)
  .action(async (options) => {
    try {
      logger.info('Executing security gates', options);

      const gates = new SecurityGates();
      const gateIds = options.gateIds ? options.gateIds.split(',') : undefined;

      const summary = await gates.executeGates(options.environment, gateIds, {
        parallel: options.parallel,
        skipNonBlocking: options.skipNonBlocking
      });

      // Save results
      await fs.mkdir(options.output, { recursive: true });
      const outputFile = path.join(options.output, 'security-gates-summary.json');
      await fs.writeFile(outputFile, JSON.stringify(summary, null, 2));

      console.log(`\n=== Security Gates Summary ===`);
      console.log(`Environment: ${summary.environment}`);
      console.log(`Overall Status: ${summary.overallStatus}`);
      console.log(`Overall Score: ${summary.overallScore}`);
      console.log(`Total Gates: ${summary.totalGates}`);
      console.log(`Passed: ${summary.passedGates}`);
      console.log(`Failed: ${summary.failedGates}`);
      console.log(`Warnings: ${summary.warningGates}`);
      console.log(`Execution Time: ${summary.executionTime}ms`);

      if (summary.blockers.length > 0) {
        console.log(`\nBlockers:`);
        summary.blockers.forEach(blocker => console.log(`  - ${blocker}`));
      }

      if (summary.recommendations.length > 0) {
        console.log(`\nRecommendations:`);
        summary.recommendations.forEach(rec => console.log(`  - ${rec}`));
      }

      // Exit with appropriate code
      if (summary.overallStatus === 'FAILED') {
        process.exit(1);
      }

    } catch (error) {
      logger.error('Security gates execution failed', { error: error.message });
      process.exit(1);
    }
  });

/**
 * Generate security report command
 */
program
  .command('report')
  .description('Generate comprehensive security report')
  .option('-i, --input <path>', 'Input directory with test results', './test-results')
  .option('-o, --output <path>', 'Output file path', './test-results/security-report.html')
  .option('-f, --format <format>', 'Output format (json, html, xml, pdf)', 'html')
  .option('--template <path>', 'Custom report template')
  .action(async (options) => {
    try {
      logger.info('Generating security report', options);

      const framework = new SecurityTestFramework();
      const report = await framework.generateSecurityReport();

      await saveResults(report, options.output, options.format);

      logger.info('Security report generated', { output: options.output });

    } catch (error) {
      logger.error('Report generation failed', { error: error.message });
      process.exit(1);
    }
  });

/**
 * Vulnerability scanning command
 */
program
  .command('vulnerabilities')
  .description('Run vulnerability scanning')
  .option('-t, --scan-type <type>', 'Scan type (static, dynamic, dependency, container, infrastructure, all)', 'all')
  .option('-o, --output <path>', 'Output directory', './test-results')
  .option('--severity <level>', 'Minimum severity level (low, medium, high, critical)', 'medium')
  .action(async (options) => {
    try {
      logger.info('Running vulnerability scan', options);

      const scanner = new VulnerabilityScanner();
      const result = await scanner.scan();

      // Filter by severity
      const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      const minSeverity = severityOrder[options.severity.toLowerCase()];

      const filteredVulnerabilities = result.vulnerabilities.filter(vuln =>
        severityOrder[vuln.severity.toLowerCase()] >= minSeverity
      );

      const report = {
        ...result,
        vulnerabilities: filteredVulnerabilities,
        filteredCount: result.vulnerabilities.length - filteredVulnerabilities.length
      };

      // Save results
      await fs.mkdir(options.output, { recursive: true });
      const outputFile = path.join(options.output, 'vulnerability-report.json');
      await fs.writeFile(outputFile, JSON.stringify(report, null, 2));

      console.log(`\n=== Vulnerability Scan Results ===`);
      console.log(`Scan Type: ${options.scanType}`);
      console.log(`Total Vulnerabilities: ${result.vulnerabilities.length}`);
      console.log(`Filtered (>= ${options.severity}): ${filteredVulnerabilities.length}`);
      console.log(`Critical: ${filteredVulnerabilities.filter(v => v.severity === 'CRITICAL').length}`);
      console.log(`High: ${filteredVulnerabilities.filter(v => v.severity === 'HIGH').length}`);
      console.log(`Medium: ${filteredVulnerabilities.filter(v => v.severity === 'MEDIUM').length}`);
      console.log(`Low: ${filteredVulnerabilities.filter(v => v.severity === 'LOW').length}`);

      // Exit with appropriate code based on critical vulnerabilities
      const criticalVulns = filteredVulnerabilities.filter(v => v.severity === 'CRITICAL').length;
      if (criticalVulns > 0) {
        process.exit(1);
      }

    } catch (error) {
      logger.error('Vulnerability scan failed', { error: error.message });
      process.exit(1);
    }
  });

/**
 * Compliance validation command
 */
program
  .command('compliance')
  .description('Run compliance validation')
  .option('-f, --framework <framework>', 'Compliance framework (gdpr, sox, iso27001, pci-dss, all)', 'all')
  .option('-o, --output <path>', 'Output directory', './test-results')
  .option('--detailed', 'Include detailed control validation', false)
  .action(async (options) => {
    try {
      logger.info('Running compliance validation', options);

      const validator = new ComplianceValidator();
      const result = await validator.validate();

      // Save results
      await fs.mkdir(options.output, { recursive: true });
      const outputFile = path.join(options.output, 'compliance-report.json');
      await fs.writeFile(outputFile, JSON.stringify(result, null, 2));

      console.log(`\n=== Compliance Validation Results ===`);
      console.log(`Framework: ${options.framework}`);
      console.log(`Overall Score: ${result.score}`);
      console.log(`Status: ${result.status}`);
      console.log(`Compliant Controls: ${result.compliantControls}`);
      console.log(`Non-Compliant Controls: ${result.nonCompliantControls}`);

      // Exit with appropriate code
      if (result.status !== 'COMPLIANT') {
        process.exit(1);
      }

    } catch (error) {
      logger.error('Compliance validation failed', { error: error.message });
      process.exit(1);
    }
  });

/**
 * Penetration testing command
 */
program
  .command('penetration')
  .description('Run penetration tests')
  .option('-s, --suite <suite>', 'Test suite (owasp-top10, authentication, authorization, injection, all)', 'all')
  .option('-t, --target <url>', 'Target URL for testing', 'http://localhost:3000')
  .option('-o, --output <path>', 'Output directory', './test-results')
  .option('--aggressive', 'Run aggressive tests (use with caution)', false)
  .action(async (options) => {
    try {
      logger.info('Running penetration tests', options);

      // Safety check for production
      if (options.target.includes('production') || options.target.includes('.com')) {
        console.log('WARNING: Running penetration tests against production systems requires authorization!');
        console.log('Ensure you have proper authorization before proceeding.');

        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise(resolve => {
          readline.question('Do you have authorization to run penetration tests against this target? (yes/no): ', resolve);
        });

        readline.close();

        if (answer.toLowerCase() !== 'yes') {
          console.log('Penetration tests cancelled.');
          process.exit(0);
        }
      }

      const pentester = new PenetrationTestRunner();
      const result = await pentester.runTests();

      // Save results
      await fs.mkdir(options.output, { recursive: true });
      const outputFile = path.join(options.output, 'penetration-report.json');
      await fs.writeFile(outputFile, JSON.stringify(result, null, 2));

      console.log(`\n=== Penetration Test Results ===`);
      console.log(`Target: ${options.target}`);
      console.log(`Suite: ${options.suite}`);
      console.log(`Overall Score: ${result.score}`);
      console.log(`Tests Executed: ${result.testsExecuted}`);
      console.log(`Tests Passed: ${result.testsPassed}`);
      console.log(`Tests Failed: ${result.testsFailed}`);
      console.log(`Critical Findings: ${result.criticalFindings}`);
      console.log(`High Findings: ${result.highFindings}`);

      // Exit with appropriate code
      if (result.criticalFindings > 0) {
        process.exit(1);
      }

    } catch (error) {
      logger.error('Penetration testing failed', { error: error.message });
      process.exit(1);
    }
  });

// Helper functions

async function runStaticAnalysis(framework: SecurityTestFramework, options: any) {
  logger.info('Running static analysis');
  const scanner = new VulnerabilityScanner();
  return await scanner.runStaticAnalysis();
}

async function runDynamicAnalysis(framework: SecurityTestFramework, options: any) {
  logger.info('Running dynamic analysis');
  const scanner = new VulnerabilityScanner();
  return await scanner.runDynamicAnalysis();
}

async function runDependencyTests(framework: SecurityTestFramework, options: any) {
  logger.info('Running dependency tests');
  const scanner = new VulnerabilityScanner();
  return await scanner.runDependencyAnalysis();
}

async function runSecretsTests(framework: SecurityTestFramework, options: any) {
  logger.info('Running secrets detection');
  const scanner = new VulnerabilityScanner();
  return await scanner.runSecretsDetection();
}

async function runPenetrationTests(options: any) {
  logger.info('Running penetration tests');
  const pentester = new PenetrationTestRunner();
  return await pentester.runTests();
}

async function runComplianceTests(options: any) {
  logger.info('Running compliance tests');
  const validator = new ComplianceValidator();
  return await validator.validate();
}

async function runThreatDetectionTests(options: any) {
  logger.info('Running threat detection tests');
  const tester = new ThreatDetectionTester();
  return await tester.runTests();
}

async function runInfrastructureTests(framework: SecurityTestFramework, options: any) {
  logger.info('Running infrastructure tests');
  const scanner = new VulnerabilityScanner();
  return await scanner.runInfrastructureAnalysis();
}

async function runAllTests(framework: SecurityTestFramework, options: any) {
  logger.info('Running comprehensive security test suite');

  const results = await framework.runSecurityTests();

  return {
    overallScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
    overallStatus: results.some(r => r.status === 'FAILED') ? 'FAILED' :
                   results.some(r => r.status === 'WARNING') ? 'WARNING' : 'PASSED',
    testResults: results,
    summary: {
      totalTests: results.length,
      passed: results.filter(r => r.status === 'PASSED').length,
      failed: results.filter(r => r.status === 'FAILED').length,
      warnings: results.filter(r => r.status === 'WARNING').length
    }
  };
}

async function saveResults(results: any, outputPath: string, format: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  switch (format.toLowerCase()) {
    case 'json':
      await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
      break;
    case 'html':
      const html = generateHtmlReport(results);
      await fs.writeFile(outputPath, html);
      break;
    case 'xml':
      const xml = generateXmlReport(results);
      await fs.writeFile(outputPath, xml);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function generateHtmlReport(results: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Security Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .status-passed { color: green; }
        .status-failed { color: red; }
        .status-warning { color: orange; }
        .score { font-size: 24px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Test Report</h1>
        <p class="score status-${results.overallStatus?.toLowerCase()}">
            Overall Score: ${results.overallScore || 'N/A'}
        </p>
        <p class="status-${results.overallStatus?.toLowerCase()}">
            Status: ${results.overallStatus || 'UNKNOWN'}
        </p>
        <p>Generated: ${new Date().toISOString()}</p>
    </div>

    <h2>Test Results Summary</h2>
    ${results.summary ? `
    <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Total Tests</td><td>${results.summary.totalTests}</td></tr>
        <tr><td>Passed</td><td class="status-passed">${results.summary.passed}</td></tr>
        <tr><td>Failed</td><td class="status-failed">${results.summary.failed}</td></tr>
        <tr><td>Warnings</td><td class="status-warning">${results.summary.warnings}</td></tr>
    </table>
    ` : ''}

    <h2>Detailed Results</h2>
    <pre>${JSON.stringify(results, null, 2)}</pre>
</body>
</html>
  `;
}

function generateXmlReport(results: any): string {
  return `
<?xml version="1.0" encoding="UTF-8"?>
<security-report>
    <metadata>
        <generated>${new Date().toISOString()}</generated>
        <overall-score>${results.overallScore || 'N/A'}</overall-score>
        <overall-status>${results.overallStatus || 'UNKNOWN'}</overall-status>
    </metadata>
    <results>
        ${JSON.stringify(results, null, 2).replace(/[<>&]/g, (match) => {
          switch (match) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            default: return match;
          }
        })}
    </results>
</security-report>
  `;
}

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Parse command line arguments
program.parse();