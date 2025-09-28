#!/usr/bin/env node

import { Command } from 'commander';
import { SecretsScanner } from '../secrets-scanner';
import * as path from 'path';

const program = new Command();

program
  .name('secrets-scanner')
  .description('Scan for hardcoded secrets in code repositories')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan a directory for secrets')
  .argument('<path>', 'Path to scan')
  .option('-o, --output <file>', 'Output file for results (JSON format)')
  .option('-e, --exclude <patterns...>', 'Exclude patterns', [])
  .option('-i, --include <patterns...>', 'Include patterns', [])
  .option('--max-size <size>', 'Maximum file size in bytes', '10485760')
  .option('--follow-symlinks', 'Follow symbolic links', false)
  .action(async (scanPath: string, options) => {
    try {
      console.log(`🔍 Starting secrets scan of: ${scanPath}`);

      const scanner = new SecretsScanner({
        rootPath: path.resolve(scanPath),
        excludePatterns: options.exclude,
        includePatterns: options.include.length > 0 ? options.include : undefined,
        maxFileSize: parseInt(options.maxSize),
        followSymlinks: options.followSymlinks,
      });

      // Progress reporting
      scanner.on('scan:progress', ({ current, total, file }) => {
        const progress = Math.round((current / total) * 100);
        process.stdout.write(`\r📁 Scanning... ${progress}% (${current}/${total}) ${path.basename(file)}`);
      });

      scanner.on('scan:error', ({ file, error }) => {
        console.error(`\n⚠️  Error scanning ${file}: ${error.message}`);
      });

      const results = await scanner.scan();
      console.log('\n✅ Scan completed!');

      const report = scanner.generateReport(results);

      // Display summary
      console.log('\n📊 SCAN SUMMARY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Total secrets found: ${report.summary.total}`);
      console.log(`  🔴 High severity: ${report.summary.high}`);
      console.log(`  🟡 Medium severity: ${report.summary.medium}`);
      console.log(`  🟢 Low severity: ${report.summary.low}`);
      console.log(`Files affected: ${report.summary.files}`);
      console.log();

      // Display high severity secrets first
      if (report.summary.high > 0) {
        console.log('🚨 HIGH SEVERITY SECRETS (IMMEDIATE ACTION REQUIRED)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        report.details
          .filter(r => r.severity === 'high')
          .slice(0, 10) // Show first 10
          .forEach(result => {
            console.log(`📁 ${result.file}:${result.line}:${result.column}`);
            console.log(`   ${result.pattern}: ${result.description}`);
            console.log(`   Match: ${result.match.substring(0, 50)}${result.match.length > 50 ? '...' : ''}`);
            console.log();
          });

        if (report.summary.high > 10) {
          console.log(`... and ${report.summary.high - 10} more high severity secrets`);
          console.log();
        }
      }

      // Display recommendations
      console.log('💡 RECOMMENDATIONS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      report.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
      console.log();

      // Save report if output file specified
      if (options.output) {
        await scanner.saveReport(results, path.resolve(options.output));
        console.log(`📄 Detailed report saved to: ${options.output}`);
      }

      // Exit with error code if high severity secrets found
      if (report.summary.high > 0) {
        console.log('❌ Scan failed due to high severity secrets');
        process.exit(1);
      } else if (report.summary.medium > 0) {
        console.log('⚠️  Scan completed with warnings');
        process.exit(0);
      } else {
        console.log('✅ No secrets detected');
        process.exit(0);
      }

    } catch (error) {
      console.error('❌ Scan failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('patterns')
  .description('List available secret patterns')
  .action(() => {
    const scanner = new SecretsScanner({ rootPath: '.' });
    const patterns = (scanner as any).patterns;

    console.log('🔍 AVAILABLE SECRET PATTERNS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    patterns.forEach((pattern: any) => {
      const severityColor = pattern.severity === 'high' ? '🔴' :
                          pattern.severity === 'medium' ? '🟡' : '🟢';
      console.log(`${severityColor} ${pattern.name}`);
      console.log(`   ${pattern.description}`);
      console.log(`   Pattern: ${pattern.pattern.source}`);
      console.log();
    });
  });

program.parse();