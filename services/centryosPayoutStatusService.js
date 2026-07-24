/*==================================================
                SENKU PAY
      CENTRYOS PAYOUT STATUS SERVICE
==================================================*/

const {
    centryosGet
} = require("./centryosApiService");


async function getTransactionWebhookPayload(
    transactionId
) {

    const id =
        String(
            transactionId || ""
        ).trim();

    if (!id) {
        throw new Error(
            "CentryOS transaction ID is required."
        );
    }

    const response =
        await centryosGet(
            "ledger",
            (
                "/v1/transactions/" +
                encodeURIComponent(id) +
                "/webhook-payload"
            )
        );

    if (
        response?.success !== true ||
        !response?.data ||
        typeof response.data !==
            "object"
    ) {

        const error =
            new Error(
                response?.message ||
                "CentryOS returned an invalid transaction webhook payload."
            );

        error.statusCode =
            502;

        error.providerResponse =
            response;

        throw error;
    }

    return response.data;
}


module.exports = {
    getTransactionWebhookPayload
};
