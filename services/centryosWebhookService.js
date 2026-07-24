/*==================================================
                SENKU PAY
        CENTRYOS WEBHOOK SERVICE
==================================================*/

const crypto = require("crypto");


/*==================================================
                    HELPERS
==================================================*/

function getRequiredWebhookSecret() {

    const secret = String(
        process.env.CENTRYOS_WEBHOOK_SECRET || ""
    ).trim();

    if (!secret) {
        throw new Error(
            "CENTRYOS_WEBHOOK_SECRET is missing from the environment configuration."
        );
    }

    return secret;
}


function normalizeSignature(value) {

    let signature = String(value || "").trim();

    /*
     * The CentryOS guide shows a plain hexadecimal
     * signature. This also accepts an optional
     * "sha512=" prefix without weakening validation.
     */
    signature = signature.replace(
        /^sha512=/i,
        ""
    );

    return signature.toLowerCase();
}


function verifyCentryosWebhookSignature(
    rawBody,
    receivedSignature
) {

    if (!Buffer.isBuffer(rawBody)) {
        return false;
    }

    const normalizedReceived =
        normalizeSignature(
            receivedSignature
        );

    if (
        !normalizedReceived ||
        !/^[a-f0-9]+$/i.test(normalizedReceived)
    ) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac(
            "sha512",
            getRequiredWebhookSecret()
        )
        .update(rawBody)
        .digest("hex")
        .toLowerCase();

    const expectedBuffer =
        Buffer.from(
            expectedSignature,
            "utf8"
        );

    const receivedBuffer =
        Buffer.from(
            normalizedReceived,
            "utf8"
        );

    if (
        expectedBuffer.length !==
        receivedBuffer.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
    );
}


function safeJson(value) {

    try {
        return JSON.parse(
            JSON.stringify(value)
        );
    } catch {
        return {
            value: String(value)
        };
    }
}


function normalizeUpper(value) {

    return String(value || "")
        .trim()
        .toUpperCase();
}


function normalizeString(value) {

    const result =
        String(value || "").trim();

    return result || null;
}


function normalizeMoney(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return null;
    }

    return Math.round(
        (number + Number.EPSILON) * 100
    ) / 100;
}


function moneyToMinorUnits(value) {

    const number = normalizeMoney(value);

    if (number === null) {
        return null;
    }

    return Math.round(number * 100);
}


function parseProviderTimestamp(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return new Date();
    }

    const date = new Date(number);

    if (Number.isNaN(date.getTime())) {
        return new Date();
    }

    return date;
}


function uniqueStrings(values) {

    return [
        ...new Set(
            values
                .map(normalizeString)
                .filter(Boolean)
        )
    ];
}


function extractCollectionEvent(body) {

    const payload =
        body &&
        typeof body.payload === "object" &&
        body.payload !== null
            ? body.payload
            : {};

    const metadata =
        payload.metadata &&
        typeof payload.metadata === "object" &&
        payload.metadata !== null
            ? payload.metadata
            : {};

    const customData =
        metadata.customData &&
        typeof metadata.customData === "object" &&
        metadata.customData !== null
            ? metadata.customData
            : {};

    const paymentLink =
        payload.paymentLink &&
        typeof payload.paymentLink === "object" &&
        payload.paymentLink !== null
            ? payload.paymentLink
            : {};

    const eventType =
        normalizeUpper(body?.eventType);

    const status =
        normalizeUpper(body?.status);

    const transactionId =
        normalizeString(
            payload.transactionId
        );

    const paymentLinkId =
        normalizeString(
            paymentLink.id
        );

    const localDepositReferences =
        uniqueStrings([
            metadata.depositId,
            metadata.orderId,
            metadata.externalId,

            customData.depositId,
            customData.orderId,
            customData.externalId,

            paymentLink.externalId
        ]);

    return {
        eventType,
        status,

        transactionId,
        walletId:
            normalizeString(
                payload.walletId
            ),
        entityId:
            normalizeString(
                payload.entityId
            ),
        entityType:
            normalizeUpper(
                payload.entityType
            ),

        method:
            normalizeUpper(
                payload.method
            ),
        summary:
            normalizeString(
                payload.summary
            ),
        entry:
            normalizeUpper(
                payload.entry
            ),

        amount:
            normalizeMoney(
                payload.amount
            ),
        amountMinor:
            moneyToMinorUnits(
                payload.amount
            ),
        currency:
            normalizeUpper(
                payload.currency
            ),
        feeCharged:
            normalizeMoney(
                payload.feeCharged
            ),

        occurredAt:
            parseProviderTimestamp(
                payload.timestamp
            ),

        reason:
            normalizeString(
                payload.reason
            ),

        paymentLinkId,
        paymentLinkExternalId:
            normalizeString(
                paymentLink.externalId
            ),

        localDepositReferences,

        payload,
        metadata,
        paymentLink
    };
}


function createEventKey(event, rawBody) {

    const stableReference =
        event.transactionId ||
        event.paymentLinkId ||
        crypto
            .createHash("sha256")
            .update(rawBody)
            .digest("hex");

    return [
        event.eventType || "UNKNOWN",
        event.status || "UNKNOWN",
        stableReference
    ].join(":");
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    verifyCentryosWebhookSignature,
    safeJson,
    extractCollectionEvent,
    createEventKey,
    moneyToMinorUnits
};
