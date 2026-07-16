/*==================================================
                SENKU PAY
            USER ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    verifyToken

} = require("../middleware/authMiddleware");

const {

    getProfile,
    deleteAccount

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

module.exports = router;