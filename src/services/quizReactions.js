const emojiToLetter = { "🇦": "A", "🇧": "B", "🇨": "C", "🇩": "D" };
const letterToEmoji = { A: "🇦", B: "🇧", C: "🇨", D: "🇩" };

module.exports = {
  addReactions: async (message) => {
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
    return reactions;
  },

  createCollector: (message, timeLimit, quizId, questionNumber, logAnswer) => {
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
      time: timeLimit * 1000,
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
      const member = await message.guild.members
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
        console.warn(
          `⚠️ Failed to remove reaction for ${user.id}: ${removeErr.message}`
        ); // Fix: Warn + continue
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

    return { collector, answers, cleanup: () => collector.stop() };
  },
};
