/*==================================================
                SENKU PAY
        PUSH-TO-CARD WITHDRAW CONTROLLER
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const prisma =
    new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function normalizeAmount(value) {

    const amount =
        Number(value);

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return null;
    }

    return Math.round(
        (amount + Number.EPSILON) * 100
    ) / 100;
}


function normalizeClientReference(value) {

    const reference =
        String(value || "").trim();

    if (!reference) {
        return null;
    }

    if (
        reference.length < 6 ||
        reference.length > 100
    ) {
        return null;
    }

    return reference;
}


function displayAccount(account) {

    return account.last4
        ? `Card ending ${account.last4}`
        : (
            account.nickName ||
            account.counterPartyName ||
            "Linked payout card"
        );
}


/*==================================================
            CREATE WITHDRAW REQUEST
==================================================*/

exports.createWithdraw =
async (req, res) => {

    try {

        const withdrawAmount =
            normalizeAmount(
                req.body?.amount
            );

        const linkedAccountId =
            String(
                req.body?.linkedAccountId || ""
            ).trim();

        const clientReference =
            normalizeClientReference(
                req.body?.clientReference
            );

        if (!withdrawAmount) {

            return res.status(400).json({
                success: false,
                message:
                    "Enter a valid withdrawal amount."
            });
        }

        if (!linkedAccountId) {

            return res.status(400).json({
                success: false,
                message:
                    "Select a linked payout card."
            });
        }

        if (
            req.body?.clientReference &&
            !clientReference
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "clientReference must contain 6 to 100 characters."
            });
        }

        const user =
            await prisma.user.findUnique({

                where: {
                    id: req.user.id
                },

                select: {
                    id: true,
                    status: true,
                    emailVerified: true,
                    balance: true,
                    centryosAccountId: true,

                    centryosWallets: {

                        where: {
                            currency:
                                "USD",
                            walletType:
                                "SPEND"
                        },

                        select: {
                            id: true
                        },

                        take: 1
                    }
                }
            });

        if (!user) {

            return res.status(404).json({
                success: false,
                message:
                    "User account not found."
            });
        }

        if (
            String(user.status)
                .toUpperCase() !==
            "ACTIVE"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account cannot request withdrawals."
            });
        }

        if (!user.emailVerified) {

            return res.status(403).json({
                success: false,
                message:
                    "Verify your email before requesting a withdrawal."
            });
        }

        if (
            !user.centryosAccountId ||
            user.centryosWallets.length === 0
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "Your CentryOS USD payout wallet is not connected."
            });
        }

        const linkedAccount =
            await prisma
                .centryosLinkedAccount
                .findFirst({

                    where: {
                        userId:
                            user.id,

                        centryosLinkedAccountId:
                            linkedAccountId,

                        currency:
                            "USD",

                        optionType:
                            "card"
                    }
                });

        if (!linkedAccount) {

            return res.status(404).json({
                success: false,
                message:
                    "The selected linked card was not found. Refresh your linked accounts and try again."
            });
        }

        const result =
            await prisma.$transaction(
            async (tx) => {

                if (clientReference) {

                    const existing =
                        await tx
                            .withdrawRequest
                            .findFirst({

                                where: {
                                    userId:
                                        user.id,

                                    clientReference
                                }
                            });

                    if (existing) {

                        return {
                            alreadyCreated:
                                true,

                            withdrawal:
                                existing
                        };
                    }
                }

                /*
                 * Atomic balance condition prevents
                 * simultaneous requests from spending
                 * the same available balance.
                 */
                const balanceLock =
                    await tx.user.updateMany({

                        where: {
                            id:
                                user.id,

                            balance: {
                                gte:
                                    withdrawAmount
                            }
                        },

                        data: {
                            balance: {
                                decrement:
                                    withdrawAmount
                            },

                            lockedBalance: {
                                increment:
                                    withdrawAmount
                            }
                        }
                    });

                if (
                    balanceLock.count !== 1
                ) {

                    const error =
                        new Error(
                            "Insufficient available balance."
                        );

                    error.statusCode =
                        400;

                    throw error;
                }

                const withdrawal =
                    await tx
                        .withdrawRequest
                        .create({

                            data: {
                                userId:
                                    user.id,

                                amount:
                                    withdrawAmount,

                                currency:
                                    "USD",

                                method:
                                    "PUSH_TO_CARD",

                                account:
                                    displayAccount(
                                        linkedAccount
                                    ),

                                note:
                                    String(
                                        req.body?.note || ""
                                    )
                                        .trim()
                                        .slice(0, 500) ||
                                    null,

                                reason:
                                    "Senku Pay card withdrawal",

                                clientReference,

                                linkedAccountId:
                                    linkedAccount
                                        .centryosLinkedAccountId,

                                linkedAccountType:
                                    linkedAccount
                                        .optionType,

                                linkedAccountLast4:
                                    linkedAccount
                                        .last4,

                                status:
                                    "PENDING"
                            }
                        });

                await tx.transaction.create({

                    data: {
                        userId:
                            user.id,

                        type:
                            "WITHDRAWAL",

                        amount:
                            withdrawAmount,

                        status:
                            "PENDING",

                        reference:
                            withdrawal.id,

                        note:
                            `Push-to-card withdrawal to ${withdrawal.account}`
                    }
                });

                return {
                    alreadyCreated:
                        false,

                    withdrawal
                };
            });

        return res.status(
            result.alreadyCreated
                ? 200
                : 201
        ).json({

            success: true,

            alreadyCreated:
                result.alreadyCreated,

            message:
                result.alreadyCreated
                    ? "This withdrawal request already exists."
                    : "Withdrawal request submitted for admin review.",

            withdrawal:
                result.withdrawal
        });

    } catch (error) {

        console.error(
            "Create withdrawal error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to create withdrawal request."
        });
    }
};


/*==================================================
        GET USER WITHDRAWAL REQUESTS
==================================================*/

exports.getWithdraws =
async (req, res) => {

    try {

        const withdrawals =
            await prisma
                .withdrawRequest
                .findMany({

                    where: {
                        userId:
                            req.user.id
                    },

                    orderBy: {
                        createdAt:
                            "desc"
                    }
                });

        return res.status(200).json({
            success: true,
            withdrawals
        });

    } catch (error) {

        console.error(
            "Get withdrawals error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load withdrawals."
        });
    }
};
