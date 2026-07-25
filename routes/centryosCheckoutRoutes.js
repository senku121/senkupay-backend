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
    getMyPaymentLinkDeposit,
    getProvisioningStatus
} = require("../controllers/centryosCheckoutController");


/*==================================
    CHECK DEPLOYED PROVISIONING
==================================*/

router.get(
    "/provisioning-status",
    verifyToken,
    getProvisioningStatus
);


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
