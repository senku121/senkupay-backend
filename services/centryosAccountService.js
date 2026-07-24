/*==================================================
                SENKU PAY
        CENTRYOS ACCOUNT SERVICE
==================================================*/

const {
    centryosGet,
    centryosPost
} = require("./centryosApiService");


/*==================================================
                    HELPERS
==================================================*/

function requiredString(value, fieldName) {

    const normalized = String(value || "").trim();

    if (!normalized) {
        throw new Error(
            `${fieldName} is required to create a CentryOS account.`
        );
    }

    return normalized;
}


/*==================================================
          CREATE END-USER ACCOUNT (PERSON)
==================================================*/

async function createEndUserAccount(user) {

    const payload = {
        firstName: requiredString(
            user.firstName,
            "First name"
        ),

        lastName: requiredString(
            user.lastName,
            "Last name"
        ),

        email: requiredString(
            user.email,
            "Email"
        ).toLowerCase(),

        // This permanently links the provider account
        // to the matching Senku Pay database user.
        identifier: requiredString(
            user.id,
            "Senku Pay user ID"
        ),

        type: "USER"
    };

    const providerResponse = await centryosPost(
        "account",
        "/v1/ext/account/create-user",
        payload
    );

    const accountId = String(
        providerResponse?.account?.id || ""
    ).trim();

    if (!accountId) {

        const error = new Error(
            "CentryOS created no usable account ID."
        );

        error.statusCode = 502;
        error.providerResponse = providerResponse;

        throw error;
    }

    return {
        accountId,
        providerResponse
    };
}


/*==================================================
              GET ACCOUNT METADATA
==================================================*/

async function getAccountMetadata(entityId) {

    const normalizedEntityId = requiredString(
        entityId,
        "CentryOS account ID"
    );

    return centryosGet(
        "account",
        `/v1/ext/account/${encodeURIComponent(normalizedEntityId)}`
    );
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    createEndUserAccount,
    getAccountMetadata
};
