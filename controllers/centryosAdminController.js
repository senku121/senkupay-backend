/*==================================================
                SENKU PAY
        CENTRYOS ADMIN CONTROLLER
==================================================*/

const {
    generateAccessToken
} = require(
    "../services/centryosAuthService"
);


/*==================================================
            TEST CENTRYOS AUTH
==================================================*/

exports.testAuthentication = async (req, res) => {

    try {

        const allowedRoles = new Set([
            "ADMIN",
            "SUPER_ADMIN"
        ]);

        const role = String(
            req.user?.role || ""
        ).toUpperCase();

        if (!allowedRoles.has(role)) {

            return res.status(403).json({
                success: false,
                message:
                    "Administrator access is required."
            });

        }

        const accessToken =
            await generateAccessToken();

        /*
         * Never return the complete provider token.
         * The frontend only needs to know whether
         * authentication succeeded.
         */
        return res.status(200).json({

            success: true,

            message:
                "CentryOS authentication is working.",

            tokenReceived:
                Boolean(accessToken),

            tokenPreview:
                `${accessToken.slice(0, 8)}...${accessToken.slice(-6)}`

        });

    } catch (error) {

        console.error(
            "CentryOS authentication test failed:",
            {
                message: error.message,
                statusCode: error.statusCode,
                providerResponse:
                    error.providerResponse
            }
        );

        return res
            .status(error.statusCode || 500)
            .json({

                success: false,

                message:
                    error.statusCode
                        ? "CentryOS authentication failed."
                        : "Unable to connect to CentryOS.",

                providerMessage:
                    error.message

            });

    }

};