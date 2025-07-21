import { Pool, PoolClient, PoolConfig } from 'pg';
import { config } from './config';

interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private readonly maxConnectionAttempts: number = 5;
  private readonly retryOptions: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  };

  private constructor() {
    const poolConfig: PoolConfig = {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl,
      max: 20, // Maximum number of clients in the pool
      min: 5,  // Minimum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection could not be established
      statement_timeout: 30000, // Abort any statement that takes more than 30 seconds
      query_timeout: 30000, // Abort any query that takes more than 30 seconds
    };

    this.pool = new Pool(poolConfig);
    this.setupEventHandlers();
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', () => {
      console.log('New database client connected');
      this.isConnected = true;
      this.connectionAttempts = 0; // Reset connection attempts on successful connection
    });

    this.pool.on('error', (err: Error) => {
      console.error('Database pool error:', err);
      this.isConnected = false;
      this.handleConnectionError(err);
    });

    this.pool.on('remove', () => {
      console.log('Database client removed from pool');
    });
  }

  private async handleConnectionError(error: Error): Promise<void> {
    console.error(`Database connection error (attempt ${this.connectionAttempts + 1}/${this.maxConnectionAttempts}):`, error);
    
    if (this.connectionAttempts < this.maxConnectionAttempts) {
      this.connectionAttempts++;
      const delay = Math.min(
        this.retryOptions.baseDelay * Math.pow(this.retryOptions.backoffMultiplier, this.connectionAttempts - 1),
        this.retryOptions.maxDelay
      );
      
      console.log(`Retrying database connection in ${delay}ms...`);
      setTimeout(() => {
        this.attemptReconnection();
      }, delay);
    } else {
      console.error('Max connection attempts reached. Database connection failed permanently.');
    }
  }

  private async attemptReconnection(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      console.error('Reconnection attempt failed:', error);
      // The error handler will be called automatically, triggering another retry if attempts remain
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'database operation'
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryOptions.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry for certain types of errors
        if (this.isNonRetryableError(error as Error)) {
          throw error;
        }
        
        if (attempt === this.retryOptions.maxRetries) {
          console.error(`${operationName} failed after ${this.retryOptions.maxRetries} attempts:`, error);
          throw error;
        }
        
        const delay = Math.min(
          this.retryOptions.baseDelay * Math.pow(this.retryOptions.backoffMultiplier, attempt - 1),
          this.retryOptions.maxDelay
        );
        
        console.warn(`${operationName} failed (attempt ${attempt}/${this.retryOptions.maxRetries}), retrying in ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  private isNonRetryableError(error: Error): boolean {
    const nonRetryableErrors = [
      'syntax error',
      'permission denied',
      'relation does not exist',
      'column does not exist',
      'duplicate key value',
      'violates foreign key constraint',
      'violates unique constraint',
      'violates check constraint',
      'table does not exist',
      'invalid sql statement',
      'intentional error to trigger rollback', // For test scenarios
    ];
    
    const errorMessage = error.message.toLowerCase();
    return nonRetryableErrors.some(pattern => errorMessage.includes(pattern));
  }

  public async connect(): Promise<void> {
    try {
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      console.log('Database connection established successfully');
    } catch (error) {
      this.isConnected = false;
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.pool.end();
        this.isConnected = false;
        console.log('Database connection closed');
      }
    } catch (error) {
      console.error('Error closing database connection:', error);
      throw error;
    }
  }

  public async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    return this.executeWithRetry(async () => {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const start = Date.now();
      let client: PoolClient | null = null;

      try {
        client = await this.pool.connect();
        const result = await client.query(text, params);
        const duration = Date.now() - start;
        
        if (duration > 1000) {
          console.warn(`Slow query detected (${duration}ms):`, text);
        }

        return result.rows;
      } catch (error) {
        console.error('Database query error:', error);
        console.error('Query:', text);
        console.error('Params:', params);
        throw error;
      } finally {
        if (client) {
          client.release();
        }
      }
    }, `query: ${text.substring(0, 50)}...`);
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.executeWithRetry(async () => {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const client = await this.pool.connect();
      
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Error during transaction rollback:', rollbackError);
        }
        throw error;
      } finally {
        client.release();
      }
    }, 'transaction');
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  public getPoolStatus(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  public isHealthy(): boolean {
    return this.isConnected;
  }

  public getConnectionInfo(): {
    isConnected: boolean;
    connectionAttempts: number;
    maxConnectionAttempts: number;
    poolStatus: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
  } {
    return {
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      maxConnectionAttempts: this.maxConnectionAttempts,
      poolStatus: this.getPoolStatus(),
    };
  }

  public async testConnection(): Promise<{
    success: boolean;
    responseTime: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      await this.query('SELECT 1 as test');
      return {
        success: true,
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - start,
        error: (error as Error).message,
      };
    }
  }

  public async gracefulShutdown(): Promise<void> {
    console.log('Initiating graceful database shutdown...');
    
    try {
      // Wait for active connections to finish (with timeout)
      const shutdownTimeout = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (this.pool.totalCount > this.pool.idleCount && (Date.now() - startTime) < shutdownTimeout) {
        console.log(`Waiting for ${this.pool.totalCount - this.pool.idleCount} active connections to finish...`);
        await this.sleep(1000);
      }
      
      await this.disconnect();
      console.log('Database shutdown completed successfully');
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const database = DatabaseConnection.getInstance();