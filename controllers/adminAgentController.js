/*==================================================
                SENKU PAY
          ADMIN AGENT CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();


/*==================================================
                    HELPERS
==================================================*/

function cleanText(value) {

    return String(value ?? "").trim();

}


function normalizeRole(value) {

    const role = cleanText(value).toUpperCase();

    const allowedRoles = [

        "AGENT",

        "SUPPORT_AGENT",

        "FINANCE_AGENT"

    ];

    return allowedRoles.includes(role)
        ? role
        : null;

}


function normalizeStatus(value) {

    return cleanText(value).toUpperCase();

}


/*==================================================
                GET ALL AGENTS
==================================================*/

exports.getAgents = async (req, res) => {

    try {

        const agents = await prisma.agent.findMany({

            include: {

                subAgents: {

                    orderBy: {

                        createdAt: "desc"

                    }

                }

            },

            orderBy: {

                createdAt: "desc"

            }

        });


        const subAgents = agents.flatMap(agent =>

            agent.subAgents.map(subAgent => ({

                ...subAgent,

                parentAgent: agent.name,

                parentAgentUsername: agent.username,

                parentAgentId: agent.id

            }))

        );


        return res.status(200).json({

            success: true,

            agents,

            subAgents

        });

    }

    catch (error) {

        console.error(

            "Get agents error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to load agent accounts."

        });

    }

};


/*==================================================
                CREATE AGENT
==================================================*/

exports.createAgent = async (req, res) => {

    try {

        const username = cleanText(

            req.body.username

        ).toLowerCase();


        const password = String(

            req.body.password || ""

        );


        const name = cleanText(

            req.body.name

        );


        const email = cleanText(

            req.body.email

        ).toLowerCase();


        const note = cleanText(

            req.body.note

        );


        const role = normalizeRole(

            req.body.role || "AGENT"

        );


        if (name.length < 2) {

            return res.status(400).json({

                success: false,

                message: "Enter a valid agent name."

            });

        }


        if (

            username.length < 3 ||

            !/^[a-zA-Z0-9._-]+$/.test(username)

        ) {

            return res.status(400).json({

                success: false,

                message: "Enter a valid agent username."

            });

        }


        if (password.length < 6) {

            return res.status(400).json({

                success: false,

                message:
                    "Password must contain at least 6 characters."

            });

        }


        if (

            email &&

            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

        ) {

            return res.status(400).json({

                success: false,

                message: "Enter a valid email address."

            });

        }


        if (!role) {

            return res.status(400).json({

                success: false,

                message: "Invalid agent role."

            });

        }


        const duplicateConditions = [

            {

                username

            }

        ];


        if (email) {

            duplicateConditions.push({

                email

            });

        }


        const existingAgent = await prisma.agent.findFirst({

            where: {

                OR: duplicateConditions

            }

        });


        if (existingAgent) {

            return res.status(409).json({

                success: false,

                message:
                    existingAgent.username === username
                        ? "Agent username already exists."
                        : "Agent email already exists."

            });

        }


        const hashedPassword = await bcrypt.hash(

            password,

            12

        );


        const agent = await prisma.agent.create({

            data: {

                username,

                password: hashedPassword,

                name,

                email: email || null,

                note: note || null,

                role,

                balance: 0,

                status: "ACTIVE"

            },

            select: {

                id: true,

                username: true,

                email: true,

                name: true,

                note: true,

                role: true,

                balance: true,

                status: true,

                createdAt: true,

                updatedAt: true

            }

        });


        return res.status(201).json({

            success: true,

            message: "Agent account created successfully.",

            agent

        });

    }

    catch (error) {

        console.error(

            "Create agent error:",

            error

        );


        if (error.code === "P2002") {

            return res.status(409).json({

                success: false,

                message:
                    "Agent username or email already exists."

            });

        }


        return res.status(500).json({

            success: false,

            message: "Unable to create the agent account."

        });

    }

};


/*==================================================
            TOGGLE AGENT STATUS
==================================================*/

exports.toggleAgentStatus = async (req, res) => {

    try {

        const id = cleanText(

            req.params.id

        );


        const agent = await prisma.agent.findUnique({

            where: {

                id

            }

        });


        if (!agent) {

            return res.status(404).json({

                success: false,

                message: "Agent account not found."

            });

        }


        const newStatus =

            normalizeStatus(agent.status) === "ACTIVE"

                ? "FROZEN"

                : "ACTIVE";


        const updatedAgent = await prisma.agent.update({

            where: {

                id

            },

            data: {

                status: newStatus

            },

            select: {

                id: true,

                username: true,

                name: true,

                email: true,

                role: true,

                status: true,

                balance: true,

                createdAt: true,

                updatedAt: true

            }

        });


        return res.status(200).json({

            success: true,

            message:
                newStatus === "ACTIVE"

                    ? "Agent account enabled successfully."

                    : "Agent account disabled successfully.",

            agent: updatedAgent

        });

    }

    catch (error) {

        console.error(

            "Toggle agent status error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to update agent status."

        });

    }

};


/*==================================================
            RESET AGENT PASSWORD
==================================================*/

exports.resetAgentPassword = async (req, res) => {

    try {

        const id = cleanText(

            req.params.id

        );


        const password = String(

            req.body.password || ""

        );


        if (password.length < 6) {

            return res.status(400).json({

                success: false,

                message:
                    "Password must contain at least 6 characters."

            });

        }


        const agent = await prisma.agent.findUnique({

            where: {

                id

            }

        });


        if (!agent) {

            return res.status(404).json({

                success: false,

                message: "Agent account not found."

            });

        }


        const hashedPassword = await bcrypt.hash(

            password,

            12

        );


        await prisma.agent.update({

            where: {

                id

            },

            data: {

                password: hashedPassword

            }

        });


        return res.status(200).json({

            success: true,

            message: "Agent password reset successfully."

        });

    }

    catch (error) {

        console.error(

            "Reset agent password error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to reset agent password."

        });

    }

};


/*==================================================
                UPDATE AGENT ROLE
==================================================*/

exports.updateAgentRole = async (req, res) => {

    try {

        const id = cleanText(

            req.params.id

        );


        const role = normalizeRole(

            req.body.role

        );


        if (!role) {

            return res.status(400).json({

                success: false,

                message: "Invalid agent role."

            });

        }


        const agent = await prisma.agent.findUnique({

            where: {

                id

            }

        });


        if (!agent) {

            return res.status(404).json({

                success: false,

                message: "Agent account not found."

            });

        }


        const updatedAgent = await prisma.agent.update({

            where: {

                id

            },

            data: {

                role

            },

            select: {

                id: true,

                username: true,

                name: true,

                email: true,

                role: true,

                status: true,

                balance: true,

                createdAt: true,

                updatedAt: true

            }

        });


        return res.status(200).json({

            success: true,

            message: "Agent role updated successfully.",

            agent: updatedAgent

        });

    }

    catch (error) {

        console.error(

            "Update agent role error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to update agent role."

        });

    }

};


/*==================================================
            GET AGENT SUB-AGENTS
==================================================*/

exports.getAgentSubAgents = async (req, res) => {

    try {

        const agentId = cleanText(

            req.params.id

        );


        const agent = await prisma.agent.findUnique({

            where: {

                id: agentId

            },

            select: {

                id: true,

                name: true,

                username: true

            }

        });


        if (!agent) {

            return res.status(404).json({

                success: false,

                message: "Agent account not found."

            });

        }


        const subAgents = await prisma.subAgent.findMany({

            where: {

                parentAgentId: agentId

            },

            orderBy: {

                createdAt: "desc"

            }

        });


        return res.status(200).json({

            success: true,

            agent,

            subAgents

        });

    }

    catch (error) {

        console.error(

            "Get agent sub-agents error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to load sub-agent accounts."

        });

    }

};


/*==================================================
            TOGGLE SUB-AGENT STATUS
==================================================*/

exports.toggleSubAgentStatus = async (req, res) => {

    try {

        const id = cleanText(

            req.params.id

        );


        const subAgent = await prisma.subAgent.findUnique({

            where: {

                id

            }

        });


        if (!subAgent) {

            return res.status(404).json({

                success: false,

                message: "Sub-agent account not found."

            });

        }


        const newStatus =

            normalizeStatus(subAgent.status) === "ACTIVE"

                ? "FROZEN"

                : "ACTIVE";


        const updatedSubAgent = await prisma.subAgent.update({

            where: {

                id

            },

            data: {

                status: newStatus

            }

        });


        return res.status(200).json({

            success: true,

            message:
                newStatus === "ACTIVE"

                    ? "Sub-agent account enabled successfully."

                    : "Sub-agent account disabled successfully.",

            subAgent: updatedSubAgent

        });

    }

    catch (error) {

        console.error(

            "Toggle sub-agent status error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to update sub-agent status."

        });

    }

};


/*==================================================
            RESET SUB-AGENT PASSWORD
==================================================*/

exports.resetSubAgentPassword = async (req, res) => {

    try {

        const id = cleanText(

            req.params.id

        );


        const password = String(

            req.body.password || ""

        );


        if (password.length < 6) {

            return res.status(400).json({

                success: false,

                message:
                    "Password must contain at least 6 characters."

            });

        }


        const subAgent = await prisma.subAgent.findUnique({

            where: {

                id

            }

        });


        if (!subAgent) {

            return res.status(404).json({

                success: false,

                message: "Sub-agent account not found."

            });

        }


        const hashedPassword = await bcrypt.hash(

            password,

            12

        );


        await prisma.subAgent.update({

            where: {

                id

            },

            data: {

                password: hashedPassword

            }

        });


        return res.status(200).json({

            success: true,

            message:
                "Sub-agent password reset successfully."

        });

    }

    catch (error) {

        console.error(

            "Reset sub-agent password error:",

            error

        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to reset sub-agent password."

        });

    }

};


/*==================================================
            GET AGENT REQUESTS
==================================================*/

exports.getAgentRequests = async (req, res) => {

    try {

        const requests = await prisma.agentRequest.findMany({

            include: {

                agent: {

                    select: {

                        id: true,

                        username: true,

                        email: true,

                        name: true,

                        role: true,

                        status: true

                    }

                },

                subAgent: {

                    select: {

                        id: true,

                        username: true,

                        email: true,

                        name: true,

                        role: true,

                        status: true,

                        parentAgentId: true

                    }

                }

            },

            orderBy: {

                createdAt: "desc"

            }

        });


        return res.status(200).json({

            success: true,

            requests

        });

    }

    catch (error) {

        console.error(

            "Get agent requests error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to load agent requests."

        });

    }

};


/*==================================================
            APPROVE AGENT REQUEST
==================================================*/

exports.approveAgentRequest = async (req, res) => {

    try {

        const id = cleanText(

            req.params.id

        );


        const adminNote = cleanText(

            req.body.note

        );


        const request = await prisma.agentRequest.findUnique({

            where: {

                id

            }

        });


        if (!request) {

            return res.status(404).json({

                success: false,

                message: "Agent request not found."

            });

        }


        if (

            normalizeStatus(request.status) !== "PENDING"

        ) {

            return res.status(409).json({

                success: false,

                message:
                    "This agent request has already been processed."

            });

        }


        const updatedRequest = await prisma.agentRequest.update({

            where: {

                id

            },

            data: {

                status: "APPROVED",

                adminNote: adminNote || null,

                processedAt: new Date()

            },

            include: {

                agent: true,

                subAgent: true

            }

        });


        return res.status(200).json({

            success: true,

            message:
                "Agent request approved successfully.",

            request: updatedRequest

        });

    }

    catch (error) {

        console.error(

            "Approve agent request error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to approve agent request."

        });

    }

};


/*==================================================
            REJECT AGENT REQUEST
==================================================*/

exports.rejectAgentRequest = async (req, res) => {

    try {

        const id = cleanText(

            req.params.id

        );


        const adminNote = cleanText(

            req.body.note

        );


        const request = await prisma.agentRequest.findUnique({

            where: {

                id

            }

        });


        if (!request) {

            return res.status(404).json({

                success: false,

                message: "Agent request not found."

            });

        }


        if (

            normalizeStatus(request.status) !== "PENDING"

        ) {

            return res.status(409).json({

                success: false,

                message:
                    "This agent request has already been processed."

            });

        }


        const updatedRequest = await prisma.agentRequest.update({

            where: {

                id

            },

            data: {

                status: "REJECTED",

                adminNote: adminNote || null,

                processedAt: new Date()

            },

            include: {

                agent: true,

                subAgent: true

            }

        });


        return res.status(200).json({

            success: true,

            message:
                "Agent request rejected successfully.",

            request: updatedRequest

        });

    }

    catch (error) {

        console.error(

            "Reject agent request error:",

            error

        );

        return res.status(500).json({

            success: false,

            message: "Unable to reject agent request."

        });

    }

};