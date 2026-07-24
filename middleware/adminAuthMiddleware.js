/*==================================================
                SENKU PAY
             ADMIN AUTH MIDDLEWARE
==================================================*/

const jwt =
    require("jsonwebtoken");


exports.verifyAdminToken =
(req, res, next) => {

    const authHeader =
        String(
            req.headers.authorization || ""
        ).trim();

    if (
        !authHeader.startsWith("Bearer ")
    ) {

        return res.status(401).json({
            success: false,
            message:
                "Admin authorization token is required."
        });
    }

    const token =
        authHeader.slice(7).trim();

    try {

        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET,
                {
                    issuer:
                        "senku-pay-api",

                    audience:
                        "senku-pay-admin"
                }
            );

        if (
            ![
                "ADMIN",
                "SUPER_ADMIN"
            ].includes(
                String(
                    decoded.role || ""
                ).toUpperCase()
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Administrator access is required."
            });
        }

        req.user =
            decoded;

        return next();

    } catch (error) {

        return res.status(401).json({
            success: false,
            message:
                "Admin token is expired or invalid."
        });
    }
};
