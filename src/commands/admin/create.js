const { SlashCommandBuilder } = require("discord.js");
const { createQuiz, startQuiz } = require("../../services/quizManager"); // Import services
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
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
              { name: config.categories.vehicles, value: "vehicles" },
              { name: config.categories.maps, value: "maps" },
              { name: config.categories.gameplay, value: "gameplay" },
              { name: config.categories.items, value: "items" },
              { name: config.categories.history, value: "history" },
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("questions_count")
            .setDescription("Số câu (mặc định 10)")
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(50)
        )
        .addIntegerOption((option) =>
          option
            .setName("time_per_question")
            .setDescription("Thời gian mỗi câu (mặc định 20s)")
            .setRequired(false)
            .setMinValue(10)
            .setMaxValue(60)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel chạy quiz (mặc định hiện tại)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Bắt đầu quiz đã tạo")
        .addStringOption((option) =>
          option
            .setName("quiz_id")
            .setDescription("ID quiz cần start (từ /create)")
            .setRequired(true)
        )
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(false) || "none"; // Get subcommand an toàn
    console.log(`🔄 Executing subcommand: ${subcommand}`); // Debug log

    try {
      await interaction.deferReply({ ephemeral: false }); // Defer chung để tránh timeout

      // Handle create
      if (subcommand === "create") {
        const category = interaction.options.getString("category");
        const questions_count =
          interaction.options.getInteger("questions_count") ||
          config.quiz.default_questions_count;
        const time_per_question =
          interaction.options.getInteger("time_per_question") ||
          config.quiz.default_time_per_question;
        const channel =
          interaction.options.getChannel("channel")?.id ||
          interaction.channel.id;

        console.log("🔄 Processing create:", {
          category,
          questions_count,
          time_per_question,
        }); // Debug

        // Check perms
        if (
          !interaction.member.permissions.has("ManageGuild") &&
          interaction.user.id !== process.env.OWNER_ID
        ) {
          return interaction.editReply("❌ Bạn không có quyền tạo quiz!");
        }

        await createQuiz(
          interaction,
          category,
          questions_count,
          time_per_question,
          channel
        );
        console.log("✅ Create quiz success");
        return; // Exit sau create
      }

      // Handle start
      if (subcommand === "start") {
        const quizId = interaction.options.getString("quiz_id");

        // Check perms
        if (
          !interaction.member.permissions.has("ManageGuild") &&
          interaction.user.id !== process.env.OWNER_ID
        ) {
          return interaction.editReply("❌ Bạn không có quyền start quiz!");
        }

        console.log("🔄 Processing start:", { quizId }); // Debug
        await startQuiz(interaction, quizId);
        console.log("✅ Start quiz success");
        return; // Exit sau start
      }

      // Fallback cho subcommand khác (test hoặc tương lai)
      console.log("🔄 Fallback for subcommand:", subcommand);
      await interaction.editReply(
        "Test reply OK! (Chỉ create/start full hiện tại)"
      );
      console.log("✅ Fallback executed");
    } catch (error) {
      console.error(`❌ Execute error for ${subcommand}:`, error); // Log chi tiết
      if (interaction.deferred) {
        await interaction.editReply({
          content: `❌ Lỗi ${subcommand}: ${error.message}`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `❌ Lỗi ${subcommand}: ${error.message}`,
          ephemeral: true,
        });
      }
    }
  },
};
