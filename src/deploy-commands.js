require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commandsPath = path.join(__dirname, "commands");
console.log(`🔍 Checking path: ${commandsPath}`);

const commandArray = [];

if (fs.existsSync(commandsPath)) {
  console.log("✅ Commands folder found.");
  const commandFolders = fs.readdirSync(commandsPath);
  console.log(`Folders: ${commandFolders.join(", ")}`);
  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.existsSync(folderPath)) continue;
    const commandFiles = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith(".js"));
    console.log(`Files in ${folder}: ${commandFiles.join(", ")}`);
    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      try {
        const command = require(filePath);
        if (command.data) {
          // Check export data
          commandArray.push(command.data.toJSON());
          console.log(`✅ Loaded ${file} (name: ${command.data.name})`);
        } else {
          console.error(
            `❌ ${file} missing export { data: SlashCommandBuilder }`
          );
        }
      } catch (requireErr) {
        console.error(`❌ Require error in ${file}: ${requireErr.message}`);
      }
    }
  }
} else {
  console.error("❌ Commands folder not found! Path: " + commandsPath);
  process.exit(1);
}

if (commandArray.length === 0) {
  console.error(
    "❌ No commands loaded! Check src/commands/user/quiz.js export and syntax."
  );
  process.exit(1);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  const guildId = process.env.GUILD_ID;
  const clientId = process.env.CLIENT_ID;
  console.log(`🔄 Deploying to guild ID: ${guildId}, app ID: ${clientId}`);
  console.log(
    `Commands to deploy: ${commandArray.map((c) => c.name).join(", ")}`
  );

  try {
    // DELETE old commands trước (force re-register, clear conflict)
    console.log("🗑️ Deleting old guild commands...");
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] } // Empty array = delete all
    );
    console.log("✅ Old commands deleted.");

    // PUT new commands
    console.log("📤 Registering new commands...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandArray,
    });
    console.log(
      `✅ Deployed guild-specific! (${commandArray.length} commands). Wait 1-5 min for sync.`
    );
  } catch (error) {
    console.error("❌ Deploy failed:", error);
    if (error.code === 50001) {
      console.error(
        "🔧 Fix: Bot lacks 'applications.commands' permission in guild. Check Integrations > Bots > Permissions."
      );
    } else if (error.code === 50035) {
      console.error("🔧 Fix: Invalid CLIENT_ID or GUILD_ID in .env.");
    }
    process.exit(1);
  }
})();
