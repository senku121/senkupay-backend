/*==================================================
                SENKU PAY
          CENTRYOS ACCOUNT ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {
    verifyToken
} = require("../middleware/authMiddleware");

const {
    createMyCentryosAccount,
    getMyCentryosAccount
} = require("../controllers/centryosAccountController");


/*==================================
       CREATE/LINK USER ACCOUNT
==================================*/

router.post(
    "/account",
    verifyToken,
    createMyCentryosAccount
);


/*==================================
          GET USER ACCOUNT
==================================*/

router.get(
    "/account",
    verifyToken,
    getMyCentryosAccount
);

module.exports = router;
