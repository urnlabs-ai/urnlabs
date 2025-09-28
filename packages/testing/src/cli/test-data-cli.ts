#!/usr/bin/env node

import { program } from 'commander';
import { TestDataManager } from '../services/test-data-manager';
import { preBuiltSchemas } from '../services/test-data-manager';
import fs from 'fs';
import path from 'path';

program
  .name('test-data')
  .description('Test data management and generation CLI')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate test data based on schema')
  .option('-s, --schema <path>', 'Schema file path or pre-built schema name')
  .option('-c, --count <number>', 'Number of records to generate', '100')
  .option('-o, --output <path>', 'Output file path (JSON or SQL)', './test-data.json')
  .option('--format <format>', 'Output format (json|sql)', 'json')
  .option('--stream', 'Use streaming for large datasets')
  .option('--seed <number>', 'Random seed for reproducible data', '12345')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const dataManager = new TestDataManager({
        seed: parseInt(options.seed),
        enableLogging: options.verbose
      });

      let schema;

      // Check if it's a pre-built schema
      if (preBuiltSchemas[options.schema as keyof typeof preBuiltSchemas]) {
        schema = preBuiltSchemas[options.schema as keyof typeof preBuiltSchemas];
        console.log(`📋 Using pre-built schema: ${options.schema}`);
      } else if (options.schema && fs.existsSync(options.schema)) {
        // Load custom schema from file
        const schemaContent = fs.readFileSync(options.schema, 'utf-8');
        schema = JSON.parse(schemaContent);
        console.log(`📋 Using custom schema: ${options.schema}`);
      } else {
        console.error('❌ Schema not found. Available pre-built schemas:', Object.keys(preBuiltSchemas).join(', '));
        process.exit(1);
      }

      const count = parseInt(options.count);
      console.log(`🔄 Generating ${count} records...`);

      let data;
      let outputContent;

      if (options.stream && count > 1000) {
        console.log('📡 Using streaming generation for large dataset');
        data = await dataManager.generateLargeDataset(schema, count);
      } else {
        data = await dataManager.generateTestData(schema, count);
      }

      if (options.format === 'sql') {
        const tableName = schema.name || 'test_data';
        outputContent = dataManager.generateSQLInserts(data, tableName);
      } else {
        outputContent = JSON.stringify(data, null, 2);
      }

      // Ensure output directory exists
      const outputDir = path.dirname(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(options.output, outputContent);
      console.log(`✅ Generated ${data.length} records saved to: ${options.output}`);

      if (options.verbose) {
        console.log(`📊 Sample record:`, JSON.stringify(data[0], null, 2));
      }

    } catch (error) {
      console.error('❌ Generation failed:', error);
      process.exit(1);
    }
  });

program
  .command('mask')
  .description('Mask sensitive data in existing dataset')
  .option('-i, --input <path>', 'Input file path (JSON)', './input-data.json')
  .option('-o, --output <path>', 'Output file path (JSON)', './masked-data.json')
  .option('-f, --fields <fields>', 'Comma-separated list of fields to mask', 'email,phone,ssn')
  .option('--anonymize', 'Use anonymization instead of simple masking')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      if (!fs.existsSync(options.input)) {
        console.error(`❌ Input file not found: ${options.input}`);
        process.exit(1);
      }

      const dataManager = new TestDataManager({
        enableLogging: options.verbose
      });

      const inputData = JSON.parse(fs.readFileSync(options.input, 'utf-8'));
      const fieldsToMask = options.fields.split(',').map((f: string) => f.trim());

      console.log(`🔒 Masking fields: ${fieldsToMask.join(', ')}`);

      let maskedData;
      if (options.anonymize) {
        console.log('🎭 Using anonymization techniques');
        maskedData = dataManager.anonymizeData(inputData, fieldsToMask);
      } else {
        maskedData = dataManager.maskData(inputData, fieldsToMask);
      }

      // Ensure output directory exists
      const outputDir = path.dirname(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(options.output, JSON.stringify(maskedData, null, 2));
      console.log(`✅ Masked ${maskedData.length} records saved to: ${options.output}`);

      if (options.verbose) {
        console.log(`📊 Sample masked record:`, JSON.stringify(maskedData[0], null, 2));
      }

    } catch (error) {
      console.error('❌ Masking failed:', error);
      process.exit(1);
    }
  });

program
  .command('seed')
  .description('Seed test database with generated data')
  .option('-s, --schema <name>', 'Pre-built schema name', 'users')
  .option('-c, --count <number>', 'Number of records to generate', '50')
  .option('--database-url <url>', 'Database connection URL')
  .option('--table <name>', 'Target table name')
  .option('--clean', 'Clean existing data before seeding')
  .option('--transaction', 'Use transaction for rollback capability')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const dataManager = new TestDataManager({
        enableLogging: options.verbose
      });

      const schema = preBuiltSchemas[options.schema as keyof typeof preBuiltSchemas];
      if (!schema) {
        console.error('❌ Schema not found. Available schemas:', Object.keys(preBuiltSchemas).join(', '));
        process.exit(1);
      }

      const count = parseInt(options.count);
      const tableName = options.table || schema.name || options.schema;

      console.log(`🌱 Seeding database table '${tableName}' with ${count} records...`);

      const data = await dataManager.generateTestData(schema, count);

      if (options.databaseUrl) {
        // Database seeding would require actual DB connection
        // For now, generate SQL and show instructions
        const sqlInserts = dataManager.generateSQLInserts(data, tableName);
        const outputPath = `./seed-${tableName}-${Date.now()}.sql`;
        fs.writeFileSync(outputPath, sqlInserts);

        console.log(`📝 SQL seed file generated: ${outputPath}`);
        console.log(`💡 To execute: psql ${options.databaseUrl} -f ${outputPath}`);

        if (options.clean) {
          console.log(`⚠️  To clean existing data, run: DELETE FROM ${tableName};`);
        }
      } else {
        console.log('💡 To seed database, provide --database-url option');
        console.log(`📊 Generated ${data.length} records for table '${tableName}'`);
      }

    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    }
  });

program
  .command('schemas')
  .description('List available pre-built schemas')
  .option('--detailed', 'Show detailed schema information')
  .action((options) => {
    console.log('📋 Available pre-built schemas:');
    console.log('===============================');

    Object.entries(preBuiltSchemas).forEach(([name, schema]) => {
      console.log(`\n🔹 ${name}`);
      if (options.detailed) {
        console.log(`   Fields: ${schema.fields.map(f => f.name).join(', ')}`);
        console.log(`   Relationships: ${schema.relationships?.map(r => r.field).join(', ') || 'None'}`);
      }
    });

    console.log('\n💡 Usage: test-data generate --schema <name> --count 100');
  });

program
  .command('performance')
  .description('Generate performance test datasets')
  .option('-t, --type <type>', 'Performance test type (load|stress|volume)', 'load')
  .option('-s, --size <size>', 'Dataset size (small|medium|large|xl)', 'medium')
  .option('-o, --output <path>', 'Output directory', './performance-data')
  .option('--concurrent', 'Generate data for concurrent access patterns')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const dataManager = new TestDataManager({
        enableLogging: options.verbose
      });

      const sizeMap = {
        small: 1000,
        medium: 10000,
        large: 100000,
        xl: 1000000
      };

      const count = sizeMap[options.size as keyof typeof sizeMap] || 10000;

      console.log(`⚡ Generating ${options.type} test data (${options.size}: ${count} records)...`);

      // Ensure output directory exists
      if (!fs.existsSync(options.output)) {
        fs.mkdirSync(options.output, { recursive: true });
      }

      // Generate different types of performance data
      const schemas = ['users', 'organizations', 'transactions'];

      for (const schemaName of schemas) {
        const schema = preBuiltSchemas[schemaName as keyof typeof preBuiltSchemas];
        if (schema) {
          console.log(`📊 Generating ${schemaName} data...`);

          const data = count > 10000
            ? await dataManager.generateLargeDataset(schema, count)
            : await dataManager.generateTestData(schema, count);

          const outputFile = path.join(options.output, `${schemaName}-${options.type}-${options.size}.json`);
          fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));

          console.log(`✅ ${schemaName}: ${data.length} records → ${outputFile}`);
        }
      }

      console.log(`🎯 Performance test data generated in: ${options.output}`);

    } catch (error) {
      console.error('❌ Performance data generation failed:', error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate test data against schema')
  .option('-i, --input <path>', 'Input data file (JSON)')
  .option('-s, --schema <path>', 'Schema file path or pre-built schema name')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      if (!fs.existsSync(options.input)) {
        console.error(`❌ Input file not found: ${options.input}`);
        process.exit(1);
      }

      const data = JSON.parse(fs.readFileSync(options.input, 'utf-8'));

      let schema;
      if (preBuiltSchemas[options.schema as keyof typeof preBuiltSchemas]) {
        schema = preBuiltSchemas[options.schema as keyof typeof preBuiltSchemas];
      } else if (fs.existsSync(options.schema)) {
        schema = JSON.parse(fs.readFileSync(options.schema, 'utf-8'));
      } else {
        console.error('❌ Schema not found');
        process.exit(1);
      }

      console.log('🔍 Validating test data...');

      const requiredFields = schema.fields.filter((f: any) => f.required !== false);
      const errors: string[] = [];

      data.forEach((record: any, index: number) => {
        requiredFields.forEach((field: any) => {
          if (record[field.name] === undefined || record[field.name] === null) {
            errors.push(`Record ${index}: Missing required field '${field.name}'`);
          }
        });
      });

      if (errors.length === 0) {
        console.log(`✅ All ${data.length} records are valid`);
      } else {
        console.log(`❌ Found ${errors.length} validation errors:`);
        errors.slice(0, 10).forEach(error => console.log(`  - ${error}`));
        if (errors.length > 10) {
          console.log(`  ... and ${errors.length - 10} more errors`);
        }
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse();
}