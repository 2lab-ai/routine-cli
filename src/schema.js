import { z } from 'zod';

// Safe name pattern (alphanumeric, dash, underscore, dot - no path traversal)
const SafeNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const SafeName = z.string().min(1).max(128).refine(
  (s) => SafeNamePattern.test(s),
  { message: 'Name must be alphanumeric (may include ._-), no spaces or special chars' }
);

// Step schemas
const ExecStepSchema = z.object({
  name: SafeName,
  type: z.literal('exec'),
  command: z.string().min(1),
  workdir: z.string().optional(),
  timeout: z.number().positive().optional().default(30000),
});

const SleepStepSchema = z.object({
  name: SafeName,
  type: z.literal('sleep'),
  duration: z.number().positive(),
});

const HttpStepSchema = z.object({
  name: SafeName,
  type: z.literal('http'),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  timeout: z.number().positive().optional().default(30000),
});

const StepSchema = z.discriminatedUnion('type', [
  ExecStepSchema,
  SleepStepSchema,
  HttpStepSchema,
]);

// Main routine schema
export const RoutineSchema = z.object({
  name: SafeName,
  description: z.string().optional(),
  steps: z.array(StepSchema).min(1),
});

/**
 * Validate a routine object against the schema
 * @param {object} data - Routine data to validate
 * @returns {{ success: boolean, data?: object, errors?: string[] }}
 */
export function validateRoutine(data) {
  const result = RoutineSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    return `${path}: ${issue.message}`;
  });
  
  return { success: false, errors };
}
