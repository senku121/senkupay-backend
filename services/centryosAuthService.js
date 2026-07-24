/*==================================================
                SENKU PAY
        CENTRYOS AUTHENTICATION SERVICE
==================================================*/

const jwt = require("jsonwebtoken");

/*
 * Cached in server memory.
 *
 * This prevents requesting a new CentryOS access
 * token for every API request.
 */
let cachedAccessToken = null;
let cachedTokenExpiresAt = 0;

/*==================================================
                    HELPERS
==================================================*/

function getRequiredEnvironmentVariable(name) {

    const value = String(
        process.env[name] || ""
    ).trim();

    if (!value) {

        throw new Error(
            `${name} is missing from the environment configuration.`
        );

    }

    return value;

}


function removeTrailingSlash(value) {

    return String(value).replace(/\/+$/, "");

}


async function readResponseBody(response) {

    const rawBody = await response.text();

    if (!rawBody) {
        return {};
    }

    try {

        return JSON.parse(rawBody);

    } catch {

        return {
            rawBody
        };

    }

}


function extractAccessToken(responseBody) {

    return (
        responseBody?.accessToken ||
        responseBody?.access_token ||
        responseBody?.token ||
        responseBody?.data?.accessToken ||
        responseBody?.data?.access_token ||
        responseBody?.data?.token ||
        null
    );

}


function getTokenExpiration(accessToken) {

    try {

        const decoded = jwt.decode(accessToken);

        if (
            decoded &&
            typeof decoded.exp === "number"
        ) {

            return decoded.exp * 1000;

        }

    } catch (error) {

        console.warn(
            "Unable to read CentryOS token expiration:",
            error.message
        );

    }

    /*
     * Safe fallback if the expiration cannot be read.
     * The token will be refreshed after 10 minutes.
     */
    return Date.now() + (10 * 60 * 1000);

}


/*==================================================
        GENERATE CENTRYOS ACCESS TOKEN
==================================================*/

async function generateAccessToken() {

    const accountBaseUrl = removeTrailingSlash(
        getRequiredEnvironmentVariable(
            "CENTRYOS_ACCOUNT_BASE_URL"
        )
    );

    const clientId = getRequiredEnvironmentVariable(
        "CENTRYOS_CLIENT_ID"
    );

    const clientSecret = getRequiredEnvironmentVariable(
        "CENTRYOS_CLIENT_SECRET"
    );

    const basicCredentials = Buffer.from(
        `${clientId}:${clientSecret}`,
        "utf8"
    ).toString("base64");

    const response = await fetch(
        `${accountBaseUrl}/v1/ext/jwt/generate-token`,
        {
            method: "POST",

            headers: {
                Authorization:
                    `Basic ${basicCredentials}`,

                "Content-Type":
                    "application/json",

                Accept:
                    "application/json"
            },

            body: JSON.stringify({})
        }
    );

    const responseBody =
        await readResponseBody(response);

    if (!response.ok) {

        const providerMessage =
            responseBody?.message ||
            responseBody?.error ||
            responseBody?.rawBody ||
            "CentryOS rejected the authentication request.";

        const error = new Error(providerMessage);

        error.statusCode = response.status;
        error.providerResponse = responseBody;

        throw error;

    }

    const accessToken =
        extractAccessToken(responseBody);

    if (!accessToken) {

        const error = new Error(
            "CentryOS did not return an access token."
        );

        error.providerResponse = responseBody;

        throw error;

    }

    cachedAccessToken = accessToken;
    cachedTokenExpiresAt =
        getTokenExpiration(accessToken);

    return accessToken;

}


/*==================================================
            GET VALID ACCESS TOKEN
==================================================*/

async function getAccessToken() {

    /*
     * Refresh 60 seconds before expiration.
     */
    const refreshBuffer = 60 * 1000;

    const tokenIsStillValid =
        cachedAccessToken &&
        cachedTokenExpiresAt >
            Date.now() + refreshBuffer;

    if (tokenIsStillValid) {

        return cachedAccessToken;

    }

    return generateAccessToken();

}


/*==================================================
                CLEAR TOKEN CACHE
==================================================*/

function clearAccessTokenCache() {

    cachedAccessToken = null;
    cachedTokenExpiresAt = 0;

}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    generateAccessToken,
    getAccessToken,
    clearAccessTokenCache
};