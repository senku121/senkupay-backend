/*==================================================
                SENKU PAY
                AUTH ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    register,
    login,
    me,
    verifyEmail,
    resendOTP,
    forgotPassword,
    verifyResetOTP,
    resetPassword

} = require("../controllers/authController");

const {

    verifyToken

} = require("../middleware/authMiddleware");


/*==================================
        ACCOUNT
==================================*/

router.post(
    "/register",
    register
);

router.post(
    "/login",
    login
);

router.get(
    "/me",
    verifyToken,
    me
);


/*==================================
        EMAIL VERIFICATION
==================================*/

router.post(
    "/verify-email",
    verifyEmail
);

router.post(
    "/resend-otp",
    resendOTP
);


/*==================================
        PASSWORD RESET
==================================*/

router.post(
    "/forgot-password",
    forgotPassword
);

router.post(
    "/verify-reset-otp",
    verifyResetOTP
);

router.post(
    "/reset-password",
    resetPassword
);

module.exports = router;