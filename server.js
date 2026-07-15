require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const testMailRoutes =
require("./routes/testMailRoutes");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const walletRoutes = require("./routes/walletRoutes");
const depositRoutes = require("./routes/depositRoutes");
const transactionRoutes = require("./routes/transactionsRoutes");
const withdrawRoutes = require("./routes/withdrawRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminWithdrawRoutes = require("./routes/adminWithdrawRoutes");
const adminUserRoutes =
require("./routes/adminUserRoutes");
const adminDashboardRoutes =
require("./routes/adminDashboardRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminTransactionRoutes = require("./routes/adminTransactionRoutes");
const adminAgentRoutes = require("./routes/adminAgentRoutes");
const platformWithdrawRoutes =
require("./routes/platformWithdrawRoutes");


const app = express();
app.set("trust proxy", 1);
app.use(
    helmet({
        crossOriginResourcePolicy: false
    })
);


app.use(
    rateLimit({

        windowMs: 15 * 60 * 1000,

        max: 200

    })
);
const allowedOrigins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://senkupay.online",
    "https://www.senkupay.online",
    "https://senku121.github.io"
];

const settingsRoutes =
require("./routes/settingsRoutes");

const corsOptions = {
    origin(origin, callback) {

        // Allows tools such as Postman and server-to-server requests
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.error("Blocked by CORS:", origin);

        return callback(
            new Error("Origin is not allowed by CORS.")
        );
    },

    methods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: true,

    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use(
    "/api/settings",
    settingsRoutes
);
app.use("/api/deposit", depositRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api/admin", adminRoutes);
app.use(
    "/api/admin/withdraws",
    adminWithdrawRoutes
);
app.use(
"/api/admin/users",
adminUserRoutes
);
app.use(
    "/api/admin/dashboard",
    adminDashboardRoutes
);

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Senku Pay Backend Running"
    });
});
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminTransactionRoutes);
app.use("/api/admin", adminAgentRoutes);
app.use(

"/api/admin/platform-withdraw",

platformWithdrawRoutes

);
app.use(
    "/api/test-mail",
    testMailRoutes
);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});