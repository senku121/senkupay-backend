/*==================================================
                SENKU PAY
     CENTRYOS LINKED ACCOUNT WIDGET SERVICE
==================================================*/

const {
    centryosPost
} = require("./centryosApiService");


/*==================================================
                    HELPERS
==================================================*/

function normalizeCurrency(value) {

    const currency =
        String(value || "USD")
            .trim()
            .toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
        throw new Error(
            "Currency must be a valid three-letter code."
        );
    }

    return currency;
}


function getRedirectUrl() {

    const explicitUrl =
        String(
            process.env
                .CENTRYOS_LINKED_ACCOUNT_REDIRECT_URL ||
            ""
        ).trim();

    if (explicitUrl) {
        return explicitUrl;
    }

    const frontendUrl =
        String(
            process.env.FRONTEND_URL || ""
        )
            .trim()
            .replace(/\/+$/, "");

    if (!frontendUrl) {
        throw new Error(
            "FRONTEND_URL or CENTRYOS_LINKED_ACCOUNT_REDIRECT_URL is required."
        );
    }

    return (
        `${frontendUrl}/withdraw.html` +
        "?linkedAccount=complete"
    );
}


function isAllowedCentryosUrl(value) {

    try {

        const url = new URL(value);

        const hostname =
            url.hostname.toLowerCase();

        return (
            url.protocol === "https:" &&
            (
                hostname === "centryos.xyz" ||
                hostname.endsWith(".centryos.xyz")
            )
        );

    } catch {
        return false;
    }
}


function appendEntityId(
    providerUrl,
    customerId
) {

    if (!isAllowedCentryosUrl(providerUrl)) {
        throw new Error(
            "CentryOS returned an invalid widget URL."
        );
    }

    const finalUrl =
        new URL(providerUrl);

    /*
     * CentryOS requires the response customerId to
     * be appended as the entityId query parameter.
     * URL.searchParams safely chooses ? or &.
     */
    finalUrl.searchParams.set(
        "entityId",
        customerId
    );

    return finalUrl.toString();
}


function parseExpiration(value) {

    if (!value) {
        return null;
    }

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}


/*==================================================
            CREATE ACCOUNT WIDGET
==================================================*/

async function createLinkedAccountWidget({
    currency,
    firstName,
    lastName,
    email
}) {

    const normalizedCurrency =
        normalizeCurrency(currency);

    const response =
        await centryosPost(
            "ledger",
            "/v1/ext/application-token",
            {
                tokenType:
                    "ACCOUNT_WIDGET",

                currency:
                    normalizedCurrency,

                useLinkAccountPath:
                    true,

                redirectTo:
                    getRedirectUrl(),

                extra: {

                    withdrawalSource:
                        "MERCHANT_WALLET",

                    counterparty: {

                        firstName:
                            String(
                                firstName || ""
                            ).trim(),

                        lastName:
                            String(
                                lastName || ""
                            ).trim(),

                        email:
                            String(
                                email || ""
                            ).trim()
                    }
                }
            }
        );

    const data =
        response?.data;

    const application =
        data?.application;

    const customerId =
        String(
            data?.customerId || ""
        ).trim();

    const providerUrl =
        String(
            data?.url || ""
        ).trim();

    const applicationId =
        String(
            application?.id || ""
        ).trim();

    if (
        !data ||
        !customerId ||
        !providerUrl ||
        !applicationId
    ) {

        const error = new Error(
            "CentryOS returned an incomplete linked-account widget response."
        );

        error.statusCode = 502;
        error.providerResponse =
            response;

        throw error;
    }

    const widgetUrl =
        appendEntityId(
            providerUrl,
            customerId
        );

    return {

        applicationId,

        customerId,

        tokenType:
            application?.tokenType ||
            "ACCOUNT_WIDGET",

        valid:
            Boolean(
                application?.valid
            ),

        expiresAt:
            parseExpiration(
                application?.expiredAt
            ),

        currency:
            normalizedCurrency,

        widgetUrl
    };
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    createLinkedAccountWidget
};
