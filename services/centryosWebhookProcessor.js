/*==================================================
                SENKU PAY
       CENTRYOS WEBHOOK EVENT PROCESSOR
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const {
    safeJson,
    extractCentryosEvent,
    createEventKey,
    moneyToMinorUnits,
    normalizeMoney
} = require("./centryosWebhookService");

const prisma =
    new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function isUniqueConstraintError(error) {

    return (
        error &&
        error.code === "P2002"
    );
}


function roundMoney(value) {

    return Math.round(
        (Number(value) + Number.EPSILON) * 100
    ) / 100;
}


async function updateWebhookEvent(
    tx,
    eventKey,
    data
) {

    return tx.centryosWebhookEvent.update({

        where: {
            eventKey
        },

        data: {
            ...data,
            processedAt:
                new Date()
        }
    });
}


function collectionTransactionReference(
    event,
    depositId
) {

    if (event.transactionId) {
        return `CENTRYOS:${event.transactionId}`;
    }

    if (event.paymentLinkId) {
        return `CENTRYOS-LINK:${event.paymentLinkId}`;
    }

    return `CENTRYOS-DEPOSIT:${depositId}`;
}


/*==================================================
              COLLECTION LOOKUP
==================================================*/

function buildDepositLookup(event) {

    const or = [];

    if (
        event.localDepositReferences.length > 0
    ) {
        or.push({
            id: {
                in:
                    event.localDepositReferences
            }
        });
    }

    if (event.paymentLinkId) {

        or.push({
            providerPaymentLinkId:
                event.paymentLinkId
        });

        or.push({
            paymentId:
                event.paymentLinkId
        });
    }

    if (event.transactionId) {

        or.push({
            providerTransactionId:
                event.transactionId
        });
    }

    return or;
}


async function findDeposit(
    tx,
    event
) {

    const or =
        buildDepositLookup(event);

    if (or.length === 0) {
        return null;
    }

    return tx.deposit.findFirst({

        where: {
            provider:
                "CENTRYOS",
            OR:
                or
        }
    });
}


/*==================================================
             PROCESS COLLECTION EVENT
==================================================*/

async function processCollectionEvent(
    tx,
    event,
    eventKey
) {

    const supportedType =
        event.eventType === "COLLECTION" ||
        event.eventType ===
            "TRANSACTION_BLOCKED";

    const supportedStatus =
        event.status === "SUCCESS" ||
        event.status === "FAILED" ||
        event.status === "BLOCKED";

    if (
        !supportedType ||
        !supportedStatus
    ) {

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "IGNORED",
                errorMessage:
                    "Unsupported CentryOS collection event."
            }
        );

        return {
            outcome:
                "IGNORED",
            resourceType:
                "DEPOSIT",
            resourceId:
                null
        };
    }

    const deposit =
        await findDeposit(
            tx,
            event
        );

    if (!deposit) {

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "ORPHANED",
                errorMessage:
                    "No matching Senku Pay deposit was found."
            }
        );

        return {
            outcome:
                "ORPHANED",
            resourceType:
                "DEPOSIT",
            resourceId:
                null
        };
    }

    await tx.centryosWebhookEvent.update({

        where: {
            eventKey
        },

        data: {
            depositId:
                deposit.id
        }
    });

    if (
        deposit.status === "COMPLETED"
    ) {

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "DUPLICATE",
                errorMessage:
                    "Deposit was already completed."
            }
        );

        return {
            outcome:
                "DUPLICATE",
            resourceType:
                "DEPOSIT",
            resourceId:
                deposit.id
        };
    }

    if (event.status === "SUCCESS") {

        const expectedAmountMinor =
            moneyToMinorUnits(
                deposit.amount
            );

        if (
            event.amountMinor === null ||
            event.amountMinor !==
                expectedAmountMinor
        ) {

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "REJECTED",
                    errorMessage:
                        `Amount mismatch. Expected ${deposit.amount}, received ${event.amount}.`
                }
            );

            return {
                outcome:
                    "REJECTED_AMOUNT",
                resourceType:
                    "DEPOSIT",
                resourceId:
                    deposit.id
            };
        }

        if (
            event.currency !==
            String(
                deposit.currency
            ).toUpperCase()
        ) {

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "REJECTED",
                    errorMessage:
                        `Currency mismatch. Expected ${deposit.currency}, received ${event.currency}.`
                }
            );

            return {
                outcome:
                    "REJECTED_CURRENCY",
                resourceType:
                    "DEPOSIT",
                resourceId:
                    deposit.id
            };
        }

        if (
            event.entry &&
            event.entry !== "CREDIT"
        ) {

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "REJECTED",
                    errorMessage:
                        `Unexpected collection entry: ${event.entry}.`
                }
            );

            return {
                outcome:
                    "REJECTED_ENTRY",
                resourceType:
                    "DEPOSIT",
                resourceId:
                    deposit.id
            };
        }

        /*
         * Product rule:
         * the customer pays the entered amount.
         * CentryOS takes its fee from that amount.
         * Only gross - fee is credited in Senku Pay.
         */
        const grossAmount =
            normalizeMoney(
                event.amount
            );

        const feeAmount =
            Math.max(
                normalizeMoney(
                    event.feeCharged
                ) || 0,
                0
            );

        const netAmount =
            roundMoney(
                grossAmount -
                feeAmount
            );

        if (
            grossAmount === null ||
            feeAmount > grossAmount ||
            netAmount <= 0
        ) {

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "REJECTED",
                    errorMessage:
                        `Invalid collection settlement. Gross ${grossAmount}, fee ${feeAmount}, net ${netAmount}.`
                }
            );

            return {
                outcome:
                    "REJECTED_SETTLEMENT",
                resourceType:
                    "DEPOSIT",
                resourceId:
                    deposit.id
            };
        }

        const completion =
            await tx.deposit.updateMany({

                where: {
                    id:
                        deposit.id,

                    status: {
                        not:
                            "COMPLETED"
                    }
                },

                data: {
                    status:
                        "COMPLETED",

                    providerStatus:
                        "SUCCESS",

                    providerTransactionId:
                        event.transactionId,

                    providerMethod:
                        event.method,

                    providerFee:
                        feeAmount,

                    customerPaidAmount:
                        grossAmount,

                    netAmount,

                    webhookReceivedAt:
                        new Date(),

                    completedAt:
                        event.occurredAt,

                    failedAt:
                        null
                }
            });

        if (
            completion.count === 0
        ) {

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "DUPLICATE",
                    errorMessage:
                        "Deposit was completed by another request."
                }
            );

            return {
                outcome:
                    "DUPLICATE",
                resourceType:
                    "DEPOSIT",
                resourceId:
                    deposit.id
            };
        }

        await tx.user.update({

            where: {
                id:
                    deposit.userId
            },

            data: {
                balance: {
                    increment:
                        netAmount
                },

                deposited: {
                    increment:
                        netAmount
                }
            }
        });

        await tx.transaction.create({

            data: {
                userId:
                    deposit.userId,

                type:
                    "DEPOSIT",

                amount:
                    netAmount,

                status:
                    "COMPLETED",

                reference:
                    collectionTransactionReference(
                        event,
                        deposit.id
                    ),

                note:
                    (
                        `CentryOS ${deposit.currency} deposit: ` +
                        `gross ${grossAmount}, fee ${feeAmount}, net ${netAmount}`
                    )
            }
        });

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "PROCESSED",
                errorMessage:
                    null
            }
        );

        return {
            outcome:
                "COMPLETED",
            resourceType:
                "DEPOSIT",
            resourceId:
                deposit.id,
            grossAmount,
            feeAmount,
            netAmount
        };
    }

    await tx.deposit.updateMany({

        where: {
            id:
                deposit.id,

            status: {
                not:
                    "COMPLETED"
            }
        },

        data: {
            status:
                "FAILED",

            providerStatus:
                event.status,

            providerTransactionId:
                event.transactionId,

            providerMethod:
                event.method,

            providerFee:
                event.feeCharged,

            webhookReceivedAt:
                new Date(),

            failedAt:
                event.occurredAt
        }
    });

    await updateWebhookEvent(
        tx,
        eventKey,
        {
            processingStatus:
                "PROCESSED",
            errorMessage:
                event.reason
        }
    );

    return {
        outcome:
            event.status,
        resourceType:
            "DEPOSIT",
        resourceId:
            deposit.id
    };
}


/*==================================================
              WITHDRAWAL LOOKUP
==================================================*/

async function findWithdrawal(
    tx,
    event
) {

    if (!event.transactionId) {
        return null;
    }

    return tx.withdrawRequest.findUnique({

        where: {
            providerTransactionId:
                event.transactionId
        }
    });
}


async function validateSpendWallet(
    tx,
    withdrawal,
    event
) {

    if (!event.walletId) {
        return true;
    }

    const wallet =
        await tx.centryosWallet.findFirst({

            where: {
                userId:
                    withdrawal.userId,

                centryosWalletId:
                    event.walletId,

                currency:
                    withdrawal.currency,

                walletType:
                    "SPEND"
            },

            select: {
                id: true
            }
        });

    return Boolean(wallet);
}


/*==================================================
              PROCESS WITHDRAWAL EVENT
==================================================*/

async function processWithdrawalEvent(
    tx,
    event,
    eventKey
) {

    const supportedStatuses =
        new Set([
            "PENDING",
            "PROCESSING_PAY_OUT",
            "SUCCESS",
            "FAILED"
        ]);

    if (
        event.eventType !== "WITHDRAWAL" ||
        !supportedStatuses.has(
            event.status
        )
    ) {

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "IGNORED",
                errorMessage:
                    "Unsupported CentryOS withdrawal event."
            }
        );

        return {
            outcome:
                "IGNORED",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                null
        };
    }

    const withdrawal =
        await findWithdrawal(
            tx,
            event
        );

    if (!withdrawal) {

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "ORPHANED",
                errorMessage:
                    "No matching Senku Pay withdrawal was found."
            }
        );

        return {
            outcome:
                "ORPHANED",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                null
        };
    }

    await tx.centryosWebhookEvent.update({

        where: {
            eventKey
        },

        data: {
            withdrawalId:
                withdrawal.id
        }
    });

    if (
        event.currency &&
        event.currency !==
            String(
                withdrawal.currency
            ).toUpperCase()
    ) {

        await tx.withdrawRequest.update({

            where: {
                id:
                    withdrawal.id
            },

            data: {
                status:
                    "REVIEW_REQUIRED",

                providerStatus:
                    event.status,

                webhookReceivedAt:
                    new Date(),

                lastProviderError:
                    `Webhook currency mismatch: ${event.currency}`
            }
        });

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "REJECTED",
                errorMessage:
                    "Withdrawal currency mismatch."
            }
        );

        return {
            outcome:
                "REVIEW_REQUIRED",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                withdrawal.id
        };
    }

    if (
        event.entry &&
        event.entry !== "DEBIT"
    ) {

        await tx.withdrawRequest.update({

            where: {
                id:
                    withdrawal.id
            },

            data: {
                status:
                    "REVIEW_REQUIRED",

                providerStatus:
                    event.status,

                webhookReceivedAt:
                    new Date(),

                lastProviderError:
                    `Unexpected withdrawal entry: ${event.entry}`
            }
        });

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "REJECTED",
                errorMessage:
                    "Unexpected withdrawal entry."
            }
        );

        return {
            outcome:
                "REVIEW_REQUIRED",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                withdrawal.id
        };
    }

    const spendWalletIsValid =
        await validateSpendWallet(
            tx,
            withdrawal,
            event
        );

    if (!spendWalletIsValid) {

        await tx.withdrawRequest.update({

            where: {
                id:
                    withdrawal.id
            },

            data: {
                status:
                    "REVIEW_REQUIRED",

                providerStatus:
                    event.status,

                webhookReceivedAt:
                    new Date(),

                lastProviderError:
                    "Webhook wallet does not match the user's USD SPEND wallet."
            }
        });

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "REJECTED",
                errorMessage:
                    "Withdrawal wallet mismatch."
            }
        );

        return {
            outcome:
                "REVIEW_REQUIRED",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                withdrawal.id
        };
    }

    const currentStatus =
        String(
            withdrawal.status || ""
        ).toUpperCase();

    const commonData = {

        providerStatus:
            event.status,

        providerMethod:
            event.method,

        providerFee:
            event.feeCharged,

        providerNetAmount:
            event.amount,

        webhookReceivedAt:
            new Date(),

        lastProviderError:
            event.reason
    };

    /*
     * Card payouts normally move directly from
     * PENDING to SUCCESS. PROCESSING_PAY_OUT is
     * retained for future bank methods.
     */
    if (
        event.status === "PENDING" ||
        event.status ===
            "PROCESSING_PAY_OUT"
    ) {

        if (
            currentStatus === "COMPLETED" ||
            currentStatus === "FAILED" ||
            currentStatus === "REJECTED"
        ) {

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "DUPLICATE",
                    errorMessage:
                        `Withdrawal is already terminal: ${currentStatus}.`
                }
            );

            return {
                outcome:
                    "DUPLICATE",
                resourceType:
                    "WITHDRAWAL",
                resourceId:
                    withdrawal.id
            };
        }

        await tx.withdrawRequest.update({

            where: {
                id:
                    withdrawal.id
            },

            data: {
                ...commonData,
                status:
                    "PROCESSING"
            }
        });

        await tx.transaction.updateMany({

            where: {
                reference:
                    withdrawal.id,
                type:
                    "WITHDRAWAL"
            },

            data: {
                status:
                    "PROCESSING",

                note:
                    `CentryOS push-to-card payout ${event.status}`
            }
        });

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "PROCESSED",
                errorMessage:
                    null
            }
        );

        return {
            outcome:
                event.status,
            resourceType:
                "WITHDRAWAL",
            resourceId:
                withdrawal.id
        };
    }

    if (event.status === "SUCCESS") {

        if (
            currentStatus === "COMPLETED"
        ) {

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "DUPLICATE",
                    errorMessage:
                        "Withdrawal was already completed."
                }
            );

            return {
                outcome:
                    "DUPLICATE",
                resourceType:
                    "WITHDRAWAL",
                resourceId:
                    withdrawal.id
            };
        }

        /*
         * A SUCCESS after funds were already restored
         * requires human review. Never charge the user
         * twice or create a negative locked balance.
         */
        if (
            currentStatus === "FAILED" ||
            currentStatus === "REJECTED"
        ) {

            await tx.withdrawRequest.update({

                where: {
                    id:
                        withdrawal.id
                },

                data: {
                    ...commonData,

                    status:
                        "REVIEW_REQUIRED",

                    lastProviderError:
                        (
                            "Provider reported SUCCESS after the withdrawal " +
                            `was already ${currentStatus}.`
                        )
                }
            });

            await tx.transaction.updateMany({

                where: {
                    reference:
                        withdrawal.id,
                    type:
                        "WITHDRAWAL"
                },

                data: {
                    status:
                        "REVIEW_REQUIRED"
                }
            });

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "CONFLICT",
                    errorMessage:
                        "Late SUCCESS arrived after local funds were restored."
                }
            );

            return {
                outcome:
                    "REVIEW_REQUIRED",
                resourceType:
                    "WITHDRAWAL",
                resourceId:
                    withdrawal.id
            };
        }

        /*
         * Consume the full amount originally locked from
         * the user's Senku Pay wallet. The difference
         * between withdrawal.amount and payoutAmount is
         * the stored Senku Pay site fee.
         */
        const userFinalize =
            await tx.user.updateMany({

                where: {
                    id:
                        withdrawal.userId,

                    lockedBalance: {
                        gte:
                            withdrawal.amount
                    }
                },

                data: {
                    lockedBalance: {
                        decrement:
                            withdrawal.amount
                    },

                    withdrawn: {
                        increment:
                            withdrawal.amount
                    }
                }
            });

        if (
            userFinalize.count !== 1
        ) {

            await tx.withdrawRequest.update({

                where: {
                    id:
                        withdrawal.id
                },

                data: {
                    ...commonData,

                    status:
                        "REVIEW_REQUIRED",

                    lastProviderError:
                        "Provider reported SUCCESS but the locked balance was insufficient."
                }
            });

            await tx.transaction.updateMany({

                where: {
                    reference:
                        withdrawal.id,
                    type:
                        "WITHDRAWAL"
                },

                data: {
                    status:
                        "REVIEW_REQUIRED"
                }
            });

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "CONFLICT",
                    errorMessage:
                        "Insufficient locked balance during payout finalization."
                }
            );

            return {
                outcome:
                    "REVIEW_REQUIRED",
                resourceType:
                    "WITHDRAWAL",
                resourceId:
                    withdrawal.id
            };
        }

        const completed =
            await tx.withdrawRequest.updateMany({

                where: {
                    id:
                        withdrawal.id,

                    status: {
                        not:
                            "COMPLETED"
                    }
                },

                data: {
                    ...commonData,

                    status:
                        "COMPLETED",

                    completedAt:
                        event.occurredAt,

                    failedAt:
                        null,

                    processedAt:
                        new Date()
                }
            });

        if (
            completed.count !== 1
        ) {

            /*
             * Throwing rolls back the user balance
             * update in this Prisma transaction.
             */
            throw new Error(
                "Unable to atomically finalize the completed withdrawal."
            );
        }

        await tx.transaction.updateMany({

            where: {
                reference:
                    withdrawal.id,
                type:
                    "WITHDRAWAL"
            },

            data: {
                status:
                    "COMPLETED",

                note:
                    (
                        `CentryOS push-to-card completed. ` +
                        `Requested ${withdrawal.amount} USD, ` +
                        `Senku Pay fee ${withdrawal.siteFeeAmount ?? 0} USD ` +
                        `(${withdrawal.siteFeePercent ?? 0}%), ` +
                        `submitted ${withdrawal.payoutAmount ?? withdrawal.amount} USD, ` +
                        `provider amount ${event.amount ?? "unknown"}, ` +
                        `provider fee ${event.feeCharged ?? "unknown"}.`
                    )
            }
        });

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "PROCESSED",
                errorMessage:
                    null
            }
        );

        return {
            outcome:
                "COMPLETED",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                withdrawal.id
        };
    }

    /*
     * FAILED: restore the user's locked amount once.
     */
    if (
        currentStatus === "COMPLETED"
    ) {

        await tx.withdrawRequest.update({

            where: {
                id:
                    withdrawal.id
            },

            data: {
                ...commonData,

                status:
                    "REVIEW_REQUIRED",

                lastProviderError:
                    (
                        "Provider reported FAILED after local completion. " +
                        (event.reason || "")
                    ).trim()
            }
        });

        await tx.transaction.updateMany({

            where: {
                reference:
                    withdrawal.id,
                type:
                    "WITHDRAWAL"
            },

            data: {
                status:
                    "REVIEW_REQUIRED"
            }
        });

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "CONFLICT",
                errorMessage:
                    "Late FAILED arrived after local completion."
            }
        );

        return {
            outcome:
                "REVIEW_REQUIRED",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                withdrawal.id
        };
    }

    if (
        currentStatus === "FAILED" ||
        currentStatus === "REJECTED"
    ) {

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "DUPLICATE",
                errorMessage:
                    `Withdrawal is already terminal: ${currentStatus}.`
            }
        );

        return {
            outcome:
                "DUPLICATE",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                withdrawal.id
        };
    }

    const userRestore =
        await tx.user.updateMany({

            where: {
                id:
                    withdrawal.userId,

                lockedBalance: {
                    gte:
                        withdrawal.amount
                }
            },

            data: {
                balance: {
                    increment:
                        withdrawal.amount
                },

                lockedBalance: {
                    decrement:
                        withdrawal.amount
                }
            }
        });

    if (
        userRestore.count !== 1
    ) {

        await tx.withdrawRequest.update({

            where: {
                id:
                    withdrawal.id
            },

            data: {
                ...commonData,

                status:
                    "REVIEW_REQUIRED",

                lastProviderError:
                    "Provider reported FAILED but the locked balance was insufficient."
            }
        });

        await tx.transaction.updateMany({

            where: {
                reference:
                    withdrawal.id,
                type:
                    "WITHDRAWAL"
            },

            data: {
                status:
                    "REVIEW_REQUIRED"
            }
        });

        await updateWebhookEvent(
            tx,
            eventKey,
            {
                processingStatus:
                    "CONFLICT",
                errorMessage:
                    "Insufficient locked balance while restoring a failed payout."
            }
        );

        return {
            outcome:
                "REVIEW_REQUIRED",
            resourceType:
                "WITHDRAWAL",
            resourceId:
                withdrawal.id
        };
    }

    await tx.withdrawRequest.update({

        where: {
            id:
                withdrawal.id
        },

        data: {
            ...commonData,

            status:
                "FAILED",

            failedAt:
                event.occurredAt,

            completedAt:
                null,

            processedAt:
                new Date()
        }
    });

    await tx.transaction.updateMany({

        where: {
            reference:
                withdrawal.id,
            type:
                "WITHDRAWAL"
        },

        data: {
            status:
                "FAILED",

            note:
                event.reason ||
                "CentryOS push-to-card payout failed."
        }
    });

    await updateWebhookEvent(
        tx,
        eventKey,
        {
            processingStatus:
                "PROCESSED",
            errorMessage:
                event.reason
        }
    );

    return {
        outcome:
            "FAILED",
        resourceType:
            "WITHDRAWAL",
        resourceId:
            withdrawal.id
    };
}


/*==================================================
            PUBLIC PROCESSOR FUNCTION
==================================================*/

async function processCentryosEvent({
    body,
    rawBody,
    signature,
    source = "WEBHOOK"
}) {

    const event =
        extractCentryosEvent(
            body
        );

    if (
        !event.eventType ||
        !event.status
    ) {

        const error =
            new Error(
                "Invalid CentryOS event payload."
            );

        error.statusCode =
            400;

        throw error;
    }

    const eventKey =
        createEventKey(
            event,
            rawBody || body
        );

    try {

        return await prisma.$transaction(
        async (tx) => {

            await tx.centryosWebhookEvent.create({

                data: {
                    eventKey,

                    eventType:
                        event.eventType,

                    status:
                        event.status,

                    transactionId:
                        event.transactionId,

                    paymentLinkId:
                        event.paymentLinkId,

                    signature:
                        String(
                            signature || source
                        ),

                    processingStatus:
                        "RECEIVED",

                    payload:
                        safeJson(
                            body
                        )
                }
            });

            if (
                event.eventType ===
                    "WITHDRAWAL"
            ) {

                return processWithdrawalEvent(
                    tx,
                    event,
                    eventKey
                );
            }

            if (
                event.eventType ===
                    "COLLECTION" ||
                event.eventType ===
                    "TRANSACTION_BLOCKED"
            ) {

                return processCollectionEvent(
                    tx,
                    event,
                    eventKey
                );
            }

            await updateWebhookEvent(
                tx,
                eventKey,
                {
                    processingStatus:
                        "IGNORED",
                    errorMessage:
                        `Unsupported CentryOS event type: ${event.eventType}`
                }
            );

            return {
                outcome:
                    "IGNORED",
                resourceType:
                    "UNKNOWN",
                resourceId:
                    null
            };
        });

    } catch (error) {

        if (
            isUniqueConstraintError(
                error
            )
        ) {

            return {
                outcome:
                    "DUPLICATE_EVENT",
                resourceType:
                    event.eventType,
                resourceId:
                    null
            };
        }

        throw error;
    }
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    processCentryosEvent
};
