/*==================================================
                SENKU PAY
            ADMIN AUTH ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {
    login
} = require("../controllers/adminAuthController");


/*==================================
        ADMIN LOGIN
==================================*/

router.post(
    "/login",
    login
);


module.exports = router;