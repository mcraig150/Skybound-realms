import { PoolClient } from 'pg';
import { database } from '../shared/database';

export interface BaseRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(entity: Omit<T, 'id'>): Promise<T>;
  update(id: ID, entity: Partial<T>): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
}

export abstract class AbstractRepository<T, ID = string> implements BaseRepository<T, ID> {
  protected abstract tableName: string;

  abstract findById(id: ID): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract create(entity: Omit<T, 'id'>): Promise<T>;
  abstract update(id: ID, entity: Partial<T>): Promise<T | null>;
  abstract delete(id: ID): Promise<boolean>;

  protected async executeQuery<R = any>(query: string, params?: any[]): Promise<R[]> {
    return database.query<R>(query, params);
  }

  public async executeTransaction<R>(callback: (client: PoolClient) => Promise<R>): Promise<R> {
    return database.transaction(callback);
  }

  protected buildUpdateQuery(tableName: string, updates: Record<string, any>, idField: string = 'id'): {
    query: string;
    params: any[];
  } {
    const fields = Object.keys(updates).filter(key => updates[key] !== undefined);
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const query = `UPDATE ${tableName} SET ${setClause} WHERE ${idField} = $${fields.length + 1} RETURNING *`;
    const params = [...fields.map(field => updates[field]), updates[idField]];

    return { query, params };
  }

  protected buildInsertQuery(tableName: string, data: Record<string, any>): {
    query: string;
    params: any[];
  } {
    const fields = Object.keys(data).filter(key => data[key] !== undefined);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const query = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const params = fields.map(field => data[field]);

    return { query, params };
  }
}