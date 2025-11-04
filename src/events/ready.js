const config = require("../../config.json");

module.exports = {
  name: "clientReady", // Fix: Rename from "ready"
  once: true,
  execute(client) {
    console.log(`⭐ Bot ready on ${client.guilds.cache.size} servers!`);
    client.user.setActivity(config.bot.status, { type: "PLAYING" });
  },
};
