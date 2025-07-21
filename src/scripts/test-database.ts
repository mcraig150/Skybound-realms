#!/usr/bin/env ts-node

import { database } from '../shared/database';
import { migrationRunner } from '../shared/migrations';
import { config } from '../shared/config';

async function testDatabaseConnection() {
  console.log('🔧 Testing Database Connection and Configuration');
  console.log('================================================');
  
  try {
    // Test configuration
    console.log('\n📋 Configuration:');
    console.log(`  Host: ${config.database.host}`);
    console.log(`  Port: ${config.database.port}`);
    console.log(`  Database: ${config.database.name}`);
    console.log(`  User: ${config.database.user}`);
    console.log(`  SSL: ${config.database.ssl}`);
    
    // Test connection
    console.log('\n🔌 Testing Connection...');
    await database.connect();
    console.log('✅ Database connection established successfully');
    
    // Test connection info
    console.log('\n📊 Connection Information:');
    const info = database.getConnectionInfo();
    console.log(`  Connected: ${info.isConnected}`);
    console.log(`  Connection Attempts: ${info.connectionAttempts}/${info.maxConnectionAttempts}`);
    console.log(`  Pool Status:`);
    console.log(`    Total Connections: ${info.poolStatus.totalCount}`);
    console.log(`    Idle Connections: ${info.poolStatus.idleCount}`);
    console.log(`    Waiting Connections: ${info.poolStatus.waitingCount}`);
    
    // Test connection performance
    console.log('\n⚡ Testing Connection Performance...');
    const testResult = await database.testConnection();
    console.log(`  Success: ${testResult.success}`);
    console.log(`  Response Time: ${testResult.responseTime}ms`);
    if (testResult.error) {
      console.log(`  Error: ${testResult.error}`);
    }
    
    // Test health check
    console.log('\n🏥 Health Check...');
    const isHealthy = await database.healthCheck();
    console.log(`  Database Health: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    // Test basic query
    console.log('\n🔍 Testing Basic Query...');
    const queryResult = await database.query('SELECT NOW() as current_time, version() as pg_version');
    console.log(`  Current Time: ${queryResult[0].current_time}`);
    console.log(`  PostgreSQL Version: ${queryResult[0].pg_version.split(' ')[0]}`);
    
    // Test transaction
    console.log('\n💳 Testing Transaction...');
    const transactionResult = await database.transaction(async (client) => {
      const result = await client.query('SELECT $1 as test_value', ['transaction_test']);
      return result.rows[0].test_value;
    });
    console.log(`  Transaction Result: ${transactionResult}`);
    
    // Test migrations
    console.log('\n🔄 Testing Migration System...');
    console.log('  Running migrations...');
    await migrationRunner.runMigrations();
    
    const executedMigrations = await migrationRunner.getExecutedMigrations();
    console.log(`  Executed Migrations: ${executedMigrations.length}`);
    executedMigrations.forEach(migration => {
      console.log(`    - ${migration.id}: ${migration.name} (${migration.executed_at.toISOString()})`);
    });
    
    // Test schema validation
    console.log('\n🏗️  Validating Database Schema...');
    const tables = await database.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`  Tables Created: ${tables.length}`);
    tables.forEach(table => {
      console.log(`    - ${table.table_name}`);
    });
    
    // Test indexes
    const indexes = await database.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname
    `);
    
    console.log(`  Performance Indexes: ${indexes.length}`);
    indexes.forEach(index => {
      console.log(`    - ${index.indexname} on ${index.tablename}`);
    });
    
    // Test foreign keys
    const foreignKeys = await database.query(`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      ORDER BY tc.table_name
    `);
    
    console.log(`  Foreign Key Constraints: ${foreignKeys.length}`);
    foreignKeys.forEach(fk => {
      console.log(`    - ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    
    console.log('\n🎉 All Database Tests Passed Successfully!');
    
  } catch (error) {
    console.error('\n❌ Database Test Failed:');
    console.error(error);
    process.exit(1);
  } finally {
    // Graceful shutdown
    console.log('\n🔌 Closing Database Connection...');
    try {
      await database.gracefulShutdown();
      console.log('✅ Database connection closed gracefully');
    } catch (error) {
      console.error('⚠️  Error during graceful shutdown:', error);
      await database.disconnect();
    }
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testDatabaseConnection().catch(console.error);
}

export { testDatabaseConnection };