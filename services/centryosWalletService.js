/*==================================================
                SENKU PAY
        CENTRYOS WALLET SERVICE
==================================================*/

const {
    centryosGet,
    centryosPost
} = require("./centryosApiService");


/*==================================================
                    CONSTANTS
==================================================*/

const ALLOWED_WALLET_TYPES =
new Set([
    "COLLECTION",
    "SPEND"
]);


/*==================================================
                    HELPERS
==================================================*/

function requiredString(
    value,
    fieldName
) {

    const normalized =
        String(value || "").trim();

    if (!normalized) {

        const error =
            new Error(
                `${fieldName} is required.`
            );

        error.statusCode = 400;

        throw error;
    }

    return normalized;
}


function normalizeWalletType(value) {

    const walletType =
        requiredString(
            value,
            "CentryOS wallet type"
        ).toUpperCase();

    if (
        !ALLOWED_WALLET_TYPES.has(
            walletType
        )
    ) {

        const error =
            new Error(
                "walletType must be COLLECTION or SPEND."
            );

        error.statusCode = 400;

        throw error;
    }

    return walletType;
}


function normalizeWallet(
    wallet,
    requestedWalletType
) {

    const id =
        requiredString(
            wallet?.id,
            "CentryOS wallet ID"
        );

    const currency =
        requiredString(
            wallet?.currency,
            "CentryOS wallet currency"
        ).toUpperCase();

    const settings =
        wallet?.settings &&
        typeof wallet.settings ===
            "object"
            ? wallet.settings
            : null;

    const permissions =
        wallet?.permissions &&
        typeof wallet.permissions ===
            "object"
            ? wallet.permissions
            : null;

    return {

        id,

        slug:
            wallet?.slug
                ? String(
                    wallet.slug
                ).trim()
                : null,

        currency,

        providerBalance:
            wallet?.balance !==
                undefined &&
            wallet?.balance !==
                null
                ? String(
                    wallet.balance
                )
                : null,

        walletType:
            requestedWalletType,

        displayCurrency:
            settings?.displayCurrency
                ? String(
                    settings
                        .displayCurrency
                )
                    .trim()
                    .toUpperCase()
                : null,

        permissions,
        settings,

        providerPayload:
            wallet

    };
}


function extractWalletArray(
    providerResponse
) {

    const possibleLists = [

        providerResponse?.wallets,
        providerResponse?.data?.wallets,
        providerResponse?.data

    ];

    for (const value of possibleLists) {

        if (Array.isArray(value)) {
            return value;
        }
    }

    return null;
}


function normalizeWalletList(
    providerResponse,
    requestedWalletType
) {

    const providerWallets =
        extractWalletArray(
            providerResponse
        );

    if (
        !Array.isArray(
            providerWallets
        )
    ) {

        const error =
            new Error(
                "CentryOS returned no wallet list."
            );

        error.statusCode = 502;
        error.providerResponse =
            providerResponse;

        throw error;
    }

    const wallets =
        providerWallets.map(
            (wallet) =>
                normalizeWallet(
                    wallet,
                    requestedWalletType
                )
        );

    if (
        wallets.length === 0
    ) {

        const error =
            new Error(
                "CentryOS returned an empty wallet list."
            );

        error.statusCode = 404;
        error.providerResponse =
            providerResponse;

        throw error;
    }

    return wallets;
}


function delay(milliseconds) {

    return new Promise(
        (resolve) => {

            setTimeout(
                resolve,
                milliseconds
            );

        }
    );
}


/*==================================================
            GET END-USER WALLETS
==================================================*/

async function getEndUserWallets(
    entityId,
    requestedWalletType
) {

    const normalizedEntityId =
        requiredString(
            entityId,
            "CentryOS entity ID"
        );

    const walletType =
        normalizeWalletType(
            requestedWalletType
        );

    const providerResponse =
        await centryosGet(
            "ledger",
            (
                "/v1/ext/wallet/" +
                "multi-currency/" +
                encodeURIComponent(
                    normalizedEntityId
                ) +
                "/" +
                walletType.toLowerCase()
            )
        );

    return {

        walletType,

        wallets:
            normalizeWalletList(
                providerResponse,
                walletType
            ),

        providerResponse

    };
}


/*==================================================
       GET WALLETS WITH SHORT RETRY WINDOW
==================================================*/

async function getEndUserWalletsWithRetry(
    entityId,
    requestedWalletType
) {

    const retryDelays = [
        0,
        350,
        800,
        1500,
        2500
    ];

    let lastError;

    for (
        const waitTime of retryDelays
    ) {

        if (waitTime > 0) {

            await delay(
                waitTime
            );
        }

        try {

            return await getEndUserWallets(
                entityId,
                requestedWalletType
            );

        } catch (error) {

            lastError =
                error;
        }
    }

    throw lastError;
}


/*==================================================
            CREATE END-USER WALLETS
==================================================*/

async function createEndUserWallets(
    entityId,
    requestedWalletType
) {

    const normalizedEntityId =
        requiredString(
            entityId,
            "CentryOS entity ID"
        );

    const walletType =
        normalizeWalletType(
            requestedWalletType
        );

    const createResponse =
        await centryosPost(
            "ledger",
            "/v1/ext/wallet/create",
            {
                entityId:
                    normalizedEntityId,

                walletType
            }
        );

    try {

        const fetched =
            await getEndUserWalletsWithRetry(
                normalizedEntityId,
                walletType
            );

        return {

            walletType,

            wallets:
                fetched.wallets,

            providerResponse: {

                create:
                    createResponse,

                fetch:
                    fetched.providerResponse

            }

        };

    } catch (fetchError) {

        const createWallets =
            extractWalletArray(
                createResponse
            );

        if (
            Array.isArray(
                createWallets
            ) &&
            createWallets.length > 0
        ) {

            return {

                walletType,

                wallets:
                    normalizeWalletList(
                        createResponse,
                        walletType
                    ),

                providerResponse: {

                    create:
                        createResponse,

                    fetchError:
                        fetchError
                            .providerResponse ||
                        fetchError
                            .message

                }

            };
        }

        const error =
            new Error(
                "CentryOS confirmed wallet creation, but the created wallets could not be retrieved."
            );

        error.statusCode = 502;

        error.providerResponse = {

            create:
                createResponse,

            fetch:
                fetchError
                    .providerResponse ||
                fetchError
                    .message

        };

        throw error;
    }
}


/*==================================================
       CREATE OR RECOVER EXISTING WALLETS
==================================================*/

async function createOrRecoverEndUserWallets(
    entityId,
    requestedWalletType
) {

    try {

        /*
         * First recover provider wallets that already
         * exist but are missing from the local DB.
         */
        return await getEndUserWalletsWithRetry(
            entityId,
            requestedWalletType
        );

    } catch (getError) {

        try {

            return await createEndUserWallets(
                entityId,
                requestedWalletType
            );

        } catch (createError) {

            const statusCode =
                Number(
                    createError
                        .statusCode || 0
                );

            /*
             * A simultaneous request may have created
             * the wallets first. Fetch them rather than
             * failing the customer's checkout.
             */
            if (
                statusCode === 400 ||
                statusCode === 409
            ) {

                return getEndUserWalletsWithRetry(
                    entityId,
                    requestedWalletType
                );
            }

            throw createError;
        }
    }
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {

    ALLOWED_WALLET_TYPES,

    normalizeWalletType,

    getEndUserWallets,
    getEndUserWalletsWithRetry,

    createEndUserWallets,
    createOrRecoverEndUserWallets

};
