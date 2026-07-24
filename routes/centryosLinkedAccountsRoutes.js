/*==================================================
                SENKU PAY
       CENTRYOS LINKED ACCOUNTS ROUTES
==================================================*/

const express =
    require("express");

const {
    verifyToken
} = require(
    "../middleware/authMiddleware"
);

const {
    listLinkedAccounts
} = require(
    "../controllers/centryosLinkedAccountsController"
);

const router =
    express.Router();


router.get(
    "/linked-accounts/:currency",
    verifyToken,
    listLinkedAccounts
);


module.exports =
    router;
