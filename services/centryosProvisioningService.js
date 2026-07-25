/*==================================================
                SENKU PAY
       CENTRYOS AUTOMATIC PROVISIONING
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const {
    createOrRecoverEndUserAccount
} = require(
    "./centryosAccountService"
);

const {
    normalizeWalletType,
    createOrRecoverEndUserWallets
} = require(
    "./centryosWalletService"
);

const prisma =
    new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function normalizeCurrency(value) {

    const currency =
        String(value || "USD")
            .trim()
            .toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {

        const error =
            new Error(
                "Currency must be a valid three-letter code."
            );

        error.statusCode = 400;

        throw error;
    }

    return currency;
}


function isUniqueConstraintError(
    error
) {

    return (
        error &&
        error.code === "P2002"
    );
}


function validateUserForProvisioning(
    user
) {

    if (!user) {

        const error =
            new Error(
                "User not found."
            );

        error.statusCode = 404;

        throw error;
    }

    if (
        String(
            user.status || ""
        ).toUpperCase() !==
        "ACTIVE"
    ) {

        const error =
            new Error(
                "Your Senku Pay account is not active."
            );

        error.statusCode = 403;

        throw error;
    }

    if (!user.emailVerified) {

        const error =
            new Error(
                "Verify your email before continuing to payment."
            );

        error.statusCode = 403;

        throw error;
    }
}


function walletResponse(wallet) {

    return {

        id:
            wallet
                .centryosWalletId,

        slug:
            wallet.slug,

        currency:
            wallet.currency,

        balance:
            wallet.providerBalance,

        walletType:
            wallet.walletType,

        displayCurrency:
            wallet.displayCurrency,

        permissions:
            wallet.permissions,

        settings:
            wallet.settings,

        createdAt:
            wallet.createdAt,

        updatedAt:
            wallet.updatedAt

    };
}


/*==================================================
             READ PROVISIONING USER
==================================================*/

async function getProvisioningUser(
    userId
) {

    return prisma.user.findUnique({

        where: {
            id:
                userId
        },

        select: {

            id:
                true,

            username:
                true,

            firstName:
                true,

            lastName:
                true,

            email:
                true,

            status:
                true,

            emailVerified:
                true,

            centryosAccountId:
                true,

            centryosAccountCreatedAt:
                true

        }

    });
}


/*==================================================
          ENSURE CENTRYOS USER ACCOUNT
==================================================*/

async function ensureCentryosAccountForUser(
    userId
) {

    let user =
        await getProvisioningUser(
            userId
        );

    validateUserForProvisioning(
        user
    );

    if (user.centryosAccountId) {

        return {
            user,
            accountId:
                user.centryosAccountId,
            accountCreated:
                false,
            accountRecovered:
                false
        };
    }

    const result =
        await createOrRecoverEndUserAccount(
            user
        );

    try {

        /*
         * updateMany acts as a local compare-and-set.
         * If another request already connected the
         * account, this request does not overwrite it.
         */
        await prisma.user.updateMany({

            where: {

                id:
                    user.id,

                centryosAccountId:
                    null

            },

            data: {

                centryosAccountId:
                    result.accountId,

                centryosAccountCreatedAt:
                    new Date()

            }

        });

    } catch (error) {

        /*
         * A unique conflict can happen when another
         * concurrent request saved the same provider
         * account first. Re-read the final state.
         */
        if (
            !isUniqueConstraintError(
                error
            )
        ) {
            throw error;
        }
    }

    user =
        await getProvisioningUser(
            user.id
        );

    if (!user?.centryosAccountId) {

        const error =
            new Error(
                "CentryOS account provisioning did not complete."
            );

        error.statusCode = 502;

        throw error;
    }

    if (
        user.centryosAccountId !==
        result.accountId
    ) {

        const error =
            new Error(
                "A different CentryOS account is already connected to this user."
            );

        error.statusCode = 409;

        throw error;
    }

    return {

        user,

        accountId:
            user.centryosAccountId,

        accountCreated:
            !result.recovered,

        accountRecovered:
            Boolean(
                result.recovered
            )

    };
}


/*==================================================
             SAVE PROVIDER WALLETS
==================================================*/

async function saveProviderWallets({
    userId,
    walletType,
    wallets
}) {

    return prisma.$transaction(
        async (tx) => {

            const savedWallets = [];

            for (
                const wallet of wallets
            ) {

                const saved =
                    await tx
                        .centryosWallet
                        .upsert({

                            where: {

                                userId_currency_walletType: {

                                    userId,

                                    currency:
                                        wallet.currency,

                                    walletType

                                }

                            },

                            create: {

                                userId,

                                centryosWalletId:
                                    wallet.id,

                                slug:
                                    wallet.slug,

                                currency:
                                    wallet.currency,

                                providerBalance:
                                    wallet.providerBalance,

                                walletType,

                                displayCurrency:
                                    wallet.displayCurrency,

                                permissions:
                                    wallet.permissions,

                                settings:
                                    wallet.settings,

                                providerPayload:
                                    wallet.providerPayload

                            },

                            update: {

                                centryosWalletId:
                                    wallet.id,

                                slug:
                                    wallet.slug,

                                providerBalance:
                                    wallet.providerBalance,

                                displayCurrency:
                                    wallet.displayCurrency,

                                permissions:
                                    wallet.permissions,

                                settings:
                                    wallet.settings,

                                providerPayload:
                                    wallet.providerPayload

                            }

                        });

                savedWallets.push(
                    saved
                );
            }

            return savedWallets;
        }
    );
}


/*==================================================
          ENSURE ONE WALLET TYPE
==================================================*/

async function ensureCentryosWalletTypeForUser({
    userId,
    accountId,
    walletType,
    requiredCurrency = "USD"
}) {

    const normalizedWalletType =
        normalizeWalletType(
            walletType
        );

    const normalizedCurrency =
        normalizeCurrency(
            requiredCurrency
        );

    const localWallets =
        await prisma
            .centryosWallet
            .findMany({

                where: {
                    userId,
                    walletType:
                        normalizedWalletType
                },

                orderBy: {
                    currency:
                        "asc"
                }

            });

    const requiredLocalWallet =
        localWallets.find(
            (wallet) =>
                wallet.currency ===
                normalizedCurrency
        );

    if (requiredLocalWallet) {

        return {

            walletType:
                normalizedWalletType,

            wallets:
                localWallets,

            createdOrRecovered:
                false

        };
    }

    const providerResult =
        await createOrRecoverEndUserWallets(
            accountId,
            normalizedWalletType
        );

    const savedWallets =
        await saveProviderWallets({

            userId,

            walletType:
                normalizedWalletType,

            wallets:
                providerResult.wallets

        });

    const requiredWallet =
        savedWallets.find(
            (wallet) =>
                wallet.currency ===
                normalizedCurrency
        );

    if (!requiredWallet) {

        const error =
            new Error(
                `CentryOS did not provide a ${normalizedCurrency} ${normalizedWalletType} wallet.`
            );

        error.statusCode = 502;
        error.providerResponse =
            providerResult.providerResponse;

        throw error;
    }

    return {

        walletType:
            normalizedWalletType,

        wallets:
            savedWallets,

        createdOrRecovered:
            true

    };
}


/*==================================================
        ENSURE CHECKOUT REQUIREMENTS
==================================================*/

async function ensureCentryosCheckoutSetup(
    userId,
    currency = "USD"
) {

    const normalizedCurrency =
        normalizeCurrency(
            currency
        );

    const accountResult =
        await ensureCentryosAccountForUser(
            userId
        );

    const collectionResult =
        await ensureCentryosWalletTypeForUser({

            userId:
                accountResult.user.id,

            accountId:
                accountResult.accountId,

            walletType:
                "COLLECTION",

            requiredCurrency:
                normalizedCurrency

        });

    /*
     * SPEND is not required to accept a deposit.
     * Try to prepare it now for future push-to-card
     * withdrawals, but do not block checkout when a
     * temporary SPEND-wallet error occurs.
     */
    let spendReady = false;
    let spendError = null;

    try {

        await ensureCentryosWalletTypeForUser({

            userId:
                accountResult.user.id,

            accountId:
                accountResult.accountId,

            walletType:
                "SPEND",

            requiredCurrency:
                normalizedCurrency

        });

        spendReady = true;

    } catch (error) {

        spendError =
            error.message;

        console.error(
            "Optional CentryOS SPEND wallet provisioning error:",
            error
        );
    }

    return {

        user:
            accountResult.user,

        accountId:
            accountResult.accountId,

        accountCreated:
            accountResult.accountCreated,

        accountRecovered:
            accountResult.accountRecovered,

        collectionWallets:
            collectionResult.wallets,

        collectionReady:
            true,

        spendReady,
        spendError

    };
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {

    ensureCentryosAccountForUser,
    ensureCentryosWalletTypeForUser,
    ensureCentryosCheckoutSetup,

    walletResponse

};
