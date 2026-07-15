/*==================================================
                SENKU PAY
        TRANSACTION ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    verifyToken

} = require("../middleware/authMiddleware");

const {

    getTransactions

} = require("../controllers/transactionsController");

/*==================================
        TRANSACTIONS
==================================*/

router.get(

    "/",

    verifyToken,

    getTransactions

);

module.exports = router;