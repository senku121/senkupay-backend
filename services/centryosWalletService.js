/*==================================================
                SENKU PAY
        CENTRYOS WALLET SERVICE
==================================================*/

const {
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

        // Store the accepted request type. The provider guide may
        // return a different settings.walletType value.
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

    const providerResponse = await centryosPost(
        "ledger",
        "/v1/ext/wallet/create",
        {
            entityId: normalizedEntityId,
            walletType
        }
    );

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
            walletType
        )
    );

    if (wallets.length === 0) {

        const error = new Error(
            "CentryOS created no usable wallets."
        );

        error.statusCode = 502;
        error.providerResponse = providerResponse;

        throw error;
    }

    return {
        walletType,
        wallets,
        providerResponse
    };
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    ALLOWED_WALLET_TYPES,
    normalizeWalletType,
    createEndUserWallets
};
