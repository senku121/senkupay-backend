/*==================================================
                SENKU PAY
       CENTRYOS WALLET CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const {
    createEndUserWallets
} = require("../services/centryosWalletService");

const prisma = new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function walletResponse(wallet) {

    return {
        id: wallet.centryosWalletId,
        slug: wallet.slug,
        currency: wallet.currency,
        balance: wallet.providerBalance,
        walletType: wallet.walletType,
        displayCurrency: wallet.displayCurrency,
        permissions: wallet.permissions,
        settings: wallet.settings,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
    };
}


/*==================================================
          CREATE MY CENTRYOS WALLETS
==================================================*/

exports.createMyCentryosWallets = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id
            },
            select: {
                id: true,
                status: true,
                emailVerified: true,
                centryosAccountId: true,
                centryosWallets: {
                    orderBy: {
                        currency: "asc"
                    }
                }
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
                    "Verify your email before creating payment wallets."
            });
        }

        if (!user.centryosAccountId) {
            return res.status(409).json({
                success: false,
                message:
                    "Connect your CentryOS account before creating wallets."
            });
        }

        /*
         * Never call the provider create endpoint again
         * after wallets have been saved locally.
         */
        if (user.centryosWallets.length > 0) {
            return res.status(200).json({
                success: true,
                message:
                    "Your CentryOS wallets are already connected.",
                alreadyCreated: true,
                wallets: user.centryosWallets.map(
                    walletResponse
                )
            });
        }

        /*
         * The provider network request is completed
         * before opening the database transaction.
         */
        const result = await createEndUserWallets(
            user.centryosAccountId
        );

        const savedWallets = await prisma.$transaction(
            async (tx) => {

                const records = [];

                for (const wallet of result.wallets) {

                    const saved = await tx.centryosWallet.upsert({
                        where: {
                            userId_currency: {
                                userId: user.id,
                                currency: wallet.currency
                            }
                        },
                        create: {
                            userId: user.id,
                            centryosWalletId: wallet.id,
                            slug: wallet.slug,
                            currency: wallet.currency,
                            providerBalance:
                                wallet.providerBalance,
                            walletType: wallet.walletType,
                            displayCurrency:
                                wallet.displayCurrency,
                            permissions: wallet.permissions,
                            settings: wallet.settings,
                            providerPayload:
                                wallet.providerPayload
                        },
                        update: {
                            centryosWalletId: wallet.id,
                            slug: wallet.slug,
                            providerBalance:
                                wallet.providerBalance,
                            walletType: wallet.walletType,
                            displayCurrency:
                                wallet.displayCurrency,
                            permissions: wallet.permissions,
                            settings: wallet.settings,
                            providerPayload:
                                wallet.providerPayload
                        }
                    });

                    records.push(saved);
                }

                return records;
            }
        );

        return res.status(201).json({
            success: true,
            message:
                "CentryOS wallets created and connected successfully.",
            alreadyCreated: false,
            wallets: savedWallets.map(walletResponse)
        });

    } catch (error) {

        console.error(
            "Create CentryOS wallets error:",
            error
        );

        const providerStatus = Number(
            error.statusCode || 0
        );

        if (
            providerStatus === 400 ||
            providerStatus === 409
        ) {
            return res.status(409).json({
                success: false,
                message:
                    error.message ||
                    "CentryOS could not create these wallets.",
                providerResponse:
                    error.providerResponse || null
            });
        }

        return res.status(
            providerStatus >= 500 &&
            providerStatus <= 599
                ? 502
                : 500
        ).json({
            success: false,
            message:
                error.message ||
                "Unable to create CentryOS wallets.",
            providerResponse:
                error.providerResponse || null
        });
    }
};


/*==================================================
            GET MY SAVED WALLETS
==================================================*/

exports.getMyCentryosWallets = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id
            },
            select: {
                id: true,
                centryosAccountId: true,
                centryosWallets: {
                    orderBy: {
                        currency: "asc"
                    }
                }
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

        return res.status(200).json({
            success: true,
            accountId: user.centryosAccountId,
            wallets: user.centryosWallets.map(
                walletResponse
            )
        });

    } catch (error) {

        console.error(
            "Get CentryOS wallets error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load your connected wallets."
        });
    }
};
