#!/usr/bin/env node

import { program } from 'commander';
import { QualityGateService, QualityGateResult } from '../services/quality-gates';
import { getQualityGateConfig } from '../config/quality-gates.config';
import fs from 'fs';
import path from 'path';

program
  .name('quality-gates')
  .description('Run quality gates and generate reports')
  .version('1.0.0');

program
  .command('check')
  .description('Run quality gate checks')
  .option('-c, --config <path>', 'Custom configuration file path')
  .option('-l, --level <level>', 'Quality gate level (basic|default|strict)', 'default')
  .option('-o, --output <path>', 'Output report file path')
  .option('-f, --format <format>', 'Output format (json|junit|html)', 'json')
  .option('--fail-fast', 'Exit immediately on first failure')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const projectRoot = process.cwd();

      // Load configuration
      let config = getQualityGateConfig(options.level);

      if (options.config) {
        const customConfigPath = path.resolve(options.config);
        if (fs.existsSync(customConfigPath)) {
          const customConfig = require(customConfigPath);
          config = { ...config, ...customConfig };
        } else {
          console.error(`Configuration file not found: ${customConfigPath}`);
          process.exit(1);
        }
      }

      if (options.verbose) {
        console.log('Running quality gates with configuration:');
        console.log(JSON.stringify(config, null, 2));
      }

      // Run quality gates
      const qualityGateService = new QualityGateService(config, projectRoot);
      const result = await qualityGateService.checkQualityGates();

      // Generate output
      await generateOutput(result, options);

      // Exit with appropriate code
      if (result.passed) {
        console.log('✅ All quality gates passed!');
        process.exit(0);
      } else {
        console.log('❌ Quality gates failed!');
        if (options.verbose) {
          printDetailedResults(result);
        }
        process.exit(1);
      }

    } catch (error) {
      console.error('Error running quality gates:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize quality gates configuration')
  .option('-l, --level <level>', 'Quality gate level (basic|default|strict)', 'default')
  .option('-o, --output <path>', 'Configuration output path', 'quality-gates.config.js')
  .action((options) => {
    const config = getQualityGateConfig(options.level);
    const configFile = `module.exports = ${JSON.stringify(config, null, 2)};`;

    fs.writeFileSync(options.output, configFile);
    console.log(`Quality gates configuration created: ${options.output}`);
  });

program
  .command('report')
  .description('Generate quality gates report from previous run')
  .option('-i, --input <path>', 'Input report file path', 'quality-gates-report.json')
  .option('-f, --format <format>', 'Output format (json|junit|html)', 'html')
  .option('-o, --output <path>', 'Output file path')
  .action(async (options) => {
    try {
      if (!fs.existsSync(options.input)) {
        console.error(`Report file not found: ${options.input}`);
        process.exit(1);
      }

      const reportData = JSON.parse(fs.readFileSync(options.input, 'utf-8'));
      await generateOutput(reportData, options);

      console.log(`Report generated: ${options.output}`);
    } catch (error) {
      console.error('Error generating report:', error);
      process.exit(1);
    }
  });

async function generateOutput(result: QualityGateResult, options: any): Promise<void> {
  const timestamp = new Date().toISOString();
  const outputPath = options.output || `quality-gates-report.${options.format}`;

  switch (options.format) {
    case 'json':
      const jsonReport = {
        timestamp,
        passed: result.passed,
        ...result
      };
      fs.writeFileSync(outputPath, JSON.stringify(jsonReport, null, 2));
      break;

    case 'junit':
      const junitXml = generateJUnitReport(result);
      fs.writeFileSync(outputPath, junitXml);
      break;

    case 'html':
      const htmlReport = generateHTMLReport(result);
      fs.writeFileSync(outputPath, htmlReport);
      break;

    default:
      throw new Error(`Unsupported format: ${options.format}`);
  }

  if (options.verbose) {
    console.log(`Report saved to: ${outputPath}`);
  }
}

function generateJUnitReport(result: QualityGateResult): string {
  const testcases = [
    {
      name: 'Code Coverage',
      passed: result.coverage.passed,
      details: result.coverage.details,
      error: result.coverage.passed ? null : 'Coverage thresholds not met'
    },
    {
      name: 'Security Scan',
      passed: result.security.passed,
      details: result.security.details,
      error: result.security.passed ? null : 'Security vulnerabilities found'
    },
    {
      name: 'Performance Benchmarks',
      passed: result.performance.passed,
      details: result.performance.details,
      error: result.performance.passed ? null : 'Performance thresholds exceeded'
    },
    {
      name: 'Compliance Checks',
      passed: result.compliance.passed,
      details: result.compliance.details,
      error: result.compliance.passed ? null : 'Compliance requirements not met'
    }
  ];

  const failures = testcases.filter(tc => !tc.passed).length;
  const total = testcases.length;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Quality Gates" tests="${total}" failures="${failures}" time="0">
  <testsuite name="Quality Gates" tests="${total}" failures="${failures}" time="0">`;

  for (const testcase of testcases) {
    xml += `
    <testcase name="${testcase.name}" classname="QualityGates">`;

    if (!testcase.passed && testcase.error) {
      xml += `
      <failure message="${testcase.error}">
        ${escapeXml(testcase.details)}
      </failure>`;
    }

    xml += `
    </testcase>`;
  }

  xml += `
  </testsuite>
</testsuites>`;

  return xml;
}

function generateHTMLReport(result: QualityGateResult): string {
  const status = result.passed ? 'PASSED' : 'FAILED';
  const statusClass = result.passed ? 'success' : 'failure';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quality Gates Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .status { font-size: 24px; font-weight: bold; padding: 10px 20px; border-radius: 5px; }
        .success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .failure { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .section h3 { margin-top: 0; }
        .pass { color: #28a745; }
        .fail { color: #dc3545; }
        .details { background-color: #f8f9fa; padding: 10px; border-radius: 3px; white-space: pre-line; }
        .timestamp { text-align: center; color: #666; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Quality Gates Report</h1>
            <div class="status ${statusClass}">${status}</div>
        </div>

        <div class="section">
            <h3>Code Coverage <span class="${result.coverage.passed ? 'pass' : 'fail'}">[${result.coverage.passed ? 'PASS' : 'FAIL'}]</span></h3>
            <div class="details">${result.coverage.details}</div>
        </div>

        <div class="section">
            <h3>Security Scan <span class="${result.security.passed ? 'pass' : 'fail'}">[${result.security.passed ? 'PASS' : 'FAIL'}]</span></h3>
            <div class="details">${result.security.details}</div>
        </div>

        <div class="section">
            <h3>Performance Benchmarks <span class="${result.performance.passed ? 'pass' : 'fail'}">[${result.performance.passed ? 'PASS' : 'FAIL'}]</span></h3>
            <div class="details">${result.performance.details}</div>
        </div>

        <div class="section">
            <h3>Compliance Checks <span class="${result.compliance.passed ? 'pass' : 'fail'}">[${result.compliance.passed ? 'PASS' : 'FAIL'}]</span></h3>
            <div class="details">${result.compliance.details}</div>
        </div>

        ${result.errors.length > 0 ? `
        <div class="section">
            <h3>Errors</h3>
            <div class="details">${result.errors.join('\n')}</div>
        </div>
        ` : ''}

        ${result.warnings.length > 0 ? `
        <div class="section">
            <h3>Warnings</h3>
            <div class="details">${result.warnings.join('\n')}</div>
        </div>
        ` : ''}

        <div class="timestamp">
            Generated on: ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>`;
}

function printDetailedResults(result: QualityGateResult): void {
  console.log('\n📊 Detailed Results:');
  console.log('===================\n');

  console.log(`🎯 Coverage: ${result.coverage.passed ? '✅' : '❌'}`);
  console.log(result.coverage.details);
  console.log('');

  console.log(`🔒 Security: ${result.security.passed ? '✅' : '❌'}`);
  console.log(result.security.details);
  console.log('');

  console.log(`⚡ Performance: ${result.performance.passed ? '✅' : '❌'}`);
  console.log(result.performance.details);
  console.log('');

  console.log(`✅ Compliance: ${result.compliance.passed ? '✅' : '❌'}`);
  console.log(result.compliance.details);
  console.log('');

  if (result.errors.length > 0) {
    console.log('🚨 Errors:');
    result.errors.forEach(error => console.log(`  - ${error}`));
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    result.warnings.forEach(warning => console.log(`  - ${warning}`));
    console.log('');
  }
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&#39;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

if (require.main === module) {
  program.parse();
}