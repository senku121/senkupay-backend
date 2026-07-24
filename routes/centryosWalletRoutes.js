/*==================================================
                SENKU PAY
          CENTRYOS WALLET ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {
    verifyToken
} = require("../middleware/authMiddleware");

const {
    createMyCentryosWallets,
    getMyCentryosWallets
} = require("../controllers/centryosWalletController");


/*==================================
        CREATE USER WALLETS
==================================*/

router.post(
    "/wallets",
    verifyToken,
    createMyCentryosWallets
);


/*==================================
        GET SAVED WALLETS
==================================*/

router.get(
    "/wallets",
    verifyToken,
    getMyCentryosWallets
);

module.exports = router;
