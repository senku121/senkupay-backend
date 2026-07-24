/*==================================================
                SENKU PAY
       CENTRYOS WEBHOOK CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const {
    verifyCentryosWebhookSignature,
    safeJson,
    extractCollectionEvent,
    createEventKey,
    moneyToMinorUnits
} = require("../services/centryosWebhookService");

const prisma = new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function isUniqueConstraintError(error) {

    return (
        error &&
        error.code === "P2002"
    );
}


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
            provider: "CENTRYOS",
            OR: or
        }
    });
}


function transactionReference(event, depositId) {

    if (event.transactionId) {
        return `CENTRYOS:${event.transactionId}`;
    }

    if (event.paymentLinkId) {
        return `CENTRYOS-LINK:${event.paymentLinkId}`;
    }

    return `CENTRYOS-DEPOSIT:${depositId}`;
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
            processedAt: new Date()
        }
    });
}


/*==================================================
        HANDLE COLLECTION WEBHOOK
==================================================*/

exports.handleCollectionWebhook =
async (req, res) => {

    const receivedSignature =
        req.get("signature");

    /*
     * Signature verification must use the exact,
     * unmodified JSON bytes received from CentryOS.
     */
    let signatureIsValid = false;

    try {

        signatureIsValid =
            verifyCentryosWebhookSignature(
                req.rawBody,
                receivedSignature
            );

    } catch (error) {

        console.error(
            "CentryOS webhook configuration error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "CentryOS webhook verification is not configured."
        });
    }

    if (!signatureIsValid) {

        return res.status(401).json({
            success: false,
            message:
                "Invalid CentryOS webhook signature."
        });
    }

    const event =
        extractCollectionEvent(
            req.body
        );

    if (
        !event.eventType ||
        !event.status
    ) {

        return res.status(400).json({
            success: false,
            message:
                "Invalid CentryOS webhook payload."
        });
    }

    const eventKey =
        createEventKey(
            event,
            req.rawBody
        );

    try {

        const result =
        await prisma.$transaction(
        async (tx) => {

            /*
             * This unique insert is the first
             * idempotency barrier. A provider retry
             * with the same event cannot credit twice.
             */
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
                            receivedSignature || ""
                        ),
                    processingStatus:
                        "RECEIVED",
                    payload:
                        safeJson(
                            req.body
                        )
                }
            });

            const supportedEventType =
                event.eventType === "COLLECTION" ||
                event.eventType ===
                    "TRANSACTION_BLOCKED";

            const supportedStatus =
                event.status === "SUCCESS" ||
                event.status === "FAILED" ||
                event.status === "BLOCKED";

            if (
                !supportedEventType ||
                !supportedStatus
            ) {

                await updateWebhookEvent(
                    tx,
                    eventKey,
                    {
                        processingStatus:
                            "IGNORED",
                        errorMessage:
                            "Unsupported CentryOS collection event type or status."
                    }
                );

                return {
                    outcome: "IGNORED",
                    depositId: null
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

                /*
                 * The event is authentic and safely
                 * recorded. Return 2xx to avoid an
                 * endless provider retry loop.
                 */
                return {
                    outcome: "ORPHANED",
                    depositId: null
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

            /*
             * A completed deposit is final. Later
             * failed/blocked messages must never
             * reverse or reduce the user's balance.
             */
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
                    outcome: "DUPLICATE",
                    depositId:
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
                        depositId:
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
                        depositId:
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
                                `Unexpected transaction entry: ${event.entry}.`
                        }
                    );

                    return {
                        outcome:
                            "REJECTED_ENTRY",
                        depositId:
                            deposit.id
                    };
                }

                /*
                 * This atomic conditional update is
                 * the second idempotency barrier.
                 * Even two different SUCCESS events
                 * arriving concurrently can complete
                 * this deposit only once.
                 */
                const completion =
                    await tx.deposit.updateMany({
                        where: {
                            id: deposit.id,
                            status: {
                                not: "COMPLETED"
                            }
                        },
                        data: {
                            status: "COMPLETED",
                            providerStatus:
                                "SUCCESS",
                            providerTransactionId:
                                event.transactionId,
                            providerMethod:
                                event.method,
                            providerFee:
                                event.feeCharged,
                            webhookReceivedAt:
                                new Date(),
                            completedAt:
                                event.occurredAt,
                            failedAt: null
                        }
                    });

                if (completion.count === 0) {

                    await updateWebhookEvent(
                        tx,
                        eventKey,
                        {
                            processingStatus:
                                "DUPLICATE",
                            errorMessage:
                                "Deposit was completed by another webhook request."
                        }
                    );

                    return {
                        outcome: "DUPLICATE",
                        depositId:
                            deposit.id
                    };
                }

                await tx.user.update({
                    where: {
                        id: deposit.userId
                    },
                    data: {
                        balance: {
                            increment:
                                deposit.amount
                        },
                        deposited: {
                            increment:
                                deposit.amount
                        }
                    }
                });

                await tx.transaction.create({
                    data: {
                        userId:
                            deposit.userId,
                        type: "DEPOSIT",
                        amount:
                            deposit.amount,
                        status:
                            "COMPLETED",
                        reference:
                            transactionReference(
                                event,
                                deposit.id
                            ),
                        note:
                            `CentryOS ${deposit.currency} collection payment`
                    }
                });

                await updateWebhookEvent(
                    tx,
                    eventKey,
                    {
                        processingStatus:
                            "PROCESSED",
                        errorMessage: null
                    }
                );

                return {
                    outcome: "COMPLETED",
                    depositId:
                        deposit.id
                };
            }

            /*
             * FAILED and BLOCKED are terminal for
             * this payment attempt, but they never
             * downgrade an already completed deposit.
             */
            await tx.deposit.updateMany({
                where: {
                    id: deposit.id,
                    status: {
                        not: "COMPLETED"
                    }
                },
                data: {
                    status: "FAILED",
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
                depositId:
                    deposit.id
            };
        });

        return res.status(200).json({
            success: true,
            received: true,
            outcome:
                result.outcome,
            depositId:
                result.depositId
        });

    } catch (error) {

        /*
         * A duplicate eventKey means CentryOS retried
         * an event that was already recorded. Return
         * 200 so the provider can stop retrying.
         */
        if (
            isUniqueConstraintError(error)
        ) {

            return res.status(200).json({
                success: true,
                received: true,
                outcome:
                    "DUPLICATE_EVENT"
            });
        }

        console.error(
            "CentryOS collection webhook error:",
            error
        );

        /*
         * A real server/database failure returns 500.
         * This allows CentryOS to retry if its webhook
         * delivery system supports retries.
         */
        return res.status(500).json({
            success: false,
            message:
                "Unable to process CentryOS webhook."
        });
    }
};
