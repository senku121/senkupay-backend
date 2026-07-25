/*==================================================
                SENKU PAY
      CENTRYOS LINKED CARDS CONTROLLER
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const {
    getEndUserLinkedAccounts
} = require(
    "../services/centryosLinkedAccountsService"
);

const {
    ensureCentryosAccountForUser,
    ensureCentryosWalletTypeForUser
} = require(
    "../services/centryosProvisioningService"
);

const prisma =
    new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function textOrNull(
    value,
    maxLength = 255
) {

    const text =
        String(value || "").trim();

    return text
        ? text.slice(0, maxLength)
        : null;
}


function dateOrNull(value) {

    if (!value) {
        return null;
    }

    const date =
        new Date(value);

    return Number.isNaN(
        date.getTime()
    )
        ? null
        : date;
}


function findLast4(...values) {

    for (const value of values) {

        const text =
            String(value || "").trim();

        if (!text) {
            continue;
        }

        const match =
            text.match(
                /([A-Za-z0-9]{4})\s*$/
            );

        if (match) {
            return match[1];
        }
    }

    return null;
}


function normalizeProviderAccount(
    account
) {

    const summary =
        account?.account &&
        typeof account.account ===
            "object"
            ? account.account
            : {};

    return {

        centryosLinkedAccountId:
            textOrNull(
                account?.id,
                100
            ),

        currency:
            textOrNull(
                account?.currency,
                3
            )?.toUpperCase(),

        optionType:
            textOrNull(
                account?.optionType,
                40
            )?.toLowerCase(),

        counterPartyName:
            textOrNull(
                account?.counterPartyName,
                150
            ),

        counterPartyEmail:
            textOrNull(
                account?.counterPartyEmail,
                254
            ),

        counterPublicPartyEmail:
            textOrNull(
                account?.counterPublicPartyEmail,
                254
            ),

        nickName:
            textOrNull(
                account?.nickName,
                120
            ),

        bankName:
            textOrNull(
                summary?.bankName,
                120
            ),

        last4:
            findLast4(
                summary?.lastFourDigits,
                summary?.last4,
                summary?.accountNumber,
                summary?.cardNumber,
                summary?.routing
            ),

        accountType:
            textOrNull(
                summary?.accountType,
                60
            ),

        routingType:
            textOrNull(
                summary?.routingType,
                60
            ),

        providerCreatedAt:
            dateOrNull(
                account?.createdAt
            ),

        providerUpdatedAt:
            dateOrNull(
                account?.updatedAt
            )
    };
}


async function saveLinkedCards(
    tx,
    userId,
    providerAccounts
) {

    const saved = [];

    for (
        const providerAccount of
        providerAccounts
    ) {

        const normalized =
            normalizeProviderAccount(
                providerAccount
            );

        /*
         * Product scope: only CARD destinations are
         * accepted for Senku Pay withdrawals.
         */
        if (
            !normalized
                .centryosLinkedAccountId ||
            normalized.currency !== "USD" ||
            normalized.optionType !== "card"
        ) {
            continue;
        }

        const existing =
            await tx
                .centryosLinkedAccount
                .findUnique({

                    where: {
                        centryosLinkedAccountId:
                            normalized
                                .centryosLinkedAccountId
                    },

                    select: {
                        id: true,
                        userId: true
                    }
                });

        if (
            existing &&
            existing.userId !==
                userId
        ) {

            throw new Error(
                "A CentryOS linked card is already assigned to another Senku Pay user."
            );
        }

        const record =
            existing
                ? await tx
                    .centryosLinkedAccount
                    .update({

                        where: {
                            id:
                                existing.id
                        },

                        data: {
                            ...normalized,
                            lastSyncedAt:
                                new Date()
                        }
                    })
                : await tx
                    .centryosLinkedAccount
                    .create({

                        data: {
                            userId,
                            ...normalized,
                            lastSyncedAt:
                                new Date()
                        }
                    });

        saved.push(record);
    }

    return saved;
}


/*==================================================
             LIST MY LINKED CARDS
==================================================*/

exports.listLinkedAccounts =
async (req, res) => {

    try {

        const currency =
            String(
                req.params.currency || "USD"
            )
                .trim()
                .toUpperCase();

        if (currency !== "USD") {

            return res.status(400).json({
                success: false,
                message:
                    "Linked payout cards currently support USD only."
            });
        }

        const accountResult =
            await ensureCentryosAccountForUser(
                req.user.id
            );

        await ensureCentryosWalletTypeForUser({

            userId:
                accountResult.user.id,

            accountId:
                accountResult.accountId,

            walletType:
                "SPEND",

            requiredCurrency:
                "USD"
        });

        const providerResult =
            await getEndUserLinkedAccounts({

                currency:
                    "USD",

                /*
                 * The unique identifier supplied when
                 * the CentryOS account was created.
                 */
                externalId:
                    accountResult.user.id,

                /*
                 * Safe provider-account fallback.
                 */
                fallbackExternalId:
                    accountResult.accountId,

                page:
                    req.query.page,

                limit:
                    req.query.limit,

                /*
                 * Force CARD. Browser input cannot
                 * request bank destinations.
                 */
                accountType:
                    "card",

                email:
                    req.query.email,

                last4:
                    req.query.last4,

                bank:
                    req.query.bank
            });

        const saved =
            await prisma.$transaction(
            async (tx) => {

                const cards =
                    await saveLinkedCards(
                        tx,
                        accountResult.user.id,
                        providerResult.accounts
                    );

                if (cards.length > 0) {

                    await tx
                        .centryosLinkedAccountWidgetSession
                        .updateMany({

                            where: {
                                userId:
                                    accountResult.user.id,
                                status:
                                    "ACTIVE"
                            },

                            data: {
                                status:
                                    "COMPLETED"
                            }
                        });
                }

                return cards;
            });

        return res.status(200).json({

            success: true,

            currency:
                "USD",

            accountType:
                "card",

            accounts:
                saved.map(
                    (account) => ({

                        id:
                            account
                                .centryosLinkedAccountId,

                        currency:
                            account.currency,

                        optionType:
                            account.optionType,

                        counterPartyName:
                            account.counterPartyName,

                        counterPartyEmail:
                            account.counterPartyEmail,

                        nickName:
                            account.nickName,

                        bankName:
                            account.bankName,

                        last4:
                            account.last4,

                        accountType:
                            account.accountType,

                        createdAt:
                            account.providerCreatedAt,

                        updatedAt:
                            account.providerUpdatedAt
                    })
                ),

            meta:
                providerResult.meta
        });

    } catch (error) {

        console.error(
            "List CentryOS linked cards error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to retrieve linked payout cards.",

            providerResponse:
                error.providerResponse
        });
    }
};
