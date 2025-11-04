const { SlashCommandSubcommandBuilder } = require("discord.js"); // Fix: SubcommandBuilder
const { stopQuiz } = require("../../services/quizManager");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("stop")
    .setDescription("Dừng quiz đang chạy"),
  async execute(interaction, hasPerms) {
    if (!hasPerms) {
      return interaction.editReply("❌ Bạn không có quyền dừng quiz!");
    }
    await stopQuiz(interaction);
  },
};
