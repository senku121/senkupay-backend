/*==================================================
                SENKU PAY
          SETTINGS CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

/*==================================
        GET SETTINGS
==================================*/

exports.getSettings = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({

            where: {
                id: req.user.id
            },

            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                country: true,
                status: true,
                emailVerified: true,
                createdAt: true
            }

        });

        if (!user) {

            return res.status(404).json({
                success: false,
                message: "User not found."
            });

        }

        return res.status(200).json({
            success: true,
            settings: {
                profile: user,

                preferences: {
                    emailNotifications: true,
                    securityNotifications: true,
                    transactionNotifications: true,
                    marketingEmails: false
                }
            }
        });

    } catch (error) {

        console.error(
            "Get settings error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to load settings."
        });

    }

};


/*==================================
        UPDATE PROFILE SETTINGS
==================================*/

exports.updateSettings = async (req, res) => {

    try {

        const firstName = String(
            req.body.firstName || ""
        ).trim();

        const lastName = String(
            req.body.lastName || ""
        ).trim();

        const phone = String(
            req.body.phone || ""
        ).trim();

        const country = String(
            req.body.country || ""
        ).trim();

        if (!firstName || !lastName) {

            return res.status(400).json({
                success: false,
                message: "First name and last name are required."
            });

        }

        const user = await prisma.user.update({

            where: {
                id: req.user.id
            },

            data: {
                firstName,
                lastName,
                phone: phone || null,
                country: country || null
            },

            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                country: true,
                status: true,
                emailVerified: true
            }

        });

        return res.status(200).json({
            success: true,
            message: "Settings updated successfully.",
            settings: {
                profile: user
            }
        });

    } catch (error) {

        console.error(
            "Update settings error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to update settings."
        });

    }

};


/*==================================
        CHANGE PASSWORD
==================================*/

exports.changePassword = async (req, res) => {

    try {

        const currentPassword = String(
            req.body.currentPassword || ""
        );

        const newPassword = String(
            req.body.newPassword || ""
        );

        if (!currentPassword || !newPassword) {

            return res.status(400).json({
                success: false,
                message:
                    "Current password and new password are required."
            });

        }

        if (newPassword.length < 6) {

            return res.status(400).json({
                success: false,
                message:
                    "New password must contain at least 6 characters."
            });

        }

        const user = await prisma.user.findUnique({

            where: {
                id: req.user.id
            }

        });

        if (!user) {

            return res.status(404).json({
                success: false,
                message: "User not found."
            });

        }

        const validPassword = await bcrypt.compare(
            currentPassword,
            user.password
        );

        if (!validPassword) {

            return res.status(400).json({
                success: false,
                message: "Current password is incorrect."
            });

        }

        const hashedPassword = await bcrypt.hash(
            newPassword,
            12
        );

        await prisma.user.update({

            where: {
                id: req.user.id
            },

            data: {
                password: hashedPassword
            }

        });

        return res.status(200).json({
            success: true,
            message: "Password changed successfully."
        });

    } catch (error) {

        console.error(
            "Change password error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to change password."
        });

    }

};