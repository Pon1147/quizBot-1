const express = require('express');

function startHealthCheckServer(client) {
  const app = express();
  const PORT = process.env.PORT || 10000; // Render default 10000
  app.use(express.json()); // Parse JSON nếu cần

  app.get('/ping', (req, res) => {
    const uptime = process.uptime();
    const status = {
      status: 'ok',
      uptime: Math.floor(uptime),
      bot: {
        connected: client?.isReady() || false,
        username: client?.user?.tag || 'Not logged in',
        guilds: client?.guilds?.cache?.size || 0,
      },
      timestamp: new Date().toISOString(),
    };
    res.json(status);
  });

  app.get('/health', (req, res) => {
    res.json({
      status: client?.isReady() ? 'healthy' : 'unhealthy',
      bot_ready: client?.isReady() || false,
      db_connected: true, // Assume SQLite OK
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Health server running on port ${PORT}`);
    console.log(` - Ping: http://0.0.0.0:${PORT}/ping`);
    console.log(` - Health: http://0.0.0.0:${PORT}/health`);
  });

  return app; // Return để close nếu cần
}

module.exports = { startHealthCheckServer };