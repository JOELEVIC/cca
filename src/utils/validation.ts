import { z } from 'zod';
import { ValidationError } from '../types/index.js';

/**
 * Validate data against a Zod schema
 */
export const validate = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = (error as any).errors.map((err: any) => `${err.path.join('.')}: ${err.message}`);
      throw new ValidationError(messages.join(', '));
    }
    throw error;
  }
};

/**
 * Safe parse that returns result with errors
 */
export const safeValidate = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: string[] } => {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = (result.error as any).errors.map((err: any) => `${err.path.join('.')}: ${err.message}`);
  return { success: false, errors };
};

// Common validation schemas
export const idSchema = z.string().uuid('Invalid ID format');
export const emailSchema = z.string().email('Invalid email format');
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters');
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must not exceed 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores');
