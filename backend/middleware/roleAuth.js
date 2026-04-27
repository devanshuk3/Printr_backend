const db = require('../db');

/**
 * Middleware to check if user has required role
 * @param {String[]} allowedRoles 
 */
module.exports = function (allowedRoles) {
  return async (req, res, next) => {
    try {
      // req.user is set by auth middleware and now includes the role claim
      if (!req.user || !req.user.role) {
        return res.status(401).json({ message: 'User verification failed' });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
      }

      next();
    } catch (err) {
      console.error('Role Middleware Error:', err);
      res.status(500).json({ message: 'Server security error' });
    }
  };
};
