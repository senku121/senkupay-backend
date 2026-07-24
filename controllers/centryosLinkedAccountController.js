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

const prisma =
    new PrismaClient();


/*==================================================
            CREATE WIDGET LINK
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
                    firstName: true,
                    lastName: true,
                    emailVerified: true,
                    centryosAccountId: true,

                    centryosWallets: {

                        where: {
                            currency,
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

        if (!user.emailVerified) {

            return res.status(403).json({
                success: false,
                message:
                    "Verify your email before linking a payout account."
            });
        }

        if (!user.centryosAccountId) {

            return res.status(409).json({
                success: false,
                message:
                    "Connect your CentryOS account before linking a payout account."
            });
        }

        if (
            user.centryosWallets.length === 0
        ) {

            return res.status(409).json({
                success: false,
                message:
                    `No ${currency} SPEND wallet is connected for this user.`
            });
        }

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
                    "First name, last name and email are required before linking an account."
            });
        }

        const widget =
            await createLinkedAccountWidget({

                currency,

                firstName:
                    user.firstName,

                lastName:
                    user.lastName,

                email:
                    user.email
            });

        /*
         * The URL contains a short-lived provider
         * token, so it is returned to the user but
         * deliberately not stored in the database.
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
                "CentryOS linked-account widget created successfully.",

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
            "Create linked-account widget error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to create the linked-account widget.",

            providerResponse:
                error.providerResponse
        });
    }
};
