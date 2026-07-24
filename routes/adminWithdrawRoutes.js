/*==================================================
                SENKU PAY
        ADMIN WITHDRAW ROUTES
==================================================*/

const express =
    require("express");

const {
    getAllWithdraws,
    approveWithdraw,
    rejectWithdraw
} = require(
    "../controllers/adminWithdrawController"
);

const {
    verifyAdminToken
} = require(
    "../middleware/adminAuthMiddleware"
);

const router =
    express.Router();


router.get(
    "/",
    verifyAdminToken,
    getAllWithdraws
);


router.post(
    "/:id/approve",
    verifyAdminToken,
    approveWithdraw
);


router.post(
    "/:id/reject",
    verifyAdminToken,
    rejectWithdraw
);


module.exports =
    router;
