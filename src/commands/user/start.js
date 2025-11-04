const { SlashCommandSubcommandBuilder } = require("discord.js"); // Fix: SubcommandBuilder
const { startQuiz } = require("../../services/quizManager");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("start")
    .setDescription("Bắt đầu quiz đã tạo")
    .addStringOption((option) =>
      option
        .setName("quiz_id")
        .setDescription("ID quiz cần start (từ /create)")
        .setRequired(true)
    ),
  async execute(interaction, hasPerms) {
    if (!hasPerms) {
      return interaction.editReply("❌ Bạn không có quyền start quiz!");
    }
    const quizId = interaction.options.getString("quiz_id");
    await startQuiz(interaction, quizId);
  },
};
