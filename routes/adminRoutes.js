/*==================================================
                SENKU PAY
            ADMIN ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    getWithdrawRequests,

    approveWithdraw,

    rejectWithdraw

} = require("../controllers/adminController");

const {

    verifyToken

} = require("../middleware/authMiddleware");

/*==================================
        WITHDRAW REQUESTS
==================================*/

router.get(

    "/withdraws",

    verifyToken,

    getWithdrawRequests

);

router.post(

    "/withdraws/:id/approve",

    verifyToken,

    approveWithdraw

);

router.post(

    "/withdraws/:id/reject",

    verifyToken,

    rejectWithdraw

);

module.exports = router;