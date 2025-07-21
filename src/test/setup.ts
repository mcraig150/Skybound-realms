// Test setup file for Vitest
import { beforeAll, afterAll, afterEach } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test configuration
if (!process.env.VERBOSE_TESTS) {
  // Suppress console.log in tests unless explicitly needed
  console.log = (): void => {};
}

// Setup test database connection if needed
beforeAll(async () => {
  // Initialize test database connection
  // This will be implemented when we add database layer
});

afterAll(async () => {
  // Clean up test database connection
  // This will be implemented when we add database layer
});

// Clean up after each test
afterEach(() => {
  // Reset any test state
  // This will be expanded when we add more test utilities
});