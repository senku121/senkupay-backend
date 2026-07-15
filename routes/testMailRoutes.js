/*==================================================
                SENKU PAY
            MAIL TEST ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {

    sendMail

} = require("../services/mailService");

router.get(

    "/",

    async (req, res) => {

        try {

            await sendMail({

                to: "admin@senkupay.online",

                subject: "Senku Pay Email Test",

                html: `

                    <h2>Senku Pay</h2>

                    <p>

                        Your Resend email service
                        is working successfully.

                    </p>

                `

            });

            return res.status(200).json({

                success: true,

                message: "Email sent successfully."

            });

        }

        catch (error) {

            console.error(error);

            return res.status(500).json({

                success: false,

                message: error.message

            });

        }

    }

);

module.exports = router;