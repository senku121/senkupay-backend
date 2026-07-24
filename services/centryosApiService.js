/*==================================================
                SENKU PAY
          CENTRYOS API SERVICE
==================================================*/

const {
    getAccessToken,
    clearAccessTokenCache
} = require("./centryosAuthService");


/*==================================================
                    HELPERS
==================================================*/

function removeTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}


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


function createProviderError(response, responseBody) {

    const providerMessage =
        responseBody?.message ||
        responseBody?.error?.message ||
        responseBody?.error ||
        responseBody?.details ||
        responseBody?.rawBody ||
        `CentryOS request failed with status ${response.status}.`;

    const error = new Error(
        typeof providerMessage === "string"
            ? providerMessage
            : JSON.stringify(providerMessage)
    );

    error.statusCode = response.status;
    error.providerResponse = responseBody;

    return error;
}


/*==================================================
                BASE URL SELECTOR
==================================================*/

function getBaseUrl(apiType) {

    switch (apiType) {

        case "account":
            return removeTrailingSlash(
                getRequiredEnvironmentVariable(
                    "CENTRYOS_ACCOUNT_BASE_URL"
                )
            );

        case "ledger":
            return removeTrailingSlash(
                getRequiredEnvironmentVariable(
                    "CENTRYOS_LEDGER_BASE_URL"
                )
            );

        default:
            throw new Error(
                `Unsupported CentryOS API type: ${apiType}`
            );
    }
}


/*==================================================
            BUILD REQUEST HEADERS
==================================================*/

function buildHeaders(accessToken, customHeaders = {}) {

    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...customHeaders
    };
}


/*==================================================
            CENTRYOS API REQUEST
==================================================*/

async function centryosRequest({
    apiType,
    path,
    method = "GET",
    body,
    headers = {},
    retryOnUnauthorized = true
}) {

    if (!path) {
        throw new Error(
            "CentryOS request path is required."
        );
    }

    const baseUrl = getBaseUrl(apiType);

    const normalizedPath = path.startsWith("/")
        ? path
        : `/${path}`;

    const accessToken = await getAccessToken();

    const requestOptions = {
        method,
        headers: buildHeaders(
            accessToken,
            headers
        )
    };

    if (
        body !== undefined &&
        body !== null &&
        method !== "GET" &&
        method !== "HEAD"
    ) {
        requestOptions.body = JSON.stringify(body);
    }

    let response;

    try {

        response = await fetch(
            `${baseUrl}${normalizedPath}`,
            requestOptions
        );

    } catch (networkError) {

        const error = new Error(
            `Unable to connect to CentryOS: ${networkError.message}`
        );

        error.statusCode = 502;
        error.originalError = networkError;

        throw error;
    }

    const responseBody =
        await readResponseBody(response);

    /*
     * If the token expired or became invalid,
     * clear the cached token and retry once.
     */
    if (
        response.status === 401 &&
        retryOnUnauthorized
    ) {

        clearAccessTokenCache();

        return centryosRequest({
            apiType,
            path,
            method,
            body,
            headers,
            retryOnUnauthorized: false
        });
    }

    if (!response.ok) {
        throw createProviderError(
            response,
            responseBody
        );
    }

    return responseBody;
}


/*==================================================
                CONVENIENCE METHODS
==================================================*/

async function centryosGet(
    apiType,
    path,
    options = {}
) {

    return centryosRequest({
        apiType,
        path,
        method: "GET",
        headers: options.headers
    });
}


async function centryosPost(
    apiType,
    path,
    body = {},
    options = {}
) {

    return centryosRequest({
        apiType,
        path,
        method: "POST",
        body,
        headers: options.headers
    });
}


async function centryosPut(
    apiType,
    path,
    body = {},
    options = {}
) {

    return centryosRequest({
        apiType,
        path,
        method: "PUT",
        body,
        headers: options.headers
    });
}


async function centryosPatch(
    apiType,
    path,
    body = {},
    options = {}
) {

    return centryosRequest({
        apiType,
        path,
        method: "PATCH",
        body,
        headers: options.headers
    });
}


async function centryosDelete(
    apiType,
    path,
    body,
    options = {}
) {

    return centryosRequest({
        apiType,
        path,
        method: "DELETE",
        body,
        headers: options.headers
    });
}


/*==================================================
                    EXPORTS
==================================================*/

module.exports = {
    centryosRequest,
    centryosGet,
    centryosPost,
    centryosPut,
    centryosPatch,
    centryosDelete
};