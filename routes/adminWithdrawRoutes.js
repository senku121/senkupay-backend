/*==================================================
                SENKU PAY
        ADMIN WITHDRAW ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    getAllWithdraws,

    approveWithdraw,

    rejectWithdraw

} = require("../controllers/adminWithdrawController");

const {

    verifyToken

} = require("../middleware/authMiddleware");

/*==================================
        WITHDRAWALS
==================================*/

router.get(

    "/",

    verifyToken,

    getAllWithdraws

);

router.post(

    "/:id/approve",

    verifyToken,

    approveWithdraw

);

router.post(

    "/:id/reject",

    verifyToken,

    rejectWithdraw

);

module.exports = router;