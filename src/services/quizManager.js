const { initDatabase } = require("../utils/database");
const {
  logger,
  logQuizCreated,
  logQuizStarted,
  logAnswer,
  logScore,
  logQuizCompleted,
} = require("../utils/logger");
const config = require("../../config.json");
const crypto = require("crypto");
const { Op } = require("sequelize"); // Fix: Import Op

const { validateCategory, validateQuizParams } = require("./quizValidator");
const {
  createQuizEmbed,
  startCountdownEmbed,
  questionEmbed,
  showQuestionResultsEmbed,
  noParticipantsEmbed,
  endQuizEmbed,
} = require("./quizEmbeds");
const { addReactions, createCollector } = require("./quizReactions");
const { calculateScores, calculateFinalStats } = require("./quizScoring");

let db; // Global instance

const generateQuizId = () =>
  `QZ_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

async function initManager() {
  const dbInstance = await initDatabase();
  db = dbInstance;
  return dbInstance;
}

async function createQuiz(
  interaction,
  category,
  questions_count = 10,
  time_per_question = 20,
  channelId = interaction.channel.id
) {
  try {
    const quizId = generateQuizId();
    const {
      user: { id, username },
      guild: { id: serverId, name },
    } = interaction;

    category = validateCategory(category);
    ({ questions_count, time_per_question } = validateQuizParams(
      questions_count,
      time_per_question
    ));

    const activeQuiz = await db.Quiz.findOne({
      where: {
        server_id: serverId,
        status: { [Op.in]: ["starting", "running"] },
      }, // Use Op.in for array
    });
    if (activeQuiz)
      return interaction.editReply(
        `❌ Đã có quiz đang chạy! (ID: ${activeQuiz.id})`
      );

    const newQuiz = await db.Quiz.create({
      id: quizId,
      server_id: serverId,
      creator_id: id,
      creator_username: username,
      category,
      questions_count,
      time_per_question,
      channel_id: channelId,
      status: "created",
    });
    logQuizCreated({
      quiz_id: quizId,
      creator_id: id,
      creator_username: username,
      server_id: serverId,
      server_name: name,
      category,
      questions_count,
      time_per_question,
      channel_id: channelId,
    });

    const embed = createQuizEmbed(
      quizId,
      category,
      questions_count,
      time_per_question,
      channelId
    );
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("Create quiz error:", err);
    await interaction.editReply("❌ Lỗi tạo quiz!");
  }
}

async function startQuiz(interaction, quizId) {
  try {
    const quiz = await db.Quiz.findOne({
      where: { id: quizId, status: "created" },
    });
    if (!quiz)
      return interaction.editReply("❌ Không tìm thấy quiz với ID này!");

    await quiz.update({ status: "starting", started_at: new Date() });

    const channel = interaction.guild.channels.cache.get(quiz.channel_id);
    if (!channel) return interaction.editReply("❌ Channel không tồn tại!");

    let count = config.quiz.countdown_duration;
    const msg = await channel.send({
      embeds: [startCountdownEmbed(quiz, count)],
    });
    await channel.send("@everyone");

    const countdownInterval = setInterval(async () => {
      count--;
      if (count > 0) {
        await msg.edit({ embeds: [startCountdownEmbed(quiz, count)] });
      } else {
        clearInterval(countdownInterval);
        await msg.edit({ embeds: [startCountdownEmbed(quiz, 0, true)] });
        await quiz.update({ status: "running" });
        logQuizStarted({
          quiz_id: quizId,
          started_at: new Date().toISOString(),
          initial_participants: 0,
        });
        setTimeout(() => startQuestionRound(quizId, 1, channel, quiz), 2000);
      }
    }, 1000);

    await interaction.editReply("✅ Quiz đang bắt đầu!");
  } catch (err) {
    console.error("Start quiz error:", err);
    const reply =
      !interaction.replied && !interaction.deferred
        ? interaction.reply
        : interaction.editReply;
    await reply("❌ Lỗi bắt đầu quiz!");
  }
}

async function startQuestionRound(quizId, questionNumber, channel, quiz) {
  let timerInterval;
  try {
    const participants = await db.QuizParticipant.findAll({
      where: { quiz_id: quizId },
      attributes: ["user_id"],
    });
    const participantIds = participants.map((p) => p.user_id);
    console.log(
      `🔍 Debug: Participants IDs: [${participantIds.join(", ")}] | Total: ${
        participantIds.length
      }`
    );
    const usedQuestions = await db.UsedQuestion.findAll({
      where: { quiz_id: quizId },
      attributes: ["question_id"],
    });
    const usedIds = usedQuestions.map((u) => u.question_id);
    console.log(
      `🔍 Debug: Used IDs for Q${questionNumber}: [${usedIds.join(", ")}]`
    );

    const whereClause =
      usedIds.length > 0 ? { id: { [Op.notIn]: usedIds } } : {}; // Fix: Use imported Op
    const question = await db.Question.findOne({
      where: { ...whereClause, category: quiz.category },
      order: db.sequelize.literal("RANDOM()"),
    });
    if (!question) {
      console.error(
        `❌ No question for Q${questionNumber} in category "${quiz.category}"`
      );
      const availCount = await db.Question.count({
        where: { category: quiz.category },
      });
      console.log(
        `🔍 Available questions in "${quiz.category}": ${availCount}`
      );
      console.log(
        `💡 Suggestion: Run "npm run load-data" và check category match in config.categories.`
      );
      return channel.send(
        `❌ Không còn câu hỏi cho category "${
          config.categories[quiz.category]
        }"! Quiz dừng. (Admin: Load data lại.)`
      );
    }

    await db.UsedQuestion.create({ quiz_id: quizId, question_id: question.id });
    console.log(
      `✅ Selected Q${question.id}: ${question.question_text.substring(
        0,
        50
      )}...`
    );

    const embed = questionEmbed(question, questionNumber, quiz);
    const message = await channel.send({ embeds: [embed] });
    await addReactions(message);

    const { collector, answers } = createCollector(
      message,
      quiz.time_per_question,
      quizId,
      questionNumber,
      logAnswer
    );

    let timeLeft = quiz.time_per_question;
    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0 && !collector.ended) {
        const updatedEmbed = questionEmbed(
          question,
          questionNumber,
          quiz,
          timeLeft
        );
        message.edit({ embeds: [updatedEmbed] }).catch(console.error);
      } else {
        clearInterval(timerInterval);
      }
    }, 1000);

    collector.on("end", async () => {
      console.log(`Collector ended`);
      clearInterval(timerInterval);
      try {
        await calculateScores(
          quizId,
          question.id,
          questionNumber,
          question.correct_answer,
          answers,
          quiz.time_per_question,
          db
        );
        const resultsEmbed = showQuestionResultsEmbed(
          questionNumber,
          question.dataValues,
          answers,
          quiz.time_per_question
        );
        await channel.send({ embeds: [resultsEmbed] });
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (questionNumber < quiz.questions_count) {
          startQuestionRound(quizId, questionNumber + 1, channel, quiz);
        } else {
          endQuiz(quizId, channel, quiz);
        }
      } catch (scoreErr) {
        console.error("Score/Results error:", scoreErr);
        channel.send("❌ Lỗi tính điểm! Quiz dừng.");
      }
    });
  } catch (err) {
    console.error("Start question round error:", err);
    if (timerInterval) clearInterval(timerInterval);
    channel.send("❌ Lỗi round câu hỏi!");
  }
}

async function endQuiz(quizId, channel, quiz) {
  try {
    const { finalScores, totalParticipants, avgCorrect, avgTime } =
      await calculateFinalStats(quizId, quiz, db);

    if (finalScores.length === 0) {
      const noParticipantsEmbedResult = noParticipantsEmbed(quizId, quiz);
      await channel.send({ embeds: [noParticipantsEmbedResult] });
      channel.send(
        "Cảm ơn các bạn đã tham gia! 🎉 Hẹn gặp lại ở quiz tiếp theo! 🏁"
      );
      await db.dbRun(
        'UPDATE quizzes SET status = "finished", finished_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quizId]
      );
      return;
    }

    const totalCorrect = finalScores.reduce(
      (sum, s) => sum + s.correct_answers,
      0
    );
    const avgCorrectFinal =
      totalParticipants > 0
        ? Math.round(
            (totalCorrect / totalParticipants / quiz.questions_count) * 100 * 10
          ) / 10
        : 0;
    const avgTimeFinal = avgTime;

    logQuizCompleted({
      quiz_id: quizId,
      completed_at: new Date().toISOString(),
      total_participants: totalParticipants,
      avg_score:
        totalParticipants > 0
          ? finalScores.reduce((sum, s) => sum + s.total_score, 0) /
            totalParticipants
          : 0,
      avg_correct_rate: avgCorrectFinal,
      top_3: finalScores.map((s) => ({
        user_id: s.user_id,
        username: s.username,
        score: s.total_score,
      })),
      duration_seconds: (new Date() - new Date(quiz.started_at)) / 1000,
    });

    const embed = endQuizEmbed(
      quizId,
      quiz,
      finalScores,
      totalParticipants,
      avgCorrectFinal,
      avgTimeFinal
    );

    // Award chỉ top 3
    if (finalScores[0]) {
      const top1Member = channel.guild.members.cache.get(
        finalScores[0].user_id
      );
      if (top1Member) {
        const championRole = channel.guild.roles.cache.find(
          (r) => r.name === config.roles.quiz_champion
        );
        if (championRole) top1Member.roles.add(championRole);
        console.log(
          `Awarded Top1: ${finalScores[0].user_id} - Role + ${config.rewards.top_1.coins} coins`
        );
      }
    }
    if (finalScores[1])
      console.log(
        `Awarded Top2: ${finalScores[1].user_id} - ${config.rewards.top_2.coins} coins`
      );
    if (finalScores[2])
      console.log(
        `Awarded Top3: ${finalScores[2].user_id} - ${config.rewards.top_3.coins} coins`
      );

    await channel.send({ embeds: [embed] });
    channel.send(
      "Cảm ơn các bạn đã tham gia! 🎉 Hẹn gặp lại ở quiz tiếp theo! 🏁"
    );
    await db.dbRun(
      'UPDATE quizzes SET status = "finished", finished_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quizId]
    );
  } catch (err) {
    console.error("End quiz error:", err);
    channel.send("❌ Lỗi kết thúc quiz!");
  }
}

async function stopQuiz(interaction) {
  try {
    const serverId = interaction.guild.id;
    const activeQuiz = await db.dbQuery(
      'SELECT id, channel_id FROM quizzes WHERE server_id = ? AND status IN ("starting", "running")',
      [serverId]
    );
    if (!activeQuiz)
      return interaction.editReply("❌ Không có quiz đang chạy!");

    await db.dbRun(
      'UPDATE quizzes SET status = "stopped", finished_at = CURRENT_TIMESTAMP WHERE id = ?',
      [activeQuiz.id]
    );
    const channel = interaction.guild.channels.cache.get(activeQuiz.channel_id);
    if (channel) channel.send(`🛑 Quiz ${activeQuiz.id} đã bị dừng!`);
    await interaction.editReply(`✅ Đã dừng quiz ${activeQuiz.id}!`);
  } catch (err) {
    console.error("Stop quiz error:", err);
    const reply =
      !interaction.replied && !interaction.deferred
        ? interaction.reply
        : interaction.editReply;
    await reply("❌ Lỗi dừng quiz!");
  }
}

async function joinQuiz(interaction, quizId) {
  try {
    const quiz = await db.dbQuery(
      'SELECT * FROM quizzes WHERE id = ? AND status = "running"',
      [quizId]
    );
    if (!quiz) return interaction.reply("❌ Không có quiz đang chạy!");
    await db.QuizParticipant.upsert({
      // Fix: Use model upsert for FK safe
      quiz_id: quizId,
      user_id: interaction.user.id,
      username: interaction.user.username,
      total_score: 0,
      correct_answers: 0,
    });
    console.log(`✅ Join logged: User ${interaction.user.id} joined ${quizId}`);
    await interaction.user.send("✅ Bạn đã tham gia quiz!");
    interaction.reply({ content: "✅ Đã tham gia!", ephemeral: true });
  } catch (err) {
    console.error("Join error:", err);
    interaction.reply("❌ Lỗi tham gia!");
  }
}

module.exports = {
  initManager,
  createQuiz,
  startQuiz,
  stopQuiz,
  joinQuiz,
};
