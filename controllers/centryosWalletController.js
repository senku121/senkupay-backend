/*==================================================
                SENKU PAY
       CENTRYOS WALLET CONTROLLER
==================================================*/

const {
    PrismaClient
} = require(
    "@prisma/client"
);

const {
    normalizeWalletType
} = require(
    "../services/centryosWalletService"
);

const {

    ensureCentryosAccountForUser,
    ensureCentryosWalletTypeForUser,
    walletResponse

} = require(
    "../services/centryosProvisioningService"
);

const prisma =
    new PrismaClient();


/*==================================================
          CREATE/ENSURE MY WALLETS
==================================================*/

exports.createMyCentryosWallets =
async (req, res) => {

    try {

        const walletType =
            normalizeWalletType(
                req.body?.walletType
            );

        const accountResult =
            await ensureCentryosAccountForUser(
                req.user.id
            );

        const result =
            await ensureCentryosWalletTypeForUser({

                userId:
                    accountResult.user.id,

                accountId:
                    accountResult.accountId,

                walletType,

                requiredCurrency:
                    String(
                        req.body?.currency ||
                        "USD"
                    )
                        .trim()
                        .toUpperCase()

            });

        return res.status(
            result.createdOrRecovered
                ? 201
                : 200
        ).json({

            success:
                true,

            message:
                result.createdOrRecovered
                    ? `CentryOS ${walletType} wallets created or recovered and connected successfully.`
                    : `Your CentryOS ${walletType} wallets are already connected.`,

            alreadyCreated:
                !result.createdOrRecovered,

            walletType,

            wallets:
                result.wallets.map(
                    walletResponse
                )

        });

    } catch (error) {

        console.error(
            "Create CentryOS wallets error:",
            error
        );

        const status =
            Number(
                error.statusCode || 500
            );

        return res.status(
            status >= 400 &&
            status <= 599
                ? status
                : 500
        ).json({

            success:
                false,

            message:
                error.message ||
                "Unable to create CentryOS wallets.",

            providerResponse:
                error.providerResponse ||
                null

        });
    }
};


/*==================================================
            GET MY SAVED WALLETS
==================================================*/

exports.getMyCentryosWallets =
async (req, res) => {

    try {

        const requestedWalletType =
            req.query.walletType
                ? normalizeWalletType(
                    req.query.walletType
                )
                : null;

        const accountResult =
            await ensureCentryosAccountForUser(
                req.user.id
            );

        if (requestedWalletType) {

            await ensureCentryosWalletTypeForUser({

                userId:
                    accountResult.user.id,

                accountId:
                    accountResult.accountId,

                walletType:
                    requestedWalletType,

                requiredCurrency:
                    String(
                        req.query.currency ||
                        "USD"
                    )
                        .trim()
                        .toUpperCase()

            });
        }

        const wallets =
            await prisma
                .centryosWallet
                .findMany({

                    where: {

                        userId:
                            accountResult.user.id,

                        ...(requestedWalletType
                            ? {
                                walletType:
                                    requestedWalletType
                            }
                            : {})

                    },

                    orderBy: [
                        {
                            walletType:
                                "asc"
                        },
                        {
                            currency:
                                "asc"
                        }
                    ]

                });

        return res.status(200).json({

            success:
                true,

            accountId:
                accountResult.accountId,

            walletType:
                requestedWalletType,

            wallets:
                wallets.map(
                    walletResponse
                )

        });

    } catch (error) {

        console.error(
            "Get CentryOS wallets error:",
            error
        );

        const status =
            Number(
                error.statusCode || 500
            );

        return res.status(
            status >= 400 &&
            status <= 599
                ? status
                : 500
        ).json({

            success:
                false,

            message:
                error.message ||
                "Unable to load the connected wallets.",

            providerResponse:
                error.providerResponse ||
                null

        });
    }
};
