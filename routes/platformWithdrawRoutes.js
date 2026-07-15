/*==================================================
                SENKU PAY
      PLATFORM WITHDRAW ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    verifyToken

} = require("../middleware/authMiddleware");

const {

    getPlatformWithdraw,

    createPlatformWithdraw

} = require("../controllers/platformWithdrawController");

/*==================================
        PLATFORM WITHDRAW
==================================*/

router.get(

    "/",

    verifyToken,

    getPlatformWithdraw

);

router.post(

    "/",

    verifyToken,

    createPlatformWithdraw

);

module.exports = router;