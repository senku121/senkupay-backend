/*==================================================
                SENKU PAY
       CENTRYOS WEBHOOK CONTROLLER
==================================================*/

const {
    verifyCentryosWebhookSignature
} = require(
    "../services/centryosWebhookService"
);

const {
    processCentryosEvent
} = require(
    "../services/centryosWebhookProcessor"
);


/*==================================================
          HANDLE ANY CENTRYOS WEBHOOK
==================================================*/

exports.handleCentryosWebhook =
async (req, res) => {

    const signature =
        req.get("signature");

    let signatureIsValid = false;

    try {

        signatureIsValid =
            verifyCentryosWebhookSignature(
                req.rawBody,
                signature
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

    try {

        const result =
            await processCentryosEvent({

                body:
                    req.body,

                rawBody:
                    req.rawBody,

                signature,

                source:
                    "WEBHOOK"
            });

        return res.status(200).json({

            success: true,
            received: true,

            outcome:
                result.outcome,

            resourceType:
                result.resourceType,

            resourceId:
                result.resourceId
        });

    } catch (error) {

        console.error(
            "CentryOS webhook processing error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({

            success: false,

            message:
                error.message ||
                "Unable to process CentryOS webhook."
        });
    }
};
