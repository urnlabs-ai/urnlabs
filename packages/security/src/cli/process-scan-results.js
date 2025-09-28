#!/usr/bin/env node

/**
 * Security Scan Results Processor
 * Aggregates and processes results from Trivy, Snyk, and ZAP scans
 */

const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');

program
  .description('Process security scan results from multiple scanners')
  .option('--trivy-dir <dir>', 'Directory containing Trivy scan results')
  .option('--snyk-file <file>', 'Snyk SARIF file path')
  .option('--zap-dir <dir>', 'Directory containing ZAP scan results')
  .option('--output <file>', 'Output file path', 'security-report.json')
  .option('--format <format>', 'Output format (json|html|csv)', 'json')
  .parse();

const options = program.opts();

async function main() {
  try {
    console.log('Processing security scan results...');

    const report = {
      timestamp: new Date().toISOString(),
      scanId: generateScanId(),
      summary: {
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        infoCount: 0
      },
      scanners: {},
      vulnerabilities: [],
      riskScore: 0,
      complianceStatus: 'COMPLIANT',
      recommendations: [],
      criticalIssues: []
    };

    // Process Trivy results
    if (options.trivyDir) {
      console.log('Processing Trivy results...');
      const trivyResults = await processTrivyResults(options.trivyDir);
      report.scanners.trivy = trivyResults;
      mergeVulnerabilities(report, trivyResults.vulnerabilities, 'trivy');
    }

    // Process Snyk results
    if (options.snykFile) {
      console.log('Processing Snyk results...');
      const snykResults = await processSnykResults(options.snykFile);
      report.scanners.snyk = snykResults;
      mergeVulnerabilities(report, snykResults.vulnerabilities, 'snyk');
    }

    // Process ZAP results
    if (options.zapDir) {
      console.log('Processing ZAP results...');
      const zapResults = await processZapResults(options.zapDir);
      report.scanners.zap = zapResults;
      mergeVulnerabilities(report, zapResults.vulnerabilities, 'zap');
    }

    // Calculate risk score and compliance status
    calculateRiskMetrics(report);

    // Generate recommendations
    generateRecommendations(report);

    // Save report
    await saveReport(report, options.output, options.format);

    console.log(`Security report generated: ${options.output}`);
    console.log(`Total vulnerabilities: ${report.summary.totalVulnerabilities}`);
    console.log(`Risk score: ${report.riskScore}/100`);
    console.log(`Compliance status: ${report.complianceStatus}`);

    // Exit with error code if critical vulnerabilities found
    if (report.summary.criticalCount > 0) {
      console.error(`❌ ${report.summary.criticalCount} critical vulnerabilities found!`);
      process.exit(1);
    }

  } catch (error) {
    console.error('Error processing security scan results:', error);
    process.exit(1);
  }
}

async function processTrivyResults(trivyDir) {
  const results = {
    scanner: 'trivy',
    vulnerabilities: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    containers: {},
    configs: {}
  };

  const files = await fs.readdir(trivyDir);

  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(trivyDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      if (data.Results) {
        for (const result of data.Results) {
          if (result.Vulnerabilities) {
            for (const vuln of result.Vulnerabilities) {
              const vulnerability = {
                id: vuln.VulnerabilityID || vuln.PkgID,
                cve: vuln.VulnerabilityID,
                title: vuln.Title || vuln.VulnerabilityID,
                description: vuln.Description || '',
                severity: vuln.Severity || 'UNKNOWN',
                cvssScore: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || 0,
                package: vuln.PkgName,
                version: vuln.InstalledVersion,
                fixedVersion: vuln.FixedVersion,
                references: vuln.References || [],
                scanner: 'trivy',
                source: file,
                publishedDate: vuln.PublishedDate,
                lastModifiedDate: vuln.LastModifiedDate
              };

              results.vulnerabilities.push(vulnerability);
              results.summary[vulnerability.severity.toLowerCase()]++;
            }
          }
        }
      }
    }
  }

  return results;
}

async function processSnykResults(snykFile) {
  const results = {
    scanner: 'snyk',
    vulnerabilities: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    dependencies: {},
    licenses: {}
  };

  try {
    const content = await fs.readFile(snykFile, 'utf8');
    const data = JSON.parse(content);

    if (data.runs && data.runs[0] && data.runs[0].results) {
      for (const result of data.runs[0].results) {
        const severity = mapSnykSeverity(result.level);

        const vulnerability = {
          id: result.ruleId,
          title: result.message.text,
          description: result.message.text,
          severity: severity,
          cvssScore: extractCvssFromSnyk(result),
          package: extractPackageFromSnyk(result),
          scanner: 'snyk',
          references: extractReferencesFromSnyk(result),
          location: result.locations?.[0]?.physicalLocation?.artifactLocation?.uri
        };

        results.vulnerabilities.push(vulnerability);
        results.summary[severity.toLowerCase()]++;
      }
    }
  } catch (error) {
    console.warn('Warning: Could not process Snyk results:', error.message);
  }

  return results;
}

async function processZapResults(zapDir) {
  const results = {
    scanner: 'zap',
    vulnerabilities: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    alerts: {},
    coverage: {}
  };

  try {
    const files = await fs.readdir(zapDir);

    for (const file of files) {
      if (file.includes('json')) {
        const filePath = path.join(zapDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);

        if (data.site && data.site[0] && data.site[0].alerts) {
          for (const alert of data.site[0].alerts) {
            const severity = mapZapSeverity(alert.riskdesc);

            const vulnerability = {
              id: alert.pluginid,
              title: alert.name,
              description: alert.desc,
              severity: severity,
              cvssScore: parseFloat(alert.cweid) || 0,
              scanner: 'zap',
              references: alert.reference ? alert.reference.split('\n') : [],
              solution: alert.solution,
              instances: alert.instances?.length || 0,
              confidence: alert.confidence,
              param: alert.instances?.[0]?.param
            };

            results.vulnerabilities.push(vulnerability);
            results.summary[severity.toLowerCase()]++;
          }
        }
      }
    }
  } catch (error) {
    console.warn('Warning: Could not process ZAP results:', error.message);
  }

  return results;
}

function mergeVulnerabilities(report, vulnerabilities, scanner) {
  report.vulnerabilities.push(...vulnerabilities);

  for (const vuln of vulnerabilities) {
    report.summary.totalVulnerabilities++;

    switch (vuln.severity) {
      case 'CRITICAL':
        report.summary.criticalCount++;
        report.criticalIssues.push(vuln);
        break;
      case 'HIGH':
        report.summary.highCount++;
        break;
      case 'MEDIUM':
        report.summary.mediumCount++;
        break;
      case 'LOW':
        report.summary.lowCount++;
        break;
      default:
        report.summary.infoCount++;
    }
  }
}

function calculateRiskMetrics(report) {
  // Calculate risk score based on severity distribution
  const weights = { critical: 10, high: 7, medium: 4, low: 1, info: 0 };

  const weightedScore =
    report.summary.criticalCount * weights.critical +
    report.summary.highCount * weights.high +
    report.summary.mediumCount * weights.medium +
    report.summary.lowCount * weights.low +
    report.summary.infoCount * weights.info;

  // Normalize to 0-100 scale
  report.riskScore = Math.min(100, Math.round(weightedScore / Math.max(1, report.summary.totalVulnerabilities) * 10));

  // Determine compliance status
  if (report.summary.criticalCount > 0) {
    report.complianceStatus = 'NON_COMPLIANT';
  } else if (report.summary.highCount > 5) {
    report.complianceStatus = 'AT_RISK';
  } else {
    report.complianceStatus = 'COMPLIANT';
  }
}

function generateRecommendations(report) {
  if (report.summary.criticalCount > 0) {
    report.recommendations.push('Immediately address critical vulnerabilities before deployment');
  }

  if (report.summary.highCount > 5) {
    report.recommendations.push('Review and remediate high-severity vulnerabilities');
  }

  if (report.summary.mediumCount > 20) {
    report.recommendations.push('Consider addressing medium-severity vulnerabilities in next release cycle');
  }

  // Scanner-specific recommendations
  if (report.scanners.trivy && report.scanners.trivy.vulnerabilities.length > 0) {
    report.recommendations.push('Update base images and dependencies to latest secure versions');
  }

  if (report.scanners.snyk && report.scanners.snyk.vulnerabilities.length > 0) {
    report.recommendations.push('Run "npm audit fix" or equivalent for automated dependency updates');
  }

  if (report.scanners.zap && report.scanners.zap.vulnerabilities.length > 0) {
    report.recommendations.push('Review web application security configurations and input validation');
  }
}

async function saveReport(report, outputPath, format) {
  switch (format) {
    case 'json':
      await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
      break;
    case 'html':
      const html = generateHtmlReport(report);
      await fs.writeFile(outputPath.replace('.json', '.html'), html);
      break;
    case 'csv':
      const csv = generateCsvReport(report);
      await fs.writeFile(outputPath.replace('.json', '.csv'), csv);
      break;
  }
}

function generateHtmlReport(report) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Security Scan Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .critical { color: #d73027; }
        .high { color: #fc8d59; }
        .medium { color: #fee08b; }
        .low { color: #91cf60; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Scan Report</h1>
        <p>Generated: ${report.timestamp}</p>
        <p>Scan ID: ${report.scanId}</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Risk Score</h3>
            <div style="font-size: 24px; font-weight: bold;">${report.riskScore}/100</div>
        </div>
        <div class="metric">
            <h3>Total Vulnerabilities</h3>
            <div style="font-size: 24px; font-weight: bold;">${report.summary.totalVulnerabilities}</div>
        </div>
        <div class="metric">
            <h3>Compliance Status</h3>
            <div style="font-size: 18px; font-weight: bold;">${report.complianceStatus}</div>
        </div>
    </div>

    <h2>Vulnerability Summary</h2>
    <table>
        <tr>
            <th>Severity</th>
            <th>Count</th>
        </tr>
        <tr class="critical"><td>Critical</td><td>${report.summary.criticalCount}</td></tr>
        <tr class="high"><td>High</td><td>${report.summary.highCount}</td></tr>
        <tr class="medium"><td>Medium</td><td>${report.summary.mediumCount}</td></tr>
        <tr class="low"><td>Low</td><td>${report.summary.lowCount}</td></tr>
    </table>

    <h2>Recommendations</h2>
    <ul>
        ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
    </ul>
</body>
</html>`;
}

function generateCsvReport(report) {
  const headers = ['ID', 'Title', 'Severity', 'CVSS Score', 'Scanner', 'Package', 'Description'];
  const rows = [headers.join(',')];

  for (const vuln of report.vulnerabilities) {
    const row = [
      vuln.id || '',
      vuln.title || '',
      vuln.severity || '',
      vuln.cvssScore || '',
      vuln.scanner || '',
      vuln.package || '',
      (vuln.description || '').replace(/,/g, ';')
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

// Utility functions
function mapSnykSeverity(level) {
  const mapping = {
    'error': 'HIGH',
    'warning': 'MEDIUM',
    'note': 'LOW',
    'info': 'INFO'
  };
  return mapping[level] || 'UNKNOWN';
}

function mapZapSeverity(riskdesc) {
  if (riskdesc.includes('High')) return 'HIGH';
  if (riskdesc.includes('Medium')) return 'MEDIUM';
  if (riskdesc.includes('Low')) return 'LOW';
  return 'INFO';
}

function extractCvssFromSnyk(result) {
  // Extract CVSS score from Snyk result if available
  return 0;
}

function extractPackageFromSnyk(result) {
  // Extract package name from Snyk result
  return result.locations?.[0]?.physicalLocation?.artifactLocation?.uri || '';
}

function extractReferencesFromSnyk(result) {
  return result.helpUri ? [result.helpUri] : [];
}

function generateScanId() {
  return `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

if (require.main === module) {
  main();
}

module.exports = { main, processTrivyResults, processSnykResults, processZapResults };