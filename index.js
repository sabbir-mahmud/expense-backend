const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const moment = require("moment");
const cors = require("cors");
require("datejs");

const app = express();
const PORT = 3000;
const JWT_SECRET = "your_jwt_secret_key";

app.use(cors());
// MongoDB connection
mongoose
    .connect(
        "mongodb+srv://sabbir:1lM7nhr4p9gzi052@nodedb.scooa.mongodb.net/",
        {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        }
    )
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err));

// Define a User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

// Create a User model from the schema
const User = mongoose.model("User", userSchema);

// Define an Expense Schema
const expenseSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    details: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["earn", "expense"], required: true }, // Either 'earn' or 'expense'
});

// Create an Expense model from the schema
const Expense = mongoose.model("Expense", expenseSchema);

app.use(bodyParser.json());

// Registration API
app.post("/api/v1/register", async (req, res) => {
    const { email, password } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error registering user", error: err });
    }
});

// Login API
app.post("/api/v1/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res
                .status(400)
                .json({ message: "Invalid email or password" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res
                .status(400)
                .json({ message: "Invalid email or password" });
        }

        const token = jwt.sign(
            { email: user.email, id: user._id },
            JWT_SECRET,
            { expiresIn: "30d" }
        );
        res.json({ message: "Login successful", token });
    } catch (err) {
        res.status(500).json({ message: "Error logging in", error: err });
    }
});

// Middleware to verify token (for protected routes)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ message: "Token missing" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.user = user;
        next();
    });
};

// API to store user expenses
app.post("/api/v1/expense", authenticateToken, async (req, res) => {
    const { date, details, amount, type } = req.body;

    if (!["earn", "expense"].includes(type)) {
        return res
            .status(400)
            .json({ message: 'Invalid type. Must be "earn" or "expense"' });
    }

    try {
        const newExpense = new Expense({
            user: req.user.id,
            date,
            details,
            amount,
            type,
        });

        await newExpense.save();
        res.status(201).json({ message: "Expense recorded successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error saving expense", error: err });
    }
});

// API to get the last 100 expenses
app.get("/api/v1/expenses", authenticateToken, async (req, res) => {
    try {
        const expenses = await Expense.find({ user: req.user.id })
            .sort({ date: -1 }) // Sort by date in descending order
            .limit(100); // Limit to last 100 entries

        res.json(expenses);
    } catch (err) {
        res.status(500).json({
            message: "Error fetching expenses",
            error: err,
        });
    }
});

// PATCH: Update a specific expense by ID
app.patch("/api/v1/expense/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { date, details, amount, type } = req.body;

    if (!["earn", "expense"].includes(type)) {
        return res
            .status(400)
            .json({ message: 'Invalid type. Must be "earn" or "expense"' });
    }

    try {
        // Find the expense by its ID and ensure it belongs to the authenticated user
        const expense = await Expense.findOneAndUpdate(
            { _id: id, user: req.user.id },
            { date, details, amount, type },
            { new: true } // Return the updated document
        );

        if (!expense) {
            return res
                .status(404)
                .json({ message: "Expense not found or not authorized" });
        }

        res.json({ message: "Expense updated successfully", expense });
    } catch (err) {
        res.status(500).json({ message: "Error updating expense", error: err });
    }
});

// DELETE: Remove a specific expense by ID
app.delete("/api/v1/expense/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        // Find the expense by its ID and ensure it belongs to the authenticated user
        const expense = await Expense.findOneAndDelete({
            _id: id,
            user: req.user.id,
        });

        if (!expense) {
            return res
                .status(404)
                .json({ message: "Expense not found or not authorized" });
        }

        res.json({ message: "Expense deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error deleting expense", error: err });
    }
});

// API to get financial summary
app.get("/api/v1/financial-summary", authenticateToken, async (req, res) => {
    // try {
    var fd = Date.today().clearTime().moveToFirstDayOfMonth();
    var startOfMonth = fd.toString("yyyy-MM-dd");

    var ld = Date.today().clearTime().moveToLastDayOfMonth();
    var endOfMonth = ld.toString("yyyy-MM-dd");

    console.log("line 218", startOfMonth);
    console.log(endOfMonth);

    // Fetch all expenses for the user
    const expenses = await Expense.find({ user: req.user.id });
    const thisMonthExpenses = await Expense.find({
        user: req.user.id,
        date: {
            $gte: startOfMonth, // Greater than or equal to startOfMonth
            $lte: endOfMonth, // Less than or equal to endOfMonth
        },
    });

    // Calculate totals
    const totalEarn = expenses
        .filter((expense) => expense.type === "earn")
        .reduce((sum, expense) => sum + expense.amount, 0);

    const totalExpense = expenses
        .filter((expense) => expense.type === "expense")
        .reduce((sum, expense) => sum + expense.amount, 0);

    // Calculate this month's totals

    const thisMonthEarn = thisMonthExpenses
        .filter((expense) => expense.type === "earn")
        .reduce((sum, expense) => sum + expense.amount, 0);

    const thisMonthExpense = thisMonthExpenses
        .filter((expense) => expense.type === "expense")
        .reduce((sum, expense) => sum + expense.amount, 0);

    // Calculate balance (totalEarn - totalExpense)
    const balance = totalEarn - totalExpense;

    res.json({
        totalEarn,
        totalExpense,
        thisMonthEarn,
        thisMonthExpense,
        balance,
    });
    // } catch (err) {
    //     res.status(500).json({
    //         message: "Error calculating financial summary",
    //         error: err,
    //     });
    // }
});

// Protected route example
app.get("/", (req, res) => {
    res.json({ message: `Expense server running` });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
