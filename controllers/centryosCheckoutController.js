/*==================================================
                SENKU PAY
       CENTRYOS CHECKOUT CONTROLLER
==================================================*/

const {
    PrismaClient
} = require("@prisma/client");

const {

normalizeAmount,
normalizeCurrency,
normalizePaymentMethod,
createCentryosPaymentLink

} = require(
"../services/centryosCheckoutService"
);

const prisma =
new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function getRequiredFrontendUrl() {

const value =
String(
process.env.FRONTEND_URL || ""
)
.trim()
.replace(/\/+$/, "");

if (!value) {

throw new Error(
"FRONTEND_URL is missing from the environment configuration."
);

}

return value;

}


function buildDepositRedirectUrl(
depositId
) {

const url =
new URL(
"/deposit.html",
`${getRequiredFrontendUrl()}/`
);

url.searchParams.set(
"payment",
"return"
);

url.searchParams.set(
"depositId",
depositId
);

return url.toString();

}


function safeJson(value) {

if (value === undefined) {
return {};
}

try {

return JSON.parse(
JSON.stringify(value)
);

} catch {

return {
message:
String(value)
};

}

}


function methodDatabaseValue(
paymentMethod
) {

return (
`CENTRYOS_${paymentMethod.code}`
);

}


function paymentLinkResponse(
deposit
) {

return {

id:
deposit.id,

amount:
deposit.amount,

customerPaidAmount:
deposit.customerPaidAmount,

providerFee:
deposit.providerFee,

netAmount:
deposit.netAmount,

currency:
deposit.currency,

method:
deposit.method,

provider:
deposit.provider,

status:
deposit.status,

providerStatus:
deposit.providerStatus,

paymentUrl:
deposit.paymentUrl,

paymentLinkId:
deposit.providerPaymentLinkId,

expiredAt:
deposit.expiredAt,

createdAt:
deposit.createdAt,

updatedAt:
deposit.updatedAt,

completedAt:
deposit.completedAt,

failedAt:
deposit.failedAt

};

}


/*==================================================
          CREATE MY PAYMENT LINK
==================================================*/

exports.createMyPaymentLink =
async (req, res) => {

let deposit = null;

try {

const amount =
normalizeAmount(
req.body?.amount
);

const currency =
normalizeCurrency(
req.body?.currency || "USD"
);

const paymentMethod =
normalizePaymentMethod(
req.body?.paymentMethod
);

const itemDeliveryAddress =
String(
req.body?.itemDeliveryAddress || ""
).trim();

if (
itemDeliveryAddress.length < 8
) {

return res.status(400).json({

success:
false,

message:
"Enter the customer's real billing or delivery address."

});

}

const clientReference =
req.body?.clientReference
? String(
req.body.clientReference
).trim()
: null;

if (
clientReference &&
(
clientReference.length < 6 ||
clientReference.length > 100
)
) {

return res.status(400).json({

success:
false,

message:
"clientReference must contain 6 to 100 characters."

});

}

if (clientReference) {

const existingDeposit =
await prisma.deposit.findFirst({

where: {
userId:
req.user.id,
clientReference
}

});

if (
existingDeposit?.paymentUrl
) {

return res.status(200).json({

success:
true,

message:
"This payment link was already created.",

alreadyCreated:
true,

deposit:
paymentLinkResponse(
existingDeposit
)

});

}

if (existingDeposit) {

return res.status(409).json({

success:
false,

message:
"A payment-link request with this clientReference is already being processed."

});

}

}

const user =
await prisma.user.findUnique({

where: {
id:
req.user.id
},

select: {

id:
true,

username:
true,

email:
true,

status:
true,

emailVerified:
true,

centryosAccountId:
true,

centryosWallets: {

where: {
walletType:
"COLLECTION",
currency
},

select: {
id:
true,
centryosWalletId:
true,
currency:
true
},

take:
1

}

}

});

if (!user) {

return res.status(404).json({

success:
false,

message:
"User not found."

});

}

if (
String(user.status)
.toUpperCase() !==
"ACTIVE"
) {

return res.status(403).json({

success:
false,

message:
"Your Senku Pay account is not active."

});

}

if (!user.emailVerified) {

return res.status(403).json({

success:
false,

message:
"Verify your email before creating a payment link."

});

}

if (!user.centryosAccountId) {

return res.status(409).json({

success:
false,

message:
"Connect your CentryOS account before creating a payment link."

});

}

if (
user.centryosWallets.length === 0
) {

return res.status(409).json({

success:
false,

message:
`Create your ${currency} COLLECTION wallet before creating a payment link.`

});

}

deposit =
await prisma.deposit.create({

data: {

userId:
user.id,

amount,
currency,

method:
methodDatabaseValue(
paymentMethod
),

provider:
"CENTRYOS",

clientReference,

status:
"PENDING",

providerStatus:
"CREATING_LINK"

}

});

const result =
await createCentryosPaymentLink({

depositId:
deposit.id,

userId:
user.id,

userEmail:
user.email,

username:
user.username,

amount,
currency,

paymentMethod:
paymentMethod.key,

itemDeliveryAddress,

redirectTo:
buildDepositRedirectUrl(
deposit.id
)

});

const savedDeposit =
await prisma.deposit.update({

where: {
id:
deposit.id
},

data: {

paymentId:
result.paymentLinkId,

providerPaymentLinkId:
result.paymentLinkId,

paymentUrl:
result.paymentUrl,

paymentToken:
result.token,

paymentTokenType:
result.tokenType,

expiredAt:
result.expiredAt,

providerStatus:
result.valid
? "LINK_CREATED"
: "LINK_INVALID",

providerPayload:
safeJson(
result.providerResponse
)

}

});

return res.status(201).json({

success:
true,

message:
"CentryOS payment link created successfully.",

alreadyCreated:
false,

deposit:
paymentLinkResponse(
savedDeposit
)

});

} catch (error) {

console.error(
"Create CentryOS payment link error:",
error
);

if (deposit?.id) {

try {

await prisma.deposit.update({

where: {
id:
deposit.id
},

data: {

status:
"FAILED",

providerStatus:
(
`CREATE_LINK_FAILED_` +
Number(
error.statusCode || 500
)
),

failedAt:
new Date(),

providerPayload:
safeJson(
error.providerResponse || {
message:
error.message
}
)

}

});

} catch (updateError) {

console.error(
"Unable to mark failed deposit:",
updateError
);

}

}

const providerStatus =
Number(
error.statusCode || 0
);

const responseStatus =
providerStatus >= 400 &&
providerStatus <= 499
? providerStatus
: providerStatus >= 500
? 502
: 500;

return res
.status(responseStatus)
.json({

success:
false,

message:
error.message ||
"Unable to create the CentryOS payment link.",

providerResponse:
error.providerResponse || null

});

}

};


/*==================================================
             GET MY DEPOSIT STATUS
==================================================*/

exports.getMyPaymentLinkDeposit =
async (req, res) => {

try {

const depositId =
String(
req.params.depositId || ""
).trim();

const deposit =
await prisma.deposit.findFirst({

where: {

id:
depositId,

userId:
req.user.id,

provider:
"CENTRYOS"

}

});

if (!deposit) {

return res.status(404).json({

success:
false,

message:
"CentryOS deposit request not found."

});

}

return res.status(200).json({

success:
true,

deposit:
paymentLinkResponse(
deposit
)

});

} catch (error) {

console.error(
"Get CentryOS deposit error:",
error
);

return res.status(500).json({

success:
false,

message:
"Unable to load the deposit status."

});

}

};
