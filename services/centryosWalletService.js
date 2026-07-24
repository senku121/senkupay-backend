/*==================================================
                SENKU PAY
        CENTRYOS WALLET SERVICE
==================================================*/

const {
    centryosPost
} = require("./centryosApiService");


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


function normalizeWallet(wallet) {

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
        walletType:
            settings?.walletType
                ? String(settings.walletType).trim()
                : "USER",
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

async function createEndUserWallets(entityId) {

    const normalizedEntityId = requiredString(
        entityId,
        "CentryOS entity ID"
    );

    const providerResponse = await centryosPost(
        "ledger",
        "/v1/ext/wallet/create",
        {
            entityId: normalizedEntityId,
            walletType: "USER"
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
        normalizeWallet
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
        wallets,
        providerResponse
    };
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    createEndUserWallets
};
