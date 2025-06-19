const express = require("express");
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require("jsonwebtoken");
const { type } = require("os");
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key"; // Use an environment variable for production

const app = express();

const PORT = process.env.PORT || 5000;
mongoose
    .connect(`${process.env.MONGO_URI}`)
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => console.error("MongoDB connection error:", err));




const corsOptions = {
    origin: "https://funtutor.netlify.app", // ✅ No trailing slash
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));



app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,
    password: String
});
const QuestionSchema = new mongoose.Schema({
    email: { type: String, required: true },  // User's email
    quizTitle: { type: String, required: true, unique: true },  // Unique quiz title
    sections: [
        {
            title: { type: String, required: true },  // Section title
            type: { type: String, required: true },  // Section type (e.g., MCQ, TF)
            questions: [
                {
                    question: { type: String, required: true },  // The actual question
                    options: [String], // Multiple options
                    answer: { type: String, required: true },   // Selected answer
                    positiveScore: { type: Number, default: 0 }, // Positive score
                    negativeScore: { type: Number, default: 0 }, // Negative score
                }
            ]
        }
    ],
    createdAt: { type: Date, default: Date.now } // Timestamp
});

  
const quizSchema = new mongoose.Schema({
    email: { type: String, required: true },  // User's email
    quizTitle: { type: String, required: true },  // Unique quiz title
    quizTime: { type: String, required: true }, // Quiz time
    quizCode: { type: String, required: true }, // Unique quiz code
    sections: [
        {
            title: { type: String, required: true },  // Section title
            questions: [
                {
                    question: { type: String, required: true },  // The actual question
                    options: [String], // Multiple options
                    answer: { type: String, required: true },   // Selected answer
                    positiveScore: { type: Number, default: 0 }, // Positive score
                    negativeScore: { type: Number, default: 0 }, // Negative score
                }
            ]
        }
    ],
    isActive: { type: Boolean, default: true }, // Quiz status
    participants: [{ type: String }], // List of participants
    createdAt: { type: Date, default: Date.now } // Timestamp
});   

const participantScoreSchema = new mongoose.Schema({
    quizCode: { type: String, required: true }, // Unique quiz code
    participantEmail: { type: String, required: true }, // Participant's email
    section:[
        {
        sectionid: { type: String, required: true }, // Section ID
    answers:[
        {  
            question_id: { type: String, required: true }, // Question ID
            question: { type: String, required: true }, // The actual question
            selectedOption: { type: String, required: true },
            correctAnswer: { type: String, required: true },
            score: { type: Number, required: true },
            questionText: { type: String }, // Optional: helpful for results view
        }
    ]
    }   
],
    totalScore: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now } // Timestamp
});


const QuestionModel = mongoose.model("Question", QuestionSchema);
const user = mongoose.model("user", userSchema);
const QuizModel = mongoose.model("Quiz", quizSchema);
const ParticipantScore= mongoose.model("ParticipantScore", participantScoreSchema);

const authenticateToken = (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1];

    if (!token) return res.status(401).json({ message: "Access Denied" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid Token" });

        req.user = user;
        next();
    });
};


const generateRoomCode = () => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};


app.post("/login-form", function (req, res) {
    const { email, password } = req.body;

    user.findOne({ email: email })
        .then((foundUser) => {
            if (!foundUser) {
                return res.status(404).send({ message: 'User not found!' });
            }

            bcrypt.compare(password, foundUser.password, (err, result) => {
                if (err) {
                    return res.status(500).send({ message: 'Error comparing passwords.' });
                }

                if (result) {
                    const token = jwt.sign({ email: foundUser.email }, SECRET_KEY, { expiresIn: "1h" });

                    res.json({ token, email: foundUser.email });
                } else {
                    res.status(401).send({ message: 'Invalid credentials' });
                }
            });
        })
        .catch((err) => res.status(500).send({ message: 'Database error', error: err }));
});


app.post("/signup-form", function (req, res) {
    const { firstName, lastName, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.status(400).send({ message: "Passwords do not match." });
    }

    user.findOne({ email: email })
        .then((existingUser) => {
            if (existingUser) {
                return res.status(400).send({ message: "Email already in use." });
            }

            bcrypt.hash(password, 10, (err, hashedPassword) => {
                if (err) {
                    return res.status(500).send({ message: "Error hashing password." });
                }

                const tempUser = new user({
                    firstName,
                    lastName,
                    email,
                    password: hashedPassword
                });

                tempUser.save()
                    .then(() => {
                        const token = jwt.sign({ email }, SECRET_KEY, { expiresIn: "1h" });
                        res.json({ message: 'Sign up successful!', token, email });
                    })
                    .catch((err) => res.status(500).send({ message: 'Error saving user', error: err }));
            });
        })
        .catch((err) => res.status(500).send({ message: 'Database error', error: err }));
});



app.post("/submit-questions",  authenticateToken,async (req, res) => {
    try {
        const { email,quizTitle, title, questions,type } = req.body;

        // Basic Validation
        if (!email ||!quizTitle|| !title || !questions || questions.length === 0) {
            return res.status(400).json({ message: "All fields are required" });
        }
       
        
        let section = await QuestionModel.findOne({ quizTitle:quizTitle, email: email });
        if (!section) {
            section = new QuestionModel({ email, quizTitle, sections: [] });
        }
        const newSection = {
            title,
            type,
            questions: questions.map((q) => ({
                question: q.question,
                answer: q.answer,
                options: q.options,
                positiveScore: q.positiveScore,
                negativeScore: q.negativeScore
            }))
        };
        section.sections.push(newSection);
        await section.save();
        console.log("Questions saved successfully:", section); 
        res.status(201).json({ message: "Questions submitted successfully!" });
    } catch (error) {
        console.error("Error saving questions:", error);
        res.status(500).json({ message: "Server error, try again later" });
    }
});

app.post("/check-title", authenticateToken, async (req, res) => {
    try {
        const { title,quizTitle } = req.body;
        console.log(quizTitle,title);
        const userEmail = req.user.email; // Assuming email is stored in req.user
console.log("email",userEmail);
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }

        const section = await QuestionModel.findOne({ email: userEmail,quizTitle:quizTitle });
        if (!section) {
            return res.status(404).json({ message: "Quiz not found" });
        }
        let existingTitle = false;
        section.sections.forEach((sec) => {
            if (sec.title === title) {
               existingTitle = true;
            }
        });

        res.json({ exists: existingTitle }); // true if exists, false otherwise
    } catch (error) {
        console.error("Error checking title:", error);
        res.status(500).json({ message: "Server error, try again later" });
    }
});



app.post("/seequiz-form", authenticateToken, async (req, res) => {
    try {
        const { email,quizTitle } = req.body;

        // Basic validation
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        if (!quizTitle) {
            return res.status(400).json({ message: "Quiz title is required" });
        }
        // Check if the user exists

        // Fetch data from database
        const quizData = await QuestionModel.find({ email: email, quizTitle: quizTitle }).exec();
        if (!quizData) {
            return res.status(404).json({ message: "No quiz data found" });
        }
        
        console.log(quizData);
        // Send the quiz data as response
        res.json(quizData);
    } catch (error) {
        console.error("Error fetching quiz data:", error);
        res.status(500).json({ message: "Server error, try again later" });
    }
});

app.post("/delete-question", authenticateToken, async (req, res) => {
    try {
        const { quizTitle, sectionId, questionId } = req.body;
        const userEmail = req.user.email; // Assuming email is stored in req.user

        // Find the quiz
        const quiz = await QuestionModel.findOne({ quizTitle: quizTitle, email: userEmail });
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        // Find the section
        const section = quiz.sections.id(sectionId);
        if (!section) {
            return res.status(404).json({ message: "Section not found" });
        }

        // Remove the question using pull()
        section.questions.pull(questionId);
        await quiz.save();

        res.json({ message: "Question deleted successfully!" });
    } catch (error) {
        console.error("Error deleting question:", error);
        res.status(500).json({ message: "Server error, try again later" });
    }
});

  
  app.post("/api/quiz", authenticateToken, async (req, res) => {
    try {
        const { userEmail, title } = req.body;
        console.log("Title received:", title);
        if (!userEmail) {
            return res.status(400).json({ message: "Email is required" });
        }
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }

        // Create a unique title using timestamp
        const uniqueTitle = `${title}-${Date.now()}`;

        // Save the quiz with the unique title
        const newQuiz = new QuestionModel({ 
            email: userEmail,
            quizTitle: uniqueTitle,
            sections: []
        });
        await newQuiz.save();

        res.json({ message: "Quiz created successfully!", uniqueTitle });
    } 
    catch (error) {
        console.error("Error saving quiz title:", error);
        res.status(500).json({ message: "Server error, try again later" });
    }
});

app.post("/generate-code", async (req, res) => {

    try {
        const { quizTitle, quizTime,email } = req.body;
        console.log("Quiz Title:", quizTitle);
        console.log("Quiz Time:", quizTime);
        console.log("Email:", email);
        const quizData = await QuestionModel.findOne(
            { email: email, quizTitle: quizTitle },
            { sections: 1, _id: 0 }
          );
          
          const sections = quizData?.sections;
          
    
        if (!sections) {
            return res.status(404).json({ message: "Quiz not found" });
        }
        let code;
        let isUnique = false;

        while (!isUnique) {
            code = generateRoomCode();
            const existing = await QuizModel.findOne({ quizCode: code });
            if (!existing) isUnique = true;
        }

        const newQuiz = new QuizModel({
            email: email,
            quizTitle,
            quizTime,
            quizCode: code,
            sections: sections,
            isActive: false,
            participants: []
        });

        await newQuiz.save();
        res.json({ code });
    } catch (error) {
        res.status(500).json({ message: "Error generating code", error });
    }
});

app.post("/start-quiz", authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email; // From JWT
        const { quizTitle,roomCode } = req.body;
  
        const quiz = await QuizModel.findOne({ email:userEmail,quizTitle:quizTitle,quizCode:roomCode });
        if (!quiz) return res.status(404).json({ message: "Quiz not found" });

        quiz.isActive = true;
        await quiz.save();

        res.json({ message: "Quiz started successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err });
    }
});
app.post("/end-quiz", authenticateToken, async (req, res) => {
   try{
        const { quizTitle, roomCode } = req.body;
        const userEmail = req.user.email; // From JWT
        if (!quizTitle || !roomCode) {
            return res.status(400).json({ message: "Quiz title and room code are required" });
        }
        const quiz = await QuizModel.findOne({ email:userEmail,quizTitle:quizTitle,quizCode:roomCode });
        if (!quiz) return res.status(404).json({ message: "Quiz not found" });

        quiz.isActive = false;
        await quiz.save();

        res.json({ message: "Quiz ended successfully!" });
    }
    catch (err) {
        res.status(500).json({ message: "Server error", error: err });
    }
});
 
app.post("/api/quiz/validate-code", authenticateToken, async (req, res) => {
    try {
        const { quizCode, email } = req.body;
       
        if (!quizCode || !email) {
            return res.status(400).json({ message: "Quiz code and email are required" });
        }

        const quiz = await QuizModel.findOne({ quizCode });

        if (!quiz) {
            return res.status(404).json({ isValid: false, message: "Quiz not found" });
        }

        if (!quiz.isActive) {
            return res.status(400).json({ isValid: false, message: "Quiz is not active" });
        }

        // Check if the email is already a participant
        if (quiz.participants.includes(email)) {
            return res.status(400).json({ isValid: false, message: "You have already joined this quiz" });
        }

        // Add participant email
        quiz.participants.push(email);
        await quiz.save();

        res.json({
            isValid: true,
            isActive: true,
            quizData: {
                quizTitle: quiz.quizTitle,
                quizTime: quiz.quizTime,
                sections: quiz.sections
            }
        });

    } catch (err) {
        console.error("Error validating quiz code:", err);
        res.status(500).json({ message: "Server error", error: err });
    }
});





app.post('/api/quiz/submit-response', authenticateToken, async (req, res) => {
    try {
        const { quizCode, participantEmail,section,totalScore} = req.body;

        if (!quizCode || !participantEmail || !section|| !totalScore) {
            return res.status(400).json({ message: "Missing fields in request" });
        }

        // Check if the quiz exists and is active
        const quiz= await QuizModel.findOne({ quizCode:quizCode });
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }
        if (!quiz.isActive) {
            return res.status(400).json({ message: "Quiz is not active" });
        }
        // Check if the participant has already submitted a response
        const existingResponse = await ParticipantScore.findOne({ quizCode, participantEmail });
        if (existingResponse) {
           
            return res.status(400).json({ message: "Participant has already submitted a response" });
        }

        const newResult = new ParticipantScore({
            quizCode,
            participantEmail,
            section: section,
            totalScore
        });

        await newResult.save();

        res.status(200).json({ message: "Quiz submitted successfully", totalScore });
    } catch (err) {
        console.error("Error submitting quiz:", err);
        res.status(500).json({ message: "Server error", error: err });
    }
});

app.post("/api/quiz/my-quizzes", authenticateToken, async (req, res) => {
    try {
        const { email } = req.body;
        console.log("Email received:", email);

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // Only return the `quizTitle` field
        const quizzes = await QuestionModel.find({ email: email }, 'quizTitle');

        res.json({ quizzes }); // Will be an array of objects like [{ quizTitle: 'Title1' }, ...]
    } catch (error) {
        console.error("Error fetching quizzes:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

app.post("/get-participants", authenticateToken, async (req, res) => {
    try {
        const { email, quizTitle } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        if (!quizTitle) {
            return res.status(400).json({ message: "Quiz title is required" });
        }

        // Find one quiz matching title with at least one participant, sorted by latest created
        const quiz = await QuizModel.findOne({
            email: email,
            quizTitle: quizTitle,
            participants: { $exists: true, $not: { $size: 0 } }
        }).sort({ createdAt: -1 });

        // If no such quiz, return null
        if (!quiz) {
            return res.status(200).json(null);
        }

        // Return only quizCode and participants
     
        return res.status(200).json({
            code: quiz.quizCode,
            participants: quiz.participants
        });

    } catch (error) {
        console.error("Error fetching quiz participants:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

app.post("/get-participant-score", authenticateToken, async (req, res) => {
    try {
        const { quizCode, participantEmail } = req.body;

        if (!quizCode || !participantEmail) {
            return res.status(400).json({ message: "Quiz code and email are required" });
        }

        const score = await ParticipantScore.findOne({ quizCode, participantEmail });

        if (!score) {
            return res.status(404).json({ message: "No score found for this participant" });
        }

        res.json(score);
    } catch (error) {
        console.error("Error fetching participant score:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

app.post("/get-participant-scores", authenticateToken, async (req, res) => {
    try {
        const { quizTitle, quizCode } = req.body;

        if (!quizTitle || !quizCode) {
            return res.status(400).json({ message: "Quiz title and code are required" });
        }

        const scores = await ParticipantScore.find({ quizCode });

        if (!scores) {
            return res.status(404).json({ message: "No scores found for this quiz" });
        }

        res.json(scores);
    } catch (error) {
        console.error("Error fetching participant scores:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

app.delete('/api/quiz/delete/:quizTitle', authenticateToken, async (req, res) => {
  const { quizTitle } = req.params;
  const userEmail = req.user.email; // From JWT

  try {
    // 1. Delete questions associated with the quiz
    const deletedQuestions = await QuestionModel.deleteMany({ quizTitle, email: userEmail });

    // 2. Find all quizzes with the given title and user
    const quizzes = await QuizModel.find({ quizTitle, email: userEmail });

    if (!quizzes || quizzes.length === 0) {
      return res.status(404).json({ error: 'Quiz not found or unauthorized' });
    }

    // Extract all quiz codes
    const quizCodes = quizzes.map(q => q.quizCode);

    // 3. Delete quizzes
    await QuizModel.deleteMany({ quizTitle, email: userEmail });

    // 4. Delete participant scores using quiz codes
    await ParticipantScore.deleteMany({ quizCode: { $in: quizCodes } });

    res.status(200).json({ message: 'Quiz deleted successfully' });

  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.listen(PORT, function () {
    console.log(`Server started on port ${PORT}`);
});

