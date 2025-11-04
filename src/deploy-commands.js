require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Quản lý quiz ZingSpeed Mobile")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Tạo quiz mới")
        .addStringOption((option) =>
          option
            .setName("category")
            .setDescription("Loại câu hỏi")
            .setRequired(true)
            .addChoices(
              { name: "Xe cộ", value: "vehicles" },
              { name: "Bản đồ", value: "maps" },
              { name: "Lối chơi", value: "gameplay" },
              { name: "Vật phẩm", value: "items" },
              { name: "Lịch sử game", value: "history" },
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("questions_count")
            .setDescription("Số câu (5-50)")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("time_per_question")
            .setDescription("Thời gian mỗi câu (10-60s)")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel chạy quiz")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Bắt đầu quiz")
        .addStringOption((option) =>
          option
            .setName("quiz_id")
            .setDescription("ID quiz cần start")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stop").setDescription("Dừng quiz đang chạy")
    )
    .toJSON(),
].map((command) => command);

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Deploying slash commands to guild...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ Deployed guild-specific!");
  } catch (error) {
    console.error("❌ Deploy failed:", error);
  }
})();
