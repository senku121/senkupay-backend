/*==================================================
                SENKU PAY
   CENTRYOS LINKED ACCOUNT WIDGET CONTROLLER
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const {
    createLinkedAccountWidget
} = require(
    "../services/centryosLinkedAccountService"
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
            CREATE CARD-LINKING WIDGET
==================================================*/

exports.createWidget =
async (req, res) => {

    try {

        const currency =
            String(
                req.body?.currency || "USD"
            )
                .trim()
                .toUpperCase();

        /*
         * Senku Pay currently supports only USD
         * push-to-card withdrawals.
         */
        if (currency !== "USD") {

            return res.status(400).json({
                success: false,
                message:
                    "Payout card linking currently supports USD only."
            });
        }

        /*
         * Automatic provider setup:
         * - create/recover the CentryOS user account
         * - create/recover the USD SPEND wallet
         *
         * The customer never manually creates or
         * connects a CentryOS account.
         */
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

        const user =
            accountResult.user;

        if (
            !String(
                user.firstName || ""
            ).trim() ||
            !String(
                user.lastName || ""
            ).trim() ||
            !String(
                user.email || ""
            ).trim()
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "First name, last name and email are required before linking a payout card."
            });
        }

        const widget =
            await createLinkedAccountWidget({

                currency:
                    "USD",

                firstName:
                    user.firstName,

                lastName:
                    user.lastName,

                email:
                    user.email
            });

        /*
         * The URL contains a short-lived provider
         * token, so it is returned to the customer
         * but never persisted in the database.
         */
        const session =
            await prisma.$transaction(
            async (tx) => {

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
                                "SUPERSEDED"
                        }
                    });

                return tx
                    .centryosLinkedAccountWidgetSession
                    .create({

                        data: {

                            userId:
                                user.id,

                            applicationId:
                                widget.applicationId,

                            customerId:
                                widget.customerId,

                            currency:
                                widget.currency,

                            providerValid:
                                widget.valid,

                            expiresAt:
                                widget.expiresAt,

                            status:
                                widget.valid
                                    ? "ACTIVE"
                                    : "INVALID"
                        }
                    });
            });

        return res.status(201).json({

            success: true,

            message:
                "Secure CentryOS payout-card widget created successfully.",

            automaticSetup: {
                accountReady:
                    true,
                spendWalletReady:
                    true
            },

            widget: {

                sessionId:
                    session.id,

                currency:
                    session.currency,

                url:
                    widget.widgetUrl,

                expiresAt:
                    session.expiresAt,

                valid:
                    session.providerValid
            }
        });

    } catch (error) {

        console.error(
            "Create linked-card widget error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to create the secure payout-card widget.",

            providerResponse:
                error.providerResponse
        });
    }
};
