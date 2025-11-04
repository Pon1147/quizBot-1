const { DataTypes } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  const Question = sequelize.define(
    "Question",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      category: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      question_text: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      option_a: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      option_b: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      option_c: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      option_d: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      correct_answer: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      explanation: {
        type: DataTypes.TEXT,
      },
      image_url: {
        type: DataTypes.STRING,
      },
      created_at: {
        type: DataTypes.DATE, // DATETIME in SQLite
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "questions",
      timestamps: false,
      indexes: [],
      uniqueKeys: {
        unique_category_text: {
          fields: ["category", "question_text"],
        },
      },
    }
  );

  Question.associate = (models) => {
    Question.hasMany(models.QuizAnswer, { foreignKey: "question_id" });
    Question.hasMany(models.UsedQuestion, { foreignKey: "question_id" });
  };

  return Question;
};
