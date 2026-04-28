const { ZodError } = require('zod');

/**
 * Creates an Express middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (sanitized) output.
 * On failure, returns 400 with structured validation errors.
 */
const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }
    next(err);
  }
};

/**
 * Creates an Express middleware that validates req.params against a Zod schema.
 * On success, replaces req.params with the parsed output.
 */
const validateParams = (schema) => (req, res, next) => {
  try {
    req.params = schema.parse(req.params);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }
    next(err);
  }
};

/**
 * Creates an Express middleware that validates req.query against a Zod schema.
 * On success, replaces req.query with the parsed output.
 */
const validateQuery = (schema) => (req, res, next) => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }
    next(err);
  }
};

module.exports = {
  validateBody,
  validateParams,
  validateQuery,
};
