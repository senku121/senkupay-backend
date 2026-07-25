/*==================================================
                SENKU PAY
       CENTRYOS ACCOUNT CONTROLLER
==================================================*/

const {
    getAccountMetadata
} = require(
    "../services/centryosAccountService"
);

const {
    ensureCentryosAccountForUser
} = require(
    "../services/centryosProvisioningService"
);


/*==================================================
       CREATE/LINK MY CENTRYOS ACCOUNT
==================================================*/

exports.createMyCentryosAccount =
async (req, res) => {

    try {

        const result =
            await ensureCentryosAccountForUser(
                req.user.id
            );

        return res.status(
            result.accountCreated
                ? 201
                : 200
        ).json({

            success:
                true,

            message:
                result.accountCreated
                    ? "CentryOS user account created and connected successfully."
                    : result.accountRecovered
                        ? "Existing CentryOS account recovered and connected successfully."
                        : "Your CentryOS account is already connected.",

            alreadyConnected:
                !result.accountCreated,

            recovered:
                result.accountRecovered,

            account: {

                id:
                    result.accountId,

                createdAt:
                    result.user
                        .centryosAccountCreatedAt

            }

        });

    } catch (error) {

        console.error(
            "Create CentryOS account error:",
            error
        );

        const status =
            Number(
                error.statusCode || 500
            );

        return res.status(
            status >= 400 &&
            status <= 599
                ? status
                : 500
        ).json({

            success:
                false,

            message:
                error.message ||
                "Unable to connect the CentryOS account.",

            providerResponse:
                error.providerResponse ||
                null

        });
    }
};


/*==================================================
              GET MY ACCOUNT METADATA
==================================================*/

exports.getMyCentryosAccount =
async (req, res) => {

    try {

        const result =
            await ensureCentryosAccountForUser(
                req.user.id
            );

        const providerAccount =
            await getAccountMetadata(
                result.accountId
            );

        return res.status(200).json({

            success:
                true,

            account:
                providerAccount

        });

    } catch (error) {

        console.error(
            "Get CentryOS account error:",
            error
        );

        const status =
            Number(
                error.statusCode || 502
            );

        return res.status(
            status >= 400 &&
            status <= 599
                ? status
                : 502
        ).json({

            success:
                false,

            message:
                error.message ||
                "Unable to retrieve the CentryOS account.",

            providerResponse:
                error.providerResponse ||
                null

        });
    }
};
