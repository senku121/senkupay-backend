/*==================================================
                SENKU PAY
       CENTRYOS WALLET CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const {
    normalizeWalletType,
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

        const walletType = normalizeWalletType(
            req.body?.walletType
        );

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
                    where: {
                        walletType
                    },
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
         * Prevent repeating the create call for the same wallet type,
         * while still allowing COLLECTION and SPEND to be created
         * independently.
         */
        if (user.centryosWallets.length > 0) {
            return res.status(200).json({
                success: true,
                message:
                    `Your CentryOS ${walletType} wallets are already connected.`,
                alreadyCreated: true,
                walletType,
                wallets: user.centryosWallets.map(
                    walletResponse
                )
            });
        }

        const result = await createEndUserWallets(
            user.centryosAccountId,
            walletType
        );

        const savedWallets = await prisma.$transaction(
            async (tx) => {

                const records = [];

                for (const wallet of result.wallets) {

                    const saved = await tx.centryosWallet.upsert({
                        where: {
                            userId_currency_walletType: {
                                userId: user.id,
                                currency: wallet.currency,
                                walletType: result.walletType
                            }
                        },
                        create: {
                            userId: user.id,
                            centryosWalletId: wallet.id,
                            slug: wallet.slug,
                            currency: wallet.currency,
                            providerBalance:
                                wallet.providerBalance,
                            walletType: result.walletType,
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
                `CentryOS ${result.walletType} wallets created and connected successfully.`,
            alreadyCreated: false,
            walletType: result.walletType,
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
            return res.status(providerStatus).json({
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

        let walletType;

        if (req.query.walletType) {
            walletType = normalizeWalletType(
                req.query.walletType
            );
        }

        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id
            },
            select: {
                id: true,
                centryosAccountId: true,
                centryosWallets: {
                    where: walletType
                        ? { walletType }
                        : undefined,
                    orderBy: [
                        { walletType: "asc" },
                        { currency: "asc" }
                    ]
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
            walletType: walletType || null,
            wallets: user.centryosWallets.map(
                walletResponse
            )
        });

    } catch (error) {

        console.error(
            "Get CentryOS wallets error:",
            error
        );

        const status = Number(error.statusCode || 500);

        return res.status(
            status >= 400 && status < 500
                ? status
                : 500
        ).json({
            success: false,
            message:
                error.message ||
                "Unable to load your connected wallets."
        });
    }
};
