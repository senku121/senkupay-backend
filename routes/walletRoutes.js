/*==================================================
                SENKU PAY
            WALLET ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    getWallet

} = require("../controllers/walletController");

const {

    verifyToken

} = require("../middleware/authMiddleware");

router.get(

    "/",

    verifyToken,

    getWallet

);

module.exports = router;