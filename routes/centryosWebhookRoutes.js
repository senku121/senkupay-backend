/*==================================================
                SENKU PAY
        CENTRYOS WEBHOOK ROUTES
==================================================*/

const express =
    require("express");

const {
    handleCentryosWebhook
} = require(
    "../controllers/centryosWebhookController"
);

const router =
    express.Router();


/*
 * Keep /collection because it is the URL already
 * registered in the CentryOS dashboard.
 *
 * The handler is now generic and safely processes
 * both COLLECTION and WITHDRAWAL events received at
 * this existing URL.
 */
router.post(
    "/collection",
    handleCentryosWebhook
);


/*
 * Optional future endpoint. Register it only if
 * CentryOS supports separate webhook URLs by event.
 */
router.post(
    "/withdrawal",
    handleCentryosWebhook
);


module.exports =
    router;
