/*==================================================
                SENKU PAY
        CENTRYOS WEBHOOK ROUTES
==================================================*/

const express = require("express");

const {
    handleCollectionWebhook
} = require(
    "../controllers/centryosWebhookController"
);

const router = express.Router();


/*
 * Do not add Senku Pay login middleware here.
 * CentryOS authenticates this request using its
 * SHA-512 HMAC signature.
 */
router.post(
    "/collection",
    handleCollectionWebhook
);


module.exports = router;
