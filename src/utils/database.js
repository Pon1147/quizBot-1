const {
  sequelize,
  Quiz,
  Question,
  QuizParticipant,
  QuizAnswer,
  UsedQuestion,
} = require("../models");

async function initDatabase() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({
      /* alter: true removed */
    }); // Plain sync, no alter/force
    console.log("✅ Sequelize DB connected and synced.");
    return {
      sequelize,
      Quiz,
      Question,
      QuizParticipant,
      QuizAnswer,
      UsedQuestion,
      dbRun: async (sql, params = []) =>
        sequelize.query(sql, {
          replacements: params,
          type: sequelize.QueryTypes.UPDATE,
        }),
      dbAll: async (sql, params = []) =>
        sequelize.query(sql, {
          replacements: params,
          type: sequelize.QueryTypes.SELECT,
        }),
      dbQuery: async (sql, params = []) =>
        (
          await sequelize.query(sql, {
            replacements: params,
            type: sequelize.QueryTypes.SELECT,
          })
        )[0] || null,
    };
  } catch (error) {
    console.error("❌ DB init error:", error);
    process.exit(1);
  }
}

module.exports = { initDatabase };
