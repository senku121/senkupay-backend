/*==================================================
                SENKU PAY
        ADMIN PUSH-TO-CARD CONTROLLER
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const {
    submitPushToCardPayout
} = require(
    "../services/centryosPayoutService"
);

const {
    getTransactionWebhookPayload
} = require(
    "../services/centryosPayoutStatusService"
);

const {
    processCentryosEvent
} = require(
    "../services/centryosWebhookProcessor"
);

const prisma =
    new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function normalizeStatus(value) {

    const status =
        String(value || "")
            .trim()
            .toUpperCase();

    return status || null;
}


function safeJson(value) {

    try {
        return JSON.parse(
            JSON.stringify(value)
        );
    } catch {
        return {
            value:
                String(value)
        };
    }
}


function wasRecentlyAttempted(date) {

    if (!date) {
        return false;
    }

    return (
        Date.now() -
        new Date(date).getTime()
    ) < 60_000;
}


function normalizeSiteFeePercent(value) {

    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {

        const error =
            new Error(
                "Enter the Senku Pay withdrawal fee percentage."
            );

        error.statusCode =
            400;

        throw error;
    }

    const percentage =
        Number(value);

    if (
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 99.99
    ) {

        const error =
            new Error(
                "Withdrawal fee percentage must be between 0 and 99.99."
            );

        error.statusCode =
            400;

        throw error;
    }

    return Math.round(
        (percentage + Number.EPSILON) * 100
    ) / 100;
}


function calculateWithdrawalAmounts(
    requestedAmount,
    siteFeePercent
) {

    const requestedCents =
        Math.round(
            Number(requestedAmount) * 100
        );

    if (
        !Number.isInteger(requestedCents) ||
        requestedCents <= 0
    ) {

        const error =
            new Error(
                "Withdrawal request has an invalid amount."
            );

        error.statusCode =
            400;

        throw error;
    }

    /*
     * Calculate in cents so $100 at 5% becomes:
     * site fee = $5.00
     * payout    = $95.00
     */
    const siteFeeCents =
        Math.round(
            requestedCents *
            siteFeePercent /
            100
        );

    const payoutCents =
        requestedCents -
        siteFeeCents;

    if (payoutCents < 1) {

        const error =
            new Error(
                "The fee leaves no payable amount. Reduce the percentage."
            );

        error.statusCode =
            400;

        throw error;
    }

    return {

        requestedAmount:
            requestedCents / 100,

        siteFeePercent,

        siteFeeAmount:
            siteFeeCents / 100,

        payoutAmount:
            payoutCents / 100
    };
}


/*==================================================
            GET ALL WITHDRAWALS
==================================================*/

exports.getAllWithdraws =
async (req, res) => {

    try {

        const page =
            Math.max(
                Number.parseInt(
                    req.query.page,
                    10
                ) || 1,
                1
            );

        const limit =
            Math.min(
                Math.max(
                    Number.parseInt(
                        req.query.limit,
                        10
                    ) || 20,
                    1
                ),
                100
            );

        const requestedStatus =
            normalizeStatus(
                req.query.status
            );

        const where =
            requestedStatus
                ? {
                    status:
                        requestedStatus
                }
                : {};

        const [
            total,
            withdrawals
        ] = await Promise.all([

            prisma.withdrawRequest.count({
                where
            }),

            prisma.withdrawRequest.findMany({

                where,

                skip:
                    (page - 1) *
                    limit,

                take:
                    limit,

                include: {

                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            balance: true,
                            lockedBalance: true
                        }
                    },

                    processedByAdmin: {
                        select: {
                            id: true,
                            username: true,
                            role: true
                        }
                    }
                },

                orderBy: {
                    createdAt:
                        "desc"
                }
            })
        ]);

        return res.status(200).json({

            success: true,

            /*
             * This marker lets the frontend confirm
             * Render is serving the current CentryOS
             * push-to-card admin controller.
             */
            apiVersion:
                "CENTRYOS_PUSH_TO_CARD_ADMIN_V3_SITE_FEE",

            total,
            page,

            pages:
                Math.max(
                    Math.ceil(
                        total / limit
                    ),
                    1
                ),

            withdrawals
        });

    } catch (error) {

        console.error(
            "Get admin withdrawals error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load withdrawals."
        });
    }
};


/*==================================================
        APPROVE AND SUBMIT PUSH-TO-CARD
==================================================*/

exports.approveWithdraw =
async (req, res) => {

    const { id } =
        req.params;

    try {

        const existing =
            await prisma
                .withdrawRequest
                .findUnique({
                    where: {
                        id
                    }
                });

        if (!existing) {

            return res.status(404).json({
                success: false,
                message:
                    "Withdrawal request not found."
            });
        }

        const currentStatus =
            normalizeStatus(
                existing.status
            );

        if (
            currentStatus !== "PENDING"
        ) {

            return res.status(409).json({
                success: false,
                message:
                    `Withdrawal cannot be approved while its status is ${currentStatus}.`
            });
        }

        const siteFeePercent =
            normalizeSiteFeePercent(
                req.body?.siteFeePercent
            );

        const calculatedAmounts =
            calculateWithdrawalAmounts(
                existing.amount,
                siteFeePercent
            );

        if (
            wasRecentlyAttempted(
                existing.lastAttemptAt
            )
        ) {

            return res.status(429).json({
                success: false,
                message:
                    "Wait at least one minute before retrying this payout."
            });
        }

        if (
            existing.currency !== "USD" ||
            existing.method !==
                "PUSH_TO_CARD" ||
            existing.linkedAccountType !==
                "card" ||
            !existing.linkedAccountId
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "This request is not a valid USD push-to-card withdrawal."
            });
        }

        /*
         * Claim the request before the network call.
         * A double-click or concurrent admin request
         * cannot submit the payout twice.
         */
        const claim =
            await prisma
                .withdrawRequest
                .updateMany({

                    where: {
                        id,
                        status: {
                            in: [
                                "PENDING",
                                "Pending"
                            ]
                        }
                    },

                    data: {
                        status:
                            "PROCESSING",

                        processedByAdminId:
                            req.user.id,

                        approvedAt:
                            new Date(),

                        lastAttemptAt:
                            new Date(),

                        siteFeePercent:
                            calculatedAmounts
                                .siteFeePercent,

                        siteFeeAmount:
                            calculatedAmounts
                                .siteFeeAmount,

                        payoutAmount:
                            calculatedAmounts
                                .payoutAmount,

                        lastProviderError:
                            null
                    }
                });

        if (claim.count !== 1) {

            return res.status(409).json({
                success: false,
                message:
                    "This withdrawal is already being processed."
            });
        }

        let providerResult;

        try {

            providerResult =
                await submitPushToCardPayout({

                    currency:
                        existing.currency,

                    linkedAccountId:
                        existing
                            .linkedAccountId,

                    amount:
                        calculatedAmounts
                            .payoutAmount,

                    reason:
                        (
                            `Senku Pay withdrawal ${existing.id}. ` +
                            `Requested ${calculatedAmounts.requestedAmount} USD, ` +
                            `site fee ${calculatedAmounts.siteFeeAmount} USD ` +
                            `(${calculatedAmounts.siteFeePercent}%), ` +
                            `payout ${calculatedAmounts.payoutAmount} USD.`
                        )
                });

        } catch (providerError) {

            const uncertainOutcome =
                !providerError.statusCode ||
                providerError.statusCode >= 500;

            const nextStatus =
                uncertainOutcome
                    ? "REVIEW_REQUIRED"
                    : "PENDING";

            await prisma.$transaction([

                prisma.withdrawRequest.update({

                    where: {
                        id
                    },

                    data: {
                        status:
                            nextStatus,

                        providerStatus:
                            "SUBMISSION_ERROR",

                        providerResponse:
                            safeJson(
                                providerError
                                    .providerResponse ||
                                {}
                            ),

                        lastProviderError:
                            providerError.message,

                        /*
                         * Keep the selected fee only when the
                         * provider outcome is uncertain. For a
                         * confirmed client-side rejection, return
                         * to PENDING and let the admin choose again.
                         */
                        approvedAt:
                            uncertainOutcome
                                ? new Date()
                                : null,

                        processedByAdminId:
                            uncertainOutcome
                                ? req.user.id
                                : null,

                        siteFeePercent:
                            uncertainOutcome
                                ? calculatedAmounts
                                    .siteFeePercent
                                : null,

                        siteFeeAmount:
                            uncertainOutcome
                                ? calculatedAmounts
                                    .siteFeeAmount
                                : null,

                        payoutAmount:
                            uncertainOutcome
                                ? calculatedAmounts
                                    .payoutAmount
                                : null
                    }
                }),

                prisma.transaction.updateMany({

                    where: {
                        reference:
                            id,
                        type:
                            "WITHDRAWAL"
                    },

                    data: {
                        status:
                            nextStatus
                    }
                })
            ]);

            return res.status(
                providerError.statusCode ||
                502
            ).json({

                success: false,

                message:
                    providerError.message,

                withdrawalStatus:
                    nextStatus,

                providerResponse:
                    providerError
                        .providerResponse
            });
        }

        const updated =
            await prisma.$transaction(
            async (tx) => {

                const withdrawal =
                    await tx
                        .withdrawRequest
                        .update({

                            where: {
                                id
                            },

                            data: {
                                status:
                                    "PROCESSING",

                                providerTransactionId:
                                    providerResult
                                        .providerTransactionId,

                                providerStatus:
                                    providerResult
                                        .providerStatus,

                                providerFee:
                                    providerResult
                                        .providerFee,

                                providerDebitedAmount:
                                    providerResult
                                        .providerDebitedAmount,

                                providerResponse:
                                    safeJson(
                                        providerResult
                                            .providerResponse
                                    ),

                                providerQueuedAt:
                                    new Date(),

                                processedAt:
                                    new Date()
                            }
                        });

                await tx.transaction.updateMany({

                    where: {
                        reference:
                            id,
                        type:
                            "WITHDRAWAL"
                    },

                    data: {
                        status:
                            "PROCESSING",

                        note:
                            (
                                `Push-to-card processing. ` +
                                `Requested ${calculatedAmounts.requestedAmount} USD, ` +
                                `Senku Pay fee ${calculatedAmounts.siteFeeAmount} USD ` +
                                `(${calculatedAmounts.siteFeePercent}%), ` +
                                `submitted ${calculatedAmounts.payoutAmount} USD to CentryOS.`
                            )
                    }
                });

                return withdrawal;
            });

        /*
         * Do not remove lockedBalance and do not
         * increase withdrawn yet. CentryOS documents
         * the response as queued/asynchronous. The
         * payout webhook will finalize success or
         * restore funds after failure.
         */
        return res.status(202).json({

            success: true,

            message:
                (
                    `Withdrawal approved. ` +
                    `${calculatedAmounts.siteFeeAmount.toFixed(2)} USD ` +
                    `Senku Pay fee was deducted and ` +
                    `${calculatedAmounts.payoutAmount.toFixed(2)} USD ` +
                    `was submitted to CentryOS.`
                ),

            calculation:
                calculatedAmounts,

            withdrawal:
                updated
        });

    } catch (error) {

        console.error(
            "Approve withdrawal error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to submit this withdrawal."
        });
    }
};


/*==================================================
            REJECT WITHDRAWAL
==================================================*/

exports.rejectWithdraw =
async (req, res) => {

    try {

        const { id } =
            req.params;

        const reason =
            String(
                req.body?.reason ||
                "Rejected by administrator."
            )
                .trim()
                .slice(0, 500);

        const request =
            await prisma
                .withdrawRequest
                .findUnique({

                    where: {
                        id
                    }
                });

        if (!request) {

            return res.status(404).json({
                success: false,
                message:
                    "Withdrawal request not found."
            });
        }

        if (
            ![
                "PENDING",
                "Pending"
            ].includes(
                request.status
            )
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "Only a pending withdrawal can be rejected."
            });
        }

        const result =
            await prisma.$transaction(
            async (tx) => {

                const claim =
                    await tx
                        .withdrawRequest
                        .updateMany({

                            where: {
                                id,
                                status: {
                                    in: [
                                        "PENDING",
                                        "Pending"
                                    ]
                                }
                            },

                            data: {
                                status:
                                    "REJECTED",

                                processedByAdminId:
                                    req.user.id,

                                rejectedAt:
                                    new Date(),

                                processedAt:
                                    new Date(),

                                note:
                                    reason
                            }
                        });

                if (claim.count !== 1) {

                    const error =
                        new Error(
                            "Withdrawal was already processed."
                        );

                    error.statusCode =
                        409;

                    throw error;
                }

                await tx.user.update({

                    where: {
                        id:
                            request.userId
                    },

                    data: {
                        balance: {
                            increment:
                                request.amount
                        },

                        lockedBalance: {
                            decrement:
                                request.amount
                        }
                    }
                });

                await tx.transaction.updateMany({

                    where: {
                        reference:
                            id,
                        type:
                            "WITHDRAWAL"
                    },

                    data: {
                        status:
                            "REJECTED",

                        note:
                            reason
                    }
                });

                return tx
                    .withdrawRequest
                    .findUnique({
                        where: {
                            id
                        }
                    });
            });

        return res.status(200).json({

            success: true,

            message:
                "Withdrawal rejected and funds returned to the user's balance.",

            withdrawal:
                result
        });

    } catch (error) {

        console.error(
            "Reject withdrawal error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to reject withdrawal."
        });
    }
};


/*==================================================
       RECONCILE MISSED PAYOUT WEBHOOK
==================================================*/

exports.reconcileWithdraw =
async (req, res) => {

    try {

        const withdrawal =
            await prisma
                .withdrawRequest
                .findUnique({

                    where: {
                        id:
                            req.params.id
                    }
                });

        if (!withdrawal) {

            return res.status(404).json({
                success: false,
                message:
                    "Withdrawal request not found."
            });
        }

        if (
            !withdrawal
                .providerTransactionId
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "This withdrawal has no CentryOS transaction ID yet."
            });
        }

        const providerEvent =
            await getTransactionWebhookPayload(
                withdrawal
                    .providerTransactionId
            );

        const result =
            await processCentryosEvent({

                body:
                    providerEvent,

                rawBody:
                    Buffer.from(
                        JSON.stringify(
                            providerEvent
                        )
                    ),

                signature:
                    "SERVER_RECONCILIATION",

                source:
                    "RECONCILIATION"
            });

        const updated =
            await prisma
                .withdrawRequest
                .findUnique({

                    where: {
                        id:
                            withdrawal.id
                    }
                });

        return res.status(200).json({

            success: true,

            message:
                "CentryOS payout status reconciled.",

            outcome:
                result.outcome,

            withdrawal:
                updated
        });

    } catch (error) {

        console.error(
            "Reconcile withdrawal error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to reconcile this withdrawal.",

            providerResponse:
                error.providerResponse
        });
    }
};
