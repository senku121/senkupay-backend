/*==================================================
                SENKU PAY
       CENTRYOS CHECKOUT CONTROLLER
==================================================*/

const {
    PrismaClient
} = require(
    "@prisma/client"
);

const {

    normalizeAmount,
    normalizeCurrency,
    normalizePaymentMethod,
    createCentryosPaymentLink

} = require(
    "../services/centryosCheckoutService"
);

const {
    ensureCentryosCheckoutSetup
} = require(
    "../services/centryosProvisioningService"
);

const prisma =
    new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function getRequiredFrontendUrl() {

    const value =
        String(
            process.env.FRONTEND_URL ||
            ""
        )
            .trim()
            .replace(/\/+$/, "");

    if (!value) {

        const error =
            new Error(
                "FRONTEND_URL is missing from the environment configuration."
            );

        error.statusCode = 500;

        throw error;
    }

    return value;
}


function buildDepositRedirectUrl(
    depositId
) {

    const url =
        new URL(
            "/deposit.html",
            `${getRequiredFrontendUrl()}/`
        );

    url.searchParams.set(
        "payment",
        "return"
    );

    url.searchParams.set(
        "depositId",
        depositId
    );

    return url.toString();
}


function safeJson(value) {

    if (value === undefined) {
        return {};
    }

    try {

        return JSON.parse(
            JSON.stringify(value)
        );

    } catch {

        return {
            message:
                String(value)
        };
    }
}


function methodDatabaseValue() {

    /*
     * The user chooses the actual payment rail on
     * the hosted CentryOS checkout.
     */
    return "CENTRYOS_CHECKOUT";
}


function paymentLinkResponse(
    deposit
) {

    return {

        id:
            deposit.id,

        amount:
            deposit.amount,

        customerPaidAmount:
            deposit.customerPaidAmount,

        providerFee:
            deposit.providerFee,

        netAmount:
            deposit.netAmount,

        currency:
            deposit.currency,

        method:
            deposit.method,

        provider:
            deposit.provider,

        status:
            deposit.status,

        providerStatus:
            deposit.providerStatus,

        providerMethod:
            deposit.providerMethod,

        paymentUrl:
            deposit.paymentUrl,

        paymentLinkId:
            deposit
                .providerPaymentLinkId,

        expiredAt:
            deposit.expiredAt,

        createdAt:
            deposit.createdAt,

        updatedAt:
            deposit.updatedAt,

        completedAt:
            deposit.completedAt,

        failedAt:
            deposit.failedAt

    };
}


/*==================================================
          CREATE MY PAYMENT LINK
==================================================*/

exports.createMyPaymentLink =
async (req, res) => {

    let deposit = null;

    try {

        const amount =
            normalizeAmount(
                req.body?.amount
            );

        const currency =
            normalizeCurrency(
                req.body?.currency ||
                "USD"
            );

        /*
         * Optional compatibility value. It does not
         * restrict the hosted checkout; every link
         * contains all four enabled payment methods.
         */
        const paymentMethod =
            normalizePaymentMethod(
                req.body?.paymentMethod
            );

        const itemDeliveryAddress =
            String(
                req.body
                    ?.itemDeliveryAddress ||
                ""
            ).trim();

        if (
            itemDeliveryAddress.length <
            8
        ) {

            return res.status(400).json({

                success:
                    false,

                message:
                    "Enter the customer's real billing or delivery address."

            });
        }

        const clientReference =
            req.body?.clientReference
                ? String(
                    req.body
                        .clientReference
                ).trim()
                : null;

        if (
            clientReference &&
            (
                clientReference.length <
                    6 ||
                clientReference.length >
                    100
            )
        ) {

            return res.status(400).json({

                success:
                    false,

                message:
                    "clientReference must contain 6 to 100 characters."

            });
        }

        if (clientReference) {

            const existingDeposit =
                await prisma
                    .deposit
                    .findFirst({

                        where: {

                            userId:
                                req.user.id,

                            clientReference

                        }

                    });

            if (
                existingDeposit
                    ?.paymentUrl
            ) {

                return res
                    .status(200)
                    .json({

                        success:
                            true,

                        message:
                            "This payment link was already created.",

                        alreadyCreated:
                            true,

                        deposit:
                            paymentLinkResponse(
                                existingDeposit
                            )

                    });
            }

            if (existingDeposit) {

                return res
                    .status(409)
                    .json({

                        success:
                            false,

                        message:
                            "A payment-link request with this clientReference is already being processed."

                    });
            }
        }

        /*
         * Automatic one-time setup:
         * 1. create/recover the CentryOS user
         * 2. create/recover the USD COLLECTION wallet
         * 3. best-effort create/recover the USD SPEND
         *    wallet for future withdrawals
         *
         * The customer never needs to visit a
         * CentryOS account-setup screen.
         */
        const setup =
            await ensureCentryosCheckoutSetup(
                req.user.id,
                currency
            );

        const user =
            setup.user;

        deposit =
            await prisma
                .deposit
                .create({

                    data: {

                        userId:
                            user.id,

                        amount,
                        currency,

                        method:
                            methodDatabaseValue(),

                        provider:
                            "CENTRYOS",

                        clientReference,

                        status:
                            "PENDING",

                        providerStatus:
                            "CREATING_LINK"

                    }

                });

        const result =
            await createCentryosPaymentLink({

                depositId:
                    deposit.id,

                userId:
                    user.id,

                userEmail:
                    user.email,

                username:
                    user.username,

                amount,
                currency,

                paymentMethod:
                    paymentMethod.key,

                itemDeliveryAddress,

                redirectTo:
                    buildDepositRedirectUrl(
                        deposit.id
                    )

            });

        const savedDeposit =
            await prisma
                .deposit
                .update({

                    where: {
                        id:
                            deposit.id
                    },

                    data: {

                        paymentId:
                            result
                                .paymentLinkId,

                        providerPaymentLinkId:
                            result
                                .paymentLinkId,

                        paymentUrl:
                            result.paymentUrl,

                        paymentToken:
                            result.token,

                        paymentTokenType:
                            result.tokenType,

                        expiredAt:
                            result.expiredAt,

                        providerStatus:
                            result.valid
                                ? "LINK_CREATED"
                                : "LINK_INVALID",

                        providerPayload:
                            safeJson({

                                paymentLink:
                                    result
                                        .providerResponse,

                                automaticSetup: {

                                    accountCreated:
                                        setup
                                            .accountCreated,

                                    accountRecovered:
                                        setup
                                            .accountRecovered,

                                    collectionReady:
                                        setup
                                            .collectionReady,

                                    spendReady:
                                        setup
                                            .spendReady,

                                    spendError:
                                        setup
                                            .spendError

                                }

                            })

                    }

                });

        return res
            .status(201)
            .json({

                success:
                    true,

                message:
                    "CentryOS payment link created successfully.",

                alreadyCreated:
                    false,

                automaticSetup: {

                    accountReady:
                        true,

                    collectionWalletReady:
                        true,

                    spendWalletReady:
                        setup.spendReady

                },

                deposit:
                    paymentLinkResponse(
                        savedDeposit
                    )

            });

    } catch (error) {

        console.error(
            "Create CentryOS payment link error:",
            error
        );

        if (deposit?.id) {

            try {

                await prisma
                    .deposit
                    .update({

                        where: {
                            id:
                                deposit.id
                        },

                        data: {

                            status:
                                "FAILED",

                            providerStatus:
                                (
                                    "CREATE_LINK_FAILED_" +
                                    Number(
                                        error
                                            .statusCode ||
                                        500
                                    )
                                ),

                            failedAt:
                                new Date(),

                            providerPayload:
                                safeJson(
                                    error
                                        .providerResponse ||
                                    {
                                        message:
                                            error
                                                .message
                                    }
                                )

                        }

                    });

            } catch (updateError) {

                console.error(
                    "Unable to mark failed deposit:",
                    updateError
                );
            }
        }

        const statusCode =
            Number(
                error.statusCode || 0
            );

        const responseStatus =
            statusCode >= 400 &&
            statusCode <= 499
                ? statusCode
                : statusCode >= 500
                    ? 502
                    : 500;

        return res
            .status(responseStatus)
            .json({

                success:
                    false,

                message:
                    error.message ||
                    "Unable to prepare the secure CentryOS checkout.",

                providerResponse:
                    error.providerResponse ||
                    null

            });
    }
};


/*==================================================
             GET MY DEPOSIT STATUS
==================================================*/

exports.getMyPaymentLinkDeposit =
async (req, res) => {

    try {

        const depositId =
            String(
                req.params.depositId ||
                ""
            ).trim();

        const deposit =
            await prisma
                .deposit
                .findFirst({

                    where: {

                        id:
                            depositId,

                        userId:
                            req.user.id,

                        provider:
                            "CENTRYOS"

                    }

                });

        if (!deposit) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    message:
                        "CentryOS deposit request not found."

                });
        }

        return res.status(200).json({

            success:
                true,

            deposit:
                paymentLinkResponse(
                    deposit
                )

        });

    } catch (error) {

        console.error(
            "Get CentryOS deposit error:",
            error
        );

        return res.status(500).json({

            success:
                false,

            message:
                "Unable to load the deposit status."

        });
    }
};
