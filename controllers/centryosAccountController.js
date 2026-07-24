/*==================================================
                SENKU PAY
       CENTRYOS ACCOUNT CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const {
    createEndUserAccount,
    getAccountMetadata
} = require("../services/centryosAccountService");

const prisma = new PrismaClient();


/*==================================================
          CREATE/LINK MY CENTRYOS ACCOUNT
==================================================*/

exports.createMyCentryosAccount = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                emailVerified: true,
                status: true,
                centryosAccountId: true,
                centryosAccountCreatedAt: true
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "Your Senku Pay account is not active."
            });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                success: false,
                message:
                    "Verify your email before creating your payment account."
            });
        }

        if (user.centryosAccountId) {
            return res.status(200).json({
                success: true,
                message:
                    "Your CentryOS account is already connected.",
                alreadyConnected: true,
                account: {
                    id: user.centryosAccountId,
                    createdAt:
                        user.centryosAccountCreatedAt
                }
            });
        }

        const result = await createEndUserAccount(user);

        const updatedUser = await prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                centryosAccountId: result.accountId,
                centryosAccountCreatedAt: new Date()
            },
            select: {
                centryosAccountId: true,
                centryosAccountCreatedAt: true
            }
        });

        return res.status(201).json({
            success: true,
            message:
                "CentryOS user account created and connected successfully.",
            alreadyConnected: false,
            account: {
                id: updatedUser.centryosAccountId,
                createdAt:
                    updatedUser.centryosAccountCreatedAt
            }
        });

    } catch (error) {

        console.error(
            "Create CentryOS account error:",
            error
        );

        const providerStatus = Number(
            error.statusCode || 0
        );

        /*
         * A provider-side 400 commonly means the email
         * already exists there. We do not guess an ID or
         * write an incorrect link into our database.
         */
        if (providerStatus === 400) {
            return res.status(409).json({
                success: false,
                message:
                    error.message ||
                    "CentryOS could not create this account.",
                providerResponse:
                    error.providerResponse || null
            });
        }

        return res.status(
            providerStatus >= 500 && providerStatus <= 599
                ? 502
                : 500
        ).json({
            success: false,
            message:
                error.message ||
                "Unable to connect your CentryOS account.",
            providerResponse:
                error.providerResponse || null
        });
    }
};


/*==================================================
              GET MY ACCOUNT METADATA
==================================================*/

exports.getMyCentryosAccount = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id
            },
            select: {
                centryosAccountId: true
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (!user.centryosAccountId) {
            return res.status(404).json({
                success: false,
                message:
                    "No CentryOS account is connected yet."
            });
        }

        const providerAccount =
            await getAccountMetadata(
                user.centryosAccountId
            );

        return res.status(200).json({
            success: true,
            account: providerAccount
        });

    } catch (error) {

        console.error(
            "Get CentryOS account error:",
            error
        );

        return res.status(502).json({
            success: false,
            message:
                error.message ||
                "Unable to retrieve the CentryOS account.",
            providerResponse:
                error.providerResponse || null
        });
    }
};
