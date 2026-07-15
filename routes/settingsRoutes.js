/*==================================================
                SENKU PAY
            SETTINGS ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {
    verifyToken
} = require("../middleware/authMiddleware");

const {
    getSettings,
    updateSettings,
    changePassword
} = require("../controllers/settingsController");


/*==================================
        SETTINGS
==================================*/

router.get(
    "/",
    verifyToken,
    getSettings
);

router.put(
    "/",
    verifyToken,
    updateSettings
);

router.post(
    "/change-password",
    verifyToken,
    changePassword
);

module.exports = router;