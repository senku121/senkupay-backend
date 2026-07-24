/*==================================================
                SENKU PAY
        CENTRYOS ADMIN ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {
    verifyToken
} = require("../middleware/authMiddleware");

const {
    testAuthentication
} = require(
    "../controllers/centryosAdminController"
);


/*==================================================
            TEST AUTHENTICATION
==================================================*/

router.post(
    "/test-auth",
    verifyToken,
    testAuthentication
);


module.exports = router;