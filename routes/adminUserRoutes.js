/*==================================================
                SENKU PAY
            ADMIN USER ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    getUsers,

    addBalance,

    deductBalance,

    updateUserStatus,

    resetPassword,

    getUserTransactions

} = require("../controllers/adminUserController");

const {

    verifyToken

} = require("../middleware/authMiddleware");

/*==================================
        USERS
==================================*/

router.get(

    "/",

    verifyToken,

    getUsers

);

router.post(

    "/:id/add-balance",

    verifyToken,

    addBalance

);

router.post(

    "/:id/deduct-balance",

    verifyToken,

    deductBalance

);

router.post(

    "/:id/status",

    verifyToken,

    updateUserStatus

);

router.post(

    "/:id/reset-password",

    verifyToken,

    resetPassword

);

router.get(

    "/:id/transactions",

    verifyToken,

    getUserTransactions

);

module.exports = router;