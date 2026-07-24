/*==================================================
                SENKU PAY
        CENTRYOS CHECKOUT SERVICE
==================================================*/

const {
    centryosPost
} = require("./centryosApiService");


/*==================================================
                    CONSTANTS
==================================================*/

const SUPPORTED_CURRENCIES = new Set([
    "USD",
    "NGN",
    "CAD",
    "GBP",
    "EUR"
]);


/*==================================================
                    HELPERS
==================================================*/

function requiredString(value, fieldName) {

    const normalized = String(value || "").trim();

    if (!normalized) {
        const error = new Error(`${fieldName} is required.`);
        error.statusCode = 400;
        throw error;
    }

    return normalized;
}


function normalizeCurrency(value) {

    const currency = requiredString(
        value,
        "currency"
    ).toUpperCase();

    if (!SUPPORTED_CURRENCIES.has(currency)) {
        const error = new Error(
            "currency must be USD, NGN, CAD, GBP, or EUR."
        );
        error.statusCode = 400;
        throw error;
    }

    return currency;
}


function normalizeAmount(value) {

    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        const error = new Error(
            "amount must be a valid number."
        );
        error.statusCode = 400;
        throw error;
    }

    if (amount < 0.5) {
        const error = new Error(
            "amount must be at least 0.50."
        );
        error.statusCode = 400;
        throw error;
    }

    return Math.round((amount + Number.EPSILON) * 100) / 100;
}


function normalizePaymentLinkResponse(providerResponse) {

    const data = providerResponse?.data;
    const application = data?.application;
    const paymentUrl = String(data?.url || "").trim();
    const paymentLinkId = String(application?.id || "").trim();

    if (!paymentUrl || !paymentLinkId) {
        const error = new Error(
            "CentryOS returned an incomplete payment-link response."
        );

        error.statusCode = 502;
        error.providerResponse = providerResponse;
        throw error;
    }

    let expiredAt = null;

    if (application?.expiredAt) {
        const parsedDate = new Date(application.expiredAt);

        if (!Number.isNaN(parsedDate.getTime())) {
            expiredAt = parsedDate;
        }
    }

    return {
        paymentUrl,
        paymentLinkId,
        token: application?.token
            ? String(application.token)
            : null,
        tokenType: application?.tokenType
            ? String(application.tokenType)
            : null,
        expiredAt,
        valid: application?.valid === true,
        providerResponse
    };
}


/*==================================================
             CREATE PAYMENT LINK
==================================================*/

async function createCentryosPaymentLink({
    depositId,
    userId,
    userEmail,
    username,
    amount,
    currency,
    itemDeliveryAddress,
    redirectTo
}) {

    const normalizedDepositId = requiredString(
        depositId,
        "depositId"
    );

    const normalizedUserId = requiredString(
        userId,
        "userId"
    );

    const normalizedEmail = requiredString(
        userEmail,
        "userEmail"
    );

    const normalizedUsername = requiredString(
        username,
        "username"
    );

    const normalizedAmount = normalizeAmount(amount);
    const normalizedCurrency = normalizeCurrency(currency);

    const deliveryAddress = requiredString(
        itemDeliveryAddress,
        "itemDeliveryAddress"
    );

    const normalizedRedirectTo = requiredString(
        redirectTo,
        "redirectTo"
    );

    const providerResponse = await centryosPost(
        "ledger",
        "/v1/ext/collections/payment-link",
        {
            currency: normalizedCurrency,
            name: "Senku Pay account funding",
            amount: normalizedAmount,
            customUrlPath: `senkupay-${normalizedDepositId}`,
            redirectTo: normalizedRedirectTo,

            // One deposit request must not be reusable.
            checkoutType: "generic",
            isOpenLink: false,
            customerPays: true,

            orderId: normalizedDepositId,
            externalId: normalizedDepositId,

            acceptedPaymentOptions: [
                "card"
            ],

            notifyPayee: false,

            itemDeliveryAddress: deliveryAddress,

            cartItems: [
                {
                    name: "Senku Pay account funding",
                    description:
                        `Account funding for Senku Pay user ${normalizedUsername}`,
                    qty: 1,
                    price: normalizedAmount,
                    currency: normalizedCurrency,
                    productId: "SENKUPAY-ACCOUNT-FUNDING"
                }
            ],

            customData: {
                depositId: normalizedDepositId,
                userId: normalizedUserId,
                email: normalizedEmail
            }
        }
    );

    return normalizePaymentLinkResponse(
        providerResponse
    );
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    SUPPORTED_CURRENCIES,
    normalizeAmount,
    normalizeCurrency,
    createCentryosPaymentLink
};
