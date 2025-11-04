quizBot
├── config.json
├── data
│   ├── database.sqlite
│   └── questions
│       └── vehicles.json
├── load-questions.js
├── logs
│   ├── errors-2025-11-04.log
│   ├── quiz_answers-2025-11-04.log
│   ├── quiz_completed-2025-11-04.log
│   ├── quiz_created-2025-11-04.log
│   ├── quiz_scores-2025-11-04.log
│   └── quiz_started-2025-11-04.log
├── migrate-db.js
├── package-lock.json
├── package.json
├── src
│   ├── commands
│   │   └── user
│   │       └── quiz.js
│   ├── data
│   │   └── database.sqlite
│   ├── deploy-commands.js
│   ├── events
│   │   └── ready.js
│   ├── index.js
│   ├── models
│   │   ├── Questions.js
│   │   ├── Quiz.js
│   │   ├── QuizAnswer.js
│   │   ├── QuizParticipant.js
│   │   ├── UsedQuestion.js
│   │   └── index.js
│   ├── services
│   │   ├── quizEmbeds.js
│   │   ├── quizManager.js
│   │   ├── quizReactions.js
│   │   ├── quizScoring.js
│   │   └── quizValidator.js
│   └── utils
│       ├── database.js
│       ├── logger.js
│       └── permissions.js
└── tree.md