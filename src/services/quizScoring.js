const { Op } = require("sequelize");
const { logScore } = require("../utils/logger");

module.exports = {
  calculateScores: async (
    quizId,
    questionId,
    questionNumber,
    correctAnswer,
    answers,
    timeLimit,
    db
  ) => {
    if (answers.length === 0) {
      console.log(`⚠️ No answers for Q${questionNumber} - Skipping scores`);
      return;
    }
    const multiplier = 1.0;
    const participants = await db.QuizParticipant.findAll({
      where: { quiz_id: quizId },
      attributes: ["user_id"],
    });
    const participantIds = participants.map((p) => p.user_id);
    console.log(
      `🔍 Debug: Fresh participants for scores: [${participantIds.join(
        ", "
      )}] | Total: ${participantIds.length}`
    );

    for (const ans of answers) {
      try {
        // Auto-join via reaction answer (logic ban đầu)
        if (!participantIds.includes(ans.user_id)) {
          console.log(
            `🔍 Debug: Auto-joining ${ans.user_id} (${ans.username}) via reaction`
          );
          await db.QuizParticipant.upsert({
            quiz_id: quizId,
            user_id: ans.user_id,
            username: ans.username,
            total_score: 0,
            correct_answers: 0,
          });
          participantIds.push(ans.user_id);
        }

        let points = 0,
          isCorrect = 0;
        if (ans.answer.toUpperCase() === correctAnswer.toUpperCase()) {
          const timeBonus = Math.max(
            0,
            (timeLimit - ans.time_taken) / timeLimit
          );
          points = Math.floor(100 * (0.5 + 0.5 * timeBonus) * multiplier);
          isCorrect = 1;
          console.log(
            `✅ Correct! User ${ans.user_id} gets ${points} points (time: ${ans.time_taken}s)`
          );
        } else {
          console.log(
            `❌ Wrong! User ${ans.user_id} answer ${ans.answer} vs correct ${correctAnswer}`
          );
        }

        // Fix: Model create QuizAnswer (auto FK, no skip)
        try {
          await db.QuizAnswer.create({
            quiz_id: quizId,
            question_id: questionId,
            question_number: questionNumber,
            user_id: ans.user_id,
            answer: ans.answer,
            is_correct: isCorrect,
            time_taken: ans.time_taken,
            points_earned: points,
          });
          console.log(`✅ QuizAnswer saved for ${ans.user_id}`);
        } catch (insertErr) {
          console.error(
            `⚠️ Skip answer insert for ${ans.user_id}: ${insertErr.message}. Score updated anyway.`
          );
        }

        // Raw UPDATE score
        await db.dbRun(
          `UPDATE quiz_participants SET total_score = total_score + ?, correct_answers = correct_answers + ?, username = ? WHERE quiz_id = ? AND user_id = ?`,
          [points, isCorrect, ans.username, quizId, ans.user_id]
        );
        console.log(
          `🔍 Debug: UPDATED score for ${ans.user_id}: +${points} points, +${isCorrect} correct`
        );

        logScore({
          quiz_id: quizId,
          question_number: questionNumber,
          user_id: ans.user_id,
          points,
          is_correct: isCorrect,
        });
      } catch (ansErr) {
        console.error("Answer process error:", ansErr);
      }
    }
    console.log(
      `📊 Scores calculated for Q${questionNumber}: ${answers.length} answers processed`
    );
  },

  calculateFinalStats: async (quizId, quiz, db) => {
    const finalScores = await db.QuizParticipant.findAll({
      where: { quiz_id: quizId },
      attributes: ["user_id", "username", "total_score", "correct_answers"],
      order: [["total_score", "DESC"]],
      limit: 3,
    });

    if (finalScores.length === 0) {
      return {
        finalScores: [],
        totalParticipants: 0,
        avgCorrect: 0,
        avgTime: "N/A",
      };
    }

    const totalParticipants = await db.QuizParticipant.count({
      where: { quiz_id: quizId },
    });
    const totalCorrect = finalScores.reduce(
      (sum, s) => sum + s.correct_answers,
      0
    );
    const avgCorrect =
      totalParticipants > 0
        ? Math.round(
            (totalCorrect / totalParticipants / quiz.questions_count) * 100 * 10
          ) / 10
        : 0;
    const avgTimeRow = await db.dbQuery(
      "SELECT AVG(time_taken) as avg_time FROM quiz_answers WHERE quiz_id = ?",
      [quizId]
    );
    const avgTime = avgTimeRow?.avg_time?.toFixed(2) ?? "N/A";

    return { finalScores, totalParticipants, avgCorrect, avgTime };
  },
};
