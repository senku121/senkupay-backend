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

function requiredString(
    value,
    fieldName
) {

    const normalized =
        String(value || "").trim();

    if (!normalized) {

        const error =
            new Error(
                `${fieldName} is required to create a CentryOS account.`
            );

        error.statusCode = 400;

        throw error;
    }

    return normalized;
}


function normalizeEmail(value) {

    return requiredString(
        value,
        "Email"
    ).toLowerCase();
}


function normalizeAccountId(
    providerResponse
) {

    const possibleIds = [

        providerResponse?.account?.id,
        providerResponse?.data?.account?.id,
        providerResponse?.data?.id,
        providerResponse?.id

    ];

    for (const value of possibleIds) {

        const accountId =
            String(value || "").trim();

        if (accountId) {
            return accountId;
        }
    }

    return null;
}


function normalizeAccountsList(
    providerResponse
) {

    const possibleLists = [

        providerResponse?.accounts,
        providerResponse?.data?.accounts,
        providerResponse?.data

    ];

    for (const value of possibleLists) {

        if (Array.isArray(value)) {
            return value;
        }
    }

    return [];
}


function normalizeMeta(
    providerResponse,
    accounts,
    requestedPage,
    requestedLimit
) {

    const meta =
        providerResponse?.meta ||
        providerResponse?.data?.meta ||
        {};

    return {

        page:
            Number(meta.page) ||
            requestedPage,

        pageSize:
            Number(meta.pageSize) ||
            requestedLimit,

        pageCount:
            Number(meta.pageCount) ||
            (
                accounts.length > 0
                    ? requestedPage
                    : 0
            ),

        total:
            Number(meta.total) ||
            accounts.length

    };
}


/*==================================================
          CREATE END-USER ACCOUNT (PERSON)
==================================================*/

async function createEndUserAccount(user) {

    const payload = {

        firstName:
            requiredString(
                user.firstName,
                "First name"
            ),

        lastName:
            requiredString(
                user.lastName,
                "Last name"
            ),

        email:
            normalizeEmail(
                user.email
            ),

        /*
         * This permanently links the CentryOS
         * provider account to the Senku Pay user.
         */
        identifier:
            requiredString(
                user.id,
                "Senku Pay user ID"
            ),

        type:
            "USER"
    };

    const providerResponse =
        await centryosPost(
            "account",
            "/v1/ext/account/create-user",
            payload
        );

    let accountId =
        normalizeAccountId(
            providerResponse
        );

    /*
     * Some provider responses may confirm creation
     * without returning the account ID. Recover it
     * from the account list by the unique email.
     */
    if (!accountId) {

        const recovered =
            await findEndUserAccount({
                userId:
                    user.id,
                email:
                    user.email
            });

        accountId =
            recovered?.accountId || null;
    }

    if (!accountId) {

        const error =
            new Error(
                "CentryOS created no usable account ID."
            );

        error.statusCode = 502;
        error.providerResponse =
            providerResponse;

        throw error;
    }

    return {
        accountId,
        providerResponse,
        recovered:
            false
    };
}


/*==================================================
              GET ACCOUNT METADATA
==================================================*/

async function getAccountMetadata(
    entityId
) {

    const normalizedEntityId =
        requiredString(
            entityId,
            "CentryOS account ID"
        );

    return centryosGet(
        "account",
        (
            "/v1/ext/account/" +
            encodeURIComponent(
                normalizedEntityId
            )
        )
    );
}


/*==================================================
              LIST USER ACCOUNTS
==================================================*/

async function listEndUserAccounts({
    page = 1,
    limit = 10
} = {}) {

    const normalizedPage =
        Math.max(
            Number.parseInt(page, 10) || 1,
            1
        );

    /*
     * CentryOS documentation specifies a maximum
     * list size of 10.
     */
    const normalizedLimit =
        Math.min(
            Math.max(
                Number.parseInt(limit, 10) || 10,
                1
            ),
            10
        );

    const providerResponse =
        await centryosGet(
            "account",
            (
                "/v1/ext/account/users" +
                `?limit=${normalizedLimit}` +
                `&page=${normalizedPage}`
            )
        );

    const accounts =
        normalizeAccountsList(
            providerResponse
        );

    return {

        accounts,

        meta:
            normalizeMeta(
                providerResponse,
                accounts,
                normalizedPage,
                normalizedLimit
            ),

        providerResponse

    };
}


/*==================================================
          FIND EXISTING PROVIDER ACCOUNT
==================================================*/

async function findEndUserAccount({
    userId,
    email
}) {

    const normalizedUserId =
        String(userId || "").trim();

    const normalizedEmail =
        normalizeEmail(email);

    const maxPages = 100;

    for (
        let page = 1;
        page <= maxPages;
        page += 1
    ) {

        const result =
            await listEndUserAccounts({
                page,
                limit:
                    10
            });

        /*
         * Prefer a direct identifier/externalId
         * match when the provider returns one.
         */
        const identifierMatch =
            result.accounts.find(
                (account) => {

                    const providerIdentifier =
                        String(
                            account?.identifier ||
                            account?.externalId ||
                            ""
                        ).trim();

                    return (
                        normalizedUserId &&
                        providerIdentifier ===
                            normalizedUserId
                    );
                }
            );

        const emailMatch =
            result.accounts.find(
                (account) => {

                    return (
                        String(
                            account?.email || ""
                        )
                            .trim()
                            .toLowerCase() ===
                        normalizedEmail
                    );
                }
            );

        const match =
            identifierMatch ||
            emailMatch;

        if (match) {

            const accountId =
                normalizeAccountId(
                    match
                );

            if (accountId) {

                return {
                    accountId,
                    account:
                        match,
                    providerResponse:
                        result.providerResponse
                };
            }
        }

        const pageCount =
            Number(
                result.meta.pageCount || 0
            );

        if (
            result.accounts.length === 0 ||
            (
                pageCount > 0 &&
                page >= pageCount
            )
        ) {
            break;
        }
    }

    return null;
}


/*==================================================
       CREATE OR RECOVER EXISTING ACCOUNT
==================================================*/

async function createOrRecoverEndUserAccount(
    user
) {

    try {

        return await createEndUserAccount(
            user
        );

    } catch (error) {

        const statusCode =
            Number(
                error.statusCode || 0
            );

        /*
         * CentryOS commonly returns 400 when the
         * email already exists. A concurrent first
         * checkout may also create the account before
         * this request finishes. Recover the existing
         * provider account instead of showing an
         * error to the user.
         */
        if (
            statusCode === 400 ||
            statusCode === 409
        ) {

            const recovered =
                await findEndUserAccount({
                    userId:
                        user.id,
                    email:
                        user.email
                });

            if (recovered?.accountId) {

                return {
                    accountId:
                        recovered.accountId,

                    providerResponse: {
                        createError:
                            error.providerResponse ||
                            error.message,

                        recovered:
                            recovered.providerResponse
                    },

                    recovered:
                        true
                };
            }
        }

        throw error;
    }
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {

    createEndUserAccount,
    createOrRecoverEndUserAccount,

    getAccountMetadata,
    listEndUserAccounts,
    findEndUserAccount

};
