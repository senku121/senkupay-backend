/*==================================================
                SENKU PAY
                MAIL SERVICE
==================================================*/

const { Resend } = require("resend");

/*==================================
        VALIDATE CONFIGURATION
==================================*/

if (!process.env.RESEND_API_KEY) {

    console.warn(
        "RESEND_API_KEY is missing. Email delivery will fail."
    );

}

const resend = new Resend(
    process.env.RESEND_API_KEY
);

/*==================================
        SEND EMAIL
==================================*/

async function sendMail({
    to,
    subject,
    html
}) {

    if (!to) {
        throw new Error("Email recipient is required.");
    }

    if (!subject) {
        throw new Error("Email subject is required.");
    }

    if (!html) {
        throw new Error("Email HTML content is required.");
    }

    const from =
        process.env.MAIL_FROM ||
        "Senku Pay <admin@senkupay.online>";

    const result = await resend.emails.send({
        from,
        to,
        subject,
        html
    });

    if (result.error) {

        console.error(
            "Resend email error:",
            result.error
        );

        throw new Error(
            result.error.message ||
            "Unable to send email."
        );

    }

    return result.data;
}

module.exports = {
    sendMail
};