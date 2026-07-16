/*==================================================
                SENKU PAY
            USER CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        USER PROFILE
==================================*/

exports.getProfile = async (req, res) => {

    try {

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

        return res.status(200).json({

            success: true,

            profile: {

                id: user.id,

                username: user.username,

                email: user.email,

                firstName: user.firstName,

                lastName: user.lastName,

                phone: user.phone,

                country: user.country,
                emailVerified: user.emailVerified,

                balance: user.balance,

                deposited: user.deposited,

                withdrawn: user.withdrawn,

                lockedBalance: user.lockedBalance,

                status: user.status,

                createdAt: user.createdAt

            }

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load profile."

        });

    }

};

/*==================================
        DELETE USER ACCOUNT
==================================*/

exports.deleteAccount = async (req, res) => {

    try {

        const userId = req.user.id;
        const confirmation = String(req.body?.confirmation || "").trim().toUpperCase();

        if (confirmation !== "DELETE") {
            return res.status(400).json({
                success: false,
                message: "Type DELETE to confirm account deletion."
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                balance: true,
                lockedBalance: true,
                deposits: {
                    where: { status: { in: ["PENDING", "Pending", "pending"] } },
                    select: { id: true },
                    take: 1
                },
                withdrawRequests: {
                    where: { status: { in: ["PENDING", "Pending", "pending", "PROCESSING", "Processing", "processing"] } },
                    select: { id: true },
                    take: 1
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        if (Math.abs(user.balance) > 0.000001 || Math.abs(user.lockedBalance) > 0.000001) {
            return res.status(409).json({
                success: false,
                message: "Your balance and locked balance must be zero before deleting your account."
            });
        }

        if (user.deposits.length > 0 || user.withdrawRequests.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Complete or cancel all pending deposits and withdrawal requests before deleting your account."
            });
        }

        await prisma.user.delete({
            where: { id: userId }
        });

        return res.status(200).json({
            success: true,
            message: "Your Senku Pay account was permanently deleted."
        });

    } catch (error) {

        console.error("Delete account error:", error);

        if (error.code === "P2025") {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to delete your account right now."
        });
    }
};
