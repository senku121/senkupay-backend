/*==================================================
                SENKU PAY
        CENTRYOS WEBHOOK SERVICE
==================================================*/

const crypto = require("crypto");


/*==================================================
                    SECRET
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


/*==================================================
               SIGNATURE VERIFICATION
==================================================*/

function normalizeSignature(value) {

    return String(value || "")
        .trim()
        .replace(/^sha512=/i, "")
        .toLowerCase();
}


function verifyCentryosWebhookSignature(
    rawBody,
    receivedSignature
) {

    if (!Buffer.isBuffer(rawBody)) {
        return false;
    }

    const received =
        normalizeSignature(
            receivedSignature
        );

    if (
        !received ||
        !/^[a-f0-9]+$/i.test(received)
    ) {
        return false;
    }

    const expected = crypto
        .createHmac(
            "sha512",
            getRequiredWebhookSecret()
        )
        .update(rawBody)
        .digest("hex")
        .toLowerCase();

    const expectedBuffer =
        Buffer.from(expected, "utf8");

    const receivedBuffer =
        Buffer.from(received, "utf8");

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


/*==================================================
                    NORMALIZERS
==================================================*/

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

    const text =
        String(value || "").trim();

    return text || null;
}


function normalizeMoney(value) {

    const amount =
        Number(value);

    if (!Number.isFinite(amount)) {
        return null;
    }

    return Math.round(
        (amount + Number.EPSILON) * 100
    ) / 100;
}


function moneyToMinorUnits(value) {

    const amount =
        normalizeMoney(value);

    return amount === null
        ? null
        : Math.round(amount * 100);
}


function parseProviderTimestamp(value) {

    const timestamp =
        Number(value);

    if (!Number.isFinite(timestamp)) {
        return new Date();
    }

    const result =
        new Date(timestamp);

    return Number.isNaN(
        result.getTime()
    )
        ? new Date()
        : result;
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


/*==================================================
               GENERIC EVENT PARSER
==================================================*/

function extractCentryosEvent(body) {

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

    return {
        eventType,
        status,

        transactionId,
        paymentLinkId,

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

        entry:
            normalizeUpper(
                payload.entry
            ),

        method:
            normalizeUpper(
                payload.method
            ),

        amount:
            normalizeMoney(
                payload.amount
            ),

        amountMinor:
            moneyToMinorUnits(
                payload.amount
            ),

        feeCharged:
            normalizeMoney(
                payload.feeCharged
            ),

        currency:
            normalizeUpper(
                payload.currency
            ),

        summary:
            normalizeString(
                payload.summary
            ),

        description:
            normalizeString(
                payload.description
            ),

        reason:
            normalizeString(
                payload.reason
            ),

        occurredAt:
            parseProviderTimestamp(
                payload.timestamp
            ),

        paymentLinkExternalId:
            normalizeString(
                paymentLink.externalId
            ),

        localDepositReferences:
            uniqueStrings([
                metadata.depositId,
                metadata.orderId,
                metadata.externalId,

                customData.depositId,
                customData.orderId,
                customData.externalId,

                paymentLink.externalId
            ]),

        payload,
        metadata,
        paymentLink
    };
}


/*==================================================
                 IDEMPOTENCY KEY
==================================================*/

function createEventKey(
    event,
    rawBody
) {

    const fallbackHash =
        crypto
            .createHash("sha256")
            .update(
                Buffer.isBuffer(rawBody)
                    ? rawBody
                    : Buffer.from(
                        JSON.stringify(
                            rawBody || {}
                        )
                    )
            )
            .digest("hex");

    const stableReference =
        event.transactionId ||
        event.paymentLinkId ||
        fallbackHash;

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
    extractCentryosEvent,
    createEventKey,
    normalizeMoney,
    moneyToMinorUnits
};
