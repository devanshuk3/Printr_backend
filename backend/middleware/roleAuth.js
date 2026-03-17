const db = require('../db');

/**
 * Middleware to check if user has required role
 * @param {String[]} allowedRoles 
 */
module.exports = function (allowedRoles) {
  return async (req, res, next) => {
    try {
      // req.user.id is set by auth middleware
      const result = await db.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'User verification failed' });
      }

      const userRole = result.rows[0].role;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
      }

      next();
    } catch (err) {
      console.error('Role Middleware Error:', err);
      res.status(500).json({ message: 'Server security error' });
    }
  };
};
