/*==================================================
                SENKU PAY
       CENTRYOS PUSH-TO-CARD PAYOUT SERVICE
==================================================*/

const {
    centryosPost
} = require("./centryosApiService");


/*==================================================
                    HELPERS
==================================================*/

function normalizeAmount(value) {

    const amount = Number(value);

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        throw new Error(
            "Payout amount must be greater than zero."
        );
    }

    return Math.round(
        (amount + Number.EPSILON) * 100
    ) / 100;
}


function normalizeCurrency(value) {

    const currency =
        String(value || "USD")
            .trim()
            .toUpperCase();

    /*
     * The CentryOS documentation for this endpoint
     * currently supports USD only.
     */
    if (currency !== "USD") {
        throw new Error(
            "Push-to-card payout currently supports USD only."
        );
    }

    return currency;
}


function parseMoney(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const amount = Number(value);

    return Number.isFinite(amount)
        ? amount
        : null;
}


/*==================================================
            SUBMIT PUSH-TO-CARD PAYOUT
==================================================*/

async function submitPushToCardPayout({
    currency,
    linkedAccountId,
    amount,
    reason
}) {

    const normalizedCurrency =
        normalizeCurrency(currency);

    const normalizedAmount =
        normalizeAmount(amount);

    const providerLinkedAccountId =
        String(linkedAccountId || "")
            .trim();

    if (!providerLinkedAccountId) {
        throw new Error(
            "A CentryOS linked card ID is required."
        );
    }

    const response =
        await centryosPost(
            "ledger",
            (
                "/v1/ext/linked-accounts/" +
                encodeURIComponent(
                    normalizedCurrency
                ) +
                "/" +
                encodeURIComponent(
                    providerLinkedAccountId
                ) +
                "/withdrawal"
            ),
            {
                amount:
                    normalizedAmount,

                walletType:
                    "SPEND",

                reason:
                    String(
                        reason ||
                        "Senku Pay card withdrawal"
                    ).trim()

                /*
                 * routingType is deliberately omitted.
                 * CentryOS documents this as push-to-card
                 * behavior for linked CARD accounts.
                 */
            }
        );

    const data =
        response?.data || {};

    if (
        response?.success !== true ||
        !String(data?.id || "").trim()
    ) {

        const error = new Error(
            response?.message ||
            "CentryOS returned an incomplete payout response."
        );

        error.statusCode = 502;
        error.providerResponse =
            response;

        throw error;
    }

    return {
        providerTransactionId:
            String(data.id),

        providerStatus:
            String(
                data.status ||
                "QUEUED"
            ).toUpperCase(),

        providerFee:
            parseMoney(data.fees),

        providerDebitedAmount:
            parseMoney(data.amount),

        message:
            response.message ||
            "Payment queued",

        providerResponse:
            response
    };
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    submitPushToCardPayout
};
