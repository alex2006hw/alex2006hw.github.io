const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(function(req, res, next) {
    // Required for SharedArrayBuffer (SQL.js)
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    
    // CHANGED: 'credentialless' allows external images/videos to load
    // while maintaining the security context needed for the DB.
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    next();
  });
};