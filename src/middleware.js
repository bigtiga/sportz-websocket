import { z } from 'zod';

export function validate(schema) {
  return (req, res, next) => {
    try {
      // Validate request body
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors?.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })) || [{ message: 'Invalid data provided' }],
        });
      }
      // Handle other errors
      return res.status(400).json({
        error: 'Validation failed',
        message: error.message || 'Invalid data provided',
      });
    }
  };
}
