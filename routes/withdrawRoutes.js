/*==================================================
                SENKU PAY
            WITHDRAW ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    createWithdraw,

    getWithdraws

} = require("../controllers/withdrawController");

const {

    verifyToken

} = require("../middleware/authMiddleware");

router.post(

    "/create",

    verifyToken,

    createWithdraw

);

router.get(

    "/",

    verifyToken,

    getWithdraws

);

module.exports = router;