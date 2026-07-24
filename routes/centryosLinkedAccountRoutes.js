/*==================================================
                SENKU PAY
  CENTRYOS LINKED ACCOUNT WIDGET ROUTES
==================================================*/

const express = require("express");

const {
    verifyToken
} = require("../middleware/authMiddleware");

const {
    createWidget
} = require("../controllers/centryosLinkedAccountController");

const router = express.Router();

router.post(
    "/linked-account-widget",
    verifyToken,
    createWidget
);

module.exports = router;