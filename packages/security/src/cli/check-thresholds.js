#!/usr/bin/env node

/**
 * Security Threshold Checker
 * Validates security scan results against configurable thresholds
 */

const fs = require('fs').promises;
const { program } = require('commander');

program
  .description('Check security scan results against thresholds')
  .option('--input <file>', 'Input security report JSON file', 'security-report.json')
  .option('--critical-max <num>', 'Maximum allowed critical vulnerabilities', '0')
  .option('--high-max <num>', 'Maximum allowed high vulnerabilities', '5')
  .option('--medium-max <num>', 'Maximum allowed medium vulnerabilities', '20')
  .option('--low-max <num>', 'Maximum allowed low vulnerabilities', '50')
  .option('--risk-score-max <num>', 'Maximum allowed risk score', '30')
  .option('--config <file>', 'Configuration file with custom thresholds')
  .option('--fail-on-new', 'Fail if new vulnerabilities are introduced', false)
  .option('--baseline <file>', 'Baseline report for comparison')
  .parse();

const options = program.opts();

async function main() {
  try {
    console.log('Checking security thresholds...');

    // Load current report
    const reportContent = await fs.readFile(options.input, 'utf8');
    const report = JSON.parse(reportContent);

    // Load configuration if provided
    let config = {
      thresholds: {
        critical: parseInt(options.criticalMax),
        high: parseInt(options.highMax),
        medium: parseInt(options.mediumMax),
        low: parseInt(options.lowMax),
        riskScore: parseInt(options.riskScoreMax)
      }
    };

    if (options.config) {
      const configContent = await fs.readFile(options.config, 'utf8');
      config = { ...config, ...JSON.parse(configContent) };
    }

    // Load baseline if provided
    let baseline = null;
    if (options.baseline) {
      const baselineContent = await fs.readFile(options.baseline, 'utf8');
      baseline = JSON.parse(baselineContent);
    }

    console.log('\n=== Security Threshold Check ===');
    console.log(`Report: ${options.input}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Scan ID: ${report.scanId}`);

    const results = {
      passed: true,
      failures: [],
      warnings: [],
      summary: report.summary,
      thresholds: config.thresholds
    };

    // Check threshold violations
    checkVulnerabilityThresholds(report, config.thresholds, results);
    checkRiskScore(report, config.thresholds, results);

    // Check for new vulnerabilities if baseline provided
    if (baseline && options.failOnNew) {
      checkNewVulnerabilities(report, baseline, results);
    }

    // Generate compliance checks
    checkComplianceRequirements(report, results);

    // Print results
    printResults(results);

    // Save detailed results
    await saveResults(results, options.input.replace('.json', '-threshold-check.json'));

    // Exit with appropriate code
    if (!results.passed) {
      console.error('\n❌ Security threshold check FAILED');
      process.exit(1);
    } else {
      console.log('\n✅ Security threshold check PASSED');
      process.exit(0);
    }

  } catch (error) {
    console.error('Error checking security thresholds:', error);
    process.exit(1);
  }
}

function checkVulnerabilityThresholds(report, thresholds, results) {
  console.log('\n--- Vulnerability Threshold Check ---');

  const checks = [
    { severity: 'critical', count: report.summary.criticalCount, threshold: thresholds.critical },
    { severity: 'high', count: report.summary.highCount, threshold: thresholds.high },
    { severity: 'medium', count: report.summary.mediumCount, threshold: thresholds.medium },
    { severity: 'low', count: report.summary.lowCount, threshold: thresholds.low }
  ];

  for (const check of checks) {
    const status = check.count <= check.threshold ? '✅' : '❌';
    console.log(`${status} ${check.severity.toUpperCase()}: ${check.count}/${check.threshold}`);

    if (check.count > check.threshold) {
      results.passed = false;
      results.failures.push({
        type: 'threshold_violation',
        severity: check.severity,
        count: check.count,
        threshold: check.threshold,
        message: `${check.severity} vulnerability count (${check.count}) exceeds threshold (${check.threshold})`
      });
    }
  }
}

function checkRiskScore(report, thresholds, results) {
  console.log('\n--- Risk Score Check ---');

  const status = report.riskScore <= thresholds.riskScore ? '✅' : '❌';
  console.log(`${status} Risk Score: ${report.riskScore}/${thresholds.riskScore}`);

  if (report.riskScore > thresholds.riskScore) {
    results.passed = false;
    results.failures.push({
      type: 'risk_score_violation',
      score: report.riskScore,
      threshold: thresholds.riskScore,
      message: `Risk score (${report.riskScore}) exceeds threshold (${thresholds.riskScore})`
    });
  }
}

function checkNewVulnerabilities(report, baseline, results) {
  console.log('\n--- New Vulnerability Check ---');

  const newVulnerabilities = [];
  const baselineIds = new Set(baseline.vulnerabilities.map(v => v.id));

  for (const vuln of report.vulnerabilities) {
    if (!baselineIds.has(vuln.id)) {
      newVulnerabilities.push(vuln);
    }
  }

  if (newVulnerabilities.length > 0) {
    console.log(`❌ Found ${newVulnerabilities.length} new vulnerabilities`);

    // Check if any new vulnerabilities are critical or high
    const criticalNew = newVulnerabilities.filter(v => v.severity === 'CRITICAL');
    const highNew = newVulnerabilities.filter(v => v.severity === 'HIGH');

    if (criticalNew.length > 0 || highNew.length > 0) {
      results.passed = false;
      results.failures.push({
        type: 'new_vulnerabilities',
        count: newVulnerabilities.length,
        critical: criticalNew.length,
        high: highNew.length,
        message: `New high/critical vulnerabilities introduced: ${criticalNew.length} critical, ${highNew.length} high`
      });
    } else {
      results.warnings.push({
        type: 'new_low_severity',
        count: newVulnerabilities.length,
        message: `${newVulnerabilities.length} new low/medium severity vulnerabilities introduced`
      });
    }

    // List new critical and high vulnerabilities
    for (const vuln of [...criticalNew, ...highNew]) {
      console.log(`  - ${vuln.severity}: ${vuln.title} (${vuln.id})`);
    }
  } else {
    console.log('✅ No new vulnerabilities found');
  }
}

function checkComplianceRequirements(report, results) {
  console.log('\n--- Compliance Check ---');

  // SOC 2 requirements
  if (report.summary.criticalCount > 0) {
    results.failures.push({
      type: 'compliance_violation',
      standard: 'SOC2',
      message: 'SOC 2 requires zero critical vulnerabilities in production systems'
    });
  }

  // PCI DSS requirements (if applicable)
  if (report.riskScore > 20) {
    results.warnings.push({
      type: 'compliance_warning',
      standard: 'PCI_DSS',
      message: 'PCI DSS recommends keeping risk score below 20 for payment processing systems'
    });
  }

  // ISO 27001 requirements
  const totalHighCritical = report.summary.criticalCount + report.summary.highCount;
  if (totalHighCritical > 3) {
    results.warnings.push({
      type: 'compliance_warning',
      standard: 'ISO27001',
      message: 'ISO 27001 recommends addressing high and critical vulnerabilities promptly'
    });
  }

  console.log(`Compliance Status: ${report.complianceStatus}`);
}

function printResults(results) {
  console.log('\n=== Summary ===');
  console.log(`Overall Status: ${results.passed ? 'PASSED' : 'FAILED'}`);

  if (results.failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of results.failures) {
      console.log(`  ❌ ${failure.message}`);
    }
  }

  if (results.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of results.warnings) {
      console.log(`  ⚠️  ${warning.message}`);
    }
  }

  console.log('\nVulnerability Summary:');
  console.log(`  Critical: ${results.summary.criticalCount}`);
  console.log(`  High: ${results.summary.highCount}`);
  console.log(`  Medium: ${results.summary.mediumCount}`);
  console.log(`  Low: ${results.summary.lowCount}`);
  console.log(`  Total: ${results.summary.totalVulnerabilities}`);
}

async function saveResults(results, outputPath) {
  const detailedResults = {
    ...results,
    timestamp: new Date().toISOString(),
    metadata: {
      version: '1.0.0',
      generator: 'urnlabs-security-threshold-checker'
    }
  };

  await fs.writeFile(outputPath, JSON.stringify(detailedResults, null, 2));
  console.log(`\nDetailed results saved to: ${outputPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { main, checkVulnerabilityThresholds, checkRiskScore };