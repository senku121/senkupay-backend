/*==================================================
                SENKU PAY
       CENTRYOS LINKED ACCOUNTS SERVICE
==================================================*/

const {
    centryosGet
} = require("./centryosApiService");


/*==================================================
                    CONSTANTS
==================================================*/

const ALLOWED_ACCOUNT_TYPES = new Set([
    "bank",
    "card",
    "international_bank",
    "prepaid_card"
]);


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


function normalizeAccountType(value) {

    const accountType =
        String(value || "")
            .trim()
            .toLowerCase();

    if (!accountType) {
        return null;
    }

    if (!ALLOWED_ACCOUNT_TYPES.has(accountType)) {
        throw new Error(
            "accountType must be one of: bank, card, international_bank, prepaid_card."
        );
    }

    return accountType;
}


function normalizePage(value) {

    const page = Number.parseInt(value, 10);

    if (!Number.isInteger(page) || page < 1) {
        return 1;
    }

    return page;
}


function normalizeLimit(value) {

    const limit = Number.parseInt(value, 10);

    if (!Number.isInteger(limit) || limit < 1) {
        return 10;
    }

    return Math.min(limit, 50);
}


function optionalText(value, maxLength = 120) {

    const text =
        String(value || "").trim();

    if (!text) {
        return null;
    }

    return text.slice(0, maxLength);
}


function buildQuery({
    page,
    limit,
    externalId,
    accountType,
    email,
    last4,
    bank
}) {

    const params = new URLSearchParams();

    params.set(
        "page",
        String(normalizePage(page))
    );

    params.set(
        "limit",
        String(normalizeLimit(limit))
    );

    /*
     * The browser is never allowed to choose this.
     * It is supplied by the authenticated backend
     * from the current Senku Pay user record.
     */
    params.set(
        "externalId",
        String(externalId)
    );

    const normalizedAccountType =
        normalizeAccountType(accountType);

    if (normalizedAccountType) {
        params.set(
            "accountType",
            normalizedAccountType
        );
    }

    const safeEmail =
        optionalText(email, 254);

    if (safeEmail) {
        params.set("email", safeEmail);
    }

    const safeLast4 =
        optionalText(last4, 4);

    if (safeLast4) {

        if (!/^[A-Za-z0-9]{4}$/.test(safeLast4)) {
            throw new Error(
                "last4 must contain exactly four letters or digits."
            );
        }

        params.set("last4", safeLast4);
    }

    const safeBank =
        optionalText(bank, 80);

    if (safeBank) {
        params.set("bank", safeBank);
    }

    return params;
}


function extractResponse(response) {

    const accounts =
        Array.isArray(response?.data)
            ? response.data
            : [];

    const meta =
        response?.meta &&
        typeof response.meta === "object"
            ? response.meta
            : {
                page: 1,
                pageSize: accounts.length,
                pageCount: accounts.length ? 1 : 0,
                total: accounts.length
            };

    return {
        accounts,
        meta
    };
}


/*==================================================
          GET END-USER LINKED ACCOUNTS
==================================================*/

async function getEndUserLinkedAccounts({
    currency,
    externalId,
    fallbackExternalId,
    page,
    limit,
    accountType,
    email,
    last4,
    bank
}) {

    const normalizedCurrency =
        normalizeCurrency(currency);

    const common = {
        page,
        limit,
        accountType,
        email,
        last4,
        bank
    };

    const primaryQuery =
        buildQuery({
            ...common,
            externalId
        });

    let response =
        await centryosGet(
            "ledger",
            `/v1/ext/linked-accounts/${encodeURIComponent(normalizedCurrency)}?${primaryQuery.toString()}`
        );

    let parsed =
        extractResponse(response);

    /*
     * CentryOS calls the account-creation identifier
     * an externalId, while some installations may
     * index the CentryOS entity/account ID instead.
     * Both values are user-specific. Retry only when
     * the first filtered result is empty.
     */
    if (
        parsed.accounts.length === 0 &&
        fallbackExternalId &&
        String(fallbackExternalId) !==
            String(externalId)
    ) {

        const fallbackQuery =
            buildQuery({
                ...common,
                externalId:
                    fallbackExternalId
            });

        response =
            await centryosGet(
                "ledger",
                `/v1/ext/linked-accounts/${encodeURIComponent(normalizedCurrency)}?${fallbackQuery.toString()}`
            );

        parsed =
            extractResponse(response);
    }

    return {
        currency:
            normalizedCurrency,
        accounts:
            parsed.accounts,
        meta:
            parsed.meta
    };
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    getEndUserLinkedAccounts,
    ALLOWED_ACCOUNT_TYPES
};
