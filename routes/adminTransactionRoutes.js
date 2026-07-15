/*==================================================
                SENKU PAY
        ADMIN TRANSACTION ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    verifyToken

} = require("../middleware/authMiddleware");

const {

    getAllTransactions

} = require("../controllers/adminTransactionController");

/*==================================
        TRANSACTIONS
==================================*/

router.get(

    "/transactions",

    verifyToken,

    getAllTransactions

);

module.exports = router;