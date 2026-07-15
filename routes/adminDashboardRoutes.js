/*==================================================
                SENKU PAY
        ADMIN DASHBOARD ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    getDashboard

} = require("../controllers/adminDashboardController");

const {

    verifyToken

} = require("../middleware/authMiddleware");

/*==================================
        DASHBOARD
==================================*/

router.get(

    "/",

    verifyToken,

    getDashboard

);

module.exports = router;