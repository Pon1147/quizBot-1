const { SlashCommandBuilder } = require("discord.js");
const {
  createQuiz,
  startQuiz,
  stopQuiz,
  joinQuiz,
} = require("../../services/quizManager");
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
              { name: config.categories.history, value: "history" }
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
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stop").setDescription("Dừng quiz đang chạy")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("join")
        .setDescription("Tham gia quiz đang chạy")
        .addStringOption((option) =>
          option
            .setName("quiz_id")
            .setDescription("ID quiz cần join (từ /create)")
            .setRequired(true)
        )
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(true); // Bắt buộc subcommand
    console.log(`🔄 Executing subcommand: ${subcommand}`);

    try {
      await interaction.deferReply({ ephemeral: false });

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
        return;
      }

      if (subcommand === "start") {
        const quizId = interaction.options.getString("quiz_id");

        if (
          !interaction.member.permissions.has("ManageGuild") &&
          interaction.user.id !== process.env.OWNER_ID
        ) {
          return interaction.editReply("❌ Bạn không có quyền start quiz!");
        }

        await startQuiz(interaction, quizId);
        return;
      }

      if (subcommand === "stop") {
        if (
          !interaction.member.permissions.has("ManageGuild") &&
          interaction.user.id !== process.env.OWNER_ID
        ) {
          return interaction.editReply("❌ Bạn không có quyền dừng quiz!");
        }

        await stopQuiz(interaction);
        return;
      }

      if (subcommand === "join") {
        const quizId = interaction.options.getString("quiz_id");
        await joinQuiz(interaction, quizId);
        return;
      }

      // Không cần fallback vì subcommand bắt buộc (Discord sẽ không cho dùng lệnh sai)
      throw new Error(`Subcommand ${subcommand} không hỗ trợ!`);
    } catch (error) {
      console.error(`❌ Execute error for ${subcommand}:`, error);
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
