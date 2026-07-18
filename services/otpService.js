/*==================================================
                SENKU PAY
                OTP SERVICE
==================================================*/

const { sendMail } = require("./mailService");

/*==================================
        SEND OTP EMAIL
==================================*/

exports.sendOTPEmail = async (email, otp) => {

    if (!email) {
        throw new Error("Recipient email is required.");
    }

    if (!otp) {
        throw new Error("OTP code is required.");
    }

    return sendMail({
        to: email,

        subject: "Senku Pay Email Verification Code",

        html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                >
            </head>

            <body style="
                margin:0;
                padding:0;
                background:#050816;
                font-family:Arial,sans-serif;
                color:#ffffff;
            ">

                <div style="
                    max-width:600px;
                    margin:0 auto;
                    padding:40px 20px;
                ">

                    <div style="
                        padding:32px;
                        border-radius:22px;
                        background:#111827;
                        border:1px solid rgba(255,255,255,.10);
                    ">

                        <div style="
                            width:58px;
                            height:58px;
                            margin-bottom:24px;
                            border-radius:18px;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            background:linear-gradient(
                                135deg,
                                #7b2cff,
                                #00d4ff
                            );
                            color:#ffffff;
                            font-size:27px;
                            font-weight:900;
                        ">
                            S
                        </div>

                        <h1 style="
                            margin:0 0 12px;
                            font-size:28px;
                            color:#ffffff;
                        ">
                            Verify your Senku Pay account
                        </h1>

                        <p style="
                            margin:0 0 25px;
                            color:#9ca3af;
                            font-size:15px;
                            line-height:1.7;
                        ">
                            Use the verification code below to complete
                            your request.
                        </p>

                        <div style="
                            margin:25px 0;
                            padding:22px;
                            text-align:center;
                            border-radius:18px;
                            background:#171f33;
                            border:1px solid rgba(123,44,255,.35);
                        ">

                            <span style="
                                display:block;
                                color:#9ca3af;
                                font-size:12px;
                                margin-bottom:9px;
                                letter-spacing:.12em;
                            ">
                                VERIFICATION CODE
                            </span>

                            <strong style="
                                color:#ffffff;
                                font-size:38px;
                                letter-spacing:8px;
                            ">
                                ${otp}
                            </strong>

                        </div>

                        <p style="
                            margin:0;
                            color:#9ca3af;
                            font-size:14px;
                            line-height:1.7;
                        ">
                            This verification code expires in 10 minutes.
                            Do not share it with anyone.
                        </p>

                        <p style="
                            margin:24px 0 0;
                            padding-top:20px;
                            border-top:1px solid rgba(255,255,255,.08);
                            color:#718096;
                            font-size:12px;
                            line-height:1.7;
                        ">
                            If you did not request this code, you can safely
                            ignore this email.
                        </p>

                    </div>

                    <p style="
                        margin:20px 0 0;
                        text-align:center;
                        color:#64748b;
                        font-size:12px;
                    ">
                        © ${new Date().getFullYear()} Senku Pay
                    </p>

                </div>

            </body>
            </html>
        `
    });
};