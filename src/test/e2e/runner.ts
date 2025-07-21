#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { TestDataGenerator } from './data/TestDataGenerator';

interface TestSuite {
  name: string;
  pattern: string;
  timeout: number;
  parallel?: boolean;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Unit Tests',
    pattern: 'src/test/**/*.test.ts',
    timeout: 30000,
    parallel: true
  },
  {
    name: 'Integration Tests',
    pattern: 'src/test/integration/**/*.test.ts',
    timeout: 60000,
    parallel: true
  },
  {
    name: 'E2E Workflow Tests',
    pattern: 'src/test/e2e/workflows/**/*.test.ts',
    timeout: 120000,
    parallel: false
  },
  {
    name: 'Performance Tests',
    pattern: 'src/test/e2e/performance/**/*.test.ts',
    timeout: 180000,
    parallel: false
  },
  {
    name: 'CI Pipeline Tests',
    pattern: 'src/test/e2e/ci/**/*.test.ts',
    timeout: 90000,
    parallel: false
  }
];

class TestRunner {
  private dbPool: Pool;
  private redisClient: any;
  private testDataGenerator: TestDataGenerator;

  constructor() {
    this.dbPool = new Pool({
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'skybound_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'password',
    });

    this.redisClient = createClient({
      url: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1'
    });

    this.testDataGenerator = new TestDataGenerator(this.dbPool, this.redisClient);
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing test environment...');
    
    try {
      // Connect to Redis
      await this.redisClient.connect();
      console.log('✅ Redis connection established');

      // Test database connection
      await this.dbPool.query('SELECT 1');
      console.log('✅ Database connection established');

      // Setup test database schema
      await this.setupTestSchema();
      console.log('✅ Test database schema ready');

    } catch (error) {
      console.error('❌ Failed to initialize test environment:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
    
    try {
      await this.testDataGenerator.cleanupTestData();
      await this.redisClient.quit();
      await this.dbPool.end();
      console.log('✅ Test environment cleaned up');
    } catch (error) {
      console.error('❌ Failed to cleanup test environment:', error);
    }
  }

  async runTestSuite(suite: TestSuite): Promise<boolean> {
    console.log(`\n🧪 Running ${suite.name}...`);
    console.log(`   Pattern: ${suite.pattern}`);
    console.log(`   Timeout: ${suite.timeout}ms`);
    console.log(`   Parallel: ${suite.parallel ? 'Yes' : 'No'}`);

    const args = [
      '--run',
      '--testTimeout', suite.timeout.toString(),
      suite.pattern
    ];

    if (!suite.parallel) {
      args.push('--no-threads');
    }

    return new Promise((resolve) => {
      const vitest = spawn('npx', ['vitest', ...args], {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test'
        }
      });

      vitest.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ ${suite.name} passed`);
          resolve(true);
        } else {
          console.log(`❌ ${suite.name} failed with code ${code}`);
          resolve(false);
        }
      });

      vitest.on('error', (error) => {
        console.error(`❌ ${suite.name} error:`, error);
        resolve(false);
      });
    });
  }

  async runAllTests(): Promise<void> {
    const startTime = Date.now();
    let totalPassed = 0;
    let totalFailed = 0;

    console.log('🎯 Starting comprehensive test suite...\n');

    for (const suite of TEST_SUITES) {
      const success = await this.runTestSuite(suite);
      if (success) {
        totalPassed++;
      } else {
        totalFailed++;
      }
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    console.log('\n📊 Test Results Summary:');
    console.log(`   Total Suites: ${TEST_SUITES.length}`);
    console.log(`   Passed: ${totalPassed}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Total Time: ${(totalTime / 1000).toFixed(2)}s`);

    if (totalFailed > 0) {
      console.log('\n❌ Some test suites failed');
      process.exit(1);
    } else {
      console.log('\n✅ All test suites passed!');
      process.exit(0);
    }
  }

  async runSpecificSuite(suiteName: string): Promise<void> {
    const suite = TEST_SUITES.find(s => s.name.toLowerCase().includes(suiteName.toLowerCase()));
    
    if (!suite) {
      console.error(`❌ Test suite "${suiteName}" not found`);
      console.log('Available suites:');
      TEST_SUITES.forEach(s => console.log(`  - ${s.name}`));
      process.exit(1);
    }

    const success = await this.runTestSuite(suite);
    process.exit(success ? 0 : 1);
  }

  async generateTestData(): Promise<void> {
    console.log('📊 Generating test data...');
    await this.testDataGenerator.seedDatabase();
    console.log('✅ Test data generated successfully');
  }

  private async setupTestSchema(): Promise<void> {
    // Create basic test tables if they don't exist
    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        skills JSONB DEFAULT '{}',
        inventory JSONB DEFAULT '[]',
        currency JSONB DEFAULT '{"coins": 1000}',
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        last_login TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        settings JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS islands (
        id VARCHAR(255) PRIMARY KEY,
        owner_id VARCHAR(255) REFERENCES players(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        expansion_level INTEGER DEFAULT 1,
        size JSONB DEFAULT '{"x": 64, "y": 64, "z": 64}',
        permissions JSONB DEFAULT '{}',
        visit_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        last_modified TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS island_chunks (
        island_id VARCHAR(255) REFERENCES islands(id) ON DELETE CASCADE,
        chunk_x INTEGER NOT NULL,
        chunk_y INTEGER NOT NULL,
        chunk_z INTEGER NOT NULL,
        voxel_data BYTEA,
        entities JSONB DEFAULT '[]',
        last_modified TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (island_id, chunk_x, chunk_y, chunk_z)
      );

      CREATE TABLE IF NOT EXISTS guilds (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        leader_id VARCHAR(255) REFERENCES players(id),
        member_limit INTEGER DEFAULT 50,
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        perks JSONB DEFAULT '{}',
        treasury JSONB DEFAULT '{"coins": 0}',
        created_at TIMESTAMP DEFAULT NOW(),
        settings JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS guild_members (
        guild_id VARCHAR(255) REFERENCES guilds(id) ON DELETE CASCADE,
        player_id VARCHAR(255) REFERENCES players(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (guild_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS items (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(100) NOT NULL,
        rarity VARCHAR(50) DEFAULT 'common',
        stack_size INTEGER DEFAULT 1,
        value INTEGER DEFAULT 0,
        stats JSONB DEFAULT '{}',
        crafting_recipe JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS market_listings (
        id VARCHAR(255) PRIMARY KEY,
        seller_id VARCHAR(255) REFERENCES players(id) ON DELETE CASCADE,
        item_id VARCHAR(255) REFERENCES items(id),
        quantity INTEGER NOT NULL,
        price_per_unit INTEGER NOT NULL,
        total_price INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        listed_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        category VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(255) PRIMARY KEY,
        buyer_id VARCHAR(255) REFERENCES players(id),
        seller_id VARCHAR(255) REFERENCES players(id),
        listing_id VARCHAR(255),
        item_id VARCHAR(255) REFERENCES items(id),
        quantity INTEGER NOT NULL,
        price_per_unit INTEGER NOT NULL,
        total_amount INTEGER NOT NULL,
        market_fee INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'completed'
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);
      CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
      CREATE INDEX IF NOT EXISTS idx_islands_owner ON islands(owner_id);
      CREATE INDEX IF NOT EXISTS idx_guild_members_player ON guild_members(player_id);
      CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_seller ON transactions(seller_id);
    `;

    await this.dbPool.query(createTablesSQL);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const runner = new TestRunner();

  try {
    await runner.initialize();

    switch (command) {
      case 'all':
        await runner.runAllTests();
        break;
      case 'suite':
        if (!args[1]) {
          console.error('❌ Please specify a suite name');
          process.exit(1);
        }
        await runner.runSpecificSuite(args[1]);
        break;
      case 'data':
        await runner.generateTestData();
        break;
      case 'cleanup':
        await runner.cleanup();
        break;
      default:
        console.log('Usage:');
        console.log('  npm run test:e2e all          - Run all test suites');
        console.log('  npm run test:e2e suite <name> - Run specific test suite');
        console.log('  npm run test:e2e data         - Generate test data');
        console.log('  npm run test:e2e cleanup      - Cleanup test environment');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  } finally {
    await runner.cleanup();
  }
}

if (require.main === module) {
  main();
}

export { TestRunner };