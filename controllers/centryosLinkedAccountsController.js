/*==================================================
                SENKU PAY
      CENTRYOS LINKED ACCOUNTS CONTROLLER
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const {
    getEndUserLinkedAccounts
} = require(
    "../services/centryosLinkedAccountsService"
);

const prisma =
    new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function textOrNull(value, maxLength = 255) {

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

    return Number.isNaN(date.getTime())
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
            text.match(/([A-Za-z0-9]{4})\s*$/);

        if (match) {
            return match[1];
        }
    }

    return null;
}


function normalizeProviderAccount(account) {

    const summary =
        account?.account &&
        typeof account.account === "object"
            ? account.account
            : {};

    /*
     * The external endpoint is documented as masking
     * sensitive numbers. We still store only a small
     * safe summary and never persist recipientData,
     * raw account numbers, card tokens, or the full
     * provider response.
     */
    return {

        centryosLinkedAccountId:
            textOrNull(account?.id, 100),

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


async function saveLinkedAccounts(
    tx,
    userId,
    providerAccounts
) {

    const saved = [];

    for (const providerAccount of providerAccounts) {

        const normalized =
            normalizeProviderAccount(
                providerAccount
            );

        if (
            !normalized
                .centryosLinkedAccountId ||
            !normalized.currency ||
            !normalized.optionType
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
            existing.userId !== userId
        ) {

            throw new Error(
                "A CentryOS linked account is already assigned to another Senku Pay user."
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
            LIST LINKED ACCOUNTS
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

        if (!/^[A-Z]{3}$/.test(currency)) {

            return res.status(400).json({
                success: false,
                message:
                    "Currency must be a valid three-letter code."
            });
        }

        const user =
            await prisma.user.findUnique({

                where: {
                    id: req.user.id
                },

                select: {
                    id: true,
                    email: true,
                    emailVerified: true,
                    centryosAccountId: true
                }
            });

        if (!user) {

            return res.status(404).json({
                success: false,
                message:
                    "User account not found."
            });
        }

        if (!user.emailVerified) {

            return res.status(403).json({
                success: false,
                message:
                    "Verify your email before viewing linked payout accounts."
            });
        }

        if (!user.centryosAccountId) {

            return res.status(409).json({
                success: false,
                message:
                    "Connect your CentryOS account before viewing linked payout accounts."
            });
        }

        const providerResult =
            await getEndUserLinkedAccounts({

                currency,

                /*
                 * user.id is the identifier sent when
                 * the CentryOS account was created.
                 */
                externalId:
                    user.id,

                /*
                 * Safe fallback for CentryOS setups
                 * that index the provider account ID.
                 */
                fallbackExternalId:
                    user.centryosAccountId,

                page:
                    req.query.page,

                limit:
                    req.query.limit,

                accountType:
                    req.query.accountType ||
                    req.query.optionType,

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

                const accounts =
                    await saveLinkedAccounts(
                        tx,
                        user.id,
                        providerResult.accounts
                    );

                if (accounts.length > 0) {

                    await tx
                        .centryosLinkedAccountWidgetSession
                        .updateMany({

                            where: {
                                userId:
                                    user.id,
                                status:
                                    "ACTIVE"
                            },

                            data: {
                                status:
                                    "COMPLETED"
                            }
                        });
                }

                return accounts;
            });

        return res.status(200).json({

            success: true,

            currency:
                providerResult.currency,

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

                        counterPublicPartyEmail:
                            account
                                .counterPublicPartyEmail,

                        nickName:
                            account.nickName,

                        bankName:
                            account.bankName,

                        last4:
                            account.last4,

                        accountType:
                            account.accountType,

                        routingType:
                            account.routingType,

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
            "List CentryOS linked accounts error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to retrieve linked payout accounts.",

            providerResponse:
                error.providerResponse
        });
    }
};
