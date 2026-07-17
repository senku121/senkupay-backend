/*==================================================
                SENKU PAY
            USER ROUTES
==================================================*/

const express = require("express");

const router = express.Router();
const {
    handleKycUpload
} = require("../middleware/kycUploadMiddleware");

const {

    verifyToken

} = require("../middleware/authMiddleware");

const {
    getProfile,
    deleteAccount,
    getKycStatus,
    submitKyc
} = require("../controllers/userController");

router.get(

    "/profile",

    verifyToken,

    getProfile

);

router.delete(

    "/account",

    verifyToken,

    deleteAccount

);


/*==================================
            KYC STATUS
==================================*/

router.get(
    "/kyc/status",
    verifyToken,
    getKycStatus
);


/*==================================
            SUBMIT KYC
==================================*/

router.post(
    "/kyc/submit",
    verifyToken,
    handleKycUpload,
    submitKyc
);

module.exports = router;