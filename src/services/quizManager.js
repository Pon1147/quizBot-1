const { initDatabase } = require("../utils/database");
const {
  logger,
  logQuizCreated,
  logQuizStarted,
  logAnswer,
  logScore,
  logQuizCompleted,
} = require("../utils/logger");
const { EmbedBuilder } = require("discord.js");
const db = initDatabase();
const config = require("../../config.json");
const crypto = require("crypto");
const emojiToLetter = { "🇦": "A", "🇧": "B", "🇨": "C", "🇩": "D" };
const letterToEmoji = { A: "🇦", B: "🇧", C: "🇨", D: "🇩" };

// DB Helpers
const dbQuery = (sql, params) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );
const dbRun = (sql, params) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, (err) => (err ? reject(err) : resolve()))
  );
const dbAll = (sql, params) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

const generateQuizId = () =>
  `QZ_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

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
    const validCategories = Object.keys(config.categories);

    if (!validCategories.includes(category))
      throw new Error("Category không hợp lệ!");
    if (
      questions_count < config.quiz.min_questions ||
      questions_count > config.quiz.max_questions
    )
      throw new Error(
        `Số câu phải từ ${config.quiz.min_questions} đến ${config.quiz.max_questions}!`
      );
    if (
      time_per_question < config.quiz.min_time ||
      time_per_question > config.quiz.max_time
    )
      throw new Error(
        `Thời gian phải từ ${config.quiz.min_time} đến ${config.quiz.max_time} giây!`
      );

    const activeQuiz = await dbQuery(
      'SELECT id FROM quizzes WHERE server_id = ? AND status IN ("starting", "running")',
      [serverId]
    );
    if (activeQuiz)
      return interaction.editReply(
        `❌ Đã có quiz đang chạy! (ID: ${activeQuiz.id})`
      );

    await dbRun(
      `INSERT INTO quizzes (id, server_id, creator_id, creator_username, category, questions_count, time_per_question, channel_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quizId,
        serverId,
        id,
        username,
        category,
        questions_count,
        time_per_question,
        channelId,
        "created",
      ]
    );
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

    const embed = new EmbedBuilder()
      .setTitle("✅ Quiz đã được tạo thành công!")
      .setDescription("━━━━━━━━━━━━━━━━━━━━━━")
      .addFields(
        { name: "📋 Quiz ID", value: quizId, inline: true },
        {
          name: "📂 Category",
          value: config.categories[category],
          inline: true,
        },
        { name: "📊 Questions", value: `${questions_count} câu`, inline: true },
        {
          name: "⏱️ Time",
          value: `${time_per_question} giây/câu`,
          inline: true,
        },
        { name: "📍 Channel", value: `<#${channelId}>`, inline: true }
      )
      .setColor(0x00ff00)
      .setFooter({ text: `Sử dụng /quiz start ${quizId} để bắt đầu` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("Create quiz error:", err);
    await interaction.editReply("❌ Lỗi tạo quiz!");
  }
}

async function startQuiz(interaction, quizId) {
  try {
    const quiz = await dbQuery(
      'SELECT * FROM quizzes WHERE id = ? AND status = "created"',
      [quizId]
    );
    if (!quiz)
      return interaction.editReply("❌ Không tìm thấy quiz với ID này!");

    await dbRun(
      'UPDATE quizzes SET status = "starting", started_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quizId]
    );

    const channel = interaction.guild.channels.cache.get(quiz.channel_id);
    if (!channel) return interaction.editReply("❌ Channel không tồn tại!");

    const baseDesc = `\n\n📋 Thông tin Quiz:\n• Category: ${
      config.categories[quiz.category]
    }\n• Số câu: ${quiz.questions_count} câu\n• Thời gian: ${
      quiz.time_per_question
    }s/câu\n\n🎁 Giải thưởng:\n🥇 Top 1: Role "${
      config.roles.quiz_champion
    }" + 1000 coins\n🥈 Top 2: 500 coins\n🥉 Top 3: 250 coins\n\nChuẩn bị sẵn sàng! 🏎️💨`;

    let embed = new EmbedBuilder()
      .setTitle("🏁 QUIZ ZINGSPEED MOBILE BẮT ĐẦU! 🏁")
      .setDescription(
        `Quiz sẽ bắt đầu trong: ${config.quiz.countdown_duration} giây${baseDesc}`
      )
      .setColor(0x00aff4);
    const msg = await channel.send({ embeds: [embed] });
    await channel.send("@everyone");

    let count = config.quiz.countdown_duration;
    const countdownInterval = setInterval(async () => {
      count--;
      if (count > 0) {
        embed.setDescription(`Quiz sẽ bắt đầu trong: ${count} giây${baseDesc}`);
        await msg.edit({ embeds: [embed] });
      } else {
        clearInterval(countdownInterval);
        embed.setDescription(`GO!${baseDesc}`);
        await msg.edit({ embeds: [embed] });
        await dbRun('UPDATE quizzes SET status = "running" WHERE id = ?', [
          quizId,
        ]);
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
    const participants = await dbAll(
      "SELECT user_id FROM quiz_participants WHERE quiz_id = ?",
      [quizId]
    );
    const participantIds = participants.map((p) => p.user_id);
    console.log(
      `🔍 Debug: Participants IDs: [${participantIds.join(", ")}] | Total: ${
        participantIds.length
      }`
    );
    const usedIds = await dbAll(
      "SELECT question_id FROM used_questions WHERE quiz_id = ?",
      [quizId]
    );
    console.log(
      `🔍 Debug: Used IDs for Q${questionNumber}: [${usedIds
        .map((u) => u.question_id)
        .join(", ")}]`
    );
    const usedClause =
      usedIds.length > 0
        ? `AND id NOT IN (${usedIds.map(() => "?").join(",")})`
        : "";
    const params = [quiz.category, ...usedIds.map((u) => u.question_id)];
    console.log(
      `🔍 Debug: Query params: category='${quiz.category}', usedClause='${usedClause}', total params=${params.length}`
    ); // THÊM log
    const question = await dbQuery(
      `SELECT * FROM questions WHERE category = ? ${usedClause} ORDER BY RANDOM() LIMIT 1`,
      params
    );
    if (!question) {
      console.error(
        `❌ No question for Q${questionNumber}: Available questions count?`
      ); // THÊM log
      // Query count để debug
      const availCount = await dbQuery(
        "SELECT COUNT(*) as count FROM questions WHERE category = ?",
        [quiz.category]
      );
      console.log(
        `🔍 Debug: Available questions in category: ${availCount.count}`
      );
      return channel.send("❌ Không còn câu hỏi! Quiz dừng.");
    }

    await dbRun(
      "INSERT OR IGNORE INTO used_questions (quiz_id, question_id) VALUES (?, ?)",
      [quizId, question.id]
    );
    console.log(
      `✅ Selected Q${question.id}: ${question.question_text.substring(
        0,
        50
      )}...`
    ); // THÊM log

    const embed = new EmbedBuilder()
      .setTitle(`Câu ${questionNumber}/${quiz.questions_count}`)
      .setDescription(question.question_text)
      .setColor(0x00aff4)
      .addFields(
        { name: "🇦", value: question.option_a, inline: false },
        { name: "🇧", value: question.option_b, inline: false },
        { name: "🇨", value: question.option_c, inline: false },
        { name: "🇩", value: question.option_d, inline: false }
      )
      .setFooter({
        text: `⏱️ Thời gian: ${quiz.time_per_question}s | 🏆 Điểm tối đa: 100`,
      });

    if (question.image_url) embed.setImage(question.image_url);

    const message = await channel.send({ embeds: [embed] });
    const reactions = await Promise.all([
      message.react("🇦"),
      message.react("🇧"),
      message.react("🇨"),
      message.react("🇩"),
    ]);
    reactions.forEach((r, i) => {
      if (r) console.log(`✅ Added reaction ${i + 1}: ${r.emoji.name}`);
      else console.log(`❌ Failed to add reaction ${i + 1}`);
    });

    const startTime = Date.now();
    const answers = [];
    const answeredUsers = new Set();

    const collector = message.createReactionCollector({
      filter: (reaction, user) => {
        const passes =
          ["🇦", "🇧", "🇨", "🇩"].includes(reaction.emoji.name) &&
          !user.bot &&
          !answeredUsers.has(user.id);
        console.log(
          `🔍 Filter check: Emoji=${reaction.emoji.name}, User=${
            user.id
          } (bot? ${user.bot}), Answered? ${answeredUsers.has(
            user.id
          )} → Pass: ${passes}`
        );
        return passes;
      },
      time: quiz.time_per_question * 1000,
    });

    collector.on("ignore", (reaction, user) => {
      console.log(
        `🚫 Ignored reaction: Emoji=${reaction.emoji.name}, User=${user.id} (reason: filter fail)`
      );
    });

    collector.on("collect", async (reaction, user) => {
      console.log(
        `🔥 Debug: Reaction COLLECTED! User: ${user.id} (${user.username}), Emoji: ${reaction.emoji.name}`
      );
      const letter = emojiToLetter[reaction.emoji.name];
      if (!letter) return;
      answeredUsers.add(user.id);
      const timeTaken = (Date.now() - startTime) / 1000;
      const member = await channel.guild.members
        .fetch(user.id)
        .catch(() => null);
      const username = member ? member.user.username : user.username;
      answers.push({
        user_id: user.id,
        username,
        answer: letter,
        time_taken: timeTaken,
      });
      console.log(
        `✅ Debug: Answer pushed to array - Length now: ${answers.length}`
      );

      try {
        await reaction.users.remove(user.id);
        for (const [emojiName] of Object.entries(emojiToLetter)) {
          if (emojiName !== reaction.emoji.name) {
            const otherReaction = message.reactions.cache.find(
              (r) => r.emoji.name === emojiName
            );
            if (otherReaction) await otherReaction.users.remove(user.id);
          }
        }
        console.log(`🗑️ Removed reactions for ${user.id}`);
      } catch (removeErr) {
        console.error(`Failed to remove reaction for ${user.id}:`, removeErr);
      }

      logAnswer({
        quiz_id: quizId,
        question_number: questionNumber,
        user_id: user.id,
        answer: letter,
        time_taken: timeTaken,
      });
    });

    collector.on("end", (collected, reason) => {
      console.log(
        `🔚 Debug: Collector ended - Reason: ${reason}, Collected size: ${collected.size}, Answers length: ${answers.length}`
      );
    });

    let timeLeft = quiz.time_per_question;
    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0 && !collector.ended) {
        embed.setFooter({
          text: `⏱️ Còn lại: ${timeLeft}s | 🏆 Điểm tối đa: 100`,
        });
        message.edit({ embeds: [embed] }).catch(console.error);
      } else {
        clearInterval(timerInterval);
      }
    }, 1000);

    collector.on("end", async (collected, reason) => {
      console.log(`Collector ended: ${reason}, collected: ${collected.size}`);
      clearInterval(timerInterval);
      try {
        await calculateScores(
          quizId,
          question.id,
          questionNumber,
          question.correct_answer,
          answers,
          quiz.time_per_question
        );
        await showQuestionResults(
          channel,
          questionNumber,
          question,
          answers,
          quiz.time_per_question
        );
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

async function calculateScores(
  quizId,
  questionId,
  questionNumber,
  correctAnswer,
  answers,
  timeLimit
) {
  if (answers.length === 0) {
    console.log(`⚠️ No answers for Q${questionNumber} - Skipping scores`);
    return;
  }
  const multiplier = 1.0;
  const participants = await dbAll(
    "SELECT user_id FROM quiz_participants WHERE quiz_id = ?",
    [quizId]
  );
  const participantIds = participants.map((p) => p.user_id);
  console.log(
    `🔍 Debug: Fresh participants for scores: [${participantIds.join(
      ", "
    )}] | Total: ${participantIds.length}`
  );

  for (const ans of answers) {
    try {
      if (!participantIds.includes(ans.user_id)) {
        console.log(`🔍 Debug: Auto-joining ${ans.user_id} (${ans.username})`);
        await dbRun(
          `INSERT OR IGNORE INTO quiz_participants (quiz_id, user_id, username, total_score, correct_answers) VALUES (?, ?, ?, 0, 0)`,
          [quizId, ans.user_id, ans.username]
        );
        participantIds.push(ans.user_id);
      }

      let points = 0,
        isCorrect = 0;
      if (ans.answer.toUpperCase() === correctAnswer.toUpperCase()) {
        const timeBonus = Math.max(0, (timeLimit - ans.time_taken) / timeLimit);
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

      await dbRun(
        `INSERT INTO quiz_answers (quiz_id, question_id, question_number, user_id, answer, is_correct, time_taken, points_earned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quizId,
          questionId,
          questionNumber,
          ans.user_id,
          ans.answer,
          isCorrect,
          ans.time_taken,
          points,
        ]
      );

      const existing = await dbQuery(
        "SELECT total_score, correct_answers FROM quiz_participants WHERE quiz_id = ? AND user_id = ?",
        [quizId, ans.user_id]
      );
      if (existing) {
        const newScore = existing.total_score + points;
        const newCorrect = existing.correct_answers + isCorrect;
        await dbRun(
          `UPDATE quiz_participants SET total_score = ?, correct_answers = ?, username = ? WHERE quiz_id = ? AND user_id = ?`,
          [newScore, newCorrect, ans.username, quizId, ans.user_id]
        );
        console.log(
          `🔍 Debug: UPDATED score for ${ans.user_id}: ${newScore} total, ${newCorrect} correct`
        );
      } else {
        await dbRun(
          `INSERT INTO quiz_participants (quiz_id, user_id, username, total_score, correct_answers) VALUES (?, ?, ?, ?, ?)`,
          [quizId, ans.user_id, ans.username, points, isCorrect]
        );
        console.log(
          `🔍 Debug: INSERTED score for ${ans.user_id}: ${points} points, ${isCorrect} correct`
        );
      }

      logScore({
        quiz_id: quizId,
        question_number: questionNumber,
        user_id: ans.user_id,
        points,
        is_correct: isCorrect,
      });
    } catch (ansErr) {
      console.error("Answer insert error:", ansErr);
    }
  }
  console.log(
    `📊 Scores calculated for Q${questionNumber}: ${answers.length} answers processed`
  );
}

async function showQuestionResults(
  channel,
  questionNumber,
  question,
  answers,
  timeLimit
) {
  if (answers.length === 0) {
    return channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`📊 KẾT QUẢ CÂU ${questionNumber}`)
          .setDescription("Không có ai trả lời câu này!")
          .setColor(0xff0000),
      ],
    });
  }

  const stats = { A: 0, B: 0, C: 0, D: 0 };
  answers.forEach((ans) => stats[ans.answer]++);
  const totalAnswers = answers.length;
  const correctAnswers = answers
    .filter((ans) => ans.answer === question.correct_answer)
    .sort((a, b) => a.time_taken - b.time_taken)
    .slice(0, 3);
  const top3Text =
    correctAnswers.length > 0
      ? correctAnswers
          .map((ans, idx) => {
            const timeBonus = Math.max(
              0,
              (timeLimit - ans.time_taken) / timeLimit
            );
            const points = Math.floor(100 * (0.5 + 0.5 * timeBonus));
            return `${["🥇", "🥈", "🥉"][idx]} <@${
              ans.user_id
            }> - ${points} điểm (${ans.time_taken.toFixed(1)}s)`;
          })
          .join("\n")
      : "Không ai đúng!";

  const correctKey = `option_${question.correct_answer.toLowerCase()}`;
  const correctText = question[correctKey] || "N/A";

  const embed = new EmbedBuilder()
    .setTitle(`📊 KẾT QUẢ CÂU ${questionNumber}`)
    .setDescription(question.question_text)
    .setColor(0x00ff00)
    .addFields(
      {
        name: "📈 Thống kê lựa chọn",
        value: `🇦 ${stats.A} người (${((stats.A / totalAnswers) * 100).toFixed(
          0
        )}%)\n🇧 ${stats.B} người (${((stats.B / totalAnswers) * 100).toFixed(
          0
        )}%)\n🇨 ${stats.C} người (${((stats.C / totalAnswers) * 100).toFixed(
          0
        )}%)\n🇩 ${stats.D} người (${((stats.D / totalAnswers) * 100).toFixed(
          0
        )}%)`,
        inline: false,
      },
      {
        name: "✅ Đáp án đúng",
        value: `${question.correct_answer} - ${correctText}`,
        inline: false,
      }
    );
  if (question.explanation)
    embed.addFields({
      name: "💡 Giải thích",
      value: question.explanation,
      inline: false,
    });
  embed.addFields({
    name: "⚡ Top 3 nhanh nhất (đúng)",
    value: top3Text,
    inline: false,
  });

  await channel.send({ embeds: [embed] });
}

async function endQuiz(quizId, channel, quiz) {
  try {
    const finalScores = await dbAll(
      `SELECT p.user_id, p.username, p.total_score, p.correct_answers FROM quiz_participants p WHERE p.quiz_id = ? ORDER BY p.total_score DESC LIMIT 10`,
      [quizId]
    );

    if (finalScores.length === 0) {
      const noParticipantsEmbed = new EmbedBuilder()
        .setTitle("🏆 BẢNG XẾP HẠNG CUỐI CÙNG")
        .setDescription(
          `Quiz: ${quizId}\nCategory: ${
            config.categories[quiz.category]
          }\n\n❌ Chưa có ai tham gia hoặc trả lời!`
        )
        .setColor(0xffd700)
        .setTimestamp();
      await channel.send({ embeds: [noParticipantsEmbed] });
      channel.send(
        "Cảm ơn các bạn đã tham gia! 🎉 Hẹn gặp lại ở quiz tiếp theo! 🏁"
      );
      await dbRun(
        'UPDATE quizzes SET status = "finished", finished_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quizId]
      );
      return;
    }

    const totalParticipants = (
      await dbQuery(
        "SELECT COUNT(*) as count FROM quiz_participants WHERE quiz_id = ?",
        [quizId]
      )
    ).count;
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
    const avgTimeRow = await dbQuery(
      "SELECT AVG(time_taken) as avg_time FROM quiz_answers WHERE quiz_id = ?",
      [quizId]
    );
    const avgTime = avgTimeRow?.avg_time?.toFixed(2) ?? "N/A";

    logQuizCompleted({
      quiz_id: quizId,
      completed_at: new Date().toISOString(),
      total_participants: totalParticipants,
      avg_score:
        totalParticipants > 0
          ? finalScores.reduce((sum, s) => sum + s.total_score, 0) /
            totalParticipants
          : 0,
      avg_correct_rate: avgCorrect,
      top_3: finalScores.slice(0, 3).map((s) => ({
        user_id: s.user_id,
        username: s.username,
        score: s.total_score,
      })),
      duration_seconds: (new Date() - new Date(quiz.started_at)) / 1000,
    });

    const embed = new EmbedBuilder()
      .setTitle("🏆 BẢNG XẾP HẠNG CUỐI CÙNG")
      .setDescription(
        `Quiz: ${quizId}\nCategory: ${config.categories[quiz.category]}`
      )
      .setColor(0xffd700)
      .setTimestamp();

    finalScores.forEach((entry, idx) => {
      const medal = idx < 3 ? ["🥇", "🥈", "🥉"][idx] : `${idx + 1}.`;
      embed.addFields({
        name: `${medal} ${entry.username}`,
        value: `📊 Điểm: **${entry.total_score}**\n✅ Đúng: ${entry.correct_answers}/${quiz.questions_count}\n⏱️ Trung bình: ${avgTime}s`,
        inline: true,
      });
    });

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

    embed.addFields(
      {
        name: "🎁 Phần thưởng đã được trao",
        value: `🥇 Role + 1000 coins | 🥈 500 coins | 🥉 250 coins`,
        inline: false,
      },
      {
        name: "📈 Thống kê Quiz",
        value: `👥 Số người tham gia: ${totalParticipants}\n✅ Tỷ lệ đúng trung bình: ${avgCorrect}%\n⏱️ Thời gian trả lời TB: ${avgTime}s\n🔥 Câu khó nhất: N/A`,
        inline: false,
      }
    );

    await channel.send({ embeds: [embed] });
    channel.send(
      "Cảm ơn các bạn đã tham gia! 🎉 Hẹn gặp lại ở quiz tiếp theo! 🏁"
    );
    await dbRun(
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
    const activeQuiz = await dbQuery(
      'SELECT id, channel_id FROM quizzes WHERE server_id = ? AND status IN ("starting", "running")',
      [serverId]
    );
    if (!activeQuiz)
      return interaction.editReply("❌ Không có quiz đang chạy!");

    await dbRun(
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
    const quiz = await dbQuery(
      'SELECT * FROM quizzes WHERE id = ? AND status = "running"',
      [quizId]
    );
    if (!quiz) return interaction.reply("❌ Không có quiz đang chạy!");
    await dbRun(
      `INSERT OR IGNORE INTO quiz_participants (quiz_id, user_id, username, total_score, correct_answers) VALUES (?, ?, ?, 0, 0)`,
      [quizId, interaction.user.id, interaction.user.username]
    );
    console.log(`✅ Join logged: User ${interaction.user.id} joined ${quizId}`);
    await interaction.user.send("✅ Bạn đã tham gia quiz!");
    interaction.reply({ content: "✅ Đã tham gia!", ephemeral: true });
  } catch (err) {
    console.error("Join error:", err);
    interaction.reply("❌ Lỗi tham gia!");
  }
}

module.exports = {
  createQuiz,
  startQuiz,
  startQuestionRound,
  calculateScores,
  showQuestionResults,
  endQuiz,
  generateQuizId,
  stopQuiz,
  joinQuiz,
};
