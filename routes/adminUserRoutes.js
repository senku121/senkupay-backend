/*==================================================
                SENKU PAY
            ADMIN USER ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {
    getUsers,
    addBalance,
    deductBalance,
    updateUserStatus,
    resetPassword,
    getUserTransactions,
    getUserKyc,
    approveUserKyc,
    rejectUserKyc,
    offlineVerifyUserKyc,
    requireKycReverification,
    revokeUserKyc
} = require("../controllers/adminUserController");

const {
    verifyToken
} = require("../middleware/authMiddleware");

/*==================================
        USERS
==================================*/

router.get(
    "/",
    verifyToken,
    getUsers
);

router.post(
    "/:id/add-balance",
    verifyToken,
    addBalance
);

router.post(
    "/:id/deduct-balance",
    verifyToken,
    deductBalance
);

router.post(
    "/:id/status",
    verifyToken,
    updateUserStatus
);

router.post(
    "/:id/reset-password",
    verifyToken,
    resetPassword
);

router.get(
    "/:id/transactions",
    verifyToken,
    getUserTransactions
);

/*==================================
            USER KYC
==================================*/

router.get(
    "/:id/kyc",
    verifyToken,
    getUserKyc
);

router.post(
    "/:id/kyc/approve",
    verifyToken,
    approveUserKyc
);

router.post(
    "/:id/kyc/reject",
    verifyToken,
    rejectUserKyc
);

router.post(
    "/:id/kyc/offline-verify",
    verifyToken,
    offlineVerifyUserKyc
);

router.post(
    "/:id/kyc/reverify",
    verifyToken,
    requireKycReverification
);

router.post(
    "/:id/kyc/revoke",
    verifyToken,
    revokeUserKyc
);

module.exports = router;