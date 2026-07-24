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

const ALLOWED_WALLET_TYPES = new Set([
    "COLLECTION",
    "SPEND"
]);


/*==================================================
                    HELPERS
==================================================*/

function requiredString(value, fieldName) {

    const normalized = String(value || "").trim();

    if (!normalized) {
        throw new Error(`${fieldName} is required.`);
    }

    return normalized;
}


function normalizeWalletType(value) {

    const walletType = requiredString(
        value,
        "CentryOS wallet type"
    ).toUpperCase();

    if (!ALLOWED_WALLET_TYPES.has(walletType)) {
        const error = new Error(
            "walletType must be COLLECTION or SPEND."
        );

        error.statusCode = 400;
        throw error;
    }

    return walletType;
}


function normalizeWallet(wallet, requestedWalletType) {

    const id = requiredString(
        wallet?.id,
        "CentryOS wallet ID"
    );

    const currency = requiredString(
        wallet?.currency,
        "CentryOS wallet currency"
    ).toUpperCase();

    const settings =
        wallet?.settings &&
        typeof wallet.settings === "object"
            ? wallet.settings
            : null;

    const permissions =
        wallet?.permissions &&
        typeof wallet.permissions === "object"
            ? wallet.permissions
            : null;

    return {
        id,

        slug: wallet?.slug
            ? String(wallet.slug).trim()
            : null,

        currency,

        providerBalance:
            wallet?.balance !== undefined &&
            wallet?.balance !== null
                ? String(wallet.balance)
                : null,

        walletType: requestedWalletType,

        displayCurrency:
            settings?.displayCurrency
                ? String(settings.displayCurrency)
                    .trim()
                    .toUpperCase()
                : null,

        permissions,
        settings,
        providerPayload: wallet
    };
}


function normalizeWalletList(
    providerResponse,
    requestedWalletType
) {

    if (!Array.isArray(providerResponse?.wallets)) {
        const error = new Error(
            "CentryOS returned no wallet list."
        );

        error.statusCode = 502;
        error.providerResponse = providerResponse;
        throw error;
    }

    const wallets = providerResponse.wallets.map(
        (wallet) => normalizeWallet(
            wallet,
            requestedWalletType
        )
    );

    if (wallets.length === 0) {
        const error = new Error(
            "CentryOS returned an empty wallet list."
        );

        error.statusCode = 502;
        error.providerResponse = providerResponse;
        throw error;
    }

    return wallets;
}


function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}


/*==================================================
            GET END-USER WALLETS
==================================================*/

async function getEndUserWallets(
    entityId,
    requestedWalletType
) {

    const normalizedEntityId = requiredString(
        entityId,
        "CentryOS entity ID"
    );

    const walletType = normalizeWalletType(
        requestedWalletType
    );

    const providerResponse = await centryosGet(
        "ledger",
        `/v1/ext/wallet/multi-currency/${encodeURIComponent(
            normalizedEntityId
        )}/${walletType.toLowerCase()}`
    );

    return {
        walletType,
        wallets: normalizeWalletList(
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
        1500
    ];

    let lastError;

    for (const waitTime of retryDelays) {

        if (waitTime > 0) {
            await delay(waitTime);
        }

        try {
            return await getEndUserWallets(
                entityId,
                requestedWalletType
            );
        } catch (error) {
            lastError = error;
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

    const normalizedEntityId = requiredString(
        entityId,
        "CentryOS entity ID"
    );

    const walletType = normalizeWalletType(
        requestedWalletType
    );

    /*
     * CentryOS may return only:
     * {
     *   "message": "Collection wallet created successfully",
     *   "success": true
     * }
     *
     * Therefore, the create response must not be treated as the
     * authoritative wallet list. Create first, then fetch the wallets
     * through the documented multi-currency endpoint.
     */
    const createResponse = await centryosPost(
        "ledger",
        "/v1/ext/wallet/create",
        {
            entityId: normalizedEntityId,
            walletType
        }
    );

    try {

        const fetched = await getEndUserWalletsWithRetry(
            normalizedEntityId,
            walletType
        );

        return {
            walletType,
            wallets: fetched.wallets,
            providerResponse: {
                create: createResponse,
                fetch: fetched.providerResponse
            }
        };

    } catch (fetchError) {

        /*
         * Some CentryOS deployments return the wallet array directly
         * from the create call. Use it only as a safe fallback when the
         * follow-up GET is temporarily unavailable.
         */
        if (
            Array.isArray(createResponse?.wallets) &&
            createResponse.wallets.length > 0
        ) {
            return {
                walletType,
                wallets: normalizeWalletList(
                    createResponse,
                    walletType
                ),
                providerResponse: {
                    create: createResponse,
                    fetchError:
                        fetchError.providerResponse ||
                        fetchError.message
                }
            };
        }

        const error = new Error(
            "CentryOS confirmed wallet creation, but the created wallets could not be retrieved."
        );

        error.statusCode = 502;
        error.providerResponse = {
            create: createResponse,
            fetch:
                fetchError.providerResponse ||
                fetchError.message
        };

        throw error;
    }
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    ALLOWED_WALLET_TYPES,
    normalizeWalletType,
    getEndUserWallets,
    createEndUserWallets
};
