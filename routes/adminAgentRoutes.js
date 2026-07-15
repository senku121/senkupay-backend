/*==================================================
                SENKU PAY
            ADMIN AGENT ROUTES
==================================================*/

const express = require("express");

const router = express.Router();

const {
    verifyToken
} = require("../middleware/authMiddleware");

const {
    getAgents,
    createAgent,
    toggleAgentStatus,
    resetAgentPassword,
    updateAgentRole,
    getAgentSubAgents,
    toggleSubAgentStatus,
    resetSubAgentPassword,
    getAgentRequests,
    approveAgentRequest,
    rejectAgentRequest
} = require("../controllers/adminAgentController");


/*==================================
        AGENT ACCOUNTS
==================================*/

router.get(
    "/agents",
    verifyToken,
    getAgents
);

router.post(
    "/agents/create",
    verifyToken,
    createAgent
);

router.post(
    "/agents/:id/toggle",
    verifyToken,
    toggleAgentStatus
);

router.post(
    "/agents/:id/reset-password",
    verifyToken,
    resetAgentPassword
);

router.post(
    "/agents/:id/role",
    verifyToken,
    updateAgentRole
);

router.get(
    "/agents/:id/sub-agents",
    verifyToken,
    getAgentSubAgents
);


/*==================================
        SUB-AGENT ACCOUNTS
==================================*/

router.post(
    "/agents/sub-agents/:id/toggle",
    verifyToken,
    toggleSubAgentStatus
);

router.post(
    "/agents/sub-agents/:id/reset-password",
    verifyToken,
    resetSubAgentPassword
);


/*==================================
        AGENT REQUESTS
==================================*/

router.get(
    "/agent-requests",
    verifyToken,
    getAgentRequests
);

router.post(
    "/agent-requests/:id/approve",
    verifyToken,
    approveAgentRequest
);

router.post(
    "/agent-requests/:id/reject",
    verifyToken,
    rejectAgentRequest
);

module.exports = router;