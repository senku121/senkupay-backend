/*==================================================
                SENKU PAY
            DEPOSIT ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    createDeposit,

    getDeposits,

    completeDeposit

} = require("../controllers/depositController");

const {

    verifyToken

} = require("../middleware/authMiddleware");


/*==================================
        DEPOSITS
==================================*/

router.post(

    "/create",

    verifyToken,

    createDeposit

);

router.get(

    "/",

    verifyToken,

    getDeposits

);

router.post(

    "/complete",

    verifyToken,

    completeDeposit

);

module.exports = router;