/*==================================================
                SENKU PAY
          ADMIN AUTH CONTROLLER
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();


/*==================================
        ADMIN LOGIN
==================================*/

exports.login = async (req, res) => {

    try {

        const username =
            String(
                req.body.username || ""
            )
            .trim()
            .toLowerCase();

        const password =
            String(
                req.body.password || ""
            );

        if (!username || !password) {

            return res.status(400).json({
                success: false,
                message:
                    "Username and password are required."
            });

        }

        if (!process.env.JWT_SECRET) {

            console.error(
                "JWT_SECRET is missing."
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server authentication is not configured."
            });

        }

        const admin =
            await prisma.admin.findUnique({

                where: {
                    username
                }

            });

        if (!admin) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid username or password."
            });

        }

        if (
            admin.status &&
            String(admin.status)
                .toUpperCase() !== "ACTIVE"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "This administrator account is disabled."
            });

        }

        const validPassword =
            await bcrypt.compare(
                password,
                admin.password
            );

        if (!validPassword) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid username or password."
            });

        }

        const token =
            jwt.sign(

                {
                    id: admin.id,
                    username: admin.username,
                    role:
                        admin.role ||
                        "SUPER_ADMIN",
                    type: "ADMIN"
                },

                process.env.JWT_SECRET,

                {
                    expiresIn: "7d",
                    issuer: "senku-pay-api",
                    audience: "senku-pay-admin"
                }

            );

        return res.status(200).json({

            success: true,

            message:
                "Administrator login successful.",

            token,

            admin: {
                id: admin.id,
                username: admin.username,
                role:
                    admin.role ||
                    "SUPER_ADMIN"
            }

        });

    } catch (error) {

        console.error(
            "Administrator login error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to complete administrator login."
        });

    }

};