/*==================================================
                SENKU PAY
        CENTRYOS CHECKOUT ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {
    verifyToken
} = require("../middleware/authMiddleware");

const {
    createMyPaymentLink,
    getMyPaymentLinkDeposit
} = require("../controllers/centryosCheckoutController");


/*==================================
        CREATE PAYMENT LINK
==================================*/

router.post(
    "/payment-link",
    verifyToken,
    createMyPaymentLink
);


/*==================================
        GET DEPOSIT STATUS
==================================*/

router.get(
    "/deposits/:depositId",
    verifyToken,
    getMyPaymentLinkDeposit
);

module.exports = router;
