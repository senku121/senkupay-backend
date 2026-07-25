/*==================================================
                SENKU PAY
        CENTRYOS CHECKOUT SERVICE
==================================================*/

const {
    centryosPost
} = require("./centryosApiService");


/*==================================================
                    CONSTANTS
==================================================*/

const SUPPORTED_CURRENCIES =
new Set([
    "USD"
]);

/*
 * These values match the payment-option names shown
 * in the CentryOS payment-link dashboard:
 * Card, Cash App, Apple Pay and Google Pay.
 *
 * Pay by Bank is deliberately excluded.
 */
const ACCEPTED_PAYMENT_OPTIONS =
Object.freeze([
    "card",
    "cashapp",
    "apple_pay",
    "google_pay"
]);

const PREFERRED_PAYMENT_METHODS =
Object.freeze({

    card: {
        code:
            "CARD",
        label:
            "Card"
    },

    cashapp: {
        code:
            "CASH_APP",
        label:
            "Cash App"
    },

    applepay: {
        code:
            "APPLE_PAY",
        label:
            "Apple Pay"
    },

    googlepay: {
        code:
            "GOOGLE_PAY",
        label:
            "Google Pay"
    },

    checkout: {
        code:
            "CHECKOUT",
        label:
            "CentryOS Checkout"
    }

});


/*==================================================
                    HELPERS
==================================================*/

function requiredString(
value,
fieldName
) {

const normalized =
String(value || "").trim();

if (!normalized) {

const error =
new Error(
`${fieldName} is required.`
);

error.statusCode = 400;

throw error;

}

return normalized;

}


function normalizeCurrency(value) {

const currency =
requiredString(
value,
"currency"
).toUpperCase();

if (
!SUPPORTED_CURRENCIES.has(
currency
)
) {

const error =
new Error(
"Senku Pay checkout currently supports USD only."
);

error.statusCode = 400;

throw error;

}

return currency;

}


function normalizeAmount(value) {

const amount =
Number(value);

if (!Number.isFinite(amount)) {

const error =
new Error(
"amount must be a valid number."
);

error.statusCode = 400;

throw error;

}

if (amount < 0.5) {

const error =
new Error(
"amount must be at least 0.50."
);

error.statusCode = 400;

throw error;

}

return Math.round(
(amount + Number.EPSILON) * 100
) / 100;

}


/*
 * This value is only kept for backward compatibility
 * with older frontend requests. It does not restrict
 * the hosted checkout. Every generated CentryOS link
 * contains all four enabled payment options.
 */
function normalizePaymentMethod(value) {

const method =
String(value || "")
.trim()
.toLowerCase();

if (!method) {

return {
key:
"checkout",
...PREFERRED_PAYMENT_METHODS.checkout
};

}

const selected =
PREFERRED_PAYMENT_METHODS[method];

if (!selected) {

const error =
new Error(
"paymentMethod must be card, cashapp, applepay, or googlepay."
);

error.statusCode = 400;

throw error;

}

return {
key:
method,
...selected
};

}


function normalizePaymentLinkResponse(
providerResponse
) {

const data =
providerResponse?.data;

const application =
data?.application;

const paymentUrl =
String(
data?.url || ""
).trim();

const paymentLinkId =
String(
application?.id || ""
).trim();

if (
!paymentUrl ||
!paymentLinkId
) {

const error =
new Error(
"CentryOS returned an incomplete payment-link response."
);

error.statusCode = 502;

error.providerResponse =
providerResponse;

throw error;

}

let expiredAt = null;

if (application?.expiredAt) {

const parsedDate =
new Date(
application.expiredAt
);

if (
!Number.isNaN(
parsedDate.getTime()
)
) {

expiredAt =
parsedDate;

}

}

return {

paymentUrl,
paymentLinkId,

token:
application?.token
? String(application.token)
: null,

tokenType:
application?.tokenType
? String(application.tokenType)
: null,

expiredAt,

valid:
application?.valid === true,

providerResponse

};

}


/*==================================================
             CREATE PAYMENT LINK
==================================================*/

async function createCentryosPaymentLink({

depositId,
userId,
userEmail,
username,
amount,
currency,
paymentMethod,
itemDeliveryAddress,
redirectTo

}) {

const normalizedDepositId =
requiredString(
depositId,
"depositId"
);

const normalizedUserId =
requiredString(
userId,
"userId"
);

const normalizedEmail =
requiredString(
userEmail,
"userEmail"
);

const normalizedUsername =
requiredString(
username,
"username"
);

const normalizedAmount =
normalizeAmount(amount);

const normalizedCurrency =
normalizeCurrency(currency);

const preferredMethod =
normalizePaymentMethod(
paymentMethod
);

const deliveryAddress =
requiredString(
itemDeliveryAddress,
"itemDeliveryAddress"
);

const normalizedRedirectTo =
requiredString(
redirectTo,
"redirectTo"
);

const providerResponse =
await centryosPost(
"ledger",
"/v1/ext/collections/payment-link",
{

currency:
normalizedCurrency,

name:
"Senku Pay account funding",

amount:
normalizedAmount,

customUrlPath:
`senkupay-${normalizedDepositId}`,

redirectTo:
normalizedRedirectTo,

checkoutType:
"generic",

isOpenLink:
false,

/*
 * Customer pays exactly the entered amount.
 * CentryOS deducts the provider fee from the gross
 * amount, and the signed webhook credits the net.
 */
customerPays:
false,

/*
 * Every link shows all supported methods.
 * Pay by Bank is not included.
 */
acceptedPaymentOptions:
[...ACCEPTED_PAYMENT_OPTIONS],

notifyPayee:
false,

itemDeliveryAddress:
deliveryAddress,

cartItems: [
{
name:
"Senku Pay account funding",

description:
(
`Account funding for Senku Pay user ` +
normalizedUsername
),

qty:
1,

price:
normalizedAmount,

currency:
normalizedCurrency,

productId:
"SENKUPAY-ACCOUNT-FUNDING"
}
],

customData: {

depositId:
normalizedDepositId,

userId:
normalizedUserId,

email:
normalizedEmail,

preferredPaymentMethod:
preferredMethod.key,

preferredPaymentMethodLabel:
preferredMethod.label,

enabledPaymentOptions:
ACCEPTED_PAYMENT_OPTIONS.join(",")

}

}
);

return normalizePaymentLinkResponse(
providerResponse
);

}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {

SUPPORTED_CURRENCIES,
ACCEPTED_PAYMENT_OPTIONS,
PREFERRED_PAYMENT_METHODS,

normalizeAmount,
normalizeCurrency,
normalizePaymentMethod,

createCentryosPaymentLink

};
